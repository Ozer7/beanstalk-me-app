// ---------------------------------------------------------------------------
// The magic word. Before anyone can even see "Sign in with Google", they type
// the site password (env ACCESS_PASSWORD). Passing it sets a signed cookie for
// 30 days. The password itself is never in the repo.
//
// Open without it: the survey book, the feedback comparison, privacy, fonts,
// the health check, and the gate itself. Everything else (the app, sign-in,
// the API, pictures) needs it.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import path from "node:path";
import { log } from "./log.js";

const COOKIE = "beanstalk.gate";
const MAX_AGE = 30 * 24 * 60 * 60; // seconds
const OPEN = [/^\/healthz$/, /^\/fonts\//, /^\/survey(\/|$)/, /^\/feedback(\/|$)/, /^\/privacy$/, /^\/gate$/, /^\/gate\//, /^\/favicon/];

export function setupGate(app) {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) {
    log.warn("ACCESS_PASSWORD is not set: the password screen is off and anyone can reach sign-in.");
    return;
  }
  const secret = process.env.SESSION_SECRET || "dev-only-secret";
  const token = crypto.createHmac("sha256", secret).update(`gate:${password}`).digest("base64url");
  const passed = (req) => readCookie(req, COOKIE) === token;
  const tries = new Map(); // ip -> { n, until }

  app.post("/gate", expressForm, (req, res) => {
    const ip = req.ip || "?";
    const t = tries.get(ip) || { n: 0, until: 0 };
    if (Date.now() < t.until) return res.status(429).json({ error: "Too many tries. Wait a minute and try again." });
    const given = String(req.body?.password ?? "");
    // Not case-sensitive: "robinson" works too.
    if (!safeEqual(given.trim().toLowerCase(), password.trim().toLowerCase())) {
      t.n += 1;
      if (t.n >= 8) { t.until = Date.now() + 60_000; t.n = 0; }
      tries.set(ip, t);
      log.info({ event: "gate.fail" }, "wrong site password");
      return res.status(401).json({ error: "That's not the magic word." });
    }
    tries.delete(ip);
    const secure = process.env.NODE_ENV === "production" || !!process.env.RENDER;
    res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
    log.info({ event: "gate.pass" }, "site password accepted");
    res.json({ ok: true });
  });

  app.use((req, res, next) => {
    if (OPEN.some((re) => re.test(req.path)) || passed(req)) return next();
    if (req.method === "GET" && req.accepts("html") && !req.path.startsWith("/api/") && !req.path.startsWith("/img/")) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(401).sendFile(path.resolve("public/gate.html"));
    }
    res.status(401).json({ error: "This site needs its password first.", gate: "/" });
  });
}

function expressForm(req, _res, next) {
  // JSON bodies are parsed later in server.js; read this tiny one ourselves.
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 2000) req.destroy(); });
  req.on("end", () => {
    try { req.body = JSON.parse(raw || "{}"); } catch { req.body = {}; }
    next();
  });
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function safeEqual(a, b) {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}
