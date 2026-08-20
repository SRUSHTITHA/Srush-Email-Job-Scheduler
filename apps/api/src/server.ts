import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { dashboardRouter } from "./routes/dashboard.js";

const app = express();
app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRouter);
app.use("/api", dashboardRouter);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error instanceof ZodError) return res.status(400).json({ message: "Please check the form fields.", issues: error.flatten() });
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : undefined;
  const clientError = statusCode === 400 || message.includes("future") || message.includes("Idempotency-Key");
  res.status(statusCode ?? (clientError ? 400 : 500)).json({ message: clientError || statusCode ? message : "Unexpected server error" });
});
app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
