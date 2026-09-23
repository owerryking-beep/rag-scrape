/**
 * Manual founding-member rail (zero third-party KYC).
 *
 * Founding buyers pay directly to the owner's own M-Pesa, then the owner
 * upgrades their key here with the M-Pesa confirmation code as proof.
 * Auth = ADMIN_KEY secret (owner-only). Codes are deduped in KV so a
 * confirmation SMS can never be reused for two upgrades.
 */
import { Hono } from "hono";
import type { HonoEnv, ApiKeyData, ErrorResponse } from "../types.js";
import { TIER_LIMITS, DAY_SECONDS } from "../types.js";

export const adminRouter = new Hono<HonoEnv>();

const PAY_PREFIX = "pay:";
const WAIT_PREFIX = "wait:";

function checkAdmin(c: { env: { ADMIN_KEY?: string }; req: { header: (k: string) => string | undefined } }): boolean {
  const key = c.req.header("x-admin-key") ?? "";
  const expected = c.env.ADMIN_KEY ?? "";
  return expected.length >= 16 && key.length === expected.length && key === expected;
}

adminRouter.use("*", async (c, next) => {
  if (!checkAdmin(c)) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "UNAUTHORIZED", message: "Bad or missing x-admin-key." } },
      401,
    );
  }
  await next();
});

/** Upgrade (or create) a key for a founding member. Dedupes on mpesaCode. */
export async function applyFoundingUpgrade(
  env: { API_KEYS: KVNamespace },
  input: { apiKey?: string; email?: string; mpesaCode: string; tier?: "starter" | "pro" },
): Promise<{ ok: true; apiKey: string; tier: string; duplicateCode: boolean } | { ok: false; error: string }> {
  const code = input.mpesaCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{8,15}$/.test(code)) {
    return { ok: false, error: "mpesaCode must be 8–15 letters/digits (the M-Pesa confirmation code)." };
  }

  const codeKey = `${PAY_PREFIX}${code}`;
  if (await env.API_KEYS.get(codeKey)) {
    return { ok: false, error: `Confirmation code ${code} was already used.` };
  }

  const tier: "starter" | "pro" = input.tier === "starter" ? "starter" : "pro";
  const limit = TIER_LIMITS[tier];

  let keyData: ApiKeyData | undefined;
  if (input.apiKey) {
    const raw = await env.API_KEYS.get(input.apiKey);
    if (raw) keyData = JSON.parse(raw) as ApiKeyData;
  }
  if (!keyData && input.email) {
    // Best-effort: find a waitlisted email's key? Waitlist stores emails, not
    // keys — so create a fresh key for the buyer.
  }
  const created = !keyData;
  if (!keyData) {
    const { generateApiKey } = await import("../services/paystack.js");
    keyData = {
      key: generateApiKey(),
      email: input.email ?? "founding-member",
      tier: "free",
      limit: 50,
      createdAt: new Date().toISOString(),
      active: true,
    };
  }

  keyData.tier = tier;
  keyData.limit = limit;
  keyData.active = true;
  if (input.email && (!keyData.email || keyData.email === "unknown" || keyData.email === "founding-member")) {
    keyData.email = input.email;
  }
  keyData.subscriptionId = `manual-mpesa:${code}`;
  await env.API_KEYS.put(keyData.key, JSON.stringify(keyData), { expirationTtl: DAY_SECONDS * 365 });
  // Reserve the code only AFTER a successful key write (same KV, same semantics).
  await env.API_KEYS.put(codeKey, JSON.stringify({ code, apiKey: keyData.key, at: new Date().toISOString() }), {
    expirationTtl: DAY_SECONDS * 3650,
  });

  return { ok: true, apiKey: keyData.key, tier, duplicateCode: false };
}

adminRouter.post("/upgrade", async (c) => {
  let body: { apiKey?: string; email?: string; mpesaCode?: string; tier?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      400,
    );
  }
  if (!body.mpesaCode) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "MISSING_CODE", message: "'mpesaCode' is required (M-Pesa confirmation code)." } },
      400,
    );
  }
  const result = await applyFoundingUpgrade(c.env, {
    apiKey: body.apiKey,
    email: body.email,
    mpesaCode: body.mpesaCode,
    tier: body.tier === "starter" ? "starter" : "pro",
  });
  if (!result.ok) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "UPGRADE_REJECTED", message: result.error } },
      400,
    );
  }
  return c.json({
    success: true,
    apiKey: result.apiKey,
    tier: result.tier,
    limit: TIER_LIMITS[result.tier as "starter" | "pro"],
    message: `Founding member activated: ${result.apiKey} → ${result.tier}.`,
  });
});

adminRouter.get("/founding", async (c) => {
  const waiters = await c.env.API_KEYS.list({ prefix: WAIT_PREFIX });
  const paid = await c.env.API_KEYS.list({ prefix: PAY_PREFIX });
  return c.json({
    success: true,
    waitlist: waiters.keys.length,
    paidActivations: paid.keys.length,
    cap: 25,
    seatsLeft: Math.max(0, 25 - paid.keys.length),
  });
});
