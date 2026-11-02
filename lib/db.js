// ---------------------------------------------------------------------------
// The database (Postgres; Neon in production, set DATABASE_URL). Tables are
// created on startup if they're missing, so a fresh database just works.
//
//   users           one row per Google account that has signed in
//   books           a user's books; `state` is the app's JSON for the book
//                   (name, About Me, which picture is Jack, page checks...)
//                   and points at pictures by URL (/img/<id>), never inlines them
//   images          every picture: the photo, each Jack, each sheet and its
//                   views, each page and each fix. Kept forever, so "undo" and
//                   a returning visitor always find them
//   generation_log  one row per image call: who, which book, what, model,
//                   quality, how long, and whether it worked
//   session         login sessions (made by connect-pg-simple)
// ---------------------------------------------------------------------------
import pg from "pg";
import { log } from "./log.js";

const url = process.env.DATABASE_URL;
if (!url) {
  log.fatal("DATABASE_URL is not set. Point it at a Postgres database (Neon, Render, or local).");
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: url,
  // Neon's URL carries sslmode=require, which pg honours. Without one, use TLS
  // unless it's a local database (or PGSSL=0).
  ...(/sslmode=/.test(url) ? {} : { ssl: process.env.PGSSL === "0" || /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } }),
  max: 5,
  idleTimeoutMillis: 30_000,
});
pool.on("error", (err) => log.error({ err }, "postgres pool error"));

export const q = (text, params) => pool.query(text, params);

export async function migrate() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      google_id   TEXT UNIQUE NOT NULL,
      email       TEXT,
      name        TEXT,
      picture     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS books (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state       JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS books_user ON books(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS images (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id     INTEGER REFERENCES books(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,          -- photo | reference | sheet | view | page
      page_id     INTEGER,
      mime        TEXT NOT NULL,
      data        BYTEA NOT NULL,
      meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS images_book ON images(book_id, kind, created_at DESC);
    CREATE TABLE IF NOT EXISTS generation_log (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      book_id     INTEGER REFERENCES books(id) ON DELETE SET NULL,
      kind        TEXT NOT NULL,          -- reference | reference-edit | sheet | page | page-edit
      page_id     INTEGER,
      model       TEXT,
      quality     TEXT,
      status      TEXT NOT NULL,          -- running | done | failed
      error       TEXT,
      image_id    BIGINT,
      ms          INTEGER,
      started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS genlog_book ON generation_log(book_id, status);
    CREATE TABLE IF NOT EXISTS ai_feedback (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      result      JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS genlog_timing ON generation_log(kind, model, quality, status, finished_at DESC);
  `);
  // A server restart mid-picture leaves "running" rows that will never finish.
  const { rowCount } = await q(
    `UPDATE generation_log SET status = 'failed', error = 'server restarted', finished_at = now()
     WHERE status = 'running' AND started_at < now() - interval '15 minutes'`
  );
  if (rowCount) log.warn({ rowCount }, "marked stale image jobs as failed");
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export async function upsertUser({ googleId, email, name, picture }) {
  const { rows } = await q(
    `INSERT INTO users (google_id, email, name, picture) VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_id) DO UPDATE SET email = $2, name = $3, picture = $4, last_login = now()
     RETURNING id, email, name, picture, (xmax = 0) AS created`,
    [googleId, email, name, picture]
  );
  return rows[0];
}

export async function getUser(id) {
  const { rows } = await q(`SELECT id, email, name, picture FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// books
// ---------------------------------------------------------------------------
export async function listBooks(userId) {
  const { rows } = await q(
    `SELECT id, created_at, updated_at,
            state->>'name' AS name,
            state->'jack'->>'image' AS jack,
            (SELECT count(*) FROM jsonb_object_keys(COALESCE(state->'pages', '{}'::jsonb)))::int AS pages
     FROM books WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50`,
    [userId]
  );
  return rows;
}

export async function createBook(userId, state = {}) {
  const { rows } = await q(`INSERT INTO books (user_id, state) VALUES ($1, $2) RETURNING id, state, updated_at`, [userId, state]);
  return rows[0];
}

export async function getBook(userId, bookId) {
  const { rows } = await q(`SELECT id, state, updated_at FROM books WHERE id = $1 AND user_id = $2`, [bookId, userId]);
  return rows[0] || null;
}

export async function latestBook(userId) {
  const { rows } = await q(`SELECT id, state, updated_at FROM books WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`, [userId]);
  return rows[0] || null;
}

export async function saveBookState(userId, bookId, state) {
  const { rows } = await q(
    `UPDATE books SET state = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id, updated_at`,
    [bookId, userId, state]
  );
  return rows[0] || null;
}

export async function deleteBook(userId, bookId) {
  const { rowCount } = await q(`DELETE FROM books WHERE id = $1 AND user_id = $2`, [bookId, userId]);
  return rowCount > 0;
}

// ---------------------------------------------------------------------------
// images
// ---------------------------------------------------------------------------
export async function saveImage({ userId, bookId, kind, pageId = null, buf, meta = {} }) {
  const mime = buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : "image/jpeg";
  const { rows } = await q(
    `INSERT INTO images (user_id, book_id, kind, page_id, mime, data, meta) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, bookId, kind, pageId, mime, buf, meta]
  );
  return { id: Number(rows[0].id), url: `/img/${rows[0].id}` };
}

export async function getImage(userId, id) {
  const { rows } = await q(`SELECT mime, data FROM images WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] || null;
}

// Pictures finished for this book after `since` (e.g. the visitor closed the
// tab while pages were drawing). Newest first.
export async function imagesSince(bookId, since) {
  const { rows } = await q(
    `SELECT id, kind, page_id, meta, created_at FROM images
     WHERE book_id = $1 AND created_at > $2 AND kind IN ('reference', 'sheet', 'page')
     ORDER BY created_at DESC`,
    [bookId, since]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// generation log
// ---------------------------------------------------------------------------
export async function logStart({ userId, bookId, kind, pageId = null, model, quality }) {
  const { rows } = await q(
    `INSERT INTO generation_log (user_id, book_id, kind, page_id, model, quality, status) VALUES ($1, $2, $3, $4, $5, $6, 'running') RETURNING id`,
    [userId, bookId, kind, pageId, model, quality]
  );
  return Number(rows[0].id);
}

export async function logFinish(id, { status, ms, error = null, imageId = null }) {
  await q(
    `UPDATE generation_log SET status = $2, ms = $3, error = $4, image_id = $5, finished_at = now() WHERE id = $1`,
    [id, status, ms, error, imageId]
  );
}

export async function runningJobs(bookId) {
  const { rows } = await q(
    `SELECT id, kind, page_id, model, quality, started_at FROM generation_log WHERE book_id = $1 AND status = 'running' ORDER BY started_at`,
    [bookId]
  );
  return rows;
}

// Where these jobs stand (for a returning visitor whose pictures were still
// drawing): status, and for finished ones the picture and its check.
export async function jobResults(userId, ids) {
  const { rows } = await q(
    `SELECT g.id, g.kind, g.page_id, g.status, g.error, g.image_id, i.meta
     FROM generation_log g LEFT JOIN images i ON i.id = g.image_id
     WHERE g.user_id = $1 AND g.id = ANY($2::bigint[])`,
    [userId, ids]
  );
  return rows.map((r) => ({
    id: Number(r.id), kind: r.kind, pageId: r.page_id, status: r.status, error: r.error,
    image: r.image_id ? `/img/${r.image_id}` : null, meta: r.meta || {},
  }));
}

// How long this kind of picture usually takes: the median of the last 20 that
// worked. The progress bars use it, so they get more accurate with use.
export async function typicalMs(kind, model, quality, fallback) {
  const { rows } = await q(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) AS ms FROM (
       SELECT ms FROM generation_log
       WHERE kind = $1 AND model = $2 AND quality = $3 AND status = 'done' AND ms IS NOT NULL
       ORDER BY finished_at DESC LIMIT 20) t`,
    [kind, model, quality]
  );
  return Math.round(rows[0]?.ms || fallback);
}

// Pictures this user started today (for the daily cap).
export async function imagesToday(userId) {
  const { rows } = await q(
    `SELECT count(*)::int AS n FROM generation_log WHERE user_id = $1 AND started_at > now() - interval '24 hours'`,
    [userId]
  );
  return rows[0].n;
}

// ---------------------------------------------------------------------------
// AI feedback runs (lib/personas.js)
// ---------------------------------------------------------------------------
export async function saveAiFeedback(userId, bookId, result) {
  const { rows } = await q(`INSERT INTO ai_feedback (user_id, book_id, result) VALUES ($1, $2, $3) RETURNING id, created_at`, [userId, bookId, result]);
  return rows[0];
}
export async function latestAiFeedback(userId, bookId) {
  const { rows } = await q(`SELECT id, result, created_at FROM ai_feedback WHERE user_id = $1 AND book_id = $2 ORDER BY id DESC LIMIT 1`, [userId, bookId]);
  return rows[0] || null;
}
