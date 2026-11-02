// ---------------------------------------------------------------------------
// Sign in with Google (OAuth 2.0 via Passport). Sessions live in Postgres, so
// a login survives restarts and redeploys; the cookie only holds a session id.
//
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET.
// The callback URL is built from the request's host, so the same code works on
// localhost, the onrender.com URL and the custom domain (each one must be
// listed as an authorised redirect URI in Google Cloud):
//   https://<host>/auth/google/callback
// ---------------------------------------------------------------------------
import session from "express-session";
import connectPg from "connect-pg-simple";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { pool, upsertUser, getUser } from "./db.js";
import { log } from "./log.js";

const PROD = process.env.NODE_ENV === "production" || !!process.env.RENDER;
// Local testing without Google: DEV_LOGIN=1 adds /auth/dev. Never in production.
export const DEV_LOGIN = process.env.DEV_LOGIN === "1" && !PROD;

export function setupAuth(app) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET } = process.env;
  if (!SESSION_SECRET && PROD) throw new Error("SESSION_SECRET is not set.");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    if (PROD) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.");
    log.warn("Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  }

  app.set("trust proxy", 1); // Render terminates HTTPS in front of us
  const PgStore = connectPg(session);
  app.use(
    session({
      store: new PgStore({ pool, createTableIfMissing: true }),
      secret: SESSION_SECRET || "dev-only-secret",
      name: "beanstalk.sid",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: "lax", secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 30 },
    })
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try { done(null, (await getUser(id)) || false); } catch (err) { done(err); }
  });

  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        { clientID: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, callbackURL: "/auth/google/callback", proxy: true },
        async (_at, _rt, profile, done) => {
          try {
            const user = await upsertUser({
              googleId: profile.id,
              email: profile.emails?.[0]?.value || null,
              name: profile.displayName || null,
              picture: profile.photos?.[0]?.value || null,
            });
            log.info({ event: "login", user: user.id, newUser: user.created }, "signed in with Google");
            done(null, user);
          } catch (err) { done(err); }
        }
      )
    );
  }

  app.use(passport.initialize());
  app.use(passport.session());

  app.get("/auth/google", (req, res, next) => {
    if (!passport._strategy("google")) return res.status(503).send("Google sign-in isn't configured on this server.");
    passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })(req, res, next);
  });
  app.get("/auth/google/callback", (req, res, next) =>
    passport.authenticate("google", (err, user) => {
      if (err) { log.error({ err }, "google sign-in failed"); return res.redirect("/?signin=failed"); }
      if (!user) return res.redirect("/?signin=cancelled");
      req.logIn(user, (e) => (e ? next(e) : res.redirect("/")));
    })(req, res, next)
  );
  app.post("/auth/logout", (req, res, next) => {
    const id = req.user?.id;
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => { log.info({ event: "logout", user: id }, "signed out"); res.clearCookie("beanstalk.sid"); res.json({ ok: true }); });
    });
  });

  if (DEV_LOGIN) {
    log.warn("DEV_LOGIN is on: /auth/dev signs in a test user without Google.");
    app.get("/auth/dev", async (req, res, next) => {
      const user = await upsertUser({ googleId: `dev-${req.query.u || "1"}`, email: "dev@example.com", name: `Dev User ${req.query.u || "1"}`, picture: null });
      req.logIn(user, (e) => (e ? next(e) : res.redirect("/")));
    });
  }
}

export function requireUser(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: "Please sign in with Google first.", signin: "/auth/google" });
}
