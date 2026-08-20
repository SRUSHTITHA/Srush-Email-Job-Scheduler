import "dotenv/config";

function numberSetting(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 1) throw new Error(`${name} must be a positive number`);
  return value;
}

export const config = {
  port: numberSetting("API_PORT", 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwtSecret: process.env.JWT_SECRET ?? "development-only-secret-change-me",
  workerConcurrency: numberSetting("WORKER_CONCURRENCY", 4),
  minimumGapSeconds: numberSetting("MIN_SEND_GAP_SECONDS", 2),
  defaultHourlyLimit: numberSetting("DEFAULT_HOURLY_LIMIT", 100)
};
