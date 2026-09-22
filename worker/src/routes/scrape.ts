import { Hono } from "hono";
import type { HonoEnv, ScrapeRequest, ScrapeResponse } from "../types.js";
import { fetchAndExtract, FetchError } from "../services/extractor.js";
import { htmlToMarkdown, countWords, slimMarkdown, sha256Hex } from "../services/converter.js";
import { chunkMarkdown } from "../services/chunker.js";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";

export const scrapeRouter = new Hono<HonoEnv>();

scrapeRouter.post(
  "/scrape",
  authMiddleware,
  rateLimitMiddleware,
  async (c) => {
    // ── Parse body ──────────────────────────────────────────────────────
    let body: ScrapeRequest;
    try {
      body = (await c.req.json()) as ScrapeRequest;
    } catch {
      return c.json<ScrapeResponse>(
        {
          success: false,
          error: {
            code: "INVALID_JSON",
            message: "Request body must be valid JSON with a 'url' field.",
          },
        },
        400,
      );
    }

    if (!body.url || typeof body.url !== "string") {
      return c.json<ScrapeResponse>(
        {
          success: false,
          error: {
            code: "MISSING_URL",
            message: "'url' is required and must be a string.",
          },
        },
        400,
      );
    }

    const url = body.url.trim();

    if (url.length > 2048) {
      return c.json<ScrapeResponse>(
        {
          success: false,
          error: {
            code: "URL_TOO_LONG",
            message: "URL must be fewer than 2048 characters.",
          },
        },
        400,
      );
    }

    // ── Scrape ──────────────────────────────────────────────────────────
    try {
      const extracted = await fetchAndExtract(url);
      let markdown = htmlToMarkdown(extracted.htmlContent, extracted.sourceUrl);

      // Token slimming (fence-aware; meaning-preserving).
      if (body.stripLinks || body.stripImages) {
        markdown = slimMarkdown(markdown, {
          stripLinks: body.stripLinks,
          stripImages: body.stripImages,
        });
      }

      const wordCount = countWords(markdown);
      const contentHash = await sha256Hex(markdown);

      // Change-aware short-circuit: the client stored this hash last time
      // and the page hasn't changed → skip the content entirely.
      if (body.ifNoneHash && body.ifNoneHash === contentHash) {
        c.header("ETag", `"${contentHash}"`);
        return c.json<ScrapeResponse>(
          {
            success: true,
            markdown: "",
            contentHash,
            unchanged: true,
            metadata: {
              title: extracted.title,
              byline: extracted.byline,
              siteName: extracted.siteName,
              excerpt: extracted.excerpt,
              wordCount,
              sourceUrl: extracted.sourceUrl,
              scrapedAt: new Date().toISOString(),
              contentLength: markdown.length,
            },
          },
          200,
        );
      }

      // Optional RAG-ready chunking (heading-aligned, fence-safe);
      // embed:true implies chunking.
      const wantChunks = body.chunk === true || body.embed === true;
      const chunks = wantChunks
        ? chunkMarkdown(markdown, body.chunkSize ?? 4000)
        : undefined;

      // One-call embeddings via Workers AI (bge-small-en-v1.5, 384-dim).
      let embedError: string | undefined;
      if (chunks && body.embed === true) {
        const ai = c.env.AI;
        if (!ai) {
          embedError = "Workers AI binding not available on this deployment.";
        } else {
          try {
            const texts = chunks.slice(0, 64).map((ch) => ch.content);
            const res = (await ai.run("@cf/baai/bge-small-en-v1.5", {
              text: texts,
            })) as { data?: number[][] };
            (res.data ?? []).forEach((vec, i) => {
              const ch = chunks[i];
              if (ch && Array.isArray(vec)) ch.embedding = vec;
            });
          } catch (e) {
            embedError = e instanceof Error ? e.message : "Embedding failed.";
          }
        }
      }

      c.header("ETag", `"${contentHash}"`);
      return c.json<ScrapeResponse>(
        {
          success: true,
          markdown,
          metadata: {
            title: extracted.title,
            byline: extracted.byline,
            siteName: extracted.siteName,
            excerpt: extracted.excerpt,
            wordCount,
            sourceUrl: extracted.sourceUrl,
            scrapedAt: new Date().toISOString(),
            contentLength: markdown.length,
          },
          ...(chunks ? { chunks } : {}),
          contentHash,
          ...(embedError ? { embedError } : {}),
        },
        200,
      );
    } catch (err) {
      if (err instanceof FetchError) {
        return c.json<ScrapeResponse>(
          {
            success: false,
            error: {
              code: "FETCH_ERROR",
              message: err.message,
              details: `HTTP ${err.statusCode}`,
            },
          },
          mapStatus(err.statusCode),
        );
      }

      console.error("scrape error:", err);
      return c.json<ScrapeResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Unexpected error while processing the URL.",
          },
        },
        500,
      );
    }
  },
);

function mapStatus(code: number): 400 | 403 | 404 | 415 | 422 | 502 | 504 {
  if (code === 400) return 400;
  if (code === 403) return 403;
  if (code === 404) return 404;
  if (code === 415) return 415;
  if (code === 422) return 422;
  if (code === 504) return 504;
  return 502;
}
