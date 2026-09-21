/**
 * Stripe integration using raw fetch() instead of the Stripe SDK.
 *
 * Why raw fetch?
 *  – The `stripe` npm package bundles ~2 MB of code; we only use Checkout
 *    Sessions + Webhooks, so the REST API direct is smaller, has zero deps,
 *    and behaves identically.
 *  – The `Stripe-Version` header is pinned so future Stripe API changes
 *    cannot silently break the Worker.
 */

import type { Env, ApiKeyData } from "../types.js";
import {
  PRO_TIER_LIMIT,
  FREE_TIER_LIMIT,
  DAY_SECONDS,
} from "../types.js";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2024-06-20";

// ── Low-level Stripe client ──────────────────────────────────────────────────

async function stripeRequest<T>(
  path: string,
  secretKey: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${secretKey}:`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });

  const data = (await response.json()) as Record<string, unknown> & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      data.error?.message ?? `Stripe API error: HTTP ${response.status}`,
    );
  }

  return data as unknown as T;
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

// ── Stripe Checkout ──────────────────────────────────────────────────────────

interface StripeSession {
  id: string;
  url: string | null;
  customer?: string;
  subscription?: string;
}

/**
 * Creates a Stripe Checkout session for the Pro plan and pre-registers the
 * API key in KV with free-tier limits. The key is upgraded to Pro by the
 * `checkout.session.completed` webhook once payment succeeds.
 *
 * The generated key is embedded in `success_url` so the landing page can
 * show it immediately after payment (the webhook upgrade may lag by seconds).
 */
export async function createCheckoutSession(
  env: Env,
  email: string,
  existingApiKey?: string,
): Promise<string> {
  const apiKey = existingApiKey ?? generateApiKey();

  const session = await stripeRequest<StripeSession>("/checkout/sessions", env.STRIPE_SECRET_KEY, "POST", {
    mode: "subscription",
    customer_email: email,
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    "automatic_payment_methods[enabled]": "true",
    success_url: `${env.STRIPE_SUCCESS_URL}&key=${apiKey}`,
    cancel_url: env.STRIPE_CANCEL_URL,
    "metadata[api_key]": apiKey,
    "metadata[email]": email,
    "subscription_data[metadata][api_key]": apiKey,
    "subscription_data[metadata][email]": email,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
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

  return session.url;
}

// ── Webhook handling ─────────────────────────────────────────────────────────

export interface StripeWebhookResult {
  handled: boolean;
  type: string;
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export async function handleWebhookEvent(
  env: Env,
  payload: string,
  signatureHeader: string,
): Promise<StripeWebhookResult> {
  if (!await verifyStripeSignature(payload, signatureHeader, env.STRIPE_WEBHOOK_SECRET)) {
    throw new Error("Webhook signature verification failed");
  }

  const event = JSON.parse(payload) as StripeEvent;

  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(env, event.data.object);
      return { handled: true, type: event.type };

    case "customer.subscription.updated":
      await onSubscriptionUpdated(env, event.data.object);
      return { handled: true, type: event.type };

    case "customer.subscription.deleted":
      await onSubscriptionDeleted(env, event.data.object);
      return { handled: true, type: event.type };

    case "invoice.payment_succeeded":
      await onPaymentSucceeded(env, event.data.object);
      return { handled: true, type: event.type };

    case "invoice.payment_failed":
      await onPaymentFailed(env, event.data.object);
      return { handled: true, type: event.type };

    default:
      return { handled: false, type: event.type };
  }
}

// ── Signature verification (Web Crypto, no SDK) ──────────────────────────────

function parseSignatureHeader(header: string): {
  timestamp: string;
  signatures: string[];
} {
  const acc: { timestamp: string; signatures: string[] } = {
    timestamp: "",
    signatures: [],
  };
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === "t") acc.timestamp = v;
    else if (k === "v1") acc.signatures.push(v);
  }
  return acc;
}

export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  const { timestamp, signatures } = parseSignatureHeader(header);
  if (!timestamp || signatures.length === 0) return false;

  // Reject events older than 5 minutes (Stripe replay protection).
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signatures.some((s) => timingSafeEqual(s, expected));
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

// ── Event handlers ───────────────────────────────────────────────────────────

async function onCheckoutCompleted(
  env: Env,
  obj: Record<string, unknown>,
): Promise<void> {
  const meta = obj.metadata as Record<string, string> | undefined;
  const apiKey = meta?.api_key;
  if (!apiKey) {
    console.error("checkout.session.completed: no api_key in metadata");
    return;
  }

  const keyData: ApiKeyData = {
    key: apiKey,
    email: meta.email ?? ((obj.customer_email as string) ?? "unknown"),
    tier: "pro",
    limit: PRO_TIER_LIMIT,
    stripeCustomerId: (obj.customer as string) ?? undefined,
    stripeSubscriptionId: (obj.subscription as string) ?? undefined,
    createdAt: new Date().toISOString(),
    active: true,
  };
  await putKey(env, keyData);
  await resetMonthlyCounter(env, apiKey);
}

async function onSubscriptionUpdated(
  env: Env,
  obj: Record<string, unknown>,
): Promise<void> {
  const meta = obj.metadata as Record<string, string> | undefined;
  const apiKey = meta?.api_key;
  if (!apiKey) return;

  const existing = await loadKeyData(env, apiKey);
  if (!existing) return;

  const status = obj.status as string;
  if (status === "active" || status === "trialing") {
    existing.tier = "pro";
    existing.limit = PRO_TIER_LIMIT;
    existing.active = true;
  } else if (status === "past_due" || status === "unpaid") {
    existing.tier = "free";
    existing.limit = FREE_TIER_LIMIT;
  }

  if (typeof obj.id === "string") {
    existing.stripeSubscriptionId = obj.id;
  }
  await putKey(env, existing);
}

async function onSubscriptionDeleted(
  env: Env,
  obj: Record<string, unknown>,
): Promise<void> {
  const meta = obj.metadata as Record<string, string> | undefined;
  const apiKey = meta?.api_key;
  if (!apiKey) return;

  const existing = await loadKeyData(env, apiKey);
  if (!existing) return;

  existing.tier = "free";
  existing.limit = FREE_TIER_LIMIT;
  await putKey(env, existing);
}

async function onPaymentSucceeded(
  env: Env,
  obj: Record<string, unknown>,
): Promise<void> {
  const subDetails = obj.subscription_details as
    | { metadata?: Record<string, string> }
    | undefined;
  const apiKey = subDetails?.metadata?.api_key;
  if (!apiKey) return;
  await resetMonthlyCounter(env, apiKey);
}

async function onPaymentFailed(
  env: Env,
  obj: Record<string, unknown>,
): Promise<void> {
  const subDetails = obj.subscription_details as
    | { metadata?: Record<string, string> }
    | undefined;
  const apiKey = subDetails?.metadata?.api_key;
  if (!apiKey) return;

  const existing = await loadKeyData(env, apiKey);
  if (!existing) return;

  existing.tier = "free";
  existing.limit = FREE_TIER_LIMIT;
  await putKey(env, existing);
}
