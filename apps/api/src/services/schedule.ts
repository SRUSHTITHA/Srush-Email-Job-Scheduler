import { z } from "zod";
import { db } from "../db.js";
import { queueMessage } from "../queue.js";
import { config } from "../config.js";

export const scheduleInput = z.object({
  recipients: z.array(z.string().email()).min(1).max(5000),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(100_000),
  startAt: z.string().datetime(),
  delaySeconds: z.number().int().min(config.minimumGapSeconds).max(86_400),
  hourlyLimit: z.number().int().min(1).max(10_000)
});

export async function scheduleCampaign(ownerId: string, raw: unknown) {
  const input = scheduleInput.parse(raw);
  const startAt = new Date(input.startAt);
  if (startAt.getTime() < Date.now() - 5_000) throw new Error("Start time must be in the future");
  const recipients = [...new Set(input.recipients.map((email) => email.toLowerCase()))];

  // Pre-computing slots preserves recipient order even if many workers run later.
  const messages = recipients.map((recipient, index) => ({
    recipient,
    scheduledFor: new Date(startAt.getTime() + index * input.delaySeconds * 1000)
  }));
  const campaign = await db.campaign.create({
    data: { ownerId, subject: input.subject, body: input.body, startAt, delaySeconds: input.delaySeconds, hourlyLimit: input.hourlyLimit,
      messages: { create: messages } }, include: { messages: true }
  });
  await Promise.all(campaign.messages.map((message) => queueMessage(message.id, message.scheduledFor)));
  return { id: campaign.id, recipientCount: campaign.messages.length };
}
