/**
 * Polar license rail (merchant-of-record, Kenya officially supported).
 *
 * Polar is the long-term international rail: ~half Gumroad's effective fees,
 * taxes/chargebacks handled, and license keys are AUTO-REVOKED when a
 * subscription is cancelled — the platform enforces liveness for us.
 *
 * Flow: customer subscribes on Polar → receives a license key →
 * POST /redeem {licenseKey, apiKey?} → we validate against Polar's
 * license-keys/validate endpoint (no auth needed, just our org id) and
 * upgrade (or create) the rsk_ API key to the matching tier.
 *
 * Docs: https://polar.sh/docs/features/benefits/license-keys
 */

import type { Env, ApiKeyData, Tier } from "../types.js";
import { FREE_TIER_LIMIT, TIER_LIMITS, DAY_SECONDS } from "../types.js";
import type { RedeemResult } from "./gumroad.js";

const POLAR_VALIDATE = "https://api.polar.sh/v1/customer-portal/license-keys/validate";

interface PolarValidateResponse {
  status?: string;
  benefit_id?: string;
  expires_at?: string | null;
}

/** Benefit → tier map. Founding benefit = Pro limits at the Starter price. */
function benefitTiers(env: Env): Array<{ benefitId: string; tier: Tier }> {
  const out: Array<{ benefitId: string; tier: Tier }> = [];
  const push = (raw: string | undefined, tier: Tier) => {
    if (raw && !raw.startsWith("SET_VIA")) out.push({ benefitId: raw.trim(), tier });
  };
  push(env.POLAR_BENEFIT_STARTER, "starter");
  push(env.POLAR_BENEFIT_FOUNDING, "pro");
  push(env.POLAR_BENEFIT_PRO, "pro");
  push(env.POLAR_BENEFIT_UNLIMITED, "unlimited");
  return out;
}

export function polarConfigured(env: Env): boolean {
  return !!env.POLAR_ORG_ID && !env.POLAR_ORG_ID.startsWith("SET_VIA");
}

async function validateWithPolar(
  env: Env,
  licenseKey: string,
): Promise<PolarValidateResponse | null> {
  const res = await fetch(POLAR_VALIDATE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: licenseKey, organization_id: env.POLAR_ORG_ID }),
  });
  return (await res.json().catch(() => null)) as PolarValidateResponse | null;
}

function isExpired(data: PolarValidateResponse): boolean {
  return !!data.expires_at && new Date(data.expires_at).getTime() < Date.now();
}

/** Weekly defense-in-depth: Polar auto-revokes on cancel, we re-check anyway. */
export async function reverifyAllPolarLicenses(
  env: Env,
): Promise<{ checked: number; downgraded: number }> {
  if (!polarConfigured(env)) return { checked: 0, downgraded: 0 };
  const list = await env.API_KEYS.list({ prefix: "plic:" });
  let checked = 0;
  let downgraded = 0;

  for (const entry of list.keys) {
    const apiKey = await env.API_KEYS.get(entry.name);
    if (!apiKey) continue;
    const licenseKey = entry.name.slice("plic:".length);
    checked++;

    const data = await validateWithPolar(env, licenseKey);
    const dead = !data || !data.benefit_id || data.status !== "granted" || isExpired(data);

    if (dead) {
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

/**
 * Verify a Polar license and upgrade (or create) the API key.
 * Exported for unit tests — the route is a thin wrapper.
 */
export async function redeemPolarLicense(
  env: Env,
  licenseKey: string,
  opts: { apiKey?: string; email?: string } = {},
): Promise<RedeemResult> {
  if (!polarConfigured(env)) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "Polar is not configured on this deployment yet.",
    };
  }

  const data = await validateWithPolar(env, licenseKey);
  if (!data || !data.benefit_id) {
    return { ok: false, code: "INVALID_LICENSE", message: "License key not recognized for any RagScrape product." };
  }
  if (data.status !== "granted" || isExpired(data)) {
    return {
      ok: false,
      code: "LICENSE_REVOKED",
      message: "This license is not active (cancelled, revoked, or expired).",
    };
  }

  const match = benefitTiers(env).find((b) => b.benefitId === data.benefit_id);
  if (!match) {
    return { ok: false, code: "INVALID_LICENSE", message: "License key not recognized for any RagScrape product." };
  }
  const tier = match.tier;
  const email = opts.email ?? "unknown";

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
  keyData.subscriptionId = `polar:${licenseKey}`;

  await env.API_KEYS.put(keyData.key, JSON.stringify(keyData), {
    expirationTtl: DAY_SECONDS * 365,
  });
  await env.API_KEYS.put(`plic:${licenseKey}`, keyData.key, {
    expirationTtl: DAY_SECONDS * 3650,
  });

  return { ok: true, apiKey: keyData.key, tier, limit: keyData.limit, email: keyData.email, created };
}
