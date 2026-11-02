import express from "express";
import multer from "multer";
import { createRequire } from "node:module";
import path from "node:path";
import { STYLE, IMAGE_SIZE, SHEET_SIZE, PAGES, getPage, enabledPages } from "./lib/storyboard.js";
import {
  referencePrompt, referenceEditPrompt, sheetPrompt, pagePrompt, pageEditPrompt, cleanInstruction,
} from "./lib/prompts.js";
import {
  editImage, normalizePhoto, friendlyError, pickModel, pickQuality,
  MODEL, MODELS, PAGE_QUALITY, REFERENCE_QUALITY, MOCK,
} from "./lib/images.js";
import { measureTextZone } from "./lib/look.js";
import { checkPage, CHECK_MODEL } from "./lib/check.js";
import { sheetViews } from "./lib/sheet.js";
import { buildBookPdf, unsupportedChars } from "./lib/pdf.js";
import { layoutWords, PAGE_W } from "./lib/layout.js";
import { log, httpLog } from "./lib/log.js";
import * as db from "./lib/db.js";
import { setupAuth, requireUser, DEV_LOGIN } from "./lib/auth.js";
import { runAiFeedback } from "./lib/personas.js";

// Secrets come ONLY from the environment (Render → Environment, or .env locally).
const PORT = process.env.PORT || 3000;
if (!process.env.OPENAI_API_KEY && !MOCK) log.warn("OPENAI_API_KEY is not set. Image generation will fail.");

// At most this many pictures are drawn at the same time on this server; the
// rest wait their turn (and their progress bar says so).
const IMAGE_CONCURRENCY = Math.max(1, Number(process.env.IMAGE_CONCURRENCY) || 3);
// Per-user cap on image calls in 24 hours, so a link shared around can't empty
// the OpenAI account.
const DAILY_IMAGE_LIMIT = Number(process.env.DAILY_IMAGE_LIMIT) || 60;

await db.migrate();

const app = express();
app.use(httpLog);
setupAuth(app);
app.use(express.json({ limit: "2mb" }));

// Signed out: the welcome page. Signed in: the app.
app.get("/", (req, res) => res.sendFile(path.resolve(req.user ? "public/index.html" : "public/welcome.html")));
// The book the survey respondents (and the AI personas) review. Public, no login.
app.get(["/survey", "/survey/"], (_req, res) => res.sendFile(path.resolve("public/survey/index.html")));
app.get("/privacy", (_req, res) => res.sendFile(path.resolve("public/privacy.html")));
app.use(express.static("public", { index: false }));

// The book font, served to the browser so the page previews match the PDF.
const require = createRequire(import.meta.url);
const fontDir = path.dirname(require.resolve("@fontsource/fredoka/files/fredoka-latin-600-normal.woff2"));
app.use("/fonts", express.static(fontDir, { maxAge: "30d" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    cb(ok ? null : httpError(400, "Please upload a PNG, JPEG or WEBP photo."), ok);
  },
});

app.get("/healthz", (_req, res) => res.send("ok"));

app.get("/api/storyboard", (_req, res) => {
  res.json({
    style: STYLE,
    size: IMAGE_SIZE,
    model: MODEL,
    models: MODELS,
    quality: PAGE_QUALITY,
    checkModel: CHECK_MODEL,
    mock: MOCK,
    devLogin: DEV_LOGIN,
    pages: PAGES.map((p) => ({
      id: p.id,
      title: p.title,
      text: p.text,
      enabled: p.enabled,
      textZone: p.textZone,
      textSpace: p.textSpace,
      editOf: p.editOf ?? null,
      // Exactly how the PDF sets the words, so the app's preview matches it.
      words: p.text ? wordsPreview(p) : null,
    })),
  });
});

// Everything below needs a signed-in user.
app.use(["/api", "/img"], requireUser);

// ---------------------------------------------------------------------------
// the signed-in user and their books
// ---------------------------------------------------------------------------
app.get("/api/me", route(async (req) => ({ user: req.user, books: await db.listBooks(req.user.id) })));

app.post("/api/books", route(async (req) => {
  const book = await db.createBook(req.user.id, { v: 3 });
  log.info({ event: "book.create", user: req.user.id, book: book.id }, "new book");
  return { book: await bookPayload(req.user.id, book) };
}));

// The book to open: the one asked for, else the most recent, else a new one.
app.get("/api/books/:id", route(async (req) => {
  const uid = req.user.id;
  let book = req.params.id === "current" ? await db.latestBook(uid) : await db.getBook(uid, Number(req.params.id));
  if (!book && req.params.id !== "current") throw httpError(404, "That book isn't yours or doesn't exist.");
  book ??= await db.createBook(uid, { v: 3 });
  return { book: await bookPayload(uid, book) };
}));

app.put("/api/books/:id", route(async (req) => {
  const state = req.body?.state;
  if (!state || typeof state !== "object") throw httpError(400, "Missing book state.");
  // Pictures are stored as images and referenced by URL; never inline them here.
  if (JSON.stringify(state).includes("data:image/")) throw httpError(400, "Book state must not contain inline pictures.");
  const saved = await db.saveBookState(req.user.id, Number(req.params.id), state);
  if (!saved) throw httpError(404, "That book isn't yours or doesn't exist.");
  return { ok: true, updatedAt: saved.updated_at };
}));

app.delete("/api/books/:id", route(async (req) => {
  const ok = await db.deleteBook(req.user.id, Number(req.params.id));
  if (!ok) throw httpError(404, "That book isn't yours or doesn't exist.");
  log.info({ event: "book.delete", user: req.user.id, book: Number(req.params.id) }, "book deleted");
  return { ok: true };
}));

// AI feedback on a finished book: 10 different AI reviewers answer the same
// survey as the real people (lib/personas.js). About a minute; ~10 vision calls.
app.post("/api/books/:id/ai-feedback", route(async (req) => {
  const book = await requireBook(req, req.params.id);
  const st = book.state || {};
  if (!st.photo) throw httpError(400, "This book has no photo.");
  const dataUrl = (buf) => `data:image/jpeg;base64,${buf.toString("base64")}`;
  const pages = [];
  for (const spec of enabledPages()) {
    if (!st.pages?.[spec.id]) throw httpError(400, `Page ${spec.id} isn't made yet.`);
    pages.push({ label: `Page ${spec.id}`, words: spec.text, image: dataUrl(await loadImage(req, st.pages[spec.id].image, `page ${spec.id}`)) });
  }
  const input = { photo: dataUrl(await loadImage(req, st.photo, "photo")), pages };
  log.info({ event: "ai-feedback.start", user: req.user.id, book: book.id }, "AI feedback started");
  const result = await runAiFeedback(input, (p) => log.info({ event: "ai-feedback.progress", book: book.id, ...p }, "AI reviewer answered"));
  const saved = await db.saveAiFeedback(req.user.id, book.id, result);
  log.info({ event: "ai-feedback.done", user: req.user.id, book: book.id, ms: result.ms, diversity: result.diversity }, "AI feedback done");
  return { id: saved.id, createdAt: saved.created_at, result };
}));
app.get("/api/books/:id/ai-feedback", route(async (req) => {
  const book = await requireBook(req, req.params.id);
  return { feedback: await db.latestAiFeedback(req.user.id, book.id) };
}));

// Jobs a returning visitor is waiting on (ids from the book's `running` list).
app.get("/api/jobs", route(async (req) => {
  const ids = String(req.query.ids || "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
  return { jobs: ids.length ? await db.jobResults(req.user.id, ids) : [] };
}));

// Pictures: only their owner can load them.
app.get("/img/:id", async (req, res) => {
  try {
    const img = await db.getImage(req.user.id, Number(req.params.id));
    if (!img) return res.status(404).end();
    res.setHeader("Content-Type", img.mime);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(img.data);
  } catch (err) { sendError(res, err); }
});

// ---------------------------------------------------------------------------
// pictures. Every route below makes exactly ONE image call (pages also get one
// check call afterwards); nothing retries automatically. Each streams its
// progress as lines of JSON, keeps going if the visitor closes the tab, and
// saves the picture to the book the moment it's done.
// ---------------------------------------------------------------------------

// The uploaded photo: straightened, resized and stored. No OpenAI call.
app.post("/api/photo", upload.single("photo"), route(async (req) => {
  if (!req.file) throw httpError(400, "No photo uploaded.");
  const book = await requireBook(req, req.body.bookId);
  const photo = await normalizePhoto(req.file.buffer);
  const saved = await db.saveImage({ userId: req.user.id, bookId: book.id, kind: "photo", buf: photo });
  return { photo: saved.url };
}));

// Photo -> Jack. This picture is the reference for every page of the book.
app.post("/api/reference", imageRoute("reference", async (req) => {
  const photo = await loadImage(req, req.body.photo, "photo");
  const prompt = referencePrompt();
  return {
    quality: REFERENCE_QUALITY,
    draw: (model) => editImage({ images: [photo], prompt, model, quality: REFERENCE_QUALITY, mock: "reference" }),
    finish: async (image, saved) => ({ image: saved.url, prompt }),
  };
}));

// Fix one thing on the reference (image 1 = reference, image 2 = the photo).
app.post("/api/reference/edit", imageRoute("reference-edit", async (req) => {
  const reference = await loadImage(req, req.body.reference, "reference");
  const photo = req.body.photo ? await loadImage(req, req.body.photo, "photo") : null;
  const instruction = requireInstruction(req.body.instruction);
  const prompt = referenceEditPrompt(instruction);
  return {
    quality: REFERENCE_QUALITY,
    saveAs: "reference",
    draw: (model) => editImage({ images: photo ? [reference, photo] : [reference], prompt, model, quality: REFERENCE_QUALITY, mock: "reference" }),
    finish: async (image, saved) => ({ image: saved.url, prompt, instruction }),
  };
}));

// Jack's character sheet: the approved Jack from several angles and with
// several expressions. It goes with the reference into every page call.
app.post("/api/sheet", imageRoute("sheet", async (req, book) => {
  const reference = await loadImage(req, req.body.reference, "reference");
  const photo = req.body.photo ? await loadImage(req, req.body.photo, "photo") : null;
  const prompt = sheetPrompt();
  return {
    quality: REFERENCE_QUALITY,
    draw: (model) => editImage({ images: photo ? [reference, photo] : [reference], prompt, model, quality: REFERENCE_QUALITY, size: SHEET_SIZE, mock: "sheet" }),
    // The views are cut out (no OpenAI call) and stored before the sheet itself,
    // so the sheet's row can list them.
    beforeSave: async (image) => ({ views: await storeViews(req, book, image), jackVersion: req.body.jackVersion ?? null }),
    finish: async (_image, saved, meta) => ({ image: saved.url, views: meta.views, prompt }),
  };
}));

// One page, from the same references every time: image 1 = Jack, image 2 =
// his character sheet (a page with `editOf` starts from that earlier page).
// Then the page check.
app.post("/api/page", imageRoute("page", async (req) => {
  const spec = requirePage(req.body.pageId);
  const quality = pickQuality(req.body.quality, PAGE_QUALITY);
  const images = await references(req);
  if (spec.editOf) images.unshift(await loadImage(req, req.body.source, `page ${spec.editOf}`));
  const prompt = pagePrompt(spec, { sheet: images.length > (spec.editOf ? 2 : 1) });
  return {
    pageId: spec.id,
    quality,
    draw: (model) => editImage({ images, prompt, model, quality, mock: spec.id }),
    beforeSave: (image, send) => pageMeta(image, spec, req, send),
    finish: async (_image, saved, meta) => ({ image: saved.url, look: meta.look, check: meta.check, prompt }),
  };
}));

// Fix one thing on a page: same picture, one change
// (image 1 = page, image 2 = Jack, image 3 = his character sheet). Then check it.
app.post("/api/page/edit", imageRoute("page-edit", async (req) => {
  const spec = requirePage(req.body.pageId);
  const quality = pickQuality(req.body.quality, PAGE_QUALITY);
  const pageImage = await loadImage(req, req.body.image, `page ${spec.id}`);
  const refs = await references(req);
  const instruction = requireInstruction(req.body.instruction);
  const prompt = pageEditPrompt(spec, instruction, { sheet: refs.length > 1 });
  return {
    pageId: spec.id,
    quality,
    saveAs: "page",
    draw: (model) => editImage({ images: [pageImage, ...refs], prompt, model, quality, mock: spec.id }),
    beforeSave: (image, send) => pageMeta(image, spec, req, send),
    finish: async (_image, saved, meta) => ({ image: saved.url, look: meta.look, check: meta.check, prompt, instruction }),
  };
}));

// Build the PDF: the pages in order, then About Me.
app.post("/api/book", async (req, res) => {
  try {
    const child = cleanChild(req.body.child);
    const reference = await loadImage(req, req.body.reference, "reference");
    const given = new Map((req.body.pages || []).map((p) => [Number(p.id), p.image]));
    const pages = [];
    for (const spec of enabledPages()) {
      if (!given.get(spec.id)) throw httpError(400, `Page ${spec.id} isn't made yet.`);
      pages.push({ spec, image: await loadImage(req, given.get(spec.id), `page ${spec.id}`) });
    }
    const t = Date.now();
    const pdf = await buildBookPdf({ pages, reference, child });
    log.info({ event: "pdf", user: req.user.id, book: Number(req.body.bookId) || null, ms: Date.now() - t, bytes: pdf.length }, "built PDF");
    const slug = child.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "book";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="jack-and-the-beanstalk-${slug}.pdf"`);
    res.send(pdf);
  } catch (err) {
    sendError(res, err);
  }
});

// Multer and other errors
app.use((err, _req, res, _next) => sendError(res, err));

app.listen(PORT, () =>
  log.info({ port: PORT, model: MODEL, pages: PAGE_QUALITY, reference: REFERENCE_QUALITY, mock: MOCK, concurrency: IMAGE_CONCURRENCY }, "Beanstalk Me is up")
);

// ---------------------------------------------------------------------------
// one picture job, start to finish
// ---------------------------------------------------------------------------
// The stages the browser's progress bar shows, in order:
//   queued   waiting for a free slot (with its place in line)
//   drawing  the image call is running (with how long that usually takes)
//   checking the page check and the words-area measurement
//   saving   writing it to the database
//   done     { result }   or   error  { error }
const DEFAULT_MS = { reference: 45000, "reference-edit": 45000, sheet: 35000, page: 40000, "page-edit": 40000 };
const MOCK_MS = Number(process.env.MOCK_DELAY_MS) || 400;

function imageRoute(kind, prepare) {
  return async (req, res) => {
    let send = () => {};
    try {
      const book = await requireBook(req, req.body.bookId);
      const used = await db.imagesToday(req.user.id);
      if (used >= DAILY_IMAGE_LIMIT) throw httpError(429, `That's ${DAILY_IMAGE_LIMIT} pictures in 24 hours, the limit for one account. Try again tomorrow.`);
      const job = await prepare(req, book);
      const model = pickModel(req.body.model);
      const quality = job.quality;

      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      // If the visitor leaves, the picture is still finished and saved.
      send = (obj) => { if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(obj) + "\n"); };
      const ping = setInterval(() => send({ stage: "ping" }), 10_000);

      const expectedMs = MOCK ? MOCK_MS : await db.typicalMs(kind, model, quality, quality === "low" ? 15000 : DEFAULT_MS[kind]);
      const logId = await db.logStart({ userId: req.user.id, bookId: book.id, kind, pageId: job.pageId, model, quality });
      const ctx = { event: "image", user: req.user.id, book: book.id, kind, page: job.pageId ?? undefined, model, quality, job: logId };
      const t0 = Date.now();
      try {
        await slots.acquire((ahead) => send({ stage: "queued", ahead }));
        let image;
        try {
          send({ stage: "drawing", expectedMs });
          log.info(ctx, "image started");
          image = await job.draw(model);
        } finally { slots.release(); }
        const drawMs = Date.now() - t0;

        const meta = job.beforeSave ? await job.beforeSave(image, send) : {};
        send({ stage: "saving" });
        const saved = await db.saveImage({
          userId: req.user.id, bookId: book.id, kind: job.saveAs || kind, pageId: job.pageId ?? null, buf: image,
          meta: { ...meta, model, quality, jackVersion: req.body.jackVersion ?? null },
        });
        await db.logFinish(logId, { status: "done", ms: drawMs, imageId: saved.id });
        log.info({ ...ctx, ms: drawMs, totalMs: Date.now() - t0, image: saved.id }, "image done");
        send({ stage: "done", result: { ...(await job.finish(image, saved, meta)), model, quality } });
      } catch (err) {
        const [status, message] = err.expose ? [err.status, err.message] : friendlyError(err);
        await db.logFinish(logId, { status: "failed", ms: Date.now() - t0, error: message }).catch(() => {});
        log.error({ ...ctx, err: { message: err.message, status: err.status, code: err?.error?.code } }, "image failed");
        send({ stage: "error", status, error: message });
      } finally {
        clearInterval(ping);
        res.end();
      }
    } catch (err) {
      // Before streaming started: an ordinary JSON error.
      if (res.headersSent) { send({ stage: "error", error: err.message }); return res.end(); }
      sendError(res, err);
    }
  };
}

// A tiny semaphore: IMAGE_CONCURRENCY slots, first come first served.
const slots = (() => {
  let free = IMAGE_CONCURRENCY;
  const waiting = [];
  const notify = () => waiting.forEach((w, i) => w.onWait(i + 1));
  return {
    acquire(onWait) {
      if (free > 0) { free--; return Promise.resolve(); }
      return new Promise((resolve) => { waiting.push({ resolve, onWait }); onWait(waiting.length); });
    },
    release() {
      const next = waiting.shift();
      if (next) { next.resolve(); notify(); } else free++;
    },
  };
})();

async function pageMeta(image, spec, req, send) {
  send({ stage: "checking" });
  const [look, check] = await Promise.all([measureTextZone(image, spec), checkPage(image, spec)]);
  return { look, check, jackVersion: req.body.jackVersion ?? null };
}

async function storeViews(req, book, sheet) {
  const views = (await sheetViews(sheet)).filter((v) => v.row || v.col);
  return Promise.all(views.map(async ({ label, image }) => {
    const buf = Buffer.from(image.split(",")[1], "base64");
    const saved = await db.saveImage({ userId: req.user.id, bookId: book.id, kind: "view", buf, meta: { label } });
    return { label, image: saved.url };
  }));
}

// ---------------------------------------------------------------------------
// a book as the app gets it: its state, plus anything that finished or is
// still drawing since the browser last saved (the visitor closed the tab
// mid-book). The app puts finished pictures straight into the book.
// ---------------------------------------------------------------------------
async function bookPayload(userId, book) {
  const state = book.state || {};
  const [finished, running] = await Promise.all([db.imagesSince(book.id, book.updated_at), db.runningJobs(book.id)]);
  let changed = false;
  const seen = new Set();
  for (const row of finished) {
    const key = row.kind === "page" ? `page${row.page_id}` : row.kind;
    if (seen.has(key)) continue; // newest of each only
    seen.add(key);
    const url = `/img/${row.id}`;
    if (row.kind === "page") {
      state.pages ??= {};
      const prev = state.pages[row.page_id];
      if (prev?.image === url) continue;
      state.pages[row.page_id] = {
        image: url, look: row.meta.look, check: row.meta.check,
        jackVersion: row.meta.jackVersion ?? state.jackVersion ?? 0,
        history: prev ? [...(prev.history || []), { image: prev.image, look: prev.look, check: prev.check, jackVersion: prev.jackVersion }] : [],
      };
      changed = true;
    } else if (row.kind === "reference" && !state.jack) {
      state.jack = { image: url }; state.jackHistory = []; state.jackVersion = (state.jackVersion || 0) + 1; changed = true;
    } else if (row.kind === "sheet" && state.jack && !state.sheet) {
      state.sheet = { image: url, views: row.meta.views || [], viewsV: 2, jackVersion: state.jackVersion }; changed = true;
    }
  }
  if (changed) await db.saveBookState(userId, book.id, state);
  return {
    id: book.id,
    state,
    running: await Promise.all(running.map(async (j) => ({
      id: Number(j.id), kind: j.kind, pageId: j.page_id, startedAt: j.started_at,
      expectedMs: MOCK ? MOCK_MS : await db.typicalMs(j.kind, j.model, j.quality, DEFAULT_MS[j.kind]),
    }))),
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function wordsPreview(spec) {
  const { size, lines, box } = layoutWords(spec);
  return { size: size / PAGE_W, lines: lines.map((l) => l.text), box };
}

async function requireBook(req, id) {
  const book = await db.getBook(req.user.id, Number(id));
  if (!book) throw httpError(404, "That book isn't yours or doesn't exist. Reload the page.");
  return book;
}

async function references(req) {
  const refs = [await loadImage(req, req.body.reference, "reference")];
  if (req.body.sheet) refs.push(await loadImage(req, req.body.sheet, "character sheet"));
  return refs;
}

// A picture the browser refers to: one of this user's stored images
// ("/img/123"), or an inline data URL.
async function loadImage(req, value, what) {
  const s = String(value || "");
  const ref = /^\/img\/(\d+)$/.exec(s);
  if (ref) {
    const img = await db.getImage(req.user.id, Number(ref[1]));
    if (!img) throw httpError(400, `The ${what} picture wasn't found.`);
    return img.data;
  }
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s.exec(s);
  if (!m) throw httpError(400, `Missing or invalid ${what} image.`);
  return Buffer.from(m[2], "base64");
}

function route(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      sendError(res, err);
    }
  };
}

function sendError(res, err) {
  if (err.expose) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  log.error({ err }, "request failed");
  const [status, message] = friendlyError(err);
  res.status(status).json({ error: message });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

function requirePage(id) {
  const spec = getPage(id);
  if (!spec) throw httpError(400, "Unknown page.");
  if (!spec.enabled) throw httpError(400, `Page ${spec.id} isn't in this build yet.`);
  return spec;
}

function requireInstruction(raw) {
  const instruction = cleanInstruction(raw);
  if (instruction.length < 3) throw httpError(400, "Say what to change.");
  return instruction;
}

const CHILD_FIELDS = { name: 40, age: 20, likes: 60, food: 60, growUp: 60, more: 400 };

function cleanChild(raw = {}) {
  const child = {};
  for (const [key, max] of Object.entries(CHILD_FIELDS)) {
    let v = String(raw[key] ?? "").trim();
    v = key === "more" ? v.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n") : v.replace(/\s+/g, " ");
    child[key] = v.slice(0, max);
  }
  if (!child.name) throw httpError(400, "Type the child's name for the About Me page.");
  const bad = unsupportedChars(Object.values(child).join(""));
  if (bad.length) {
    throw httpError(400, `The book's font can't print ${bad.slice(0, 6).join(" ")} yet. Please use English letters on the About Me page.`);
  }
  return child;
}
