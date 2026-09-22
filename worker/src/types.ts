// ── Cloudflare bindings ──────────────────────────────────────────────────────

export interface Env {
  API_KEYS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  LS_API_KEY: string;
  LS_WEBHOOK_SECRET: string;
  LS_STORE_ID: string;
  LS_VARIANT_ID_PRO: string;
  LS_VARIANT_ID_STARTER: string;
  LS_TEST_MODE: string;
  CHECKOUT_SUCCESS_URL: string;
  CHECKOUT_CANCEL_URL: string;
  DEMO_KEY: string;
}

// ── KV value schemas ─────────────────────────────────────────────────────────

export type Tier = "free" | "starter" | "pro";
/** Paid plans (Lemon Squeezy variants). */
export type Plan = "starter" | "pro";

export interface ApiKeyData {
  key: string;
  email: string;
  tier: Tier;
  limit: number;
  lsSubscriptionId?: string;
  createdAt: string;
  active: boolean;
}

export interface RateLimitData {
  count: number;
  windowStart: number;
}

// ── API request / response ───────────────────────────────────────────────────

export interface ScrapeRequest {
  url: string;
  /** Opt in to RAG-ready chunking of the returned Markdown. */
  chunk?: boolean;
  /** Target max chars per chunk (200–16000, default 4000 ≈ 1k tokens). */
  chunkSize?: number;
}

export interface Chunk {
  index: number;
  content: string;
  headingPath: string[];
  charCount: number;
}

export interface ScrapeMetadata {
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  wordCount: number;
  sourceUrl: string;
  scrapedAt: string;
  contentLength: number;
}

export interface ScrapeSuccessResponse {
  success: true;
  markdown: string;
  metadata: ScrapeMetadata;
  /** Present only when the request asked for `chunk: true`. */
  chunks?: Chunk[];
}

export interface ErrorBody {
  code: string;
  message: string;
  details?: string;
}

export interface ErrorResponse {
  success: false;
  error: ErrorBody;
}

export type ScrapeResponse = ScrapeSuccessResponse | ErrorResponse;

export interface RegisterRequest {
  email: string;
}

export interface RegisterResponse {
  success: true;
  apiKey: string;
  tier: Tier;
  limit: number;
  message: string;
}

export interface CheckoutRequest {
  email: string;
  apiKey?: string;
  /** Which paid plan to check out (default "pro"). */
  plan?: Plan;
}

export interface CheckoutResponse {
  success: true;
  checkoutUrl: string;
}

export interface WebhookAck {
  received: true;
  type: string;
  handled: boolean;
}

// ── Crawl (docs-site crawler) ────────────────────────────────────────────────

export interface CrawlRequest {
  url: string;
  /** Max pages to crawl (1–100, default 20). Each page costs 1 request. */
  maxPages?: number;
  /** Only follow paths starting with one of these prefixes. */
  includePaths?: string[];
  /** Never follow paths starting with these prefixes. */
  excludePaths?: string[];
}

export interface CrawledPageDto {
  url: string;
  title: string;
  markdown: string;
  wordCount: number;
}

export interface CrawlSuccessResponse {
  success: true;
  pages: CrawledPageDto[];
  /** llms.txt content for the crawled site (llmstxt.org format). */
  llmsTxt: string;
  stats: { crawled: number; failed: number; requested: number };
  errors: Array<{ url: string; error: string }>;
}

// ── Hono env helper ──────────────────────────────────────────────────────────

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    apiKeyData: ApiKeyData;
  };
};

// ── Shared constants ─────────────────────────────────────────────────────────

export const FREE_TIER_LIMIT = 50;
export const STARTER_TIER_LIMIT = 2_000;
export const PRO_TIER_LIMIT = 10_000;
export const TIER_LIMITS: Record<Tier, number> = {
  free: FREE_TIER_LIMIT,
  starter: STARTER_TIER_LIMIT,
  pro: PRO_TIER_LIMIT,
};

export function tierForPlan(plan: string | undefined | null): Tier {
  return plan === "starter" ? "starter" : "pro";
}

export const DEMO_KEY_LIMIT = 5;
export const DAY_SECONDS = 86_400;
