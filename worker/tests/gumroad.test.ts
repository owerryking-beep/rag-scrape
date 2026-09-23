import test from "node:test";
import assert from "node:assert/strict";
import type { Env, ApiKeyData } from "../src/types.js";
import { redeemLicense } from "../src/services/gumroad.js";
import { addWaitlistEntry } from "../src/routes/waitlist.js";

function mockKV(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => {
      m.set(k, v);
    },
    list: async (opts: { prefix?: string }) => ({
      keys: [...m.keys()].filter((k) => !opts.prefix || k.startsWith(opts.prefix)).map((name) => ({ name })),
    }),
  } as unknown as KVNamespace;
}

function mockEnv(products: Record<string, string> = {}): Env {
  return {
    API_KEYS: mockKV(),
    RATE_LIMITS: mockKV(),
    GUMROAD_PRODUCT_STARTER: products.starter ?? "SET_VIA_GUMROAD",
    GUMROAD_PRODUCT_PRO: products.pro ?? "SET_VIA_GUMROAD",
    GUMROAD_PRODUCT_UNLIMITED: products.unlimited ?? "SET_VIA_GUMROAD",
  } as unknown as Env;
}

test("redeem: NOT_CONFIGURED when no product ids set", async () => {
  const r = await redeemLicense(mockEnv(), "LIC-123");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "NOT_CONFIGURED");
});

test("redeem: invalid license when verify fails for all products", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => ({ json: async () => ({ success: false }) })) as unknown as typeof fetch;
  try {
    const r = await redeemLicense(mockEnv({ pro: "PID_PRO" }), "LIC-BAD");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "INVALID_LICENSE");
  } finally {
    globalThis.fetch = orig;
  }
});

test("redeem: pro license upgrades an existing key", async () => {
  const env = mockEnv({ pro: "PID_PRO" });
  const seed: ApiKeyData = {
    key: "rsk_existing", email: "buyer@e.com", tier: "free", limit: 50,
    createdAt: new Date().toISOString(), active: true,
  };
  await env.API_KEYS.put(seed.key, JSON.stringify(seed));

  const orig = globalThis.fetch;
  globalThis.fetch = (async () => ({
    json: async () => ({ success: true, purchase: { email: "buyer@e.com" } }),
  })) as unknown as typeof fetch;
  try {
    const r = await redeemLicense(env, "LIC-PRO-1", { apiKey: "rsk_existing" });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.tier, "pro");
      assert.equal(r.limit, 10_000);
      assert.equal(r.created, false);
      assert.equal(r.apiKey, "rsk_existing");
      const stored = JSON.parse((await env.API_KEYS.get("rsk_existing")) ?? "{}") as ApiKeyData;
      assert.equal(stored.tier, "pro");
      assert.equal(stored.limit, 10_000);
    }
  } finally {
    globalThis.fetch = orig;
  }
});

test("redeem: starter license creates a new key when none supplied", async () => {
  const env = mockEnv({ starter: "PID_STARTER" });
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => ({
    json: async () => ({ success: true, purchase: { email: "new@e.com" } }),
  })) as unknown as typeof fetch;
  try {
    const r = await redeemLicense(env, "LIC-ST-1", {});
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.tier, "starter");
      assert.equal(r.limit, 2_000);
      assert.equal(r.created, true);
      assert.ok(r.apiKey.startsWith("rsk_"));
    }
  } finally {
    globalThis.fetch = orig;
  }
});

test("redeem: revoked license is rejected", async () => {
  const env = mockEnv({ pro: "PID_PRO" });
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => ({
    json: async () => ({ success: true, purchase: { email: "x@e.com", revoked: true } }),
  })) as unknown as typeof fetch;
  try {
    const r = await redeemLicense(env, "LIC-REV", {});
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "LICENSE_REVOKED");
  } finally {
    globalThis.fetch = orig;
  }
});

// ── waitlist ─────────────────────────────────────────────────────────────────

test("waitlist: adds, positions, dedupes", async () => {
  const env = { API_KEYS: mockKV() };
  const a = await addWaitlistEntry(env, "A@Example.com ");
  assert.equal(a.ok, true);
  assert.equal(a.position, 1);
  const b = await addWaitlistEntry(env, "b@example.com");
  assert.equal(b.position, 2);
  const dup = await addWaitlistEntry(env, "a@example.com");
  assert.equal(dup.already, true);
  assert.equal(dup.position, 1);
});

test("waitlist: rejects invalid emails", async () => {
  const env = { API_KEYS: mockKV() };
  const r = await addWaitlistEntry(env, "not-an-email");
  assert.equal(r.ok, false);
});


test("reverifyAllLicenses downgrades cancelled subscriptions", async () => {
  const { reverifyAllLicenses } = await import("../src/services/gumroad.js");
  const env = mockEnv({ pro: "PID_PRO" });
  // Seed a previously-redeemed Pro key + its license registry entry.
  const seed: ApiKeyData = {
    key: "rsk_gone", email: "c@e.com", tier: "pro", limit: 10_000,
    subscriptionId: "gumroad:LIC-CANCELLED", createdAt: new Date().toISOString(), active: true,
  };
  await env.API_KEYS.put(seed.key, JSON.stringify(seed));
  await env.API_KEYS.put("glic:LIC-CANCELLED", seed.key);

  const orig = globalThis.fetch;
  globalThis.fetch = (async () => ({
    json: async () => ({
      success: true,
      purchase: { email: "c@e.com", subscription_cancelled_at: "2026-09-20T00:00:00Z" },
    }),
  })) as unknown as typeof fetch;
  try {
    const res = await reverifyAllLicenses(env);
    assert.equal(res.checked, 1);
    assert.equal(res.downgraded, 1);
    const after = JSON.parse((await env.API_KEYS.get("rsk_gone")) ?? "{}") as ApiKeyData;
    assert.equal(after.tier, "free");
    assert.equal(after.limit, 50);
  } finally {
    globalThis.fetch = orig;
  }
});

test("reverifyAllLicenses leaves active subscriptions alone", async () => {
  const { reverifyAllLicenses } = await import("../src/services/gumroad.js");
  const env = mockEnv({ pro: "PID_PRO" });
  const seed: ApiKeyData = {
    key: "rsk_keep", email: "k@e.com", tier: "pro", limit: 10_000,
    createdAt: new Date().toISOString(), active: true,
  };
  await env.API_KEYS.put(seed.key, JSON.stringify(seed));
  await env.API_KEYS.put("glic:LIC-OK", seed.key);

  const orig = globalThis.fetch;
  globalThis.fetch = (async () => ({
    json: async () => ({ success: true, purchase: { email: "k@e.com" } }),
  })) as unknown as typeof fetch;
  try {
    const res = await reverifyAllLicenses(env);
    assert.equal(res.downgraded, 0);
    const after = JSON.parse((await env.API_KEYS.get("rsk_keep")) ?? "{}") as ApiKeyData;
    assert.equal(after.tier, "pro");
  } finally {
    globalThis.fetch = orig;
  }
});
