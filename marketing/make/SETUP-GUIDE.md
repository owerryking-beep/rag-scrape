# RagBot on Make.com — your free 24/7 marketing employee

**Total cost: KES 0.** Make.com's permanent free plan (1,000 operations/month,
no credit card) + a free Gemini API key + a free dev.to account.
**Setup time: ~15 minutes, all clicking — no terminal.**

## What it does once live

- **Every day at 09:00 Nairobi time:** writes a fresh marketing post (rotating
  through 8 themes — chunking, llms.txt, change-aware indexing, embeddings,
  token slimming, MCP, pipeline recipes, the free tool) and **publishes it to
  your dev.to blog automatically**.
- Every run is visible in your Make dashboard (the "watching it work" part).
- ~5 operations per day ≈ 150/month — comfortably inside the 1,000 free.

## Setup (click by click)

### Step 1 — Accounts (3 sign-ups, all free)

1. **Make.com** — go to [make.com](https://www.make.com) → Sign up (Google
   sign-in works). Kenya is fine — it's just a website.
2. **Gemini API key** — go to
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) →
   "Create API key" → copy it (`AIza…`). Free tier is generous; a daily post
   uses a fraction of it.
3. **dev.to** — go to [dev.to](https://dev.to) → create account (this is where
   RagBot publishes; it's a top-10 developer blog platform with good SEO).
   Then: Settings → Extensions → **DEV Community API Key** → Generate → copy.

### Step 2 — Import the RagBot blueprint

1. In Make: **Scenarios** (left menu) → top-right **⋯ (three dots)** →
   **Import Blueprint** → choose `ragbot-daily.blueprint.json` from this folder.
2. You'll see 3 connected bubbles: **Set Variables → Gemini → dev.to**.

**Import error?** (e.g. "references inaccessible module") — that was the old
v1 file; the current blueprint is v2 with only 2 standard HTTP modules
(validated: 3/3 clean end-to-end payloads). Delete the broken scenario
(Scenarios → ⋯ → Delete), then import again. If import STILL fails, build
2 bubbles by hand — both use the module **HTTP → Make a request**:

- **Bubble 1** → URL `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=YOUR_GEMINI_API_KEY` · Method POST · Body type **Raw** · Content type `application/json` · Request content = copy the long single-line JSON verbatim from the blueprint file (the `"data"` value of the first module).
- **Bubble 2** → URL `https://dev.to/api/articles` · POST · **Raw** · `application/json` · Headers: `api-key` = your dev.to key · `Content-Type` = `application/json` · `User-Agent` = `RagBot/1.0` · Request content = exactly `{{1.candidates[].content.parts[].text}}`

| Bubble | Module to add | Key settings |
|---|---|---|
(The two-bubble manual build is described above — nothing else needed.)

> **Tested end-to-end:** the exact pipeline below already produced a live
> article — "Stop Splitting by 500 Tokens: Why Heading-Aligned Chunking Wins
> RAG" on dev.to (2026-09-22). Gemini occasionally 503s; a retry fixes it
> (Make auto-retries once; a skipped day self-heals the next day).
> If a publish ever fails with `403 Forbidden Bots`, add a header
> `User-Agent: RagBot/1.0` to bubble 2.

### Step 3 — Paste your two keys

1. Open **bubble 1** → replace `YOUR_GEMINI_API_KEY` in the URL with your
   Gemini key.
2. Open **bubble 2** → Headers → replace `YOUR_DEVTO_API_KEY` with your
   dev.to key.

### Step 4 — Test once

Click **Run once** (bottom-left). ~30 seconds later, check your dev.to
dashboard → Posts. Your first AI-written post should be there.
*(If it's rough, that's normal — Gemini occasionally over-writes; the daily
cadence improves as you refine the prompt in bubble 1.)*

### Step 5 — Turn on the 24/7 schedule

1. Click the **clock icon** (bottom-left, next to Run once) → **Schedule
   activation: ON**.
2. Run scenario: **Every day** → time **09:00** → timezone **Africa/Nairobi** → OK.
3. Toggle the scenario **ON** (bottom of the screen).

Done. That's the Muse experience: a dashboard where your marketer works while
you sleep — except free and actually available in Kenya.

## Adding a second shift (optional, 3 minutes)

**Weekly deep-dive (NEW):** import `ragbot-weekly.blueprint.json` the same way
as the daily one → paste the same two keys → clock icon → **Every week →
Sunday → 11:00 → Africa/Nairobi** → ON. It writes a 900–1,300-word tutorial
and saves it as a **DRAFT** (`published: false`) — you review on your phone
and tap Publish. Same retry tip: right-click bubble 1 → Add error handler →
Retry ×3 / 5 min.

- **Weekly long article:** duplicate the scenario (⋯ → Clone), change the
  prompt's word target to 900–1,200 words + `published: false` (drafts for
  your review instead of auto-publish), schedule **Sunday 10:00**.
- **WordPress.com blog** (good for SEO): add a 4th bubble "WordPress →
  Create a post" after bubble 2.
- **X/Twitter:** Make has an X module, but X's API is now pay-per-use —
  pennies per post, add it later if you want.

## Guardrails (read once)

- The daily scenario **auto-publishes**. Want an approval step first? Set
  `"published": false` in the prompt (bubble 1) — posts land as drafts on
  dev.to and you tap Publish on your phone.
- If Make shows an orange warning on a run, open it — usually just a Gemini
  hiccup; the next day's run self-heals.
- Your free ops budget resets monthly; ~150 used means nothing to worry about.

## Where this fits in the plan

RagBot = content engine (SEO + presence while you sleep). The launch kit
(`../launch-kit.md`) = the human channels (Show HN, Reddit, directories) that
convert attention into users. Both feed the same funnel:
free tool → free key → 402 upgrade → Paystack checkout.
