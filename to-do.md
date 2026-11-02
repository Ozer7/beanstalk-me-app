# To do

## This homework: proof of concept → real app (due Wed Nov 4)

- [x] **Sign in with Google**, using my own OAuth client in Google Cloud; app published so any Gmail can sign in
- [x] **Books persist in a database** (Neon Postgres): users, books, every picture, image-call log, sessions
- [x] **Live on Render** at https://app.bluebid.online. The earlier homeworks are untouched (own repo / branch / service)
- [x] **Logging**: structured JSON logs in Render, plus `generation_log` in the database
- [x] **Progress bar per picture** + one for the whole book, streamed from the server
- [x] **Pages drawn in parallel** on the server (3 at a time)
- [x] **Cheap test mode**: `IMAGE_QUALITY=low`, `MOCK_IMAGES=1`
- [ ] **10 real responses** (CloudResearch Connect, survey built in Engage)
- [ ] **10 AI responses** from 10 different personas
- [ ] **Compare** the two sets (public link)
- [ ] **Use the feedback** before shipping the final version (see below once it's in)

## What the feedback says (fill in after the responses come in)
- _Real people:_
- _AI personas:_
- _What people caught that the AI didn't, and the reverse:_
- _What I'm changing because of it:_

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
