# RagScrape — URL → clean Markdown, at the edge

One API call turns any public URL into clean, LLM-ready Markdown. Built for
RAG pipelines, knowledge bases, and AI agents.

- **Module 1** — Cloudflare Worker API (`worker/`): Hono + `@mozilla/readability`
  (on linkedom's DOM) + a custom Markdown converter. KV-based API keys,
  monthly rate limits, Stripe Checkout + webhooks.
- **Module 2** — Node.js CLI (`cli/`): `npx rag-scrape <url>` with `ora`
  spinner, free-key registration, and batch mode.
- **Module 3** — GitHub Action (`github-action/`): scrape a URL list, write
  Markdown files, commit & push.
- **Module 4** — Stripe + landing page (`landing/index.html`): $19/mo Pro
  subscription (10 000 calls) with Tailwind + Alpine.

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
│  POST /create-checkout  Stripe Checkout session ($19/mo)                │
│  POST /webhook     Stripe events → KV tier upgrade (HMAC-verified)      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Verified status

Everything below was executed, not assumed:

| Check | Result |
|---|---|
| Worker `tsc --noEmit` (strict + noUncheckedIndexedAccess) | ✅ clean |
| Worker unit tests (converter, extractor, Stripe signature) | ✅ 25/25 |
| `wrangler dev --local` end-to-end | ✅ 200 live scrape, real `example.com` fetch |
| Auth: no key / bad format / unknown key | ✅ 401 |
| Demo key: 5 uses then blocked | ✅ 429 `DEMO_LIMIT_EXCEEDED` |
| Monthly limit exhausted | ✅ 402 `RATE_LIMIT_EXCEEDED` |
| SSRF: `file://`, `127.0.0.1`, `169.254.169.254` | ✅ 400/403 |
| Validation: missing url, bad JSON, 404 route | ✅ 400/404 |
| CORS + `X-RateLimit-*` headers | ✅ present |
| CLI build + scrape/register/error paths against live local API | ✅ |
| Action `tsc` + `ncc` bundle + live smoke run (success, 404, outputs, key masking) | ✅ |

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
wrangler secret put STRIPE_SECRET_KEY          # sk_live_…
wrangler secret put STRIPE_WEBHOOK_SECRET      # whsec_…

# 3. Set STRIPE_PRICE_ID / success & cancel URLs in wrangler.toml
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
| `GET /` | – | Service info |
| `GET /health` | – | Liveness |
| `POST /scrape` | Bearer key | `{ "url": string }` → `{ success, markdown, metadata }` |
| `POST /register` | – | `{ "email": string }` → free key (50 reqs/mo) |
| `POST /create-checkout` | – | `{ "email", "apiKey"? }` → `{ checkoutUrl }` |
| `POST /webhook` | Stripe HMAC | Stripe event sink |

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
- **Stripe API version is pinned** (`2024-06-20`) in `services/stripe.ts` —
  bump deliberately.
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

1. **Stripe product:** Dashboard → Products → subscription, **$19.00/month**,
   copy the price id → `STRIPE_PRICE_ID` in `wrangler.toml`.
2. **Webhook:** Dashboard → Developers → Webhooks → add endpoint
   `https://<worker>/webhook` with events:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_succeeded`,
   `invoice.payment_failed`.
   Copy the signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`.
3. **Flow:** `POST /create-checkout` creates a Checkout session (key pre-
   registered at free limits) and embeds `?key=rsk_…` in the success URL.
   On payment, the webhook upgrades the key in KV to Pro (10 000/mo); the
   landing page shows the key immediately in a green banner (it works even
   before the webhook lands).
4. **Landing page:** single file, Tailwind + Alpine via CDN. Replace the
   `API` constant (top of the `<script>` at the bottom) with your deployed
   Worker URL, then deploy to Cloudflare Pages / Vercel / Netlify:
   `wrangler pages deploy landing --project-name ragscrape-landing`.
   Keep the Worker's CORS allow-list in `src/index.ts` in sync with the
   landing page's origin.

---

## Deployment checklist (exact order)

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

# 3. Stripe webhook (see Module 4) — requires the deployed URL from step 1

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
