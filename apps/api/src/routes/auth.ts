import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { db } from "../db.js";
import { config } from "../config.js";

export const authRouter = Router();
const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL);

authRouter.get("/google", (_req, res) => {
  const url = google.generateAuthUrl({ access_type: "offline", scope: ["openid", "email", "profile"], prompt: "select_account" });
  res.redirect(url);
});
authRouter.get("/google/callback", async (req, res, next) => {
  try {
    const code = zString(req.query.code);
    const { tokens } = await google.getToken(code);
    const ticket = await google.verifyIdToken({ idToken: tokens.id_token!, audience: process.env.GOOGLE_CLIENT_ID });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email) throw new Error("Google did not return a usable profile");
    const user = await db.user.upsert({ where: { googleId: profile.sub }, update: { name: profile.name ?? profile.email, email: profile.email, avatarUrl: profile.picture }, create: { googleId: profile.sub, name: profile.name ?? profile.email, email: profile.email, avatarUrl: profile.picture } });
    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: "7d" });
    res.cookie("postbox_session", token, { httpOnly: true, sameSite: "lax", secure: false, maxAge: 604800000 });
    res.redirect(config.webOrigin);
  } catch (error) { next(error); }
});
authRouter.post("/logout", (_req, res) => { res.clearCookie("postbox_session"); res.status(204).end(); });
function zString(value: unknown) { if (typeof value !== "string") throw new Error("Missing Google authorization code"); return value; }
