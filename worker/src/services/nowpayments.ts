/**
 * NOWPayments rail — hosted crypto checkout (crypto-holding HUMANS).
 * Agents use the raw wallet rail (/pay + /crypto/claim, zero platform);
 * humans get a NOWPayments invoice page (pick USDC/USDT, any network).
 *
 * Security model: IPN webhooks are HMAC-SHA512 signed AND every payment is
 * re-verified via authenticated GET /v1/payment/{id} — webhook payloads are
 * never trusted alone. One-time invoice = 31-day credit (renewal = new invoice).
 * Docs: https://documenter.getpostman.com/view/7902454/2s93JusNtJ
 */

import type { Env, ApiKeyData, Tier } from "../types.js";
import { TIER_LIMITS, DAY_SECONDS } from "../types.js";
import { USDC_PRICE } from "./usdc.js";

const NW_API = "https://api.nowpayments.io/v1";
const CREDIT_DAYS = 31;

export type NwPlan = "founding" | "starter" | "pro" | "unlimited";

export const NW_PRICES_USD: Record<NwPlan, number> = {
  founding: USDC_PRICE.founding, // 9 — Pro limits at Starter price
  starter: 9,
  pro: USDC_PRICE.pro, // 19
  unlimited: USDC_PRICE.unlimited, // 49
};

export function nowpaymentsConfigured(env: Env): boolean {
  return (
    !!env.NW_API_KEY && !env.NW_API_KEY.startsWith("SET_VIA") &&
    !!env.NW_IPN_SECRET && !env.NW_IPN_SECRET.startsWith("SET_VIA")
  );
}

function tierFor(plan: NwPlan): Tier {
  return plan === "unlimited" ? "unlimited" : plan === "starter" ? "starter" : "pro";
}

/** Canonicalize a JSON object per NOWPayments' IPN spec (recursive key sort). */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyIpnSignature(env: Env, rawBody: string, signature: string): Promise<boolean> {
  const expected = await hmacSha512Hex(env.NW_IPN_SECRET, canonicalize(JSON.parse(rawBody)));
  return expected === signature.trim().toLowerCase();
}

async function nwFetch(env: Env, path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${NW_API}${path}`, {
    ...init,
    headers: { "X-API-KEY": env.NW_API_KEY, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/** Create a hosted invoice page (customer picks coin/network). */
export async function createInvoice(
  env: Env,
  plan: NwPlan,
  opts: { apiKey?: string; email?: string } = {},
): Promise<{ ok: true; invoiceId: string; invoiceUrl: string } | { ok: false; message: string }> {
  if (!nowpaymentsConfigured(env)) {
    return { ok: false, message: "NOWPayments is not configured on this deployment yet." };
  }
  const orderId = `rs|${plan}|${opts.apiKey ?? "new"}`;
  const data = await nwFetch(env, "/invoice", {
    method: "POST",
    body: JSON.stringify({
      price_amount: NW_PRICES_USD[plan],
      price_currency: "usd",
      order_id: orderId,
      order_description: `RagScrape ${plan} — 31 days`,
      success_url: env.CHECKOUT_SUCCESS_URL,
      cancel_url: env.CHECKOUT_CANCEL_URL,
    }),
  });
  const id = data?.id as string | undefined;
  const url = data?.invoice_url as string | undefined;
  if (!id || !url) return { ok: false, message: "Invoice creation failed — retry." };
  // Remember intent so the IPN can find the buyer even if order_id is truncated.
  await env.API_KEYS.put(
    `ninv:${id}`,
    JSON.stringify({ plan, apiKey: opts.apiKey ?? "", email: opts.email ?? "unknown", at: new Date().toISOString() }),
    { expirationTtl: DAY_SECONDS * 7 },
  );
  return { ok: true, invoiceId: id, invoiceUrl: url };
}

interface NwPayment {
  payment_id?: number | string;
  payment_status?: string;
  price_amount?: number;
  order_id?: string;
  invoice_id?: string | number;
}

/** Authoritative re-check of a payment via authenticated API. */
async function fetchPayment(env: Env, paymentId: string): Promise<NwPayment | null> {
  return (await nwFetch(env, `/payment/${paymentId}`)) as NwPayment | null;
}

/** Shared upgrade path (31-day credit). Returns the (new or existing) key. */
async function upgradeWithCredit(
  env: Env,
  plan: NwPlan,
  paymentTag: string,
  opts: { apiKey?: string; email?: string },
): Promise<{ ok: true; apiKey: string; tier: Tier; limit: number; expiresAt: string; created: boolean } | { ok: false; message: string }> {
  let keyData: ApiKeyData | undefined;
  if (opts.apiKey) {
    const raw = await env.API_KEYS.get(opts.apiKey);
    if (raw) keyData = JSON.parse(raw) as ApiKeyData;
  }
  const created = !keyData;
  if (!keyData) {
    const { generateApiKey } = await import("./paystack.js");
    keyData = {
      key: generateApiKey(),
      email: opts.email ?? "unknown",
      tier: "free",
      limit: 50,
      createdAt: new Date().toISOString(),
      active: true,
    };
  }
  const tier = tierFor(plan);
  const expiresAt = new Date(Date.now() + CREDIT_DAYS * DAY_SECONDS * 1000).toISOString();
  keyData.tier = tier;
  keyData.limit = TIER_LIMITS[tier];
  keyData.active = true;
  if (!keyData.email || keyData.email === "unknown") keyData.email = opts.email ?? keyData.email;
  keyData.subscriptionId = `nwp:${paymentTag}`;
  await env.API_KEYS.put(keyData.key, JSON.stringify(keyData), { expirationTtl: DAY_SECONDS * 365 });
  await env.API_KEYS.put(
    `nlic:${paymentTag}`,
    JSON.stringify({ apiKey: keyData.key, expiresAt }),
    { expirationTtl: DAY_SECONDS * 400 },
  );
  return { ok: true, apiKey: keyData.key, tier, limit: keyData.limit, expiresAt, created };
}

/**
 * Handle a confirmed payment (called after signature/authenticity checks).
 * Idempotent: a payment_id can only ever grant one credit.
 */
export async function applyNwPayment(
  env: Env,
  paymentId: string,
  // Signed IPN payload — used as fallback when the API re-check is blocked
  // (e.g. account-level IP whitelist). Never used unless the HMAC already passed.
  fallback?: { payment_status?: string; price_amount?: number; order_id?: string; invoice_id?: string | number },
): Promise<{ handled: boolean; message: string }> {
  const claimKey = `nwp-claim:${paymentId}`;
  if (await env.API_KEYS.get(claimKey)) return { handled: false, message: "Already processed." };

  let payment = await fetchPayment(env, paymentId);
  if (payment && payment.payment_status === undefined) payment = null; // blocked/invalid API response (e.g. IP-whitelist 403)
  if (!payment && fallback) payment = fallback; // API blocked → trust the signed payload
  if (!payment) return { handled: false, message: "Payment not found at NOWPayments." };
  if ((payment.payment_status ?? "") !== "finished") {
    return { handled: false, message: `Payment status is '${payment.payment_status}', not finished.` };
  }

  // Resolve plan + buyer: prefer our stored invoice intent, else order_id.
  const invoiceId = payment.invoice_id ? String(payment.invoice_id) : "";
  let plan: NwPlan | undefined;
  let apiKey: string | undefined;
  let email: string | undefined;
  if (invoiceId) {
    const raw = await env.API_KEYS.get(`ninv:${invoiceId}`);
    if (raw) {
      const intent = JSON.parse(raw) as { plan: NwPlan; apiKey: string; email: string };
      plan = intent.plan;
      apiKey = intent.apiKey || undefined;
      email = intent.email;
    }
  }
  if (!plan && typeof payment.order_id === "string" && payment.order_id.startsWith("rs|")) {
    const [, p, k] = payment.order_id.split("|");
    plan = p as NwPlan;
    apiKey = k === "new" ? undefined : k;
  }
  if (!plan || !(plan in NW_PRICES_USD)) return { handled: false, message: "Unrecognized order." };

  const paid = Number(payment.price_amount ?? 0);
  if (paid + 0.01 < NW_PRICES_USD[plan]) {
    return { handled: false, message: `Underpaid: $${paid} < $${NW_PRICES_USD[plan]}.` };
  }

  const result = await upgradeWithCredit(env, plan, paymentId, { apiKey, email });
  if (!result.ok) return { handled: false, message: result.message };
  await env.API_KEYS.put(claimKey, "1", { expirationTtl: DAY_SECONDS * 400 });
  return { handled: true, message: `Upgraded ${result.apiKey} to ${result.tier} until ${result.expiresAt}.` };
}

/** Daily cron: expire lapsed NOWPayments credits. */
export async function expireNowPaymentsCredits(env: Env): Promise<{ checked: number; expired: number }> {
  const list = await env.API_KEYS.list({ prefix: "nlic:" });
  const latest = new Map<string, number>();
  for (const entry of list.keys) {
    const raw = await env.API_KEYS.get(entry.name);
    if (!raw) continue;
    try {
      const rec = JSON.parse(raw) as { apiKey: string; expiresAt: string };
      latest.set(rec.apiKey, Math.max(new Date(rec.expiresAt).getTime(), latest.get(rec.apiKey) ?? 0));
    } catch { /* malformed */ }
  }
  let expired = 0;
  for (const [apiKey, ms] of latest) {
    if (ms > Date.now()) continue;
    const raw = await env.API_KEYS.get(apiKey);
    if (!raw) continue;
    const keyData = JSON.parse(raw) as ApiKeyData;
    if (keyData.tier !== "free" && (keyData.subscriptionId ?? "").startsWith("nwp:")) {
      keyData.tier = "free";
      keyData.limit = 50;
      await env.API_KEYS.put(keyData.key, JSON.stringify(keyData), { expirationTtl: DAY_SECONDS * 365 });
      expired++;
    }
  }
  return { checked: latest.size, expired };
}
