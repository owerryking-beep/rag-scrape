# RagScrape — URL → clean Markdown, at the edge

One API call turns any public URL into clean, LLM-ready Markdown. Built for
RAG pipelines, knowledge bases, and AI agents.

## Live now

- **API + storefront:** <https://rag-scrape-api.owerryking.workers.dev>
- **Source:** <https://github.com/owerryking-beep/rag-scrape>
- Plans: **Free** 50/mo · **Starter** $9/mo 2 000 · **Pro** $19/mo 10 000 ·
  **Unlimited** $49/mo 1 000 000 (Lemon Squeezy checkout; merchant of record —
  pays out to Kenya. Switched from Stripe 2026-09-21: Stripe live activation
  requires US-only identity + bank details.)

### The gaps we fill (why this isn't "another scraper")

| Gap | RagScrape | Typical tools |
|---|---|---|
| Sites have no `/llms.txt` | `POST /llms-txt` crawls & generates one | — |
| Re-indexing re-pays for unchanged pages | `contentHash` + `ifNoneHash` → `unchanged:true`, zero content tokens | re-scrape & re-embed everything |
| LLM context tokens wasted on links/images | `stripLinks` / `stripImages` (fence-aware) | — |
| Scrape → chunk → embed = 3 vendors | `embed: true` → chunks with 384-dim vectors in one call (Workers AI) | stitch it yourself |
- Free no-signup web tool: <https://rag-scrape-api.owerryking.workers.dev/convert>
- RAG-ready chunking (`POST /scrape` with `chunk: true`) and a same-host
  docs crawler (`POST /crawl` → pages + `llms.txt`).

- **Module 1** — Cloudflare Worker API (`worker/`): Hono + `@mozilla/readability`
  (on linkedom's DOM) + a custom Markdown converter. KV-based API keys,
  monthly rate limits, Stripe Checkout + webhooks.
- **Module 2** — Node.js CLI (`cli/`): `npx rag-scrape <url>` with `ora`
  spinner, free-key registration, and batch mode.
- **Module 3** — GitHub Action (`github-action/`): scrape a URL list, write
  Markdown files, commit & push.
- **Module 4** — Lemon Squeezy payments + landing page (`landing/index.html`):
  $19/mo Pro subscription (10 000 calls) with Tailwind + Alpine.

```
 CLI / Action / your code
        │  POST /scrape { url }
        ▼
┌─────────────────────────── Cloudflare Worker ───────────────────────────┐
│  Hono app                                                               │
│  ├─ auth middleware      Bearer key → KV lookup (or per-IP demo meter)  │
│  ├─ rate-limit middleware  monthly counter in KV, 402 when exhausted    │
│  └─ POST /scrape         fetch → SSRF guard → linkedom DOM →            │
│                          Readability → custom HTML→MD converter         │
│  POST /register    free key (50/mo)                                     │
│  POST /create-checkout  Lemon Squeezy hosted checkout ($19/mo)        │
│  POST /webhook     LS events (X-Signature HMAC) → KV tier upgrade       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Verified status

Everything below was executed, not assumed:

| Check | Result |
|---|---|
| Worker `tsc --noEmit` (strict + noUncheckedIndexedAccess) | ✅ clean |
| Worker unit tests (converter, extractor, LS webhooks, chunker, crawler) | ✅ 45/45 |
| `wrangler dev --local` end-to-end | ✅ 200 live scrape, real `example.com` fetch |
| Auth: no key / bad format / unknown key | ✅ 401 |
| Demo key: 5 uses then blocked | ✅ 429 `DEMO_LIMIT_EXCEEDED` |
| Monthly limit exhausted | ✅ 402 `RATE_LIMIT_EXCEEDED` |
| SSRF: `file://`, `127.0.0.1`, `169.254.169.254` | ✅ 400/403 |
| Validation: missing url, bad JSON, 404 route | ✅ 400/404 |
| CORS + `X-RateLimit-*` headers | ✅ present |
| CLI build + scrape/register/error paths against live local API | ✅ |
| Action `tsc` + `ncc` bundle + live smoke run (success, 404, outputs, key masking) | ✅ |
| Production deploy (`wrangler deploy` → `*.workers.dev`) | ✅ live, `/health` 200 |
| Public-URL e2e: scrape / register / demo key / rate limits | ✅ |
| Stripe test-mode money loop (session → signed webhook → upgrade) | ✅ free (50/mo) → Pro (10 000/mo) proven on the live worker |
| CLI register / scrape / front-matter / batch vs production | ✅ |

---

## Module 1 — Worker API

### Setup

```bash
cd worker
npm install

# 1. Create KV namespaces and paste the ids into wrangler.toml
wrangler kv:namespace create API_KEYS          # → id + preview_id
wrangler kv:namespace create RATE_LIMITS       # → id + preview_id

# 2. Secrets (never commit)
wrangler secret put LS_API_KEY                 # Lemon Squeezy API key
wrangler secret put LS_WEBHOOK_SECRET          # webhook signing secret

# 3. Set LS_STORE_ID / LS_VARIANT_ID / success & cancel URLs in wrangler.toml
#    (store + variant IDs: GET https://api.lemonsqueezy.com/v1/stores|variants)
# 4. Deploy
wrangler deploy
# → https://rag-scrape-api.<sub>.workers.dev
```

Local development: `npm run dev` (Miniflare, simulated KV).

> **Local-KV gotcha (discovered while testing):** `wrangler dev --local`
> simulates bindings using the **preview** id, so local CLI KV operations
> must target it too:
> `npx wrangler kv:key put --local --preview --binding=API_KEYS <key> <json>`
> Using `--preview false` writes to a *different* local namespace that the
> dev server never sees.

### API reference

| Endpoint | Auth | Description |
|---|---|---|
| `GET /` | – | Landing page (HTML storefront; `?key=` / `?checkout=` handled client-side) |
| `GET /api` | – | Service info (JSON) |
| `GET /convert` | – | Free no-signup URL→Markdown web tool (demo quota) |
| `GET /health` | – | Liveness |

`POST /scrape` extras: `chunk`/`chunkSize` (heading-aligned, fence-safe),
`embed: true` (chunks gain 384-dim `embedding`, Workers AI bge-small),
`stripLinks`/`stripImages` (token slimming), `ifNoneHash` (change-aware:
returns `unchanged: true` + `contentHash` when the page hasn't changed).
| `POST /scrape` | Bearer key | `{ url, chunk?, chunkSize? }` → `{ markdown, metadata, chunks? }` |
| `POST /crawl` | Bearer key | `{ url, maxPages?, includePaths?, excludePaths? }` → `{ pages[], llmsTxt, stats }` (same-host, ≤100 pages, 1 req/page) |
| `POST /llms-txt` | Bearer key | same input → `{ llmsTxt, stats }` only (no page payloads) |
| `POST /register` | – | `{ "email": string }` → free key (50 reqs/mo) |
| `POST /create-checkout` | – | `{ "email", "apiKey"? }` → `{ checkoutUrl }` (Lemon Squeezy hosted) |
| `POST /webhook` | LS `X-Signature` HMAC | `subscription_created/updated/expired`, `subscription_payment_success` |

Error shape (all failures):

```json
{ "success": false, "error": { "code": "FETCH_ERROR", "message": "…", "details": "HTTP 404" } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | missing/bad/unknown key |
| `KEY_INACTIVE` | 403 | key deactivated |
| `DEMO_LIMIT_EXCEEDED` | 429 | demo key: 5 reqs / IP / 30 days |
| `RATE_LIMIT_EXCEEDED` | 402 | monthly limit exhausted (upgrade hint for free tier) |
| `INVALID_JSON` / `MISSING_URL` / `URL_TOO_LONG` | 400 | bad request |
| `FETCH_ERROR` | 4xx/5xx | mirrors target status; 403 SSRF, 415 non-HTML, 422 no article, 502 unreachable, 504 timeout |

Success responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset` (exposed via CORS).

### Extraction pipeline

1. `normalizeUrl` — adds `https://`, rejects non-http(s) schemes (400).
2. `assertNotBlocked` — SSRF guard: localhost, RFC1918, link-local/metadata
   IP, IPv6 literals, `file:`/`ftp:`/`data:`/etc.
3. `fetch` — 15 s timeout, redirect-follow, HTML content-type check
   (sniff-only when the header is absent).
4. linkedom `parseHTML` → conservative noise removal (ads, nav, footer,
   comments, cookie banners — **not** `<header>`, so bylines survive).
5. `<base href>` injection → `Readability.parse()` → absolutised links.
6. Custom DOM→Markdown walker (headings, lists incl. nesting, tables with
   escaped pipes, fenced code with language, blockquotes, images).
7. `cleanMarkdown` — whitespace normalization, single trailing newline.

### Known limitations (deliberate trade-offs)

- **KV counters are not atomic.** Under heavy concurrency the rate-limit
  counter can drift by a request or two. For strict accounting, move the
  counter to a Durable Object.
- **DNS rebinding** (public domain resolving to a private IP) is not caught —
  Workers provides no post-resolution hook before `fetch`.
- **`/register` is unauthenticated** by design (frictionless free tier).
  Mitigation if abused: Cloudflare Turnstile challenge or an IP-registration
  cap in front of it.
- **Lemon Squeezy webhook events are subscribed via the LS API** — the worker
  expects `LS_WEBHOOK_SECRET` to match the webhook's signing secret. Fees ≈
  5 % + $0.50 (+ intl/subscription surcharges).
- `@mozilla/readability` 0.5.0 has no `url` option; relative URLs are
  absolutised via the injected `<base>` tag **and** the converter's
  `baseUrl` fallback (belt and suspenders).

---

## Module 2 — CLI

```bash
cd cli && npm install && npm run build

# Single URL (demo key fallback, 5 reqs/IP)
node dist/index.js https://example.com
npx rag-scrape https://example.com          # once published to npm

# Your own key: --api-key, or export RAG_SCRAPE_API_KEY=…
node dist/index.js https://example.com -k rsk_…

# Self-hosted / local dev (also: RAG_SCRAPE_API_URL env)
node dist/index.js https://example.com -b http://127.0.0.1:8787 -k rsk_…

# Output file + YAML front-matter / raw JSON
node dist/index.js https://example.com -o article.md --metadata
node dist/index.js https://example.com -j

# Free key (50/mo)
node dist/index.js register you@example.com

# Crawl a docs site → ./crawled-docs/<host>/*.md + llms.txt
node dist/index.js crawl https://docs.example.com --max-pages 30 --include /docs

# MCP server for Claude Desktop / agents (tools: rag_scrape, rag_crawl)
node dist/index.js mcp --api-key rsk_…

# Batch: one URL per line, # comments allowed
node dist/index.js batch urls.txt -d ./docs --delay 1000
```

Notes:
- Native `fetch` (Node ≥ 18) — no `node-fetch`.
- `enablePositionalOptions()` is required: the main command and subcommands
  both define `--base-url`, and without it the parent's option parser
  silently swallows the subcommand's flag (commander 12 default behavior).

---

## Module 3 — GitHub Action

```bash
cd github-action && npm install && npm run build
# builds tsc → dist/ (intermediate, gitignored) and ncc → dist-action/ (commit this)
```

`action.yml` inputs: `urls-file` (required), `api-key` (required),
`output-dir` (default `scraped-docs`), `commit-changes` (default `true`),
`commit-message`, `delay-ms`, `api-url`. Outputs: `files-created`,
`files-failed`, `output-directory`.

Filenames are `<domain>.md` per the spec, extended with a sanitized path
segment when the URL has one (plus an 8-char hash on collision) so two URLs
from the same domain can't overwrite each other.

Example workflow (also in `.github/workflows/scrape.yml`):

```yaml
name: Weekly Scrape
on:
  schedule: [{ cron: "0 6 * * 1" }]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: ./github-action            # or ragscrape/rag-scrape-action@v1
        with:
          urls-file: urls.txt
          output-dir: scraped-docs
          api-key: ${{ secrets.RAG_SCRAPE_API_KEY }}
          delay-ms: "2000"
```

To publish the action: commit `github-action/dist-action/`, tag `v1`, push.

---

## Module 4 — Stripe & landing page

1. **Lemon Squeezy product:** LS dashboard → Products → New product →
   subscription, **$19.00/month** → copy the store + variant IDs →
   `LS_STORE_ID` / `LS_VARIANT_ID` in `wrangler.toml`.
2. **Webhook:** Dashboard → Developers → Webhooks → add endpoint
   `https://<worker>/webhook`. Minimum event:
   `checkout.session.completed` (the production endpoint also adds
   `customer.subscription.updated` / `deleted` and
   `invoice.payment_succeeded` / `failed` so tier changes and payment
   failures sync automatically).
   Copy the signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`.
3. **Flow:** `POST /create-checkout` creates a Lemon Squeezy checkout for the
   Pro variant (key pre-registered at free limits); the key rides along as
   checkout custom data and in the `redirect_url`. On payment the
   `subscription_created` webhook upgrades the key to Pro (10 000/mo);
   `subscription_updated/expired` keeps the tier in sync (cancellations
   downgrade); `subscription_payment_success` resets the monthly counter.
4. **Landing page:** single file, Tailwind + Alpine via CDN — **served by the
   Worker itself at `GET /`** (same origin, no CORS, no extra hosting). The
   HTML is embedded at build time: `node scripts/embed-landing.mjs` regenerates
   `src/generated/landing-html.ts` from `landing/index.html` — run it after
   editing the page, then `wrangler deploy`. The page's `const API` points at
   the Worker URL; Stripe checkout returns to
   `/?checkout=success&key=rsk_…` and the page shows the key in a banner.
   (Optional: `landing/` can also be hosted on Cloudflare Pages — in that case
   add that origin to the CORS allow-list in `src/index.ts`.)

---

## Deployment checklist (exact order)

> **Status (2026-09-21):** steps 1–3 and 6 are **done** on the live instance
> (`https://rag-scrape-api.owerryking.workers.dev`); step 4/5 remain until the
> npm token and live Stripe keys arrive. Keep this checklist for self-hosting
> or re-deploys.

```bash
# 1. Worker
cd worker
npm install
wrangler kv:namespace create API_KEYS        # paste id + preview_id into wrangler.toml
wrangler kv:namespace create RATE_LIMITS     # paste id + preview_id
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
# edit wrangler.toml: STRIPE_PRICE_ID, STRIPE_SUCCESS_URL, STRIPE_CANCEL_URL
npm run typecheck && npm test
wrangler deploy
# → note https://rag-scrape-api.<sub>.workers.dev  (SUB = <sub>)

# 2. Point every client at the deployed URL (single constant per module):
#    cli/src/config.ts            → API_BASE_URL (or RAG_SCRAPE_API_URL at runtime)
#    github-action/action.yml     → default api-url (overridable per workflow)
#    landing/index.html           → const API = '…'
#    .github/workflows/scrape.yml → (optional) api-url input

# 3. Lemon Squeezy webhook (create via LS API, url <worker>/webhook,
#    signing secret → wrangler secret put LS_WEBHOOK_SECRET)

# 4. CLI
cd ../cli && npm install && npm run build
# publish: npm publish (prepublishOnly builds)

# 5. Action
cd ../github-action && npm install && npm run build
git add dist-action && git tag v1 && git push --tags

# 6. Landing
wrangler pages deploy ../landing --project-name ragscrape-landing
```

## Repo layout

```
rag-scrape/
├── worker/            Module 1 — Hono Worker (src/, tests/, wrangler.toml)
├── cli/               Module 2 — rag-scrape CLI (src/, tsc → dist/)
├── github-action/     Module 3 — action.yml + ncc-bundled dist-action/
├── landing/           Module 4 — index.html (Tailwind + Alpine)
├── .github/workflows/scrape.yml
└── urls.txt           sample URL list
```

## Running the tests

```bash
cd worker
npm test        # 25 tests: converter, extractor (fixture page), Stripe HMAC
npm run typecheck
cd ../cli && npm run typecheck
cd ../github-action && npm run typecheck
```
