import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config.js";

export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  connectTimeout: 10_000,
  enableReadyCheck: true,
});

export const emailQueue = new Queue<{ messageId: string; reservedAt?: number }>(
  "outbound-email",
  {
    connection: redis,
  }
);

export async function queueMessage(
  messageId: string,
  scheduledFor: Date
) {
  const delay = Math.max(0, scheduledFor.getTime() - Date.now());

  await emailQueue.add(
    "send-email",
    { messageId },
    {
      jobId: `message-${messageId}`,
      delay,
      removeOnComplete: 1000,
      removeOnFail: 1000,
      attempts: config.jobAttempts,
      backoff: {
        type: "exponential",
        delay: config.jobBackoffMs,
      },
    }
  );
}