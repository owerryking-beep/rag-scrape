import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import type {
  HonoEnv,
  ApiKeyData,
  ErrorResponse,
  RegisterRequest,
  RegisterResponse,
} from "./types.js";
import {
  FREE_TIER_LIMIT,
  DAY_SECONDS,
} from "./types.js";
import { generateApiKey } from "./services/lemonsqueezy.js";
import { scrapeRouter } from "./routes/scrape.js";
import { checkoutRouter } from "./routes/checkout.js";
import { webhookRouter } from "./routes/webhook.js";
import { crawlRouter } from "./routes/crawl.js";
import { agentRouter } from "./routes/agents.js";
import { redeemRouter } from "./routes/redeem.js";
import { waitlistRouter } from "./routes/waitlist.js";
import { LANDING_HTML } from "./generated/landing-html.js";
import { CONVERT_HTML } from "./generated/convert-html.js";

const app = new Hono<HonoEnv>();

// ── Global middleware ────────────────────────────────────────────────────────

app.use("*", logger());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: [
      "https://rag-scrape-api.owerryking.workers.dev",
      "http://localhost:3000",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    maxAge: 86_400,
  }),
);

// ── Landing page + machine info ─────────────────────────────────────────────

// The public storefront, served from the API's own domain (no separate
// hosting needed; same origin = no CORS for the page's own API calls).
app.get("/", (c) => {
  c.header("Cache-Control", "public, max-age=600");
  return c.html(LANDING_HTML);
});

// Free no-signup web tool: paste a URL, get Markdown (uses the per-IP demo
// quota; upgrade path shown inline when it runs out).
app.get("/convert", (c) => {
  c.header("Cache-Control", "public, max-age=600");
  return c.html(CONVERT_HTML);
});

app.get("/api", (c) =>
  c.json({
    service: "rag-scrape-api",
    version: "2.1.0",
    status: "healthy",
    docs: "https://rag-scrape-api.owerryking.workers.dev",
    endpoints: {
      scrape: "POST /scrape { url, chunk?, chunkSize?, embed?, stripLinks?, stripImages?, ifNoneHash? }",
      crawl: "POST /crawl { url, maxPages?, includePaths?, excludePaths? } → pages[] + llmsTxt",
      llms_txt: "POST /llms-txt { url, maxPages? } → llms.txt only (cheap)",
      register: "POST /register",
      checkout: "POST /create-checkout { email, apiKey?, plan? } (Starter $9 / Pro $19 / Unlimited $49)",
      webhook: "POST /webhook (Paystack or Lemon Squeezy)",
      convert_tool: "GET /convert (free, no signup)",
      for_agents: "GET /openapi.json · GET /llms.txt · GET /llms-full.txt · GET /robots.txt",
      redeem: "POST /redeem { licenseKey, apiKey? } — Gumroad license activation",
      waitlist: "POST /waitlist { email } · GET /waitlist — founding members (first 25: Pro at Starter price for a year)",
      health: "GET /health",
    },
    plans: { free: "50 reqs/mo", starter: "2,000 reqs/mo ($9)", pro: "10,000 reqs/mo ($19)", unlimited: "1,000,000 reqs/mo ($49)" },
  }),
);

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// ── Route mounts ─────────────────────────────────────────────────────────────

app.route("/", scrapeRouter);
app.route("/", crawlRouter);
app.route("/", agentRouter);
app.route("/", redeemRouter);
app.route("/", waitlistRouter);
app.route("/", checkoutRouter);
app.route("/", webhookRouter);

// ── Free registration ────────────────────────────────────────────────────────
//
// NOTE: deliberately unauthenticated so anyone can start in seconds.
// Each key gets FREE_TIER_LIMIT requests/month. See README "Known
// limitations" for the abuse trade-off and recommended mitigations.

app.post("/register", async (c) => {
  let body: RegisterRequest;
  try {
    body = (await c.req.json()) as RegisterRequest;
  } catch {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: { code: "INVALID_JSON", message: "Invalid request body." },
      },
      400,
    );
  }

  if (!body.email || typeof body.email !== "string") {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_EMAIL", message: "A valid email is required." } },
      400,
    );
  }

  if (body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_EMAIL", message: "A valid email is required." } },
      400,
    );
  }

  const apiKey = generateApiKey();

  const keyData: ApiKeyData = {
    key: apiKey,
    email: body.email,
    tier: "free",
    limit: FREE_TIER_LIMIT,
    createdAt: new Date().toISOString(),
    active: true,
  };
  await c.env.API_KEYS.put(apiKey, JSON.stringify(keyData), {
    expirationTtl: DAY_SECONDS * 365,
  });

  return c.json<RegisterResponse>(
    {
      success: true,
      apiKey,
      tier: "free",
      limit: FREE_TIER_LIMIT,
      message:
        `Free API key created (${FREE_TIER_LIMIT} reqs/mo). Keep it secret! ` +
        "Upgrade at https://rag-scrape-api.owerryking.workers.dev for 10 000 reqs/mo.",
    },
    200,
  );
});

// ── 404 ──────────────────────────────────────────────────────────────────────

app.notFound((c) =>
  c.json<ErrorResponse>(
    {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${c.req.method} ${c.req.path} not found.`,
      },
    },
    404,
  ),
);

// ── Global error handler ─────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error("Unhandled:", err);
  return c.json<ErrorResponse>(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
    },
    500,
  );
});

export default app;
