import type { Context, Next } from "hono";
import type { HonoEnv, RateLimitData } from "../types.js";
import { DAY_SECONDS } from "../types.js";

/**
 * Monthly per-key request counter stored in the RATE_LIMITS KV.
 *
 *  – Window: calendar month, key = `<apiKey>:<YYYY-MM>`
 *  – Exhausted keys receive `402 Payment Required` (free) or a reset hint (pro).
 *  – X-RateLimit-* headers are set on every non-limited response.
 *
 * Known trade-off: KV get→put is not atomic, so under very high concurrency
 * the counter can drift by a request or two. For strict accounting, move the
 * counter into a Durable Object (see README "Known limitations").
 */
export async function rateLimitMiddleware(
  c: Context<HonoEnv>,
  next: Next,
): Promise<Response | void> {
  const keyData = c.get("apiKeyData");

  // The demo key is already metered (per-IP) in the auth middleware.
  if (keyData.key === c.env.DEMO_KEY) {
    return next();
  }

  const now = new Date();
  const monthKey = `${keyData.key}:${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;

  const raw = await c.env.RATE_LIMITS.get(monthKey);
  let rl: RateLimitData;
  if (raw) {
    try {
      rl = JSON.parse(raw) as RateLimitData;
    } catch {
      rl = { count: 0, windowStart: Date.now() };
    }
  } else {
    rl = { count: 0, windowStart: Date.now() };
  }

  const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  if (rl.count >= keyData.limit) {
    const upgradeHint =
      keyData.tier === "free"
        ? " Upgrade to Pro ($19/mo) for 10,000 requests: https://ragscrape.dev"
        : ` Monthly limit resets on ${resetDate}.`;

    return c.json(
      {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Monthly limit of ${keyData.limit} requests exceeded.${upgradeHint}`,
        },
      },
      402,
    );
  }

  rl.count += 1;
  await c.env.RATE_LIMITS.put(monthKey, JSON.stringify(rl), {
    expirationTtl: DAY_SECONDS * 35,
  });

  c.header("X-RateLimit-Limit", String(keyData.limit));
  c.header(
    "X-RateLimit-Remaining",
    String(Math.max(0, keyData.limit - rl.count)),
  );
  c.header("X-RateLimit-Reset", resetDate);

  return next();
}
