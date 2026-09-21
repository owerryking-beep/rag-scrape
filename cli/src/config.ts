export const CONFIG = {
  /**
   * Base URL of the deployed Worker.
   * Override with the RAG_SCRAPE_API_URL env var (or --base-url flag) —
   * e.g. for `wrangler dev` at http://127.0.0.1:8787.
   */
  API_BASE_URL: (
    process.env.RAG_SCRAPE_API_URL ??
    "https://rag-scrape-api.owerryking.workers.dev"
  ).replace(/\/+$/, ""),
  /**
   * Shared fallback demo key. The Worker caps it at 5 requests per IP per
   * 30 days — anything serious should register a real key.
   */
  DEMO_API_KEY: "demo_rsk_free_tier_2024",
  REQUEST_TIMEOUT_MS: 30_000,
  VERSION: "1.0.0",
} as const;

export interface ApiSuccessResponse {
  success: true;
  markdown: string;
  metadata: {
    title: string;
    byline: string | null;
    siteName: string | null;
    excerpt: string | null;
    wordCount: number;
    sourceUrl: string;
    scrapedAt: string;
    contentLength: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

export type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export interface RegisterResponse {
  success: boolean;
  apiKey?: string;
  tier?: string;
  limit?: number;
  message?: string;
  error?: { code: string; message: string };
}
