# Content Arsenal — fully written, ready to fire

Everything here is complete copy. Edit the bracketed bits, press post.

---

## 1. Quora answers (post as-is)

**Q: "How do I convert HTML web pages to Markdown for LLM/RAG pipelines?"**

> The naive path (requests + html2text) breaks on four things: boilerplate
> (nav/footers polluting chunks), relative links, code fences split mid-block,
> and no way to know when a page changed so you can re-index.
>
> A robust pipeline is: fetch → strip boilerplate (Mozilla Readability) →
> convert to Markdown with code fences intact → chunk along headings, not
> fixed token counts → embed each chunk → store a content hash so tomorrow's
> run skips unchanged pages.
>
> I built an API that does all five steps in one call (RagScrape —
> https://rag-scrape-api.owerryking.workers.dev ). Free tier is 50
> requests/month, no card, and there's a no-signup converter at /convert if
> you just need one page. If you'd rather DIY, Readability + a heading-aware
> splitter is the minimum honest stack.

**Q: "What is llms.txt and how do I create one?"**

> llms.txt (llmstxt.org) is a markdown file at your site root that tells AI
> tools what your site contains — the equivalent of robots.txt for AI
> indexing, but curative instead of restrictive. Format: an H1, a blockquote
> summary, then a list of `[title](url): description` lines.
>
> Easiest creation path: https://rag-scrape-api.owerryking.workers.dev/llms-txt-generator
> — enter your site, it crawls your pages and writes the file for you (free).
> Save it as llms.txt, upload to your site root, done. Docs sites benefit
> most because assistants can finally cite the right page.

---

## 2. Newsletter pitches (send individually — never BCC)

**TLDR Newsletter** — submit via tldr.tech/advertise … no, for tools use:
`feedback@tldr.tech` subject "Tool suggestion for TLDR AI"
> RagScrape — one API call turns any URL into RAG-ready Markdown with
> heading-aligned chunks + embeddings, and contentHash change detection so
> re-indexing skips unchanged pages. Free converter, free key, MCP server
> included. Built by a solo dev in Nairobi on Cloudflare's free tier:
> https://rag-scrape-api.owerryking.workers.dev

**console.dev** — submissions form at console.dev/submit
> console.dev readers love a good API. RagScrape: POST a URL, get RAG-ready
> chunks + embeddings back; crawl a docs site, get llms.txt. Free tier 50
> req/mo. Built with Hono + Readability + Workers AI on Cloudflare Workers.
> https://rag-scrape-api.owerryking.workers.dev

**JavaScript Weekly** — `news@javascriptweekly.com` subject "Site suggestion"
> Readers building AI features keep reinventing scraping → chunking →
> embedding. RagScrape collapses it to one call with an OpenAPI spec, MCP
> server and a free no-signup converter. From Nairobi, on CF free tier:
> https://rag-scrape-api.owerryking.workers.dev

**AI Weekly / The Batch** — same skeleton, lead with the llms.txt generator
free tool (most newsworthy angle this month).

---

## 3. Press emails (the Kenya story is the hook)

**Techpoint Africa** — editors@techpoint.africa
**TechCabal** — via techcabal.com/contact
**Techweez** — tips@techweez.com

Subject: Kenyan developer ships AI data-API entirely on Cloudflare's free tier
> Hi — build story from Nairobi your readers may enjoy: after Stripe
> rejected Kenyan payouts and Lemon Squeezy's KYC blocked him, [YOUR NAME]
> launched RagScrape — an API that turns any URL into AI-ready data
> (Markdown, RAG chunks, embeddings, llms.txt generation) — running
> entirely on Cloudflare's FREE tier, with payments on Paystack (M-Pesa).
> Full build log, real numbers, and the repo are open:
> https://github.com/owerryking-beep/rag-scrape
> https://rag-scrape-api.owerryking.workers.dev
> Happy to share MRR and lessons learned. — [NAME, phone]

---

## 4. Two more Reddit posts

**r/LocalLLaMA** — title: `Free self-serve pipeline for local RAG: URL → chunks + embeddings (bge-small), no card`
> Running local models means you already know the data pipeline is the
> bottleneck. RagScrape turns any URL into heading-aligned chunks with
> bge-small (384-dim) embeddings in one call — drop the vectors straight
> into your local Chroma/Qdrant/LanceDB. contentHash change detection means
> nightly re-indexing skips unchanged pages instead of burning tokens.
> Free key = 50 req/mo, no card, OpenAPI spec included:
> https://rag-scrape-api.owerryking.workers.dev/openapi.json
> Honest limits: no JS rendering, same-host crawl ≤100 pages.

**r/Rag** — title: `What I learned building change-aware re-indexing for web RAG`
> Write-up + tool: most RAG demos scrape once and never update; production
> needs the opposite. I gave every scrape a contentHash — send it back as
> ifNoneHash and unchanged pages return {unchanged:true} with zero content
> cost. Combined with heading-aligned chunking (never split code fences),
> re-indexing a 100-page docs site daily costs only what actually changed.
> Implementation notes + free tier: https://rag-scrape-api.owerryking.workers.dev
> Repo: https://github.com/owerryking-beep/rag-scrape — critique welcome.

---

## 5. LinkedIn series (one per week, 2–3 lines + article link)

1. *"Your RAG isn't bad. Your chunks are."* → chunking article
2. *"Stop re-embedding pages that didn't change."* → change-detection article
3. *"robots.txt told crawlers where NOT to go. llms.txt tells AI what to read."* → llms.txt article
4. *"I shipped an AI API on $0 of infrastructure. Here's the stack."* → build story
5. *"Agents don't read your landing page. They read your OpenAPI spec."* → /openapi.json + MCP

## 6. Direct outreach DM (X/LinkedIn, only when genuinely relevant)
> Saw your thread about [specific pain]. Built exactly that as an API —
> one call returns RAG-ready chunks + embeddings, free key no card:
> https://rag-scrape-api.owerryking.workers.dev/convert — if it saves you a
> weekend, it did its job.

## 7. Product Hunt assets (prepared)
- **Name:** RagScrape · **Tagline:** The RAG data pipeline in one API call
- **Description:** Turn any URL into LLM-ready Markdown — with heading-aligned chunks, embeddings, change-aware re-indexing and llms.txt generation. Free converter, free API key, MCP server. Built solo in Kenya on Cloudflare's free tier.
- **Maker comment draft:** I kept hitting the same wall: scraping was solved, but everything AFTER the scrape (chunking → embedding → re-indexing → llms.txt) was 4 vendors and a pile of glue code. RagScrape is that whole pipeline as one call. The feature I'm proudest of: contentHash — send it back and unchanged pages return nothing, so daily re-indexing costs almost nothing. Honest limits: no JS rendering yet. Roast it.
- **Gallery:** /convert screenshot, /llms-txt-generator screenshot, pricing screenshot.
