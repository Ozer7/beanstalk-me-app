# To do

## This homework: proof of concept → real app (due Wed Nov 4)

- [x] **Sign in with Google**, using my own OAuth client in Google Cloud; app published so any Gmail can sign in
- [x] **Books persist in a database** (Neon Postgres): users, books, every picture, image-call log, sessions
- [x] **Live on Render** at https://app.bluebid.online. The earlier homeworks are untouched (own repo / branch / service)
- [x] **Logging**: structured JSON logs in Render, plus `generation_log` in the database
- [x] **Progress bar per picture** + one for the whole book, streamed from the server
- [x] **Pages drawn in parallel** on the server (3 at a time)
- [x] **Cheap test mode**: `IMAGE_QUALITY=low`, `MOCK_IMAGES=1`
- [x] **10 real responses**: CloudResearch Connect, survey built in Engage, all 10 passed the attention check → [feedback/human-responses.json](feedback/human-responses.json)
- [x] **10 AI responses** from 10 different personas (`lib/personas.js`)
- [x] **Compare** the two sets → https://beanstalk-me-app.onrender.com/feedback
- [x] **Use the feedback**: painted style, hands check, page 3 mother (below)

## What the feedback says
Real people (10, 1–5): **likeness 3.8, story 3.7, professional 3.5**; 99¢ for 20 pages: 4 yes, 3 maybe, 3 no. Full side-by-side with the AI reviewers: https://beanstalk-me-app.onrender.com/feedback

- **Likeness works because of the glasses and beard.** Eight people gave it a 4. Two said the head is drawn wider/shorter than in the photo.
- **The art style is the main complaint.** 5 of 10 called it generic, "Disney-like", glossy, cartoony or "obviously AI"; 2 asked for hand-drawn or painted.
- **The story feels cut short**: three people said it's rushed and skips scenes (expected: this is 3 of 20 pages).
- **Single sharp catches:** a six-fingered hand on the old man; blurry, "not HD" backgrounds; the mother looks too happy on page 3; the About Me page would make more sense first.
- **The AI interviewer pushed too hard** on one person who had no complaints ("please stop asking this question"). Next survey: cap follow-ups at 2.
- **People took ~10 minutes, not 5**, so they earned about $4.60/hr. Next study: estimate 10 minutes and pay for it.

What the **AI reviewers** added (10 personas; likeness 3.9, story 3.8, professional 3.6; 99¢: 1 yes, 9 maybe, 0 no): all 10 brought up the About Me page, and 7 flagged that "Age 22 / learning Computer Science" doesn't fit a children's book. Also: an adult face on a child's body looks uncanny, sentences are long for five-year-olds, page 2 is too cheerful for a grim trade. They missed the extra finger and the blurry backgrounds that people caught, and they hedged (all scores 3–4, almost all "maybe").

### What I changed because of it
- [x] **New "Painted storybook" style** (gouache/watercolour, matte, visible brushwork), chosen per book next to the name. The 3D style stays the default.
- [x] **The page check now looks at hands** (four fingers and a thumb) and offers a one-click fix.
- [x] **Page 3: the mother is cross, not smiling**, spelled out in the prompt.
- [x] **Head shape**: every prompt now asks for the same head width and length as the photo, "not wider or rounder".
- [ ] **Sharper backgrounds**: the survey book was made at the old default; the live app is set to `low` for testing. Hand-in: set quality back to `high`, and print at a higher resolution later.
- [ ] **About Me first?** One person asked; keep it last for now, but add one line on page 1 ("starring Ori").
- [ ] **Longer story**: pages 4–20.
- [ ] **About Me for adults** (AI): when the star is an adult, label it "starring as Jack" without the child-style fields, or let the uploader hide Age.
- [ ] **Reading level** (AI): keep each page's words short enough for a 5-year-old reading along.
- [ ] **Next survey**: estimate 10 minutes and pay for it; cap Engage follow-ups at 2; hide About Me details from most AI personas so they don't all pile on one flaw.

## Done since the last build
- ~~The book is saved only in this browser~~: now saved to your Google account, on any device.
- ~~No spending limit~~: 60 image calls per account per 24 hours (`DAILY_IMAGE_LIMIT`), and you must sign in.
- ~~Three big requests at once could run Render out of memory~~: the server caps it at `IMAGE_CONCURRENCY`; the rest wait in line, and their bars say so.

## Still open

### App
- **Free Render server sleeps** when idle and takes about a minute to wake up. The first visit is slow.
- **Progress while drawing is an estimate.** The image API doesn't report percent done. The bar follows the median time of recent pictures of the same kind, then the real stages (checking, saving) are exact.
- **Neon free tier is 0.5 GB.** At ~400 KB a picture, that's roughly 1,000 pictures. Old books could move to object storage (S3/R2) later.
- **No way to delete the whole account** from the app yet (books can be deleted one by one). The privacy page says to email me.
- **Stripe (99¢ for the 20-page book)**: not yet, per the assignment.

### Pictures
- **Image models still miscount sometimes** (the five beans). The automatic check catches it and offers a one-click fix.
- **OpenAI's safety filter sometimes blocks a finished picture by mistake.** The app explains it and offers "Draw again".
- **Only Jack has reference images.** The mother, Milky-White and the old man stay consistent through fixed text descriptions only. Next: a cast sheet.

### Words on the page
- **The quiet area for the words isn't guaranteed.** The app warns when something is under the words but doesn't move them.
- **The story always says "Jack" and "his"**, not the child's name or pronouns.
- **About Me only prints English letters** (no Hebrew yet).

### Not built yet
- **Pages 4–20.** Page 4 is in the storyboard (an edit of page 3) but switched off.
- **Print quality**: 1024×1536 on a 6×9 in page is about 170 dpi. Fine on screen, soft in print.
