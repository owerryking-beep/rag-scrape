import { Hono } from "hono";
import type { HonoEnv, ScrapeRequest, ScrapeResponse } from "../types.js";
import { fetchAndExtract, FetchError } from "../services/extractor.js";
import { htmlToMarkdown, countWords } from "../services/converter.js";
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
      const markdown = htmlToMarkdown(extracted.htmlContent, extracted.sourceUrl);
      const wordCount = countWords(markdown);

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
