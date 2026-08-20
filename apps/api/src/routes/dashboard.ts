import { Router } from "express";
import { db } from "../db.js";
import { requireUser, type AuthenticatedRequest } from "../middleware.js";
import { scheduleCampaign } from "../services/schedule.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireUser);

dashboardRouter.get("/me", async (req: AuthenticatedRequest, res) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: req.userId } });
  res.json({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl });
});
dashboardRouter.get("/messages", async (req: AuthenticatedRequest, res) => {
  const sent = req.query.status === "sent";
  const messages = await db.emailMessage.findMany({
    where: { campaign: { ownerId: req.userId }, status: sent ? { in: ["SENT", "FAILED"] } : { in: ["SCHEDULED", "PROCESSING"] } },
    include: { campaign: { select: { subject: true } } }, orderBy: sent ? { sentAt: "desc" } : { scheduledFor: "asc" }, take: 100
  });
  res.json(messages.map((m) => ({ id: m.id, recipient: m.recipient, subject: m.campaign.subject, scheduledFor: m.scheduledFor, sentAt: m.sentAt, status: m.status })));
});
dashboardRouter.post("/campaigns", async (req: AuthenticatedRequest, res, next) => {
  try { res.status(201).json(await scheduleCampaign(req.userId!, req.body)); } catch (error) { next(error); }
});
