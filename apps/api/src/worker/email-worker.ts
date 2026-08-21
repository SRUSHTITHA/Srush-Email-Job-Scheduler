import { DelayedError, Worker } from "bullmq";
import IORedis from "ioredis";
import nodemailer from "nodemailer";
import { db } from "../db.js";
import { queueMessage } from "../queue.js";
import { config } from "../config.js";

const workerRedis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 10_000,
  enableReadyCheck: true,
});

workerRedis.on("error", (error) => {
  console.error("[worker redis] error:", error);
});

workerRedis.on("ready", () => {
  console.log("[worker redis] ready");
});

if (!config.etherealUser || !config.etherealPass) {
  throw new Error(
    "ETHEREAL_USER and ETHEREAL_PASS must be configured"
  );
}

const senders = Array.from(
  { length: config.etherealSenderCount },
  (_, index) => {
    const transport = nodemailer.createTransport({
      host: config.etherealHost,
      port: config.etherealPort,
      secure: config.etherealPort === 465,
      auth: {
        user: config.etherealUser,
        pass: config.etherealPass,
      },
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });

    return {
      account: {
        user: config.etherealUser,
      },
      transport,
      index,
    };
  }
);

const worker = new Worker<{
  messageId: string;
  reservedAt?: number;
}>(
  "outbound-email",
  async (job) => {
    console.log(
      `[worker] processing job=${job.id} message=${job.data.messageId}`
    );

    const message = await db.emailMessage.findUnique({
      where: {
        id: job.data.messageId,
      },
      include: {
        campaign: true,
      },
    });

    if (!message || message.status !== "SCHEDULED") {
      console.log(
        `[worker] skipping job=${job.id}: message missing or status=${message?.status}`
      );
      return;
    }

    const claim = await db.emailMessage.updateMany({
      where: {
        id: message.id,
        status: "SCHEDULED",
      },
      data: {
        status: "PROCESSING",
        processingAt: new Date(),
      },
    });

    if (claim.count === 0) {
      console.log(
        `[worker] message ${message.id} was already claimed`
      );
      return;
    }

    let smtpAttempted = false;

    try {
      const reservation = job.data.reservedAt
        ? {
            sendAt: job.data.reservedAt,
          }
        : await reserveProviderSlot(
            message.campaign.ownerId,
            message.campaign.hourlyLimit,
            message.campaign.delaySeconds
          );

      if (reservation.retryAt) {
        await db.emailMessage.update({
          where: {
            id: message.id,
          },
          data: {
            status: "SCHEDULED",
            processingAt: null,
          },
        });

        await job.moveToDelayed(
          reservation.retryAt,
          job.token
        );

        throw new DelayedError();
      }

      if (reservation.sendAt > Date.now()) {
        await job.updateData({
          ...job.data,
          reservedAt: reservation.sendAt,
        });

        await db.emailMessage.update({
          where: {
            id: message.id,
          },
          data: {
            status: "SCHEDULED",
            processingAt: null,
          },
        });

        await job.moveToDelayed(
          reservation.sendAt,
          job.token
        );

        throw new DelayedError();
      }

      const sender =
        senders[hash(message.id) % senders.length];

      smtpAttempted = true;

      const result = await sender.transport.sendMail({
        from: `Postbox Scheduler <${sender.account.user}>`,
        to: message.recipient,
        subject: message.campaign.subject,
        text: message.campaign.body,
        attachments: message.campaign.attachmentData
          ? [
              {
                filename:
                  message.campaign.attachmentName ??
                  "attachment",
                content: Buffer.from(
                  message.campaign.attachmentData,
                  "base64"
                ),
                contentType:
                  message.campaign.attachmentType ??
                  "application/octet-stream",
              },
            ]
          : undefined,
      });

      console.log(
        `Sent ${message.id}: ${nodemailer.getTestMessageUrl(result)}`
      );

      await db.emailMessage.update({
        where: {
          id: message.id,
        },
        data: {
          status: "SENT",
          sentAt: new Date(),
          processingAt: null,
        },
      });

      console.log(
        `[worker] message ${message.id} marked SENT`
      );
    } catch (error) {
      if (error instanceof DelayedError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Temporary worker failure";

      if (!smtpAttempted) {
        await db.emailMessage.updateMany({
          where: {
            id: message.id,
            status: "PROCESSING",
          },
          data: {
            status: "SCHEDULED",
            processingAt: null,
            errorMessage,
          },
        });
      } else {
        await db.emailMessage.updateMany({
          where: {
            id: message.id,
            status: "PROCESSING",
          },
          data: {
            status: "FAILED",
            processingAt: null,
            errorMessage,
          },
        });
      }

      throw error;
    }
  },
  {
    connection: workerRedis,
    concurrency: config.workerConcurrency,
  }
);

async function reserveProviderSlot(
  ownerId: string,
  hourlyLimit: number,
  requestedGapSeconds: number
) {
  const now = Date.now();

  const result = (await workerRedis.eval(
    `
      local now = tonumber(ARGV[1])
      local gap = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])

      local previous =
        tonumber(redis.call('GET', KEYS[1]) or '0')

      local slot = math.max(now, previous)

      local hour =
        math.floor(slot / 3600000)

      local counter =
        KEYS[2] .. hour

      local count =
        tonumber(redis.call('GET', counter) or '0')

      if count >= limit then
        return {
          0,
          (hour + 1) * 3600000
        }
      end

      redis.call('INCR', counter)

      redis.call(
        'EXPIRE',
        counter,
        7500
      )

      redis.call(
        'SET',
        KEYS[1],
        slot + gap,
        'PX',
        math.max(gap * 2, 60000)
      )

      return {
        1,
        slot
      }
    `,
    2,
    `next-slot:${ownerId}`,
    `rate:${ownerId}:`,
    now,
    Math.max(
      config.minimumGapSeconds,
      requestedGapSeconds
    ) * 1000,
    hourlyLimit
  )) as [number, number];

  return result[0] === 0
    ? {
        sendAt: now,
        retryAt: result[1],
      }
    : {
        sendAt: result[1],
      };
}

function hash(value: string) {
  let result = 0;

  for (const character of value) {
    result =
      (result * 31 + character.charCodeAt(0)) >>> 0;
  }

  return result;
}

worker.on("ready", () => {
  console.log(
    `[worker] ready; concurrency=${config.workerConcurrency}`
  );
});

worker.on("active", (job) => {
  console.log(
    `[worker] active job=${job.id} message=${job.data.messageId}`
  );
});

worker.on("completed", (job) => {
  console.log(
    `[worker] completed job=${job.id}`
  );
});

worker.on("failed", (job, error) => {
  console.error(
    `[worker] failed job=${job?.id} message=${job?.data.messageId}`,
    error
  );
});

worker.on("error", (error) => {
  console.error("[worker] error:", error);
});

const scheduledMessages =
  await db.emailMessage.findMany({
    where: {
      status: "SCHEDULED",
    },
    select: {
      id: true,
      scheduledFor: true,
    },
  });

const staleBefore = new Date(
  Date.now() -
    config.processingLeaseSeconds * 1000
);

const abandonedMessages =
  await db.emailMessage.findMany({
    where: {
      status: "PROCESSING",
      processingAt: {
        lt: staleBefore,
      },
    },
    select: {
      id: true,
      scheduledFor: true,
    },
  });

if (abandonedMessages.length) {
  await db.emailMessage.updateMany({
    where: {
      id: {
        in: abandonedMessages.map(
          (message) => message.id
        ),
      },
      status: "PROCESSING",
    },
    data: {
      status: "SCHEDULED",
      processingAt: null,
    },
  });
}

const recoveredMessages = [
  ...scheduledMessages,
  ...abandonedMessages,
];

await Promise.all(
  recoveredMessages.map((message) =>
    queueMessage(
      message.id,
      message.scheduledFor
    )
  )
);

console.log(
  `Worker started with concurrency ${config.workerConcurrency} and ${senders.length} Ethereal senders. Reconciled ${recoveredMessages.length} scheduled messages.`
);