# RagScrape Marketing Playbook — the full system

Supersedes the "weekly cadence" sketch in launch-kit.md. RagBot (daily dev.to
posts) is the content engine; this playbook is everything around it.

**Positioning one-liners (use the right one per room):**
- Devs building RAG: *"One call: URL → heading-aligned chunks + embeddings.
  contentHash means you never re-embed unchanged pages."*
- Agent builders: *"Give your agent the web: rag_scrape + rag_crawl as MCP
  tools, free key, self-serve."*
- Indie hackers: *"'Scrape to Markdown' is free everywhere. I sell the
  pipeline after it: chunking, embeddings, change detection, llms.txt."*
- Everyone: *"Firecrawl scrapes. Jina reads. RagScrape indexes."*

**Honest-limits FAQ (memorize — trust converts):**
No JS rendering (SPA pages come back thin) · no robots.txt checking ·
same-host crawl only, ≤100 pages · KV counters aren't atomic under heavy
concurrency · embedding model is bge-small (384-dim), not OpenAI.

**Scope added (this build):** programmatic-SEO pages live at
`/vs/firecrawl` + `/vs/jina-reader` + `/llms-txt-generator` (second free tool)
+ `/sitemap.xml` (all in robots.txt) · `/convert` is now an embeddable widget
(X-Frame-Options off — the iframe snippet is in §3.7) · repo has npm/tests/MCP
badges + 10 topics + description/homepage · `CONTENT-ARSENAL.md` holds
fully-written Quora answers, newsletter/press emails, 2 more Reddit posts,
LinkedIn series, DM template, PH assets · `marketing/make/ragbot-weekly.blueprint.json`
= Sunday 1,000-word deep-dive DRAFTS for your review.

---

## 1. Channels by ROI

### TIER S — do these, they convert
| Channel | Action | Cadence |
|---|---|---|
| **Show HN** | Pre-written in launch-kit §1. Post Tue–Thu 13:00–16:00 Nairobi. Reply to every comment for 48h | Once now, again at v3 |
| **Reddit** (r/LLMDevs, r/SideProject, r/mcp, r/LocalLLaMA, r/Rag) | One pre-written post/day (launch-kit §2), then 1 helpful comment/day on OTHER people's threads (F5Bot leads) | Daily 15 min |
| **F5Bot radar** | 8 keywords armed → reply where genuinely relevant | Alerts → same day |
| **dev.to (RagBot)** | Auto-posts daily 10:00. Your job: reply to every reader comment | Passive + 10 min/day |

### TIER A — compounding, start week 1–2
| Channel | Action | Cadence |
|---|---|---|
| **LinkedIn** | Repost each RagBot article as a personal post (template §3.1). Dev-LinkedIn is underpriced | 2×/week |
| **X/Twitter** | Thread template §3.2 on launch day; then reply-guy strategy: 3 smart replies/day on AI-eng tweets. Posting via API needs pay-per-use credits (~$1/mo) — or post manually from the thread text | Launch + daily replies |
| **GitHub compounding** | PR your repo into awesome-lists (§3.4 template): search GitHub "awesome rag", "awesome llm", "awesome mcp servers" → add RagScrape under tools | 3 PRs, week 1 |
| **MCP directories** | Submit server to: mcp.so, Smithery, PulseMCP, Glama, mcpservers.org (each: name, npx command, description — 10 min each) | Once |
| **API directories** | Postman Public API Network, RapidAPI (list free tier), APIs.guru, SwaggerHub | Once |

### TIER B — week 2–4
| Channel | Action |
|---|---|
| **Product Hunt** | Week 2–3, Tuesday 00:01 PT. Tagline: "The RAG data pipeline in one API call". Prepare: 2 screenshots (/convert + pricing), maker comment = your build story (Kenya, solo, Cloudflare free tier) |
| **Indie Hackers** | Milestone post: "From Stripe rejection to first API product — build log" |
| **Quora** | Answer "How do I convert web pages to markdown for LLMs?"-type questions (template §3.3) |
| **Newsletters** | Cold-pitch TLDR Newsletter, console.dev, JavaScript Weekly, AI Weekly (template §3.5) |
| **African tech press** | Techpoint Africa, TechCabal, Techweez: "Kenyan developer builds AI data infrastructure on Cloudflare's free tier" (template §3.6) — the Kenya angle is genuinely newsworthy there |

### TIER C — compounding SEO ✅ BUILT (live now)
- ✅ `/vs/firecrawl` + `/vs/jina-reader` — honest comparisons, cached 24h, in sitemap
- ✅ `/llms-txt-generator` — second free tool (its own keyword: "llms.txt generator")
- ✅ `/sitemap.xml` + robots Sitemap line; all pages cache-cached for crawlers
- ✅ `/convert` embeddable (X-Frame-Options off) — every blogger embed = backlink
- ✅ Repo: badges, 10 topics, description/homepage set via API
- Target keywords: "url to markdown api", "llms.txt generator", "rag chunking api",
  "firecrawl alternative", "markdown chunking for rag" — pages now exist for each
- Next (when traffic data justifies): add `?embed=1` usage examples page

---

## 2. The 30-day calendar

| Day | Post/Action (30–60 min) |
|---|---|
| 1 (Tue) | **Show HN** + first-comment; F5Bot armed; LinkedIn repost of dev.to #1 |
| 2 | r/LLMDevs post; reply to all HN comments |
| 3 | r/SideProject post; 3 awesome-list PRs |
| 4 | r/mcp post; MCP directory submissions (2 of 5) |
| 5 | MCP directories (rest); Quora answer #1 |
| 6 | API directory submissions; reply to everything |
| 7 (Mon) | LinkedIn post #2 (RagBot article angle); weekly scorecard |
| 8 | r/LocalLLaMA post (adjust: emphasize local/self-serve) |
| 9 | Newsletter cold-pitches (3 emails) |
| 10 | African press pitches (2 emails) |
| 11 | Quora answer #2; F5Bot replies |
| 12 | **Product Hunt prep**: account, gallery, maker comment draft |
| 13 | Buffer day (catch up on replies — this is the real work) |
| 14 (Mon) | Weekly scorecard; **launch Product Hunt Tue 3am** … |
| 15 | **Product Hunt launch day** — reply to every comment |
| 16–20 | PH follow-up; 1 Reddit comment/day; Quora #3 |
| 21 | Scorecard; pick top RagBot article → submit to Lobsters? |
| 22–27 | Keep cadence; start `/vs/` pages if traffic data suggests demand |
| 28–30 | Month review: which channel produced sign-ups? Double down there, drop the rest |

---

## 3. Templates

### 3.1 LinkedIn repost (for each RagBot article)
> Most RAG pipelines break at the boring part: getting clean data in.
> Wrote about why heading-aligned chunking beats fixed-size splitting —
> with a curl example you can run in 30 seconds. [link]
> Free tier, no card. Feedback welcome.
(2–3 lines max; LinkedIn punishes links in body — put in first comment if reach matters)

### 3.2 X thread (launch day, 5 posts)
1/ Every RAG tutorial skips the worst part: the data pipeline. Four vendors, three API keys, zero change detection. I built the whole thing into one API call 🧵
2/ The pitch: POST /scrape {"url":…, "chunk":true, "embed":true} → Markdown + heading-aligned chunks + 384-dim vectors. Code fences never split.
3/ The feature nobody offers: every response carries contentHash. Send it back as ifNoneHash → unchanged pages return {"unchanged":true}. Re-index daily without re-paying.
4/ Also: docs-site crawler → llms.txt in one call. MCP server so agents can use it directly. Free converter, no signup: [link]
5/ Free key = 50 req/mo, no card. Built on Cloudflare's free tier, from Nairobi. Roast it: [repo link]

### 3.3 Quora answer skeleton
Direct answer first (3–4 sentences, actually useful) → "I ended up building
an API for this because the DIY path has 4 failure modes: …" → link. Never
lead with the link.

### 3.4 awesome-list PR description
> Adds [RagScrape](https://github.com/owerryking-beep/rag-scrape) — URL →
> RAG-ready Markdown API with heading-aligned chunking, optional embeddings,
> change-aware re-indexing (contentHash), docs crawler + llms.txt generation,
> and an MCP server. Free tier, self-serve.

### 3.5 Newsletter cold-pitch (subject: "Tool tip: one-call RAG data pipeline")
> Hi [name] — 3-line tip for [newsletter]: RagScrape turns any URL into
> RAG-ready chunks + embeddings in one API call, with contentHash-based
> change detection so re-indexing unchanged pages costs nothing. Free key,
> no card: https://rag-scrape-api.owerryking.workers.dev Built by a solo dev
> in Kenya on Cloudflare's free tier. Worth a look if you cover dev tools.

### 3.6 African press pitch (subject: "Kenyan dev ships AI data API on free tier")
> [Name] — a build story your readers might like: a solo developer in Nairobi
> built and launched a developer API (URL → RAG-ready Markdown, chunks,
> embeddings) entirely on Cloudflare's FREE tier, after Stripe rejected
> Kenyan payouts and Lemon Squeezy's KYC blocked him — so payments now run
> on Paystack with M-Pesa. Happy to share numbers and lessons.
> https://rag-scrape-api.owerryking.workers.dev

---

## 4. Measurement (Sunday, 10 minutes)

UTM every link you control: `?utm_source=hn|reddit|linkedin|quora|newsletter`

| Funnel stage | Where to look | Healthy signal (month 1) |
|---|---|---|
| Visitors | dev.to stats, HN score, utm hits | 300–1,000 |
| Free keys registered | my claim: check Make/convert usage; ask me for a /register count endpoint | 30–150 |
| Paid checkouts | Paystack dashboard (test→live) | 1–10 |
| RagBot articles | views per angle → tell me the winner, I reweight the calendar | 1 breakout >500 views |

Funnel math reminder: 2–5% of active free users convert. 100 free keys ≈
2–5 customers ≈ $18–85 MRR. Month 1 goal isn't money — it's **finding the
one channel that produces free keys**, then doing 10× of that in month 2.

## 3.7 The embed widget (viral loop — put this in every article footer)
```html
<iframe src="https://rag-scrape-api.owerryking.workers.dev/convert"
        style="width:100%;height:720px;border:0;border-radius:12px"
        loading="lazy" title="RagScrape — free URL to Markdown"></iframe>
```
Framing is explicitly allowed. Every embed is a permanent backlink + demo.

## 5. Budget
$0 now. First $20 of revenue → domain (ragscrape.dev) — I wire it same day.
Optional later: X API credits (~$1–3/mo), Product Hunt assets (free via
Canva), everything else stays free.
