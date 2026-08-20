import { DelayedError, Worker } from "bullmq";
import nodemailer from "nodemailer";
import { db } from "../db.js";
import { redis } from "../queue.js";
import { config } from "../config.js";

// Ethereal credentials are created at startup; replace this with stored sender accounts for production.
const testAccount = await nodemailer.createTestAccount();
const transport = nodemailer.createTransport({ host: testAccount.smtp.host, port: testAccount.smtp.port, secure: testAccount.smtp.secure, auth: { user: testAccount.user, pass: testAccount.pass } });

const worker = new Worker<{ messageId: string }>("outbound-email", async (job) => {
  const message = await db.emailMessage.findUnique({ where: { id: job.data.messageId }, include: { campaign: true } });
  if (!message || message.status !== "SCHEDULED") return; // completed/claimed jobs are harmless duplicates

  // A conditional update works as a database-backed lock across every worker instance.
  const claim = await db.emailMessage.updateMany({ where: { id: message.id, status: "SCHEDULED" }, data: { status: "PROCESSING", processingAt: new Date() } });
  if (claim.count === 0) return;
  try {
    // This is a last line of defence: scheduling spaces messages in advance; Redis shares the policy across workers.
    await enforceProviderWindow(message.campaign.ownerId, message.campaign.hourlyLimit, message.campaign.delaySeconds);
    const result = await transport.sendMail({ from: `Postbox Scheduler <${testAccount.user}>`, to: message.recipient, subject: message.campaign.subject, text: message.campaign.body });
    console.log(`Sent ${message.id}: ${nodemailer.getTestMessageUrl(result)}`);
    await db.emailMessage.update({ where: { id: message.id }, data: { status: "SENT", sentAt: new Date() } });
  } catch (error) {
    if (error instanceof NextHourError) {
      // Do not fail or discard rate-limited jobs. BullMQ persists this new delay in Redis.
      await db.emailMessage.update({ where: { id: message.id }, data: { status: "SCHEDULED", processingAt: null } });
      await job.moveToDelayed(error.retryAt, job.token);
      throw new DelayedError();
    }
    await db.emailMessage.update({ where: { id: message.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "SMTP send failed" } });
    throw error;
  }
}, { connection: redis, concurrency: config.workerConcurrency });

async function enforceProviderWindow(ownerId: string, hourlyLimit: number, requestedGapSeconds: number) {
  const gapMs = Math.max(config.minimumGapSeconds, requestedGapSeconds) * 1000;
  const now = Date.now();
  const hourKey = new Date(now).toISOString().slice(0, 13);
  const counterKey = `rate:${ownerId}:${hourKey}`;
  const sentThisHour = await redis.incr(counterKey);
  if (sentThisHour === 1) await redis.expire(counterKey, 3700);
  if (sentThisHour > hourlyLimit) {
    const nextHour = new Date(now); nextHour.setUTCMinutes(60, 0, 0);
    await redis.decr(counterKey);
    throw new NextHourError(nextHour.getTime());
  }
  const slot = await redis.set(`next-slot:${ownerId}`, String(now + gapMs), "PX", gapMs, "GET");
  const availableAt = Math.max(now, Number(slot ?? now));
  if (availableAt > now) await new Promise((resolve) => setTimeout(resolve, availableAt - now));
}

class NextHourError extends Error {
  constructor(readonly retryAt: number) { super("Hourly sending limit reached"); }
}

worker.on("failed", (job, error) => console.error(`Job ${job?.id} failed:`, error.message));
console.log(`Worker started with concurrency ${config.workerConcurrency}. Ethereal sender: ${testAccount.user}`);
