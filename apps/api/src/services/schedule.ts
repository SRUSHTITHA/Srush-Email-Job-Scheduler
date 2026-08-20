import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { queueMessage } from "../queue.js";
import { config } from "../config.js";

export const scheduleInput = z.object({
  recipients: z.array(z.string().email()).min(1).max(5000),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(100_000),
  attachment: z.object({ name: z.string().min(1).max(255), type: z.string().max(200), data: z.string().max(2_000_000) }).nullable().optional(),
  startAt: z.string().datetime(),
  delaySeconds: z.number().int().min(config.minimumGapSeconds).max(86_400),
  hourlyLimit: z.number().int().min(1).max(10_000).default(config.defaultHourlyLimit)
});

export async function scheduleCampaign(ownerId: string, raw: unknown, idempotencyKey?: string) {
  const input = scheduleInput.parse(raw);
  const normalizedIdempotencyKey = idempotencyKey?.trim().slice(0, 128);
  if (normalizedIdempotencyKey) {
    const existing = await db.campaign.findUnique({ where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: normalizedIdempotencyKey } }, select: { id: true, messages: { select: { id: true } } } });
    if (existing) return { id: existing.id, recipientCount: existing.messages.length, reused: true };
  }
  const startAt = new Date(input.startAt);
  if (startAt.getTime() < Date.now() - 5_000) throw new Error("Start time must be in the future");
  const recipients = [...new Set(input.recipients.map((email) => email.toLowerCase()))];

  const messages = recipients.map((recipient, index) => ({
    recipient,
    scheduledFor: new Date(startAt.getTime() + index * input.delaySeconds * 1000)
  }));
  let campaign;
  try {
    campaign = await db.campaign.create({
      data: { ownerId, idempotencyKey: normalizedIdempotencyKey, subject: input.subject, body: input.body, attachmentName: input.attachment?.name, attachmentType: input.attachment?.type, attachmentData: input.attachment?.data, startAt, delaySeconds: input.delaySeconds, hourlyLimit: input.hourlyLimit,
        messages: { create: messages } }, include: { messages: true }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || !normalizedIdempotencyKey) throw error;
    const existing = await db.campaign.findUniqueOrThrow({ where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: normalizedIdempotencyKey } }, select: { id: true, messages: { select: { id: true } } } });
    return { id: existing.id, recipientCount: existing.messages.length, reused: true };
  }
  await Promise.all(campaign.messages.map((message) => queueMessage(message.id, message.scheduledFor)));
  return { id: campaign.id, recipientCount: campaign.messages.length };
}
