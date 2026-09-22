# rag-scrape

Convert any URL to clean, LLM-ready Markdown — from your terminal.

Built for RAG pipelines: scrape a URL, get structured Markdown (headings,
lists, links, fenced code blocks with language tags) instead of messy HTML.

- **Free tier:** 50 requests/month — no card required
- **Pro:** $19/month — 10,000 requests/month
- Hosted on Cloudflare Workers; typical response < 500 ms

## Install

```bash
npx rag-scrape https://example.com
```

No install needed — `npx` fetches it. (Or `npm i -g rag-scrape` for a
permanent `rag-scrape` command.)

## Usage

```bash
# Scrape a URL (uses the shared demo key — 5 requests/IP, for trying it out)
npx rag-scrape https://example.com

# Get your own free key (50 reqs/mo)
npx rag-scrape register you@example.com
export RAG_SCRAPE_API_KEY="rsk_..."

# Scrape with your key
npx rag-scrape https://example.com --api-key "$RAG_SCRAPE_API_KEY"

# Add YAML front-matter (title, source, word count)
npx rag-scrape https://example.com -m

# Save to a file instead of stdout
npx rag-scrape https://example.com -o article.md

# Raw JSON response (markdown + metadata)
npx rag-scrape https://example.com -j

# Batch: process a file of URLs into ./output/*.md
npx rag-scrape batch urls.txt --api-key "$RAG_SCRAPE_API_KEY"
```

## Options

| Flag | Description |
|---|---|
| `-k, --api-key <key>` | API key (falls back to `$RAG_SCRAPE_API_KEY`, then the demo key) |
| `-b, --base-url <url>` | API base URL (for self-hosted / local dev) |
| `-o, --output <file>` | Save to file instead of stdout |
| `-m, --metadata` | Prepend YAML front-matter |
| `-j, --json` | Output raw JSON |
| `-q, --quiet` | No spinner / info output |

## API

- `POST /scrape` — `{ "url": "https://…" }` with `Authorization: Bearer <key>`
- `POST /register` — `{ "email": "you@example.com" }` → free key
- `GET /health` — liveness
- API home: <https://rag-scrape-api.owerryking.workers.dev>

## Also available

- **GitHub Action** — scrape a list of URLs in CI and commit the Markdown:
  see `github-action/` in the [repository](https://github.com/owerryking-beep/rag-scrape).

## License

MIT

## Crawl a docs site

```bash
npx rag-scrape crawl https://docs.example.com --include /docs --max-pages 30
# → ./crawled-docs/<host>/*.md  +  ./crawled-docs/llms.txt
```

Same-host BFS crawler with `--include`/`--exclude` path-prefix filters. Every
successfully crawled page costs 1 request against your monthly quota (free
key = 50 pages/mo). `--llms-txt` also prints the generated `llms.txt`.

## MCP server (Claude Desktop, agents)

```bash
npx rag-scrape mcp --api-key rsk_…
```

Runs a [Model Context Protocol](https://modelcontextprotocol.io) stdio server
exposing two tools: `rag_scrape` (single URL → Markdown, optional RAG chunks)
and `rag_crawl` (docs-site crawl + llms.txt). Example `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rag-scrape": {
      "command": "npx",
      "args": ["-y", "rag-scrape", "mcp"],
      "env": { "RAG_SCRAPE_API_KEY": "rsk_…" }
    }
  }
}
```

## RAG-ready chunking

```bash
curl -s https://rag-scrape-api.owerryking.workers.dev/scrape \
  -H "Authorization: Bearer $RAG_SCRAPE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/docs","chunk":true,"chunkSize":4000}'
```

`chunks[]` aligns to headings, never breaks code fences, and carries
`headingPath` for citation metadata — ready for your vector store.
