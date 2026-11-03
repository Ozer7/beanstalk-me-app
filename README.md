# Beanstalk Me

A *Jack and the Beanstalk* picture book starring the child in an uploaded photo: from proof of concept to a real app. Sign in with Google, and every book you make is saved to your account. Close the tab, come back on another device, and it's still there.

Live: https://app.bluebid.online (also https://beanstalk-me-app.onrender.com)

Earlier homeworks are frozen and still running, each from its own repo or branch:
- Storybook, pages 1–3 + About Me: https://storybook.bluebid.online, from [Ozer7/beanstalk-me](https://github.com/Ozer7/beanstalk-me) `main`
- Two scenes: https://beanstalk.bluebid.online, from [Ozer7/beanstalk-me](https://github.com/Ozer7/beanstalk-me/tree/two-scenes) `two-scenes`

## Feedback

- **Survey** (Engage, sent to 10 paid people on CloudResearch Connect): https://beanstalk-me-app.onrender.com/survey is the book they saw.
- **10 real vs 10 AI responses, compared**: https://feedback.bluebid.online (also https://beanstalk-me-app.onrender.com/feedback)
- **How the 10 AI reviewers differ** (`lib/personas.js`): a persona grid (relation to the child, expertise, age, how much they care), a "lens" (what each looks at first), a temperament and survey style (one rushed crowd worker), independent calls with a different page order each, and a measured check: answers are embedded, and any answer with cosine similarity above 0.92 to an earlier one is redone with a new lens.
- **What changed because of it**: a painted storybook style, a hands check, and an angry mother on page 3 (see to-do.md).

## What's new in this build

- **A password before sign-in.** Visitors first see a night-sky beanstalk screen asking for the magic word (`ACCESS_PASSWORD`, set only in Render, never in the repo). The right word grows the beanstalk up to the giant's castle and opens the sign-in page; it's remembered for 30 days. The survey book, the feedback comparison and the privacy page stay public. (`lib/gate.js`, `public/gate.html`)
- **Sign in with Google.** Passport + `passport-google-oauth20`, with my own OAuth client. Sessions are stored in Postgres, so a login survives restarts and redeploys. Signed-out visitors only see the welcome page; every API route and every picture needs a login.
- **Books saved to the database (Neon Postgres).** Tables: `users`, `books` (the book's state as JSON), `images` (every picture: photo, Jack, sheet, views, pages, and every fix, so undo still works), `generation_log` (one row per image call) and `session`. Pictures are served at `/img/<id>`, and only to their owner. **My books** lists them; **New book** starts another without losing the old one; each can be deleted.
- **A closed tab doesn't lose a picture.** The server finishes and saves it anyway. When the book is opened again, pictures still drawing show their progress bars and pop in when done.
- **Progress per picture.** Each picture route streams its progress as lines of JSON (`queued` → `drawing` → `checking` → `saving` → `done`). Every page card has its own bar with a time estimate, and a bar at the top adds them up ("Making your book: 2 of 3 pictures done"). The estimate is the median time of the last 20 pictures of that kind in `generation_log`, so it gets more accurate the more the app is used.
- **Parallel.** The three pages are requested at once and drawn in parallel on the server, at most `IMAGE_CONCURRENCY` (default 3) at a time; the rest show "Waiting for a free slot".
- **Logging.** One JSON line per event (pino) in Render's Logs: every request with a request id and user id, sign-ins, each image call (kind, page, model, quality, how long, success or the safety-filter message) and each PDF. Image calls also go into `generation_log`. Cookies, secrets and pictures are never logged.
- **Spending limit.** At most `DAILY_IMAGE_LIMIT` (default 60) image calls per account per 24 hours.
- **Cheap testing.** `IMAGE_QUALITY=low REFERENCE_QUALITY=low` for low-res pictures; `MOCK_IMAGES=1` for placeholders with no API calls (`MOCK_DELAY_MS=5000` to watch the bars).

## How it works

1. **Who's the star?** Upload a photo and type the child's name.
2. **Meet Jack.** One call turns the photo into a full-body Jack in the book's style. You check that it looks like the child (or fix one thing), then approve him. A second call draws his **character sheet**: the same Jack from four angles and with four expressions. The app shows Jack and lets you flip through the other views with arrows.
3. **The pages.** Pages 1–3 are drawn at the same time, each from the same two references and the same style line, and shown in the order of the story. After each page, a vision model checks it against that page's checklist (for example, exactly five beans) and the app offers a one-click fix for anything wrong.
4. **About me.** The name and whatever the uploader types in, with a live preview of the page.
5. **Read it, then download.** A full-screen reader shows the book exactly as the PDF lays it out, then the PDF downloads.

The book is saved to your account as you go: every picture the moment it's drawn, and your typing half a second after you stop.

## Keeping the child the same on every page

- **One reference, plus his character sheet.** The photo is turned into Jack once. Every page is drawn from that same Jack and his sheet, never from the photo again and never from the previous page, so mistakes don't pile up from page to page. The sheet shows the model what his face looks like turned and with feelings, which is where likeness used to slip.
- **Expressions are spelled out** per page (eyebrows, eyes, mouth), and every prompt says an expression may not change his face, glasses or hair.
- **One style string**, defined once in `lib/storyboard.js` and pasted word for word into every call:
  > Modern 3D animated feature — rounded forms, large expressive eyes, soft rim light.
- **Fixed descriptions** for Jack's clothes, the mother, Milky-White, the old man and the cottage, also pasted word for word wherever they appear.
- **Same picture size everywhere** (1024×1536, tall), which is also the shape of the PDF page.

## Choosing the model

Default: `gpt-image-2.5-sunburst` at high quality. I compared it with `gpt-image-2.5-flare` on pages 2 and 3 with the same Jack and the same prompts. Both got the five beans right, but Sunburst kept the face and beard closer to the reference and followed the scene more closely (the beans fly out over the garden on page 3). The price per picture is the same; Sunburst is slower (about 36 s per page vs 23 s).

## Editing instead of regenerating

Every page card has **Fix one thing**: it sends the finished page plus the reference and asks for one change ("make the beans brighter"), keeping everything else. That's cheaper and safer than rolling a whole new picture when the page is 90% right. Jack has the same button. Page 4 (the beanstalk at dawn) is already in the storyboard as an edit of page 3, so the cottage and garden carry over. It's switched off in this build.

## The words are never drawn by the model

Every prompt asks for a quiet strip where the words will go (lower third on page 1, the sky on page 2, the dark grass on page 3) and forbids any lettering. The PDF layer (`lib/pdf.js`) then:

- measures the exact box where the words will print and picks light or dark words, with a soft shadow band behind them that gets stronger only when something sits under the words;
- sets the story text in Fredoka, sized to fit and balanced across lines;
- adds the About Me page with Jack's portrait, the name and the typed details.

The page cards in the app preview the words the same way, and flag a page when a person or object sits under its words (the busiest cell of the words box has a lot of edges; a clean sky doesn't).

## Files

| File | What's in it |
|---|---|
| `lib/storyboard.js` | Style string, Jack's outfit, the cast, and the page specs (words, scene, text zone). Pages 4–20 get added here. |
| `lib/prompts.js` | Builds the prompt for each kind of call: Jack, fix Jack, character sheet, page, fix page. |
| `lib/images.js` | The one place that draws pictures (`images.edit`). Exactly one call per request, no retries. |
| `lib/check.js` | The page check: one vision-model call per page that answers the page's checklist. |
| `lib/layout.js` | Where the words go on each page: size, line breaks, the box they cover. Used by both the PDF and the check below. |
| `lib/look.js` | Measures the picture under the words (brightness, whether something is in the way). |
| `lib/pdf.js` | Builds the PDF. |
| `server.js` | Express routes: books, pictures (streamed progress, concurrency limit), PDF. |
| `lib/auth.js` | Google sign-in, sessions in Postgres. |
| `lib/db.js` | Tables and queries. |
| `lib/log.js` | Structured logging. |
| `lib/personas.js` | The 10 AI reviewers and the diversity check. |
| `feedback/human-responses.json` | The 10 real responses. |
| `public/feedback/` | The public comparison page. |
| `public/welcome.html` | The signed-out page. |
| `public/index.html` | The app. |
| `PROMPTS.md` | The exact prompts, for pasting into the OpenAI Playground. Regenerate with `npm run prompts`. |
| `to-do.md` | What still needs work. |

## Run it locally

```bash
npm install
cp .env.example .env     # fill in; git ignores .env
npm run dev              # http://localhost:3000
```

You need a Postgres database (`DATABASE_URL`); tables are created on startup. Without Google credentials locally, set `DEV_LOGIN=1` to get a test sign-in link (it's ignored in production). `MOCK_IMAGES=1` makes placeholder pictures and no API calls; `npm test` runs the picture-and-PDF pipeline in mock mode.

## Deploy (Render)

Web service from this repo, build `npm install`, start `node server.js`, health check `/healthz`. Environment: `OPENAI_API_KEY`, `DATABASE_URL` (Neon), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ACCESS_PASSWORD`, `NODE_ENV=production`. Optional ones are listed in `.env.example`.

Google Cloud → Google Auth Platform → Clients: the authorised redirect URIs are `https://app.bluebid.online/auth/google/callback`, `https://beanstalk-me-app.onrender.com/auth/google/callback` and `http://localhost:3000/auth/google/callback`. The app is published (not "Testing"), so any Gmail can sign in.

DNS: `app.bluebid.online` is a CNAME to `beanstalk-me-app.onrender.com` at GoDaddy, with the custom domain added in Render.

## Secrets

`.env` is in `.gitignore`; on Render the keys live only in the Environment tab. Nothing secret is in the repo or its history.
