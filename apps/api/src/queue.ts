import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config.js";

export const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
export const emailQueue = new Queue<{ messageId: string }>("outbound-email", { connection: redis });

export async function queueMessage(messageId: string, scheduledFor: Date) {
  const delay = Math.max(0, scheduledFor.getTime() - Date.now());
  await emailQueue.add("send-email", { messageId }, {
    jobId: `message:${messageId}`,
    delay,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    attempts: 1 // avoids blind SMTP retries after an uncertain network failure
  });
}
