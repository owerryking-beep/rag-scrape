/**
 * Programmatic SEO: honest comparison pages. Honest tables (including where
 * competitors win) rank better and convert better than ads — and almost
 * nobody publishes them in this niche.
 */
import { Hono } from "hono";
import type { HonoEnv } from "../types.js";

export const vsRouter = new Hono<HonoEnv>();

const BASE = "https://rag-scrape-api.owerryking.workers.dev";

interface Row { feature: string; rs: string; other: string }
interface Page { slug: string; name: string; tagline: string; rows: Row[]; verdict: string }

const PAGES: Page[] = [
  {
    slug: "firecrawl",
    name: "Firecrawl",
    tagline: "Great scraper. RagScrape is the pipeline after it.",
    rows: [
      { feature: "URL → clean Markdown", rs: "✅", other: "✅" },
      { feature: "Heading-aligned RAG chunks (fence-safe)", rs: "✅", other: "⚠️ generic splitting" },
      { feature: "Embeddings in the same call", rs: "✅ 384-dim, Workers AI", other: "❌ separate vendor" },
      { feature: "Change detection (skip unchanged pages)", rs: "✅ contentHash / ifNoneHash", other: "❌ re-embed everything" },
      { feature: "llms.txt generation for any site", rs: "✅ POST /llms-txt", other: "❌" },
      { feature: "Docs-site crawler → files + llms.txt", rs: "✅ ≤100 pages", other: "✅ at scale" },
      { feature: "JavaScript/SPA rendering", rs: "❌ (on the roadmap)", other: "✅" },
      { feature: "MCP server included", rs: "✅ npx rag-scrape mcp", other: "✅" },
      { feature: "Free no-signup tool", rs: "✅ /convert", other: "⚠️ trial credits" },
      { feature: "Paid entry", rs: "$9/mo (2,000 req)", other: "see current pricing" },
    ],
    verdict:
      "Choose Firecrawl if you need JavaScript-rendered SPA scraping at scale today. " +
      "Choose RagScrape if your pipeline starts after the fetch: chunks aligned to headings, " +
      "vectors, change-aware re-indexing and llms.txt — from $9/mo, free tier, no card.",
  },
  {
    slug: "jina-reader",
    name: "Jina Reader",
    tagline: "Excellent reader. RagScrape reads less — and indexes more.",
    rows: [
      { feature: "URL → clean Markdown", rs: "✅", other: "✅" },
      { feature: "Heading-aligned RAG chunks (fence-safe)", rs: "✅", other: "❌" },
      { feature: "Embeddings in the same call", rs: "✅ 384-dim, Workers AI", other: "❌" },
      { feature: "Change detection (skip unchanged pages)", rs: "✅ contentHash / ifNoneHash", other: "❌" },
      { feature: "llms.txt generation for any site", rs: "✅ POST /llms-txt", other: "❌" },
      { feature: "Docs-site crawler → files", rs: "✅ ≤100 pages", other: "✅ via sitemap" },
      { feature: "JavaScript/SPA rendering", rs: "❌ (on the roadmap)", other: "✅" },
      { feature: "Token slimming (strip links/images)", rs: "✅ fence-aware", other: "❌" },
      { feature: "Free no-signup tool", rs: "✅ /convert", other: "✅ rate-limited" },
      { feature: "Paid entry", rs: "$9/mo (2,000 req)", other: "see current pricing" },
    ],
    verdict:
      "Jina Reader is a superb fetch-and-read utility. RagScrape is the pipeline: it returns " +
      "chunks your vector DB can use directly, embeds them in the same call, and tells you " +
      "when a page hasn't changed so you never re-pay for identical content.",
  },
];

function page(p: Page): string {
  const rows = p.rows
    .map(
      (r) =>
        `<tr><td style="padding:10px 12px;border-bottom:1px solid #1f2937">${r.feature}</td>` +
        `<td style="padding:10px 12px;border-bottom:1px solid #1f2937;text-align:center">${r.rs}</td>` +
        `<td style="padding:10px 12px;border-bottom:1px solid #1f2937;text-align:center">${r.other}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RagScrape vs ${p.name} — honest comparison</title>
<meta name="description" content="RagScrape vs ${p.name}: an honest feature comparison for RAG pipelines — chunking, embeddings, change detection, llms.txt, pricing and limits.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>">
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1220;color:#e5e7eb;margin:0;padding:40px 20px}main{max-width:820px;margin:0 auto}h1{font-size:30px;letter-spacing:-.02em}p.tag{color:#9ca3af;font-size:17px}table{width:100%;border-collapse:collapse;margin:24px 0;font-size:14px}th{color:#9ca3af;text-align:left;font-weight:600;padding:10px 12px;border-bottom:2px solid #374151}th.c,td.c{text-align:center}a{color:#818cf8;text-decoration:none}a.btn{display:inline-block;background:#6366f1;color:#fff;padding:12px 20px;border-radius:10px;font-weight:600;margin-top:8px}.verdict{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:18px 20px;line-height:1.6;font-size:15px}.note{color:#6b7280;font-size:13px;margin-top:24px}</style>
</head><body><main>
<h1>RagScrape vs ${p.name}</h1>
<p class="tag">${p.tagline}</p>
<table><thead><tr><th>Feature</th><th class="c">RagScrape</th><th class="c">${p.name}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="verdict"><strong>Verdict.</strong> ${p.verdict}</div>
<a class="btn" href="/">Try RagScrape free — 50 req/mo, no card →</a>
<a class="btn" style="background:#1f2937;margin-left:8px" href="/convert">Just convert one URL</a>
<p class="note">Comparisons are honest to the best of our knowledge (${new Date().toISOString().slice(0, 10)}) — competitors' features change; check their docs. RagScrape's known limits are listed, not hidden.</p>
</main></body></html>`;
}

for (const p of PAGES) {
  const html = page(p);
  vsRouter.get(`/vs/${p.slug}`, (c) => {
    c.header("Cache-Control", "public, max-age=86400");
    return c.html(html);
  });
}
