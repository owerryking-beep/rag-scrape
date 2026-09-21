// ── Cloudflare bindings ──────────────────────────────────────────────────────

export interface Env {
  API_KEYS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID: string;
  STRIPE_SUCCESS_URL: string;
  STRIPE_CANCEL_URL: string;
  DEMO_KEY: string;
}

// ── KV value schemas ─────────────────────────────────────────────────────────

export type Tier = "free" | "pro";

export interface ApiKeyData {
  key: string;
  email: string;
  tier: Tier;
  limit: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
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

// ── Hono env helper ──────────────────────────────────────────────────────────

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    apiKeyData: ApiKeyData;
  };
};

// ── Shared constants ─────────────────────────────────────────────────────────

export const FREE_TIER_LIMIT = 50;
export const PRO_TIER_LIMIT = 10_000;
export const DEMO_KEY_LIMIT = 5;
export const DAY_SECONDS = 86_400;
