/**
 * USDC-on-Base rail — autonomous agent payments, zero third parties.
 *
 * Philosophy: an AI agent with a wallet pays like a human with cash —
 * send USDC to the owner's address on Base, then claim with the tx hash.
 * We verify the payment OURSELVES against the public Base RPC (no API key,
 * no processor, no KYC): find the USDC Transfer event to our address,
 * check the amount, upgrade-or-create the API key for 31 days.
 *
 * Contract: USDC (native) on Base mainnet.
 * Docs: https://developers.circle.com/stablecoins/usdc-contract-addresses
 */

import type { Env, ApiKeyData, Tier } from "../types.js";
import { TIER_LIMITS, DAY_SECONDS } from "../types.js";

export const USDC_BASE_CONTRACT = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BASE_RPC = "https://mainnet.base.org";

/** Plan prices in USDC (6 decimals applied later). Matches USD public pricing. */
export const USDC_PRICE: Record<"founding" | "pro" | "unlimited", number> = {
  founding: 9,
  pro: 19,
  unlimited: 49,
};
const CREDIT_DAYS = 31;

export function usdcConfigured(env: Env): boolean {
  const a = (env.BASE_USDC_ADDRESS ?? "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

function ownerTopic(address: string): string {
  return "0x" + address.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json().catch(() => null)) as { result?: T } | null;
  return json?.result ?? null;
}

interface Receipt {
  status?: string;
  logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
}

/** Verify a tx sent USDC to us and map the amount to the best matching tier. */
async function verifyTx(
  owner: string,
  txHash: string,
): Promise<{ ok: true; tier: Tier; usdc: number } | { ok: false; code: string; message: string }> {
  const receipt = await rpc<Receipt>("eth_getTransactionReceipt", [txHash]);
  if (!receipt) {
    return { ok: false, code: "TX_NOT_FOUND", message: "Transaction not found on Base (wrong chain, or still pending — retry in ~30s)." };
  }
  if ((receipt.status ?? "").toLowerCase() !== "0x1") {
    return { ok: false, code: "TX_FAILED", message: "That transaction failed on-chain." };
  }
  const to = ownerTopic(owner);
  for (const log of receipt.logs ?? []) {
    if ((log.address ?? "").toLowerCase() !== USDC_BASE_CONTRACT) continue;
    if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if ((log.topics[2] ?? "").toLowerCase() !== to) continue;
    const units = BigInt(log.data ?? "0x0");
    const usdc = Number(units / 1_000_000n); // USDC = 6 decimals
    if (usdc < USDC_PRICE.founding) {
      return { ok: false, code: "UNDERPAID", message: `Payment received but below the minimum (${USDC_PRICE.founding} USDC for Founding).` };
    }
    let tier: Tier = "pro";
    if (usdc >= USDC_PRICE.founding && usdc < USDC_PRICE.pro) tier = "pro"; // founding price, Pro limits
    if (usdc >= USDC_PRICE.unlimited) tier = "unlimited";
    return { ok: true, tier, usdc };
  }
  return { ok: false, code: "TX_INVALID", message: "No USDC transfer to our address found in that transaction." };
}

export type UsdcClaimResult =
  | { ok: true; apiKey: string; tier: Tier; limit: number; email: string; created: boolean; expiresAt: string }
  | { ok: false; code: string; message: string };

/** Claim: verify the on-chain payment and upgrade (or create) the API key. */
export async function claimUsdcPayment(
  env: Env,
  txHash: string,
  opts: { apiKey?: string; email?: string } = {},
): Promise<UsdcClaimResult> {
  if (!usdcConfigured(env)) {
    return { ok: false, code: "NOT_CONFIGURED", message: "The USDC rail is not active on this deployment yet." };
  }
  const hash = txHash.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return { ok: false, code: "INVALID_HASH", message: "'txHash' must be a Base mainnet transaction hash (0x + 64 hex chars)." };
  }

  const regKey = `usdc:${hash}`;
  if (await env.API_KEYS.get(regKey)) {
    return { ok: false, code: "ALREADY_CLAIMED", message: "That transaction hash has already been claimed." };
  }

  const verified = await verifyTx(env.BASE_USDC_ADDRESS.trim(), hash);
  if (!verified.ok) return verified;

  const tier: Tier = verified.tier;
  const email = opts.email ?? "agent";
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

  const expiresAt = new Date(Date.now() + CREDIT_DAYS * DAY_SECONDS * 1000).toISOString();
  keyData.tier = tier;
  keyData.limit = TIER_LIMITS[tier];
  keyData.active = true;
  if (!keyData.email || keyData.email === "unknown") keyData.email = email;
  keyData.subscriptionId = `usdc:${hash}`;

  await env.API_KEYS.put(keyData.key, JSON.stringify(keyData), { expirationTtl: DAY_SECONDS * 365 });
  await env.API_KEYS.put(regKey, JSON.stringify({ apiKey: keyData.key, expiresAt }), {
    expirationTtl: DAY_SECONDS * 400,
  });

  return { ok: true, apiKey: keyData.key, tier, limit: keyData.limit, email: keyData.email, created, expiresAt };
}

/**
 * Daily cron: expire USDC credits. A key is downgraded only when its LATEST
 * usdc: registry entry is past expiry (renewals add fresh entries).
 */
export async function expireUsdcCredits(
  env: Env,
): Promise<{ checked: number; expired: number }> {
  const list = await env.API_KEYS.list({ prefix: "usdc:" });
  const latest = new Map<string, number>(); // apiKey → max expiry ms
  let checked = 0;

  for (const entry of list.keys) {
    const raw = await env.API_KEYS.get(entry.name);
    if (!raw) continue;
    try {
      const rec = JSON.parse(raw) as { apiKey: string; expiresAt: string };
      const ms = new Date(rec.expiresAt).getTime();
      checked++;
      latest.set(rec.apiKey, Math.max(ms, latest.get(rec.apiKey) ?? 0));
    } catch {
      /* ignore malformed */
    }
  }

  let expired = 0;
  for (const [apiKey, maxMs] of latest) {
    if (maxMs > Date.now()) continue;
    const raw = await env.API_KEYS.get(apiKey);
    if (!raw) continue;
    const keyData = JSON.parse(raw) as ApiKeyData;
    if (keyData.tier !== "free" && (keyData.subscriptionId ?? "").startsWith("usdc:")) {
      keyData.tier = "free";
      keyData.limit = 50;
      await env.API_KEYS.put(keyData.key, JSON.stringify(keyData), { expirationTtl: DAY_SECONDS * 365 });
      expired++;
    }
  }
  return { checked, expired };
}
