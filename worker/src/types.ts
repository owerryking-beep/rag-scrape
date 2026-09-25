// ── Cloudflare bindings ──────────────────────────────────────────────────────

export interface Env {
  API_KEYS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  LS_API_KEY: string;
  LS_WEBHOOK_SECRET: string;
  LS_STORE_ID: string;
  LS_VARIANT_ID_PRO: string;
  LS_VARIANT_ID_STARTER: string;
  LS_VARIANT_ID_UNLIMITED: string;
  // ── Payment provider switch: "paystack" | "lemonsqueezy" | "" (unconfigured)
  PAYMENT_PROVIDER: string;
  PAYSTACK_SECRET_KEY: string;
  PS_PLAN_STARTER: string;
  PS_PLAN_PRO: string;
  PS_PLAN_UNLIMITED: string;
  /** Founding-member Pro-at-Starter-price plan (first 25 only). */
  PS_PLAN_FOUNDING: string;
  /** USD card plans (charge $9/$19/$49 in true USD; settle to USD domiciliary a/c). */
  PS_PLAN_STARTER_USD: string;
  PS_PLAN_PRO_USD: string;
  PS_PLAN_UNLIMITED_USD: string;
  PS_PLAN_FOUNDING_USD: string;
  // ── Gumroad license rail (product IDs; "SET_VIA_GUMROAD" = not configured)
  GUMROAD_PRODUCT_STARTER: string;
  GUMROAD_PRODUCT_PRO: string;
  GUMROAD_PRODUCT_UNLIMITED: string;
  /** Owner-only key for the manual founding rail (GET/POST /admin/*, /founding-admin). */
  ADMIN_KEY: string;
  /** Polar rail: org id + one license-key benefit id per product/tier. */
  POLAR_ORG_ID: string;
  /** USDC rail: owner wallet address on Base (agents pay crypto, no third party). */
  BASE_USDC_ADDRESS: string;
  POLAR_BENEFIT_STARTER: string;
  POLAR_BENEFIT_PRO: string;
  POLAR_BENEFIT_UNLIMITED: string;
  POLAR_BENEFIT_FOUNDING: string;
  /** Workers AI binding (optional at type level; deploy adds it). */
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
  LS_TEST_MODE: string;
  CHECKOUT_SUCCESS_URL: string;
  CHECKOUT_CANCEL_URL: string;
  DEMO_KEY: string;
}

// ── KV value schemas ─────────────────────────────────────────────────────────

export type Tier = "free" | "starter" | "pro" | "unlimited";
/** Paid plans (Lemon Squeezy variants). */
export type Plan = "starter" | "pro" | "unlimited" | "founding";

export interface ApiKeyData {
  key: string;
  email: string;
  tier: Tier;
  limit: number;
  /** Provider-agnostic subscription/transaction id. */
  subscriptionId?: string;
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
  /** Also embed every chunk with Workers AI (bge-small, 384-dim). Implies chunk. */
  embed?: boolean;
  /** Token slimming: drop images (keep alt text). */
  stripImages?: boolean;
  /** Token slimming: unwrap links (keep link text). */
  stripLinks?: boolean;
  /** Change-aware scraping: send the previously stored contentHash — if the
   * page is unchanged you get { unchanged: true } and zero content tokens. */
  ifNoneHash?: string;
}

export interface Chunk {
  index: number;
  content: string;
  headingPath: string[];
  charCount: number;
  /** 384-dim bge-small embedding, present when the request set embed:true. */
  embedding?: number[];
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
  /** Present only when the request asked for `chunk: true` / `embed: true`. */
  chunks?: Chunk[];
  /** SHA-256 (first 16 hex chars) of the returned markdown — store it and
   * send it back as ifNoneHash next run to detect unchanged pages. */
  contentHash?: string;
  /** true → page unchanged since ifNoneHash; markdown/chunks omitted. */
  unchanged?: boolean;
  /** Present (with chunks) when the Workers AI embedding call failed. */
  embedError?: string;
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
  currency?: "KES" | "USD";
}

interface CheckoutOption {
  type: string;
  [k: string]: unknown;
}

export interface CheckoutResponse {
  success: true;
  checkoutUrl: string;
  options?: CheckoutOption[];
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

export interface LlmsTxtRequest {
  url: string;
  maxPages?: number;
  includePaths?: string[];
  excludePaths?: string[];
}

export interface LlmsTxtSuccessResponse {
  success: true;
  llmsTxt: string;
  stats: { crawled: number; failed: number; requested: number };
  errors: Array<{ url: string; error: string }>;
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
/** Effectively unlimited: ~1 M pages/month, far above manual-use ceilings. */
export const UNLIMITED_TIER_LIMIT = 1_000_000;
export const TIER_LIMITS: Record<Tier, number> = {
  free: FREE_TIER_LIMIT,
  starter: STARTER_TIER_LIMIT,
  pro: PRO_TIER_LIMIT,
  unlimited: UNLIMITED_TIER_LIMIT,
};

export function tierForPlan(plan: string | undefined | null): Tier {
  if (plan === "starter") return "starter";
  if (plan === "unlimited") return "unlimited";
  return "pro";
}

export const DEMO_KEY_LIMIT = 5;
export const DAY_SECONDS = 86_400;
