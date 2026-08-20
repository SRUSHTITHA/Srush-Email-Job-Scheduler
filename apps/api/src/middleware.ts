import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { db } from "./db.js";

export interface AuthenticatedRequest extends Request { userId?: string }
export async function requireUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.postbox_session;
    const payload = jwt.verify(token, config.jwtSecret) as { userId?: unknown };
    if (typeof payload.userId !== "string") throw new Error("Invalid session");
    const user = await db.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
    if (!user) throw new Error("Invalid session");
    req.userId = payload.userId;
    next();
  } catch { res.status(401).json({ message: "Please sign in first." }); }
}
