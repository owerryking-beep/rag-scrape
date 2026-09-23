/**
 * Agent-facing discovery endpoints.
 *
 * AI agents are first-class customers: they find APIs via OpenAPI specs,
 * llms.txt files and robots.txt. Everything here is static, cacheable and
 * cheap — the entire file exists so machines can onboard themselves.
 */
import { Hono } from "hono";
import type { HonoEnv } from "../types.js";

export const agentRouter = new Hono<HonoEnv>();

const BASE = "https://rag-scrape-api.owerryking.workers.dev";

// ── robots.txt ───────────────────────────────────────────────────────────────

const ROBOTS = [
  "User-agent: *",
  "Allow: /",
  "# AI agents are welcome customers — API docs for machines:",
  "User-agent: GPTBot",
  "Allow: /",
  "User-agent: ClaudeBot",
  "Allow: /",
  "User-agent: PerplexityBot",
  "Allow: /",
  "User-agent: Google-Extended",
  "Allow: /",
  "User-agent: CCBot",
  "Allow: /",
  "",
  "# Machine-readable API reference",
  "# llms.txt:   " + BASE + "/llms.txt",
  "# OpenAPI:    " + BASE + "/openapi.json",
  "Sitemap: " + BASE + "/sitemap.xml",
  "",
].join("\n");

agentRouter.get("/robots.txt", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(ROBOTS, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

// ── llms.txt (llmstxt.org) ───────────────────────────────────────────────────

const LLMS_TXT = [
  "# RagScrape",
  "",
  "> URL → RAG-ready Markdown in one API call: heading-aligned chunks, " +
    "embeddings, llms.txt generation for any site, change-aware re-indexing " +
    "(unchanged pages return no content) and an MCP server. Free tier: 50 " +
    "requests/month, no card. Paid: Starter $9, Pro $19, Unlimited $49.",
  "",
  "## Docs",
  "",
  "- [Home](https://rag-scrape-api.owerryking.workers.dev/): product overview and pricing",
  "- [Free converter](https://rag-scrape-api.owerryking.workers.dev/convert): paste a URL, get Markdown, no signup",
  "- [OpenAPI spec](https://rag-scrape-api.owerryking.workers.dev/openapi.json): machine-readable API reference",
  "- [Full API reference](https://rag-scrape-api.owerryking.workers.dev/llms-full.txt): every endpoint in Markdown",
  "- [CLI + MCP server (npm)](https://www.npmjs.com/package/rag-scrape): npx rag-scrape, npx rag-scrape mcp",
  "- [Source code](https://github.com/owerryking-beep/rag-scrape)",
  "",
  "## Quickstart",
  "",
  "1. Register a free key (no card):",
  "   POST " + BASE + "/register {\"email\":\"you@example.com\"} → {\"apiKey\":\"rsk_…\"}",
  "2. Scrape + chunk + embed in one call:",
  "   POST " + BASE + "/scrape, Authorization: Bearer rsk_…, body {\"url\":\"https://example.com\",\"chunk\":true,\"embed\":true}",
  "3. Every response carries contentHash — resend it as ifNoneHash to get" +
    " {\"unchanged\":true} (zero content tokens) when a page hasn't changed.",
  "",
].join("\n");

agentRouter.get("/llms.txt", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(LLMS_TXT, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

// ── llms-full.txt — complete API reference in Markdown ──────────────────────

const FENCE = "```";
const LLMS_FULL = [
  "# RagScrape API reference",
  "",
  "Base URL: " + BASE,
  "",
  "Auth: send your key as a bearer token on every scrape/crawl/llms-txt call.",
  "Error shape (all failures): {\"success\":false,\"error\":{\"code\":…,\"message\":…}}",
  "",
  "## POST /scrape",
  "",
  "Turn any public URL into clean, LLM-ready Markdown. Optional: heading-aligned chunks, embeddings, token slimming, change detection.",
  "",
  "Request (JSON):",
  "- url (string, required) — http(s) URL",
  "- chunk (boolean) — return chunks[] aligned to headings (code fences never split)",
  "- chunkSize (number, 200–16000, default 4000) — target max chars per chunk",
  "- embed (boolean) — implies chunk; each chunk gains embedding: number[384]",
  "- stripLinks (boolean) — unwrap links, keep text (fewer tokens)",
  "- stripImages (boolean) — drop image URLs, keep alt text",
  "- ifNoneHash (string) — contentHash from a previous call; if the page is unchanged the response is {unchanged:true, contentHash} with no content",
  "",
  FENCE + "json",
  'POST /scrape {"url":"https://example.com/docs","chunk":true,"embed":true,"stripLinks":true}',
  FENCE,
  "",
  "Response 200: {success:true, markdown, metadata{title,byline,siteName,excerpt,wordCount,sourceUrl,scrapedAt,contentLength}, chunks?[{index,content,headingPath[],charCount,embedding?}], contentHash, unchanged?, embedError?}",
  "Errors: 401 UNAUTHORIZED (bad key) · 402 RATE_LIMIT_EXCEEDED (quota, upgrade hint in message) · 403 KEY_INACTIVE / blocked URL · 429 DEMO_LIMIT_EXCEEDED · 400 validation · 504 timeout · 502 unreachable.",
  "Rate-limit headers: X-RateLimit-Limit / -Remaining / -Reset.",
  "",
  "## POST /crawl",
  "",
  "Same-host BFS crawl of a documentation site. 1 quota unit per successfully crawled page. Hard cap 100 pages per call.",
  "- url (string, required) · maxPages (1–100, default 20) · includePaths (string[] prefixes) · excludePaths (string[] prefixes)",
  "Response 200: {success:true, pages:[{url,title,markdown,wordCount}], llmsTxt, stats{crawled,failed,requested}, errors[]}",
  "",
  "## POST /llms-txt",
  "",
  "Generate llms.txt for any site WITHOUT page payloads (cheap). Same input as /crawl. Response: {success:true, llmsTxt, stats, errors}.",
  "",
  "## POST /register",
  "",
  "Free API key, no card. {\"email\":\"you@example.com\"} → {success:true, apiKey:\"rsk_…\", tier:\"free\", limit:50}",
  "",
  "## POST /create-checkout",
  "",
  "Hosted subscription checkout (Starter $9 / Pro $19 / Unlimited $49). Body: {email, apiKey?, plan?}. Response: {success:true, checkoutUrl}. Payment upgrades the key automatically via webhook.",
  "",
  "## GET /",
  "",
  "Landing page. GET /convert — free no-signup converter (5 uses per IP). GET /health — liveness. GET /openapi.json — this API as OpenAPI 3.1.",
  "",
  "## Plans",
  "",
  "free: 50 req/mo · Starter $9: 2,000 req/mo · Pro $19: 10,000 req/mo · Unlimited $49: 1,000,000 req/mo. Monthly counters reset on the 1st.",
  "",
  "## MCP server",
  "",
  FENCE + "json",
  '{"mcpServers":{"rag-scrape":{"command":"npx","args":["-y","rag-scrape","mcp"],"env":{"RAG_SCRAPE_API_KEY":"rsk_…"}}}}',
  FENCE,
  "",
  "Tools: rag_scrape {url, chunk?, chunk_size?}, rag_crawl {url, max_pages?, include_paths?, exclude_paths?}.",
  "",
].join("\n");

agentRouter.get("/llms-full.txt", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(LLMS_FULL, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

// ── OpenAPI 3.1 ──────────────────────────────────────────────────────────────

const errorSchema = {
  type: "object",
  properties: {
    success: { type: "boolean", const: false },
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
  required: ["success", "error"],
};

const OPENAPI: Record<string, unknown> = {
  openapi: "3.1.0",
  info: {
    title: "RagScrape API",
    version: "2.1.0",
    summary: "URL → RAG-ready Markdown, chunks, embeddings, llms.txt",
    description:
      "One API call turns any public URL into clean, LLM-ready Markdown. " +
      "Options add heading-aligned chunks, 384-dim embeddings, token slimming " +
      "and change-aware re-indexing. Includes a same-host docs crawler that " +
      "generates llms.txt. Free tier: 50 requests/month (POST /register).",
    termsOfService: BASE + "/",
    contact: { name: "RagScrape", url: BASE + "/", email: "Owerryking@gmail.com" },
    license: { name: "MIT", url: "https://github.com/owerryking-beep/rag-scrape" },
  },
  servers: [{ url: BASE }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "API key from POST /register (rsk_…)" },
    },
    schemas: { Error: errorSchema },
  },
  paths: {
    "/scrape": {
      post: {
        summary: "URL → Markdown (+chunks, +embeddings, +change detection)",
        operationId: "scrape",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string", description: "http(s) URL to scrape" },
                  chunk: { type: "boolean", description: "Return heading-aligned chunks[]" },
                  chunkSize: { type: "number", default: 4000, description: "200–16000 max chars per chunk" },
                  embed: { type: "boolean", description: "Also embed every chunk (384-dim). Implies chunk." },
                  stripLinks: { type: "boolean", description: "Unwrap links, keep text" },
                  stripImages: { type: "boolean", description: "Drop images, keep alt text" },
                  ifNoneHash: { type: "string", description: "contentHash from a previous response → unchanged pages return {unchanged:true}" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Scraped content (or unchanged:true short-circuit)",
            headers: {
              ETag: { description: 'contentHash — send back as ifNoneHash', schema: { type: "string" } },
              "X-RateLimit-Remaining": { schema: { type: "string" } },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", const: true },
                    markdown: { type: "string" },
                    metadata: { type: "object" },
                    chunks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "number" },
                          content: { type: "string" },
                          headingPath: { type: "array", items: { type: "string" } },
                          charCount: { type: "number" },
                          embedding: { type: "array", items: { type: "number" }, description: "384-dim when embed:true" },
                        },
                      },
                    },
                    contentHash: { type: "string" },
                    unchanged: { type: "boolean" },
                    embedError: { type: "string" },
                  },
                },
              },
            },
          },
          "401": { description: "Bad/missing key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "402": { description: "Monthly quota exhausted", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Inactive key or blocked URL", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Demo quota exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/crawl": {
      post: {
        summary: "Crawl a docs site → pages[] + llms.txt (≤100 pages, 1 unit/page)",
        operationId: "crawl",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string" },
                  maxPages: { type: "number", default: 20, description: "1–100" },
                  includePaths: { type: "array", items: { type: "string" } },
                  excludePaths: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Crawl result" },
          "401": { description: "Bad/missing key" },
          "402": { description: "Quota exhausted" },
          "403": { description: "Demo key may not crawl" },
        },
      },
    },
    "/llms-txt": {
      post: {
        summary: "Generate llms.txt for a site (no page payloads)",
        operationId: "llmsTxt",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string" },
                  maxPages: { type: "number", default: 20 },
                  includePaths: { type: "array", items: { type: "string" } },
                  excludePaths: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: { "200": { description: "llms.txt content" }, "403": { description: "Demo key may not crawl" } },
      },
    },
    "/register": {
      post: {
        summary: "Register a free API key (50 req/mo, no card)",
        operationId: "register",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: { email: { type: "string", format: "email" } },
              },
            },
          },
        },
        responses: { "200": { description: "Key created" }, "400": { description: "Invalid email" } },
      },
    },
    "/create-checkout": {
      post: {
        summary: "Create a hosted subscription checkout ($9 / $19 / $49 per month)",
        operationId: "createCheckout",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", format: "email" },
                  apiKey: { type: "string", description: "Existing key to upgrade" },
                  plan: { type: "string", enum: ["starter", "pro", "unlimited"], default: "pro" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Hosted checkout URL" }, "400": { description: "Invalid plan/email" } },
      },
    },
    "/health": {
      get: { summary: "Liveness", operationId: "health", security: [], responses: { "200": { description: "OK" } } },
    },
  },
};

agentRouter.get("/openapi.json", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(JSON.stringify(OPENAPI, null, 2), 200, {
    "Content-Type": "application/json; charset=utf-8",
  });
});

// ── sitemap.xml ──────────────────────────────────────────────────────────────

const SITEMAP = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...[
    "/", "/convert", "/llms-txt-generator", "/vs/firecrawl", "/vs/jina-reader",
  ].map((p) =>
    `  <url><loc>${BASE}${p}</loc><changefreq>weekly</changefreq><priority>${p === "/" ? "1.0" : "0.8"}</priority></url>`,
  ),
  "</urlset>",
].join("\n");

agentRouter.get("/sitemap.xml", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  return c.body(SITEMAP, 200, { "Content-Type": "application/xml; charset=utf-8" });
});
