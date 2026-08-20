import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { db } from "../db.js";
import { config } from "../config.js";

export const authRouter = Router();
const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL);
const invalidCredentials = "Invalid email or password";
const dummyPasswordHash = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const maxLoginFailures = 5;
const failureWindowMs = 15 * 60 * 1000;

function setSession(res: Response, userId: string) {
  const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: "7d" });
  res.cookie("postbox_session", token, { httpOnly: true, sameSite: "lax", secure: config.webOrigin.startsWith("https://"), maxAge: 604800000 });
}

authRouter.post("/register", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = validPassword(req.body.password);
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: "An account with that email already exists." });
    const user = await db.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12), name: email } });
    setSession(res, user.id);
    res.status(201).json({ name: user.name, email: user.email, avatarUrl: user.avatarUrl });
  } catch (error) { next(error); }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    let email: string;
    let password: string;
    try { email = normalizeEmail(req.body.email); password = validPassword(req.body.password); }
    catch { return res.status(401).json({ message: invalidCredentials }); }
    const key = `${req.ip}:${email}`;
    const failure = loginFailures.get(key);
    if (failure && failure.resetAt > Date.now() && failure.count >= maxLoginFailures) return res.status(429).json({ message: "Too many login attempts. Try again later." });
    const user = await db.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyPasswordHash);
    if (!user?.passwordHash || !valid) {
      const nextFailure = failure && failure.resetAt > Date.now() ? { count: failure.count + 1, resetAt: failure.resetAt } : { count: 1, resetAt: Date.now() + failureWindowMs };
      loginFailures.set(key, nextFailure);
      return res.status(401).json({ message: invalidCredentials });
    }
    loginFailures.delete(key);
    setSession(res, user.id);
    res.json({ name: user.name, email: user.email, avatarUrl: user.avatarUrl });
  } catch (error) { next(error); }
});

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
    const user = await db.user.findUnique({ where: { googleId: profile.sub } }) ?? await db.user.upsert({ where: { email: profile.email }, update: { googleId: profile.sub, name: profile.name ?? profile.email, avatarUrl: profile.picture }, create: { googleId: profile.sub, name: profile.name ?? profile.email, email: profile.email, avatarUrl: profile.picture } });
    setSession(res, user.id);
    res.redirect(config.webOrigin);
  } catch (error) { next(error); }
});
authRouter.post("/logout", (_req, res) => { res.clearCookie("postbox_session"); res.status(204).end(); });
function normalizeEmail(value: unknown) {
  if (typeof value !== "string" || !/^\S+@\S+\.\S+$/.test(value.trim())) throw new AuthInputError("Enter a valid email address.");
  return value.trim().toLowerCase();
}
function validPassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || Buffer.byteLength(value, "utf8") > 72) throw new AuthInputError("Password must be 8 to 72 bytes.");
  return value;
}
class AuthInputError extends Error { statusCode = 400; }
function zString(value: unknown) { if (typeof value !== "string") throw new Error("Missing Google authorization code"); return value; }
