import { Hono } from "hono";
import type {
  HonoEnv,
  CrawlRequest,
  LlmsTxtRequest,
  CrawlSuccessResponse,
  LlmsTxtSuccessResponse,
  ErrorResponse,
} from "../types.js";
import { DAY_SECONDS } from "../types.js";
import { crawlSite } from "../services/crawler.js";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";

export const crawlRouter = new Hono<HonoEnv>();

/**
 * POST /crawl — same-host documentation crawl → Markdown pages + llms.txt.
 * Every successfully crawled page costs 1 request against the monthly quota
 * (the middleware charges 1 for the request itself; the handler tops up the
 * rest using the same `key:YYYY-MM` counter the middleware uses).
 */
crawlRouter.post("/crawl", authMiddleware, rateLimitMiddleware, async (c) => {
  const keyData = c.get("apiKeyData");

  if (keyData.key === c.env.DEMO_KEY) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: {
          code: "CRAWL_REQUIRES_KEY",
          message:
            "The shared demo key cannot crawl. Register a free key: POST /register or `npx rag-scrape register <email>`.",
        },
      },
      403,
    );
  }

  let body: CrawlRequest;
  try {
    body = (await c.req.json()) as CrawlRequest;
  } catch {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON." },
      },
      400,
    );
  }

  if (!body.url || typeof body.url !== "string") {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: { code: "MISSING_URL", message: "'url' is required and must be a string." },
      },
      400,
    );
  }
  if (body.url.length > 2048) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: { code: "URL_TOO_LONG", message: "URL must be fewer than 2048 characters." },
      },
      400,
    );
  }
  for (const field of ["includePaths", "excludePaths"] as const) {
    const v = body[field];
    if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== "string") || v.length > 20)) {
      return c.json<ErrorResponse>(
        {
          success: false,
          error: { code: "INVALID_FILTER", message: `'${field}' must be an array of at most 20 path prefixes.` },
        },
        400,
      );
    }
  }

  const maxPages =
    body.maxPages === undefined ? 20 : Math.floor(Number(body.maxPages));
  if (Number.isNaN(maxPages) || maxPages < 1 || maxPages > 100) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: { code: "INVALID_MAX_PAGES", message: "'maxPages' must be between 1 and 100." },
      },
      400,
    );
  }

  try {
    const result = await crawlSite(body.url, {
      maxPages,
      includePaths: body.includePaths,
      excludePaths: body.excludePaths,
    });

    // Charge 1 quota unit per successfully crawled page (middleware already
    // charged 1 for this HTTP request itself).
    const extra = Math.max(0, result.stats.crawled - 1);
    if (extra > 0) {
      const now = new Date();
      const monthKey = `${keyData.key}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const raw = await c.env.RATE_LIMITS.get(monthKey);
      const rl = raw
        ? (JSON.parse(raw) as { count: number; windowStart: number })
        : { count: 0, windowStart: Date.now() };
      rl.count += extra;
      await c.env.RATE_LIMITS.put(monthKey, JSON.stringify(rl), {
        expirationTtl: DAY_SECONDS * 35,
      });
    }

    return c.json<CrawlSuccessResponse>(
      {
        success: true,
        pages: result.pages,
        llmsTxt: result.llmsTxt,
        stats: result.stats,
        errors: result.errors,
      },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Crawl failed.";
    const isBlock = msg.includes("blocked") || msg.includes("not allowed");
    console.error("crawl error:", err);
    return c.json<ErrorResponse>(
      {
        success: false,
        error: {
          code: isBlock ? "URL_BLOCKED" : "CRAWL_ERROR",
          message: isBlock ? msg : "Failed to crawl the site. Please retry.",
          details: isBlock ? undefined : msg,
        },
      },
      isBlock ? 403 : 500,
    );
  }
});

/**
 * POST /llms-txt — generate an llms.txt for any site WITHOUT the full page
 * payloads. Same crawl, tiny response: the list + descriptions only. Ideal
 * for "make my site AI-ready" tooling and for agents bootstrapping a new site.
 */
crawlRouter.post("/llms-txt", authMiddleware, rateLimitMiddleware, async (c) => {
  const keyData = c.get("apiKeyData");

  if (keyData.key === c.env.DEMO_KEY) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: {
          code: "CRAWL_REQUIRES_KEY",
          message: "The shared demo key cannot crawl. Register a free key: POST /register.",
        },
      },
      403,
    );
  }

  let body: LlmsTxtRequest;
  try {
    body = (await c.req.json()) as LlmsTxtRequest;
  } catch {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      400,
    );
  }
  if (!body.url || typeof body.url !== "string") {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "MISSING_URL", message: "'url' is required." } },
      400,
    );
  }

  const maxPages =
    body.maxPages === undefined ? 20 : Math.floor(Number(body.maxPages));
  if (Number.isNaN(maxPages) || maxPages < 1 || maxPages > 100) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_MAX_PAGES", message: "'maxPages' must be between 1 and 100." } },
      400,
    );
  }

  try {
    const result = await crawlSite(body.url, {
      maxPages,
      includePaths: body.includePaths,
      excludePaths: body.excludePaths,
    });

    const extra = Math.max(0, result.stats.crawled - 1);
    if (extra > 0) {
      const now = new Date();
      const monthKey = `${keyData.key}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const raw = await c.env.RATE_LIMITS.get(monthKey);
      const rl = raw
        ? (JSON.parse(raw) as { count: number; windowStart: number })
        : { count: 0, windowStart: Date.now() };
      rl.count += extra;
      await c.env.RATE_LIMITS.put(monthKey, JSON.stringify(rl), {
        expirationTtl: DAY_SECONDS * 35,
      });
    }

    return c.json<LlmsTxtSuccessResponse>(
      { success: true, llmsTxt: result.llmsTxt, stats: result.stats, errors: result.errors },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Crawl failed.";
    const isBlock = msg.includes("blocked") || msg.includes("not allowed");
    console.error("llms-txt error:", err);
    return c.json<ErrorResponse>(
      {
        success: false,
        error: { code: isBlock ? "URL_BLOCKED" : "CRAWL_ERROR", message: isBlock ? msg : "Failed to generate llms.txt." },
      },
      isBlock ? 403 : 500,
    );
  }
});
