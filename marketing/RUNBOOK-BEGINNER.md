# RagScrape Beginner Runbook — every remaining step, click by click

You never need to guess. Each step tells you: **what to click → what you'll
see → how to know it worked.** Do the missions in order. Check the box when
done.

```
[x] Product built & live
[x] Payments wired (test mode verified)
[x] First dev.to article published
[ ] Mission 1 — Finish RagBot (10 min)  ← you are here
[ ] Mission 2 — F5Bot radar (5 min)
[ ] Mission 3 — Show HN (30 min, Tue–Thu)
[ ] Mission 4 — Reddit, one subreddit a day (15 min/day)
[ ] Mission 5 — Paystack webhook + live keys (2 min + waiting)
[ ] Mission 6 — GitHub token so I can sync the repo (5 min)
[ ] Mission 7 — The weekly rhythm (ongoing)
```

---

## Mission 1 — Finish RagBot in Make.com (10 min)

You imported the blueprint and see **3 connected bubbles** on a canvas,
labelled 1, 2, 3. Bubbles = steps. A panel opens when you click one.
**OK** saves a panel. Nothing is live until Mission 1.5.

### 1.1 — Give Gemini its key (bubble 2, the middle one)
1. Click **bubble 2** (its URL mentions `generativelanguage.googleapis.com`).
2. A panel opens. Find the field called **URL**. At the very end it says:
   `...generateContent?key=YOUR_GEMINI_API_KEY`
3. Drag your cursor over just `YOUR_GEMINI_API_KEY` and paste your Gemini key
   over it. The end must read:
   `...generateContent?key=YOUR_GEMINI_KEY_HERE`
   (no space after `key=`)
4. Click **OK**.

### 1.2 — Give dev.to its key (bubble 3, the last one)
1. Click **bubble 3** (URL mentions `dev.to/api/articles`).
2. In the panel find **Headers** — two rows. Leave `Content-Type` alone.
3. In the row `api-key`, replace `YOUR_DEVTO_API_KEY` with:
   `Z8R9oddvhXUG6zDPaJrykKTF`
4. Click **OK**.

### 1.3 — Test fire
1. Bottom-left of the screen: click **Run once**.
2. The bubbles get a number badge as they finish: 1 → 2 → 3.
   - **White/numbered bubble** = worked.
   - **Orange bubble** = click it to see the error.
     - Bubble 2 error 503/429 = Gemini was busy → click **Run once** again.
     - Bubble 3 error `403 Forbidden Bots` → click bubble 3 → **Headers** →
       **add item** → name: `User-Agent`, value: `RagBot/1.0` → OK → run again.
3. **Proof of success:** open dev.to → your profile → a NEW article is live
   (a different angle than the chunking one).

### 1.4 — Turn on the daily schedule
1. Bottom-left: click the **clock icon**.
2. Set: **Schedule activation ON** → Run scenario **Every day** → time
   **09:00** → timezone **Africa/Nairobi** → OK.
3. Bottom-left: flip the big **ON/OFF toggle to ON** (it asks for a name —
   type `RagBot daily`).

**Done forever.** Every morning 09:00 a new article publishes itself.
Check **History** (left menu) any day to see runs. Uses ~5 of your 1,000
free monthly operations.

---

## Mission 2 — F5Bot: your opportunity radar (5 min)

F5Bot emails you **within minutes** when anyone on Reddit or Hacker News
types a keyword you care about. This is where your first customers hide.

1. Go to **f5bot.com** → enter your email → click **Get Monitoring**.
2. Open your email → click the confirmation link.
3. On the F5Bot page: **Add new search** → paste ONE keyword → Save.
   Repeat for each of these:
   ```
   url to markdown
   llms.txt
   rag chunking
   chunking for rag
   firecrawl alternative
   jina reader alternative
   markdown api
   scrape docs llm
   ```
4. **Proof:** the keywords are listed on your F5Bot page.

**When an alert arrives (this is the money part):**
- Open the thread. Read what the person actually needs.
- If RagScrape genuinely helps: reply like a helpful expert, mention it
  casually, with the link. Example:
  > "I built something for exactly this — RagScrape returns heading-aligned
  > chunks with embeddings in one call. Free key, no card:
  > https://rag-scrape-api.owerryking.workers.dev — feedback welcome."
- If it doesn't fit: ignore it. Never spam. One good reply > ten links.

---

## Mission 3 — Show Hacker News (30 min, post Tue–Thu)

Hacker News = where developers look for new tools. One good Show HN can send
hundreds of visitors in a day.

### 3.1 — Account (once)
1. Go to **news.ycombinator.com** → top-right **login** → "got an account?"
   → create one (pick a clean username, e.g. your name or `owerryking`).
2. Verify your email if it asks.

### 3.2 — Post (Tue, Wed or Thursday, between 13:00–16:00 Nairobi time —
that's morning in the US when HN is most active)
1. Top nav → **submit**.
2. **title** (copy exactly):
   ```
   Show HN: RagScrape – URL to RAG-ready chunks, embeddings and llms.txt in one API call
   ```
3. **URL**: `https://rag-scrape-api.owerryking.workers.dev`
   (leave "text" empty when submitting a URL)
4. Click **submit**.

### 3.3 — The first comment (do this within 1 minute of posting)
1. Open your new post → click **comment** (or "add comment").
2. Paste the "First comment" text from `marketing/launch-kit.md` (section 1).
3. **Rules that keep you alive on HN:** never ask friends to upvote (their
   system detects it and kills the post), reply to every question honestly,
   admit the limits (no JS rendering yet) — honesty is HN currency.

**Success =** even 10–30 visitors and 2–3 good conversations. Traction is a
bonus, feedback is the prize.

---

## Mission 4 — Reddit: one subreddit per day (15 min/day)

**Golden rule:** read each community's rules first, post like a human, say
it's your product, answer every reply.

| Day | Community | Post from launch-kit |
|---|---|---|
| Day 1 | reddit.com/r/LLMDevs | section 2, r/LLMDevs post |
| Day 2 | reddit.com/r/SideProject | section 2, r/SideProject post |
| Day 3 | reddit.com/r/mcp | section 2, r/mcp post |

Steps for each:
1. Create a Reddit account (or use yours). Post from the same username
   every time — credibility compounds.
2. Open the community → check **Rules** (right sidebar) — all three above
   allow project posts.
3. Click **Create post** → paste the title from the kit → paste the body →
   **light edit 2–3 sentences so it's not identical everywhere**.
4. Next 48 hours: **reply to every comment**, even "cool" ones ("thanks!
   what would you want it to do next?").

---

## Mission 5 — Paystack (2 min now, then waiting)

### 5.1 — The webhook paste (do today)
1. Go to **dashboard.paystack.com** → log in.
2. Left menu → **Settings** → **API Keys & Webhooks**.
3. Find **Webhook URL** → paste:
   ```
   https://rag-scrape-api.owerryking.workers.dev/webhook
   ```
4. Click **Save**. (This is what upgrades a customer's key the moment they
   pay. Without it, payments work but keys don't upgrade automatically.)

### 5.2 — While in review
- Approval usually lands in **24–48 hours** by email. Past 48h → email
  **support@paystack.com** with your business name + registered email.
- **Do NOT** send me the Test Secret Key again — it's already wired.

### 5.3 — When the approval email arrives
1. Paystack dashboard → the banner about going live disappears →
   **Settings → API Keys & Webhooks** now shows **Live Secret Key**
   (`sk_live_…`).
2. Copy it → paste it to me in chat. **That's your entire job.**
3. What I then do (you watch): create the 3 live KES plans → store your live
   secret → switch the provider to live → run a live verification → hand you
   the first real checkout link. RagScrape is open for business.

---

## Mission 6 — GitHub token so I can sync the repo (5 min)

The public repo is 13+ commits behind (old code, no RagBot, no Paystack).
Only you can authorize me:

1. Go to **github.com** → log in as **owerryking-beep**.
2. Click your **profile picture** (top-right) → **Settings**.
3. Left menu, scroll to the very bottom → **Developer settings**.
4. **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**.
5. Fill in:
   - Token name: `arena-sync`
   - Expiration: **7 days**
   - Repository access: **Only select repositories** → pick `rag-scrape`
   - Permissions → Repository permissions → **Contents: Read and write**
     (Metadata gets added automatically)
6. Click **Generate token** → **copy the token immediately**
   (starts with `github_pat_…` — shown only once).
7. Paste it to me in chat. I push all 13+ commits and confirm. After I
   confirm, you may delete the token (Settings → Developer settings → delete)
   — safest habit.

---

## Mission 7 — The weekly rhythm (after launch week)

| Day | Do (30–60 min total) |
|---|---|
| **Mon** | Check F5Bot emails → reply where genuinely relevant |
| **Tue** | (Only if not done) Show HN; else 1 helpful comment somewhere |
| **Wed** | Reply to comments on your Reddit/HN posts; check dev.to stats |
| **Fri** | Skim dev.to analytics (which angle performed?) — RagBot's prompt rotates angles automatically; your only job is replying to readers |
| **Any day** | A Paystack email arrives → paste me the live key |

---

## When something breaks (quick fixes)

| Symptom | Fix |
|---|---|
| Make bubble 2 orange, error 503/429 | Run once again later (Gemini busy — we saw this; retries work) |
| Make bubble 3 orange, `403 Forbidden Bots` | Add header `User-Agent: RagBot/1.0` to bubble 3 |
| No email from F5Bot | Check spam; keywords only trigger on NEW Reddit/HN posts |
| HN post gets zero traction | Normal. Post again next Tue–Thu; traction is a lottery, replying to comments is the real value |
| Paystack silent after 48h | Email support@paystack.com (business name + registered email) |
| Anything in the product itself | Tell me — I run the infrastructure |

## The current scoreboard

- 🟢 Product live (API v2.1, 4 tiers, crawler, embeddings, llms-txt, MCP)
- 🟢 Paystack test loop verified end-to-end
- 🟢 First marketing article live on dev.to
- 🟡 RagBot daily mode — Mission 1 (your 10 minutes)
- 🟡 Live revenue — waits on Paystack review → paste `sk_live_…`
- 🟡 Public repo sync — Mission 6
