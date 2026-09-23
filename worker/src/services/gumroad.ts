/**
 * Gumroad license rail (activation-based selling).
 *
 * Why: Gumroad lets a Kenya-based seller START SELLING immediately — ID
 * verification only gates the first payout, not the sales. This rail is the
 * "international / sell-now" option while Paystack approval is pending; it
 * also survives as a permanent second rail.
 *
 * Flow: customer buys a RagScrape product on Gumroad → receives a license
 * key → POST /redeem {licenseKey, apiKey?} → we verify the license against
 * Gumroad's API and upgrade (or create) the rsk_ API key to the product's
 * tier. No webhook needed (pull-based verification).
 *
 * Docs: https://gumroad.com/api — licenses/verify needs no auth, just the
 * product id + license key.
 */

import type { Env, ApiKeyData, Tier } from "../types.js";
import { FREE_TIER_LIMIT, TIER_LIMITS, DAY_SECONDS } from "../types.js";

const GUMROAD_VERIFY = "https://api.gumroad.com/v2/licenses/verify";

interface GumroadVerifyResponse {
  success?: boolean;
  message?: string;
  purchase?: {
    email?: string;
    product_name?: string;
    revoked?: boolean;
    refund_and_dispute_presale?: boolean;
    subscription_ended_at?: string | null;
    subscription_cancelled_at?: string | null;
    subscription_failed_at?: string | null;
  };
}

function productTiers(env: Env): Array<{ productId: string; tier: Tier }> {
  const out: Array<{ productId: string; tier: Tier }> = [];
  const push = (raw: string | undefined, tier: Tier) => {
    if (raw && !raw.startsWith("SET_VIA")) out.push({ productId: raw.trim(), tier });
  };
  push(env.GUMROAD_PRODUCT_STARTER, "starter");
  push(env.GUMROAD_PRODUCT_PRO, "pro");
  push(env.GUMROAD_PRODUCT_UNLIMITED, "unlimited");
  return out;
}

async function verifyWithGumroad(
  productId: string,
  licenseKey: string,
): Promise<GumroadVerifyResponse | null> {
  const res = await fetch(GUMROAD_VERIFY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ product_id: productId, license_key: licenseKey }).toString(),
  });
  return (await res.json().catch(() => null)) as GumroadVerifyResponse | null;
}

/**
 * Weekly re-verification (cron): every registered Gumroad license is
 * re-checked. Refunded / revoked / cancelled subscriptions are downgraded
 * to the free tier — this is what makes Gumroad a complete replacement
 * rail rather than a one-way door.
 */
export async function reverifyAllLicenses(
  env: Env,
): Promise<{ checked: number; downgraded: number }> {
  const list = await env.API_KEYS.list({ prefix: "glic:" });
  let checked = 0;
  let downgraded = 0;

  for (const entry of list.keys) {
    const apiKey = await env.API_KEYS.get(entry.name);
    if (!apiKey) continue;
    const licenseKey = entry.name.slice("glic:".length);
    checked++;

    let dead = false;
    let stillValid = false;
    for (const { productId } of productTiers(env)) {
      const data = await verifyWithGumroad(productId, licenseKey);
      if (data?.success) {
        stillValid = true;
        const p = data.purchase ?? {};
        if (p.revoked || p.refund_and_dispute_presale) dead = true;
        if (p.subscription_ended_at || p.subscription_cancelled_at || p.subscription_failed_at) dead = true;
        break;
      }
    }

    if (!stillValid || dead) {
      const raw = await env.API_KEYS.get(apiKey);
      if (raw) {
        const keyData = JSON.parse(raw) as ApiKeyData;
        if (keyData.tier !== "free") {
          keyData.tier = "free";
          keyData.limit = FREE_TIER_LIMIT;
          await env.API_KEYS.put(keyData.key, JSON.stringify(keyData), {
            expirationTtl: DAY_SECONDS * 365,
          });
          downgraded++;
        }
      }
    }
  }

  return { checked, downgraded };
}

export type RedeemResult =
  | { ok: true; apiKey: string; tier: Tier; limit: number; email: string; created: boolean }
  | { ok: false; code: string; message: string };

/**
 * Verify a Gumroad license and upgrade (or create) the API key.
 * Exported for unit tests — the route is a thin wrapper.
 */
export async function redeemLicense(
  env: Env,
  licenseKey: string,
  opts: { apiKey?: string; email?: string } = {},
): Promise<RedeemResult> {
  const products = productTiers(env);
  if (products.length === 0) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "Gumroad products are not configured on this deployment yet.",
    };
  }

  let verified: { tier: Tier; email?: string } | null = null;
  for (const { productId, tier } of products) {
    const data = await verifyWithGumroad(productId, licenseKey);
    if (data?.success) {
      if (data.purchase?.revoked || data.purchase?.refund_and_dispute_presale) {
        return { ok: false, code: "LICENSE_REVOKED", message: "This license has been revoked or refunded." };
      }
      verified = { tier, email: data.purchase?.email };
      break;
    }
  }
  if (!verified) {
    return { ok: false, code: "INVALID_LICENSE", message: "License key not recognized for any RagScrape product." };
  }

  const tier = verified.tier;
  const email = opts.email ?? verified.email ?? "unknown";

  // Existing key upgrade (when the buyer already registered), else create.
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
      email,
      tier: "free",
      limit: 50,
      createdAt: new Date().toISOString(),
      active: true,
    };
  }

  keyData.tier = tier;
  keyData.limit = TIER_LIMITS[tier];
  keyData.active = true;
  if (!keyData.email || keyData.email === "unknown") keyData.email = email;
  keyData.subscriptionId = `gumroad:${licenseKey}`;

  await env.API_KEYS.put(keyData.key, JSON.stringify(keyData), {
    expirationTtl: DAY_SECONDS * 365,
  });
  // Registry for the weekly re-verification cron (license → api key).
  await env.API_KEYS.put(`glic:${licenseKey}`, keyData.key, {
    expirationTtl: DAY_SECONDS * 3650,
  });

  return {
    ok: true,
    apiKey: keyData.key,
    tier,
    limit: keyData.limit,
    email: keyData.email,
    created,
  };
}
