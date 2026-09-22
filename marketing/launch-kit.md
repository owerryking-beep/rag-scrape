# RagScrape Launch Kit

Everything below is copy-paste ready. Rule #1 of developer marketing:
**participate, don't spam.** Post, then reply to every comment for 48 hours.
Disclose that it's your product. Honesty about limits (no JS rendering yet)
earns more trust than hype — and trust converts.

**The one-liner:** *The RAG data pipeline in one API call — clean Markdown,
heading-aligned chunks, embeddings, llms.txt, change-aware re-indexing and an
MCP server. Free tier, from $9/mo.*

**Key links:**
- Landing/API: https://rag-scrape-api.owerryking.workers.dev
- Free tool (the hook): https://rag-scrape-api.owerryking.workers.dev/convert
- npm: https://www.npmjs.com/package/rag-scrape
- GitHub: https://github.com/owerryking-beep/rag-scrape

---

## 1. Show Hacker News (biggest single-day shot — post Tue–Thu, 6–9 AM ET)

**Title:**
```
Show HN: RagScrape – URL to RAG-ready chunks, embeddings and llms.txt in one API call
```

**First comment (post it yourself immediately):**
```
Hi HN! I built RagScrape because every RAG tutorial starts the same way:
"first, scrape the docs into Markdown" — and then you're 4 vendors deep
(scrape → chunk → embed → schedule) before you have a single vector stored.

RagScrape collapses that into one API call:

- POST /scrape {"url": …, "chunk": true, "embed": true} → clean Markdown +
  heading-aligned chunks (never split mid-code-block) + 384-dim embeddings
- Every response carries a contentHash — send it back as ifNoneHash and
  unchanged pages return {unchanged: true} instead of re-paying you to
  re-embed identical content
- POST /crawl → a whole docs site as Markdown + a ready llms.txt
- POST /llms-txt → just the llms.txt, for making any site AI-readable
- npx rag-scrape mcp → MCP server so agents can use all of it directly

The free tier is 50 requests/month (no card), and there's a no-signup
converter at https://rag-scrape-api.owerryking.workers.dev/convert

Honest limits: no JS rendering yet (SPA pages come back thin), no robots.txt
handling, and the crawler is same-host only, capped at 100 pages.

Stack: Cloudflare Workers + Readability + a custom HTML→MD converter,
Workers AI for embeddings. Happy to answer architecture questions.

What would you want added before you'd point a pipeline at it?
```

## 2. Reddit (one subreddit per day, engage in comments)

**r/LLMDevs** — title: `I built an API that returns RAG-ready chunks + embeddings from any URL (free tier, MCP included)`
```
Every RAG pipeline needs the same boring plumbing: scrape → clean → chunk →
embed → detect what changed. I wrapped all of it in one API so you can skip
to the interesting part.

Example: one POST with {"url": "...", "chunk": true, "embed": true} returns
Markdown plus chunks aligned to headings (code fences never split) with
384-dim vectors. Re-run tomorrow with the contentHash from today and
unchanged pages cost you nothing.

Free tier: 50 reqs/mo, no card. No-signup demo: /convert (link on the site).
MCP server included so Claude/agents can use it as a tool.

Repo is public — feedback welcome, especially on the chunking strategy.
```

**r/SideProject** — title: `I built RagScrape: URL → Markdown + RAG chunks + embeddings, one API call`
(Same body, more casual, add: "Launch day — roasting welcome.")

**r/mcp** — title: `MCP server for web scraping + docs crawling (rag_scrape / rag_crawl tools)`
```
I packaged my scraping API as an MCP stdio server: npx rag-scrape mcp
(RAG_SCRAPE_API_KEY env). rag_scrape returns clean Markdown (optionally
RAG-chunked + embedded); rag_crawl crawls a docs site and returns every page
plus a generated llms.txt. Free key = 50 calls/mo. Config snippet in the npm
README. Would love feedback from agent builders.
```

**Skip for now:** r/webdev & r/programming (moderators remove self-promo) —
earn the right there later via a pure-text "how I built it" article.

## 3. Product Hunt (week 2, once HN/Reddit dust settles)

- **Tagline (60 chars):** `The RAG data pipeline in one API call`
- **Description:** `RagScrape turns any URL into clean, LLM-ready Markdown — with heading-aligned chunks, embeddings, llms.txt generation and change-aware re-indexing. Includes a free no-signup converter, CLI, GitHub Action and an MCP server.`
- **First comment:** your build story (Kenya, solo, Cloudflare free tier, why chunking strategy matters).
- **Gallery:** screenshot of the /convert tool + the pricing page.

## 4. The article (dev.to → cross-post Hashnode/Medium, publish launch week)

**Title:** `I built a URL-to-embeddings API: 5 things I learned about chunking for RAG`
Outline:
1. Why "scrape to Markdown" is not a product (free alternatives) — but the
   pipeline around it is
2. Heading-aligned chunking: why we never split code fences (show the walker)
3. contentHash/ifNoneHash: incremental re-indexing nobody offers
4. Embeddings on the edge: Workers AI, 384-dim bge-small, one batch call
5. llms.txt: crawling docs sites into AI-ready context
CTA: /convert tool + free key.

## 5. X/Twitter thread (5 posts, launch day)

1/ "Every RAG tutorial skips the worst part: the data pipeline. I built the
whole thing into one API call. 🧵"
2/ The problem: 4 vendors, 3 API keys, 0 change detection.
3/ Demo: curl with chunk+embed → show chunks[] with headingPath + vectors.
4/ The trick nobody offers: contentHash → unchanged pages return
{unchanged:true}. Re-index daily without re-paying.
5/ Free tier (no card) + MCP server for your agents + /convert if you just
need one page right now: [link]

## 6. F5Bot (free — your early-warning radar) — https://f5bot.com

Add these keywords (you get an email when Reddit/HN mentions them — go help,
never lead with your link unless asked):
```
url to markdown
llms.txt
rag chunking
chunking for rag
firecrawl alternative
jina reader alternative
scrape docs for llm
markdown api
```

## 7. Directory listings (one afternoon, permanent SEO)

- [ ] MCP directories: mcp.so, PulseMCP (pulsempc.com), Smithery, Glama,
      mcpservers.org — submit `rag-scrape` MCP server
- [ ] AlternativeTo: "alternative to Firecrawl" / "alternative to Jina Reader"
- [ ] SaaSHub + thereisanai.com + futurepedia (AI tool directories)
- [ ] GitHub: topics on the repo — `rag`, `llm`, `markdown`, `scraper`,
      `embeddings`, `mcp-server`, `llms-txt`
- [ ] API directories: submit `openapi.json` (SwaggerHub, APIs.guru, Postman
      public network, RapidAPI hub listing)

## 10. Agent-discoverability (shipped — use as a talking point)

RagScrape is machine-onboardable end to end — say this in every pitch:
- `GET /openapi.json` — OpenAPI 3.1 spec (agent frameworks auto-learn the API)
- `GET /llms.txt` + `GET /llms-full.txt` — our own docs in llmstxt.org format
- `GET /robots.txt` — explicitly welcomes GPTBot/ClaudeBot/PerplexityBot
- `npx rag-scrape mcp` — MCP tools for Claude/agents
- An agent can self-serve the whole funnel: `POST /register` (free key) →
  scrape until quota → the 402 message carries the upgrade URL. No human
  onboarding anywhere in the loop.
- [ ] npm README already links everything ✓

## 8. RagBot — the autonomous content engine (free, Kenya-safe)

 + : a Make.com
scenario that writes and publishes a fresh marketing post to dev.to **every
day at 09:00 Nairobi time** — free forever (1,000 ops/mo plan). Set it up
first, then the weekly cadence below becomes mostly replies and engagement.

## 9. Weekly cadence (the part that decides everything)

| Day | Action (30–60 min) |
|---|---|
| Mon | 1 Reddit comment where your tool genuinely helps (F5Bot leads) |
| Wed | Short X post or repo improvement (docs/examples) |
| Fri | Reply to every issue/DM; 1 directory or outreach submission |

**Stop-doing list:** no mass DMs, no fake accounts, no buying lists, no
engage-bait. The product's honesty (real limits, real pricing) IS the brand.

## 10. When Paystack review clears

Live keys → paste to your assistant → live KES plans created → flip
PAYMENT_PROVIDER → first real sale. Meanwhile: test-mode money loop is fully
verified, so go-live is a key swap, not a project.
