/**
 * Lemon Squeezy integration using raw fetch() (zero deps).
 *
 * Why Lemon Squeezy instead of Stripe (decision 2026-09-21)?
 *  – Stripe live activation requires US-only identity + bank details, which
 *    blocked the Kenya-based account. Lemon Squeezy is a merchant of record:
 *    they sell on our behalf on their payment rails and pay out to Kenya.
 *  – Fees ≈ 5% + $0.50 (+~2% international/subscription surcharges).
 *
 * API: JSON:API style, Bearer auth. Docs: docs.lemonsqueezy.com
 * Webhooks: POST with hex HMAC-SHA256 of the raw body in `X-Signature`.
 */

import type { Env, ApiKeyData } from "../types.js";
import {
  PRO_TIER_LIMIT,
  FREE_TIER_LIMIT,
  DAY_SECONDS,
} from "../types.js";

const LS_API = "https://api.lemonsqueezy.com/v1";

// ── Low-level Lemon Squeezy client ───────────────────────────────────────────

interface LsErrorBody {
  error?: string | { message?: string; detail?: string };
  errors?: Array<{ detail?: string; title?: string }>;
  message?: string;
}

function describeLsError(status: number, body: LsErrorBody): string {
  if (typeof body.error === "string") return body.error;
  if (body.error?.message) return body.error.message;
  if (body.error?.detail) return body.error.detail;
  if (body.errors?.length) {
    const first = body.errors[0];
    return first?.detail ?? first?.title ?? `Lemon Squeezy API error: HTTP ${status}`;
  }
  if (body.message) return body.message;
  return `Lemon Squeezy API error: HTTP ${status}`;
}

async function lsRequest<T>(
  path: string,
  apiKey: string,
  method: "GET" | "POST",
  jsonBody?: unknown,
): Promise<T> {
  const response = await fetch(`${LS_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(jsonBody !== undefined ? { "Content-Type": "application/vnd.api+json" } : {}),
    },
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
  });

  const text = await response.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // non-JSON body — fall through to the status check
  }

  if (!response.ok) {
    throw new Error(describeLsError(response.status, (data ?? {}) as LsErrorBody));
  }

  return data as T;
}

// ── API key generation ───────────────────────────────────────────────────────

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

// ── Lemon Squeezy Checkout ───────────────────────────────────────────────────

interface LsCheckoutResponse {
  data?: { attributes?: { url?: string } };
}

/**
 * Creates a Lemon Squeezy hosted checkout for the Pro variant and
 * pre-registers the API key in KV with free-tier limits. The key is upgraded
 * to Pro by the `subscription_created` webhook once payment succeeds.
 *
 * The generated key is embedded in `redirect_url` so the landing page can
 * show it immediately after payment (the webhook upgrade may lag seconds).
 * The key also travels as checkout custom data (`meta.custom_data.api_key`
 * in every webhook for this subscription).
 */
export async function createCheckoutSession(
  env: Env,
  email: string,
  existingApiKey?: string,
): Promise<string> {
  const apiKey = existingApiKey ?? generateApiKey();

  const testMode = (env.LS_TEST_MODE ?? "").trim().toLowerCase() === "true";

  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        ...(testMode ? { test_mode: true } : {}),
        product_options: {
          enabled_variants: [Number(env.LS_VARIANT_ID)],
          redirect_url: `${env.CHECKOUT_SUCCESS_URL}&key=${apiKey}`,
          receipt_button_text: "Start scraping",
          receipt_thank_you_note:
            "Your RagScrape Pro key is active — 10,000 requests/month. It is the rsk_… key you registered with.",
        },
        checkout_options: { embed: false },
        checkout_data: {
          email,
          custom: { api_key: apiKey, email },
        },
      },
      relationships: {
        store: { data: { type: "stores", id: String(env.LS_STORE_ID) } },
        variant: { data: { type: "variants", id: String(env.LS_VARIANT_ID) } },
      },
    },
  };

  const res = await lsRequest<LsCheckoutResponse>(
    "/checkouts",
    env.LS_API_KEY,
    "POST",
    payload,
  );

  const url = res.data?.attributes?.url;
  if (!url) {
    throw new Error("Lemon Squeezy did not return a checkout URL");
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

  return url;
}

// ── Webhook handling ─────────────────────────────────────────────────────────

export interface LsWebhookResult {
  handled: boolean;
  type: string;
}

interface LsWebhook {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, string>;
  };
  data?: {
    id?: string;
    attributes?: Record<string, unknown>;
  };
}

export async function handleWebhookEvent(
  env: Env,
  payload: string,
  signatureHeader: string,
): Promise<LsWebhookResult> {
  if (
    !signatureHeader ||
    !(await verifyLsSignature(payload, signatureHeader, env.LS_WEBHOOK_SECRET))
  ) {
    throw new Error("Webhook signature verification failed");
  }

  let event: LsWebhook;
  try {
    event = JSON.parse(payload) as LsWebhook;
  } catch {
    throw new Error("Webhook payload is not valid JSON");
  }

  const eventName = event.meta?.event_name ?? "unknown";
  const custom = event.meta?.custom_data;
  const apiKey = custom?.api_key;
  const attrs = event.data?.attributes ?? {};
  const lsSubscriptionId = typeof event.data?.id === "string" ? event.data.id : undefined;
  const status = typeof attrs.status === "string" ? attrs.status : undefined;

  switch (eventName) {
    // First successful payment → upgrade the key to Pro.
    case "subscription_created": {
      if (!apiKey) {
        console.error("subscription_created: no api_key in custom_data");
        return { handled: true, type: eventName };
      }
      const keyData: ApiKeyData = {
        key: apiKey,
        email: custom?.email ?? (typeof attrs.user_email === "string" ? attrs.user_email : "unknown"),
        tier: "pro",
        limit: PRO_TIER_LIMIT,
        ...(lsSubscriptionId ? { lsSubscriptionId } : {}),
        createdAt: new Date().toISOString(),
        active: true,
      };
      await putKey(env, keyData);
      await resetMonthlyCounter(env, apiKey);
      return { handled: true, type: eventName };
    }

    // Status changes across the subscription lifetime → keep the tier in sync.
    case "subscription_updated": {
      if (!apiKey) return { handled: true, type: eventName };
      const existing = await loadKeyData(env, apiKey);
      if (!existing) return { handled: true, type: eventName };
      if (lsSubscriptionId) existing.lsSubscriptionId = lsSubscriptionId;

      if (status === "active") {
        existing.tier = "pro";
        existing.limit = PRO_TIER_LIMIT;
        existing.active = true;
      } else if (status === "cancelled" || status === "expired" || status === "unpaid") {
        existing.tier = "free";
        existing.limit = FREE_TIER_LIMIT;
      }
      // past_due / on_trial / grace_period / paused → keep current tier.
      await putKey(env, existing);
      return { handled: true, type: eventName };
    }

    // Terminal event (cancel followed through / non-payment exhausted).
    case "subscription_expired": {
      if (!apiKey) return { handled: true, type: eventName };
      const existing = await loadKeyData(env, apiKey);
      if (!existing) return { handled: true, type: eventName };
      existing.tier = "free";
      existing.limit = FREE_TIER_LIMIT;
      await putKey(env, existing);
      return { handled: true, type: eventName };
    }

    // Successful renewal → give the month a fresh counter.
    case "subscription_payment_success": {
      if (!apiKey) return { handled: true, type: eventName };
      await resetMonthlyCounter(env, apiKey);
      return { handled: true, type: eventName };
    }

    default:
      return { handled: false, type: eventName };
  }
}

// ── Signature verification (Web Crypto, hex HMAC-SHA256 of the raw body) ─────

export async function verifyLsSignature(
  payload: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHex || !/^[0-9a-f]{64}$/i.test(signatureHex)) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
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

async function loadKeyData(
  env: Env,
  apiKey: string,
): Promise<ApiKeyData | null> {
  const raw = await env.API_KEYS.get(apiKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ApiKeyData;
  } catch {
    return null;
  }
}
