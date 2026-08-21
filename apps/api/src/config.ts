import "dotenv/config";

function numberSetting(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);

  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a positive number`);
  }

  return value;
}

function requiredSecret(name: string, fallback: string) {
  const value = process.env[name] ?? fallback;

  if (
    value.length < 32 &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      `${name} must be at least 32 characters in production`
    );
  }

  return value;
}

export const config = {
  port: numberSetting(
    "PORT",
    numberSetting("API_PORT", 4000)
  ),

  webOrigin:
    process.env.WEB_ORIGIN ??
    "http://localhost:5173",

  redisUrl:
    process.env.REDIS_URL ??
    "redis://localhost:6379",

  jwtSecret: requiredSecret(
    "JWT_SECRET",
    "development-only-secret-change-me"
  ),

  workerConcurrency: numberSetting(
    "WORKER_CONCURRENCY",
    4
  ),

  minimumGapSeconds: numberSetting(
    "MIN_SEND_GAP_SECONDS",
    2
  ),

  defaultHourlyLimit: numberSetting(
    "DEFAULT_HOURLY_LIMIT",
    100
  ),

  etherealSenderCount: numberSetting(
    "ETHEREAL_SENDER_COUNT",
    2
  ),

  etherealHost:
    process.env.ETHEREAL_HOST ??
    "smtp.ethereal.email",

  etherealPort: numberSetting(
    "ETHEREAL_PORT",
    587
  ),

  etherealUser:
    process.env.ETHEREAL_USER ?? "",

  etherealPass:
    process.env.ETHEREAL_PASS ?? "",

  processingLeaseSeconds: numberSetting(
    "PROCESSING_LEASE_SECONDS",
    900
  ),

  jobAttempts: numberSetting(
    "JOB_ATTEMPTS",
    3
  ),

  jobBackoffMs: numberSetting(
    "JOB_BACKOFF_MS",
    10_000
  ),
};