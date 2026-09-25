/**
 * Paystack integration (raw fetch, zero deps).
 *
 * Why Paystack (decision 2026-09-22): Lemon Squeezy live onboarding blocked
 * on the Kenyan account; Paystack Kenya's "Starter Business" verification is
 * national ID + personal M-Pesa/bank number — the lightest legal KYC for a
 * Kenya-based seller. Bonus: local customers can pay with M-Pesa.
 *
 * API: Bearer secret key. Docs: paystack.com/docs
 * Webhooks: POST with hex HMAC-SHA512 of the raw body in
 * `x-paystack-signature` (signed with the SECRET KEY itself).
 *
 * The provider is selected via PAYMENT_PROVIDER ("paystack" | "lemonsqueezy").
 */

import type { Env, ApiKeyData, Plan } from "../types.js";
import { FREE_TIER_LIMIT, TIER_LIMITS, tierForPlan, DAY_SECONDS } from "../types.js";

const PS_API = "https://api.paystack.co";

/** KES prices (base units). Paystack charges in subunits (×100) internally. */
export const PS_PRICES_KES: Record<Plan, number> = {
  starter: 1_200,
  pro: 2_500,
  unlimited: 6_500,
  founding: 1_200, // Pro tier at Starter price — founding-member campaign
};

/** USD card prices (whole USD; Paystack charges subunits ×100). */
export const PS_PRICES_USD: Record<Plan, number> = {
  starter: 9,
  pro: 19,
  unlimited: 49,
  founding: 9, // founding = Pro tier at Starter price, in USD too
};

function planCodeFor(env: Env, plan: Plan, currency: "KES" | "USD" = "KES"): string {
  if (currency === "USD") {
    const usdCode =
      plan === "starter" ? env.PS_PLAN_STARTER_USD :
      plan === "pro" ? env.PS_PLAN_PRO_USD :
      plan === "unlimited" ? env.PS_PLAN_UNLIMITED_USD :
      env.PS_PLAN_FOUNDING_USD;
    // USD plans used only when actually configured; otherwise fall back to KES.
    if (usdCode && !usdCode.startsWith("SET_VIA")) return usdCode;
  }
  const code =
    plan === "starter"
      ? env.PS_PLAN_STARTER
      : plan === "unlimited"
        ? env.PS_PLAN_UNLIMITED
        : plan === "founding"
          ? env.PS_PLAN_FOUNDING
          : env.PS_PLAN_PRO;
  if (!code || code.startsWith("SET_VIA")) {
    throw new Error(`Paystack plan code for "${plan}" is not configured yet.`);
  }
  return code;
}

// ── API key generation (same format as the LS service) ───────────────────────

export function generateApiKey(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = "";
    for (let i = 0; i < 8; i++) {
      const b = bytes[s * 8 + i] ?? 0;
      seg += chars.charAt(b % chars.length);
    }
    segments.push(seg);
  }
  return `rsk_${segments.join("_")}`;
}

// ── Checkout ─────────────────────────────────────────────────────────────────

interface PsInitializeResponse {
  status?: boolean;
  message?: string;
  data?: { authorization_url?: string };
}

/**
 * Creates a Paystack hosted checkout (cards / M-Pesa for local customers)
 * for the plan's subscription, and pre-registers the API key in KV with
 * free-tier limits. `charge.success` webhook upgrades the key to the paid
 * tier once payment succeeds.
 */
export async function createCheckoutSession(
  env: Env,
  email: string,
  existingApiKey?: string,
  plan: Plan = "pro",
  currency: "KES" | "USD" = "KES",
): Promise<string> {
  const apiKey = existingApiKey ?? generateApiKey();
  const planCode = planCodeFor(env, plan, currency);
  const effectiveCurrency: "KES" | "USD" = planCode.includes("USD") || currency === "USD" ? (planCodeFor(env, plan, "USD") === planCode ? "USD" : "KES") : "KES";

  const res = await fetch(`${PS_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      plan: planCode,
      currency: effectiveCurrency,
      callback_url: `${env.CHECKOUT_SUCCESS_URL}&key=${apiKey}`,
      cancel_action: env.CHECKOUT_CANCEL_URL,
      metadata: { api_key: apiKey, email, plan, currency: effectiveCurrency },
    }),
  });

  const data = (await res.json().catch(() => ({}))) as PsInitializeResponse;
  if (!res.ok || !data.status || !data.data?.authorization_url) {
    throw new Error(data.message ?? `Paystack API error: HTTP ${res.status}`);
  }

  const keyData: ApiKeyData = {
    key: apiKey,
    email,
    tier: "free",
    limit: FREE_TIER_LIMIT,
    createdAt: new Date().toISOString(),
    active: true,
  };
  await env.API_KEYS.put(apiKey, JSON.stringify(keyData), {
    expirationTtl: DAY_SECONDS * 30,
  });

  return data.data.authorization_url;
}

// ── Webhook handling ─────────────────────────────────────────────────────────

export interface PsWebhookResult {
  handled: boolean;
  type: string;
}

export async function handleWebhookEvent(
  env: Env,
  payload: string,
  signatureHeader: string,
): Promise<PsWebhookResult> {
  if (
    !signatureHeader ||
    !(await verifyPaystackSignature(payload, signatureHeader, env.PAYSTACK_SECRET_KEY))
  ) {
    throw new Error("Webhook signature verification failed");
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(payload) as { event?: string; data?: Record<string, unknown> };
  } catch {
    throw new Error("Webhook payload is not valid JSON");
  }

  const type = event.event ?? "unknown";

  // The one event that matters: every successful charge — first payment AND
  // renewals. Paystack fires it for each recurring billing cycle, so this
  // both upgrades and keeps the monthly counter fresh. Idempotent by design.
  if (type === "charge.success") {
    const data = event.data ?? {};
    const meta = (data.metadata ?? {}) as Record<string, string>;
    const apiKey = meta.api_key;
    if (!apiKey) {
      console.error("charge.success: no api_key in metadata");
      return { handled: true, type };
    }
    const tier = tierForPlan(meta.plan);
    const keyData: ApiKeyData = {
      key: apiKey,
      email: meta.email ?? (typeof data.customer === "object" && data.customer !== null
        ? String((data.customer as Record<string, unknown>).email ?? "unknown")
        : "unknown"),
      tier,
      limit: TIER_LIMITS[tier],
      subscriptionId:
        typeof data.id === "string" || typeof data.id === "number"
          ? String(data.id)
          : undefined,
      createdAt: new Date().toISOString(),
      active: true,
    };
    await putKey(env, keyData);
    await resetMonthlyCounter(env, apiKey);
    return { handled: true, type };
  }

  // Cancellation events arrive without our metadata (v1: manual downgrade on
  // customer contact — same trade-off every indie payment setup makes first).
  return { handled: false, type };
}

// ── Signature verification (Web Crypto, hex HMAC-SHA512 of the raw body) ─────

export async function verifyPaystackSignature(
  payload: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHex || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(signatureHex.toLowerCase(), expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── KV helpers ───────────────────────────────────────────────────────────────

function monthlyCounterKey(apiKey: string, now = new Date()): string {
  return `${apiKey}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function putKey(
  env: Env,
  keyData: ApiKeyData,
  ttlSeconds = DAY_SECONDS * 365,
): Promise<void> {
  await env.API_KEYS.put(keyData.key, JSON.stringify(keyData), {
    expirationTtl: ttlSeconds,
  });
}

async function resetMonthlyCounter(env: Env, apiKey: string): Promise<void> {
  await env.RATE_LIMITS.put(
    monthlyCounterKey(apiKey),
    JSON.stringify({ count: 0, windowStart: Date.now() }),
    { expirationTtl: DAY_SECONDS * 35 },
  );
}
