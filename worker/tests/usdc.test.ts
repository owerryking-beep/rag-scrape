import { test } from "node:test";
import assert from "node:assert/strict";
import type { Env, ApiKeyData } from "../src/types.js";
import {
  claimUsdcPayment,
  expireUsdcCredits,
  USDC_BASE_CONTRACT,
  TRANSFER_TOPIC,
} from "../src/services/usdc.js";

class MemoryKV {
  private m = new Map<string, string>();
  async get(k: string): Promise<string | null> { return this.m.get(k) ?? null; }
  async put(k: string, v: string): Promise<void> { this.m.set(k, v); }
  async list(opts: { prefix: string }): Promise<{ keys: Array<{ name: string }> }> {
    return { keys: [...this.m.keys()].filter((k) => k.startsWith(opts.prefix)).map((name) => ({ name })) };
  }
}

const OWNER = "0x1111111111111111111111111111111111111111";
const HASH = "0x" + "ab".repeat(32);

function receiptJson(to: string, usdcAmount: number, status = "0x1") {
  return {
    jsonrpc: "2.0", id: 1,
    result: {
      status,
      logs: [{
        address: USDC_BASE_CONTRACT,
        topics: [TRANSFER_TOPIC, "0x" + "22".repeat(32), "0x" + to.replace(/^0x/, "").toLowerCase().padStart(64, "0")],
        data: "0x" + (usdcAmount * 1_000_000).toString(16),
      }],
    },
  };
}

function mockEnv() {
  return {
    API_KEYS: new MemoryKV() as unknown as Env["API_KEYS"],
    BASE_USDC_ADDRESS: OWNER,
  } as unknown as Env;
}

test("usdc claim: 9 USDC → founding (Pro limits), registered + expiring", async () => {
  const env = mockEnv();
  globalThis.fetch = (async () => ({ json: async () => receiptJson(OWNER, 9) })) as unknown as typeof fetch;
  const res = await claimUsdcPayment(env, HASH, { email: "bot@ai" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.tier, "pro"); // founding price, Pro limits
  assert.equal(res.limit, 10_000);
  assert.ok((await env.API_KEYS.get(`usdc:${HASH}`)) !== null);
  const rec = JSON.parse((await env.API_KEYS.get(`usdc:${HASH}`)) ?? "{}");
  assert.ok(new Date(rec.expiresAt).getTime() > Date.now() + 30 * 24 * 3600 * 1000);
});

test("usdc claim: 49+ USDC → unlimited", async () => {
  const env = mockEnv();
  globalThis.fetch = (async () => ({ json: async () => receiptJson(OWNER, 49) })) as unknown as typeof fetch;
  const res = await claimUsdcPayment(env, "0x" + "cd".repeat(32), {});
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.tier, "unlimited");
});

test("usdc claim: underpayment rejected, wrong recipient rejected", async () => {
  const env = mockEnv();
  globalThis.fetch = (async () => ({ json: async () => receiptJson(OWNER, 5) })) as unknown as typeof fetch;
  const low = await claimUsdcPayment(env, "0x" + "ee".repeat(32), {});
  assert.equal(low.ok, false);
  if (!low.ok) assert.equal(low.code, "UNDERPAID");

  globalThis.fetch = (async () => ({ json: async () => receiptJson("0x9999999999999999999999999999999999999999", 9) })) as unknown as typeof fetch;
  const wrong = await claimUsdcPayment(env, "0x" + "ff".repeat(32), {});
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.code, "TX_INVALID");
});

test("usdc claim: double-claim blocked + unconfigured returns 503-style", async () => {
  const env = mockEnv();
  globalThis.fetch = (async () => ({ json: async () => receiptJson(OWNER, 19) })) as unknown as typeof fetch;
  const first = await claimUsdcPayment(env, "0x" + "11".repeat(32), {});
  assert.equal(first.ok, true);
  const dup = await claimUsdcPayment(env, "0x" + "11".repeat(32), {});
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.code, "ALREADY_CLAIMED");

  const off = { API_KEYS: new MemoryKV(), BASE_USDC_ADDRESS: "SET_VIA_WALLET" } as unknown as Env;
  const nc = await claimUsdcPayment(off, HASH, {});
  assert.equal(nc.ok, false);
  if (!nc.ok) assert.equal(nc.code, "NOT_CONFIGURED");
});

test("usdc cron: expired credit downgrades key, renewed credit survives", async () => {
  const env = mockEnv();
  const key: ApiKeyData = {
    key: "rsk_usdc", email: "bot@ai", tier: "pro", limit: 10_000,
    subscriptionId: "usdc:0xold", createdAt: new Date().toISOString(), active: true,
  };
  await env.API_KEYS.put(key.key, JSON.stringify(key));
  await env.API_KEYS.put("usdc:0xold", JSON.stringify({ apiKey: key.key, expiresAt: new Date(Date.now() - 86400_000).toISOString() }));
  await env.API_KEYS.put("usdc:0xnew", JSON.stringify({ apiKey: key.key, expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() }));
  const res = await expireUsdcCredits(env);
  assert.equal(res.expired, 0); // latest entry still valid → survives
  // Now expire everything:
  await env.API_KEYS.put("usdc:0xnew", JSON.stringify({ apiKey: key.key, expiresAt: new Date(Date.now() - 86400_000).toISOString() }));
  const res2 = await expireUsdcCredits(env);
  assert.equal(res2.expired, 1);
  const after = JSON.parse((await env.API_KEYS.get("rsk_usdc")) ?? "{}") as ApiKeyData;
  assert.equal(after.tier, "free");
  assert.equal(after.limit, 50);
});
