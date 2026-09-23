import { test } from "node:test";
import assert from "node:assert/strict";
import type { Env, ApiKeyData } from "../src/types.js";
import { redeemPolarLicense, reverifyAllPolarLicenses } from "../src/services/polar.js";

class MemoryKV {
  private m = new Map<string, string>();
  async get(k: string): Promise<string | null> { return this.m.get(k) ?? null; }
  async put(k: string, v: string): Promise<void> { this.m.set(k, v); }
  async list(opts: { prefix: string }): Promise<{ keys: Array<{ name: string }> }> {
    return { keys: [...this.m.keys()].filter((k) => k.startsWith(opts.prefix)).map((name) => ({ name })) };
  }
}

function mockEnv(org = "org-uuid", benefit = "benefit-uuid"): Env {
  return {
    API_KEYS: new MemoryKV() as unknown as Env["API_KEYS"],
    POLAR_ORG_ID: org,
    POLAR_BENEFIT_FOUNDING: benefit,
    POLAR_BENEFIT_STARTER: "SET_VIA_POLAR",
    POLAR_BENEFIT_PRO: "SET_VIA_POLAR",
    POLAR_BENEFIT_UNLIMITED: "SET_VIA_POLAR",
  } as unknown as Env;
}

function mockFetch(payload: unknown): void {
  globalThis.fetch = (async () => ({ json: async () => payload })) as unknown as typeof fetch;
}

test("polar redeem: granted benefit creates pro key and registers license", async () => {
  const env = mockEnv();
  mockFetch({ status: "granted", benefit_id: "benefit-uuid", expires_at: null });
  const res = await redeemPolarLicense(env, "POLAR_LIC_1", { email: "p@e.com" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.tier, "pro");
  assert.equal(res.limit, 10_000);
  assert.equal(res.created, true);
  assert.equal(await env.API_KEYS.get("plic:POLAR_LIC_1"), res.apiKey);
});

test("polar redeem: revoked license is rejected, unconfigured returns 503-style", async () => {
  const env = mockEnv();
  mockFetch({ status: "revoked", benefit_id: "benefit-uuid", expires_at: null });
  const revoked = await redeemPolarLicense(env, "POLAR_LIC_2", {});
  assert.equal(revoked.ok, false);
  assert.equal(revoked.code, "LICENSE_REVOKED");

  const off = mockEnv("SET_VIA_POLAR");
  const nc = await redeemPolarLicense(off, "POLAR_LIC_3", {});
  assert.equal(nc.ok, false);
  assert.equal(nc.code, "NOT_CONFIGURED");
});

test("polar cron: non-granted license downgrades its key", async () => {
  const env = mockEnv();
  const seed: ApiKeyData = {
    key: "rsk_polar", email: "x@e.com", tier: "pro", limit: 10_000,
    createdAt: new Date().toISOString(), active: true,
  };
  await env.API_KEYS.put(seed.key, JSON.stringify(seed));
  await env.API_KEYS.put("plic:POLAR_LIC_4", seed.key);
  mockFetch({ status: "revoked", benefit_id: "benefit-uuid", expires_at: null });
  const res = await reverifyAllPolarLicenses(env);
  assert.equal(res.checked, 1);
  assert.equal(res.downgraded, 1);
  const after = JSON.parse((await env.API_KEYS.get("rsk_polar")) ?? "{}") as ApiKeyData;
  assert.equal(after.tier, "free");
});
