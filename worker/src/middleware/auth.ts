import type { Context, Next } from "hono";
import type { HonoEnv, ApiKeyData } from "../types.js";
import {
  DEMO_KEY_LIMIT,
  DAY_SECONDS,
  FREE_TIER_LIMIT,
} from "../types.js";

const DEMO_USAGE_PREFIX = "demo_usage:";

/**
 * Verifies `Authorization: Bearer <key>`.
 *
 *  – The shared DEMO_KEY is validated against a per-IP counter in the
 *    RATE_LIMITS KV (5 uses per 30 days) and never touches API_KEYS.
 *  – Real keys are looked up in the API_KEYS KV and must be `active`.
 *
 * On success the resolved ApiKeyData is stored in Hono context variables
 * for the rate-limit middleware and routes.
 */
export async function authMiddleware(
  c: Context<HonoEnv>,
  next: Next,
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return unauthorized(
      c,
      "Missing Authorization header. Use: Authorization: Bearer <api_key>",
    );
  }

  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (!match || !match[1]) {
    return unauthorized(
      c,
      "Invalid Authorization format. Use: Authorization: Bearer <api_key>",
    );
  }

  const apiKey = match[1];

  if (apiKey.length < 5) {
    return unauthorized(c, "Invalid API key format.");
  }

  // ── Shared demo key (no KV entry — capped per IP) ──────────────────────
  if (apiKey === c.env.DEMO_KEY) {
    const demoData = await checkDemoKey(c);
    if (!demoData) {
      return c.json(
        {
          success: false,
          error: {
            code: "DEMO_LIMIT_EXCEEDED",
            message:
              `Demo key is limited to ${DEMO_KEY_LIMIT} requests. ` +
              "Register a free key: POST /register or `npx rag-scrape register <email>`",
          },
        },
        429,
      );
    }
    c.set("apiKeyData", demoData);
    return next();
  }

  // ── Real key lookup ─────────────────────────────────────────────────────
  const raw = await c.env.API_KEYS.get(apiKey);
  if (!raw) {
    return unauthorized(
      c,
      "Invalid API key. Register a free key at https://ragscrape.dev",
    );
  }

  let keyData: ApiKeyData;
  try {
    keyData = JSON.parse(raw) as ApiKeyData;
  } catch {
    return unauthorized(c, "Corrupted API key record. Contact support.");
  }

  if (!keyData.active) {
    return c.json(
      {
        success: false,
        error: {
          code: "KEY_INACTIVE",
          message: "API key deactivated. Contact support@ragscrape.dev",
        },
      },
      403,
    );
  }

  c.set("apiKeyData", keyData);
  return next();
}

async function checkDemoKey(
  c: Context<HonoEnv>,
): Promise<ApiKeyData | null> {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const counterKey = `${DEMO_USAGE_PREFIX}${ip}`;

  // NOTE: KV get→put is not atomic. Under the demo key's 5-request cap a
  // race can cost a user one use in the worst case — acceptable for a demo.
  const raw = await c.env.RATE_LIMITS.get(counterKey);
  const count = raw ? parseInt(raw, 10) || 0 : 0;

  if (count >= DEMO_KEY_LIMIT) return null;

  await c.env.RATE_LIMITS.put(counterKey, String(count + 1), {
    expirationTtl: DAY_SECONDS * 30,
  });

  return {
    key: c.env.DEMO_KEY,
    email: "demo@ragscrape.dev",
    tier: "free",
    limit: FREE_TIER_LIMIT,
    createdAt: new Date().toISOString(),
    active: true,
  };
}

function unauthorized(c: Context<HonoEnv>, message: string): Response {
  return c.json(
    {
      success: false,
      error: { code: "UNAUTHORIZED", message },
    },
    401,
  );
}
