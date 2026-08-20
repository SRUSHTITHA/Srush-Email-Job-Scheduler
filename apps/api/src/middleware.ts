import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export interface AuthenticatedRequest extends Request { userId?: string }
export function requireUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.postbox_session;
    const payload = jwt.verify(token, config.jwtSecret) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch { res.status(401).json({ message: "Please sign in first." }); }
}
