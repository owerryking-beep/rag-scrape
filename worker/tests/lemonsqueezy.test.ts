import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Env, ApiKeyData } from "../src/types.js";
import {
  verifyLsSignature,
  handleWebhookEvent,
} from "../src/services/lemonsqueezy.js";

const SECRET = "whsec_test_signing_secret_123";

// ── Mocks ────────────────────────────────────────────────────────────────────

function mockKV(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => {
      m.set(k, v);
    },
  } as unknown as KVNamespace;
}

function mockEnv(): Env {
  return {
    API_KEYS: mockKV(),
    RATE_LIMITS: mockKV(),
    LS_API_KEY: "ls_api_test",
    LS_WEBHOOK_SECRET: SECRET,
    LS_STORE_ID: "1",
    LS_VARIANT_ID: "1",
    LS_TEST_MODE: "",
    CHECKOUT_SUCCESS_URL: "https://worker.test/?checkout=success",
    CHECKOUT_CANCEL_URL: "https://worker.test/?checkout=cancelled",
    DEMO_KEY: "demo_rsk_free_tier_2024",
  } as Env;
}

function seedKey(env: Env, data: Partial<ApiKeyData>): void {
  const full: ApiKeyData = {
    key: "rsk_test",
    email: "buyer@example.com",
    tier: "free",
    limit: 50,
    createdAt: new Date().toISOString(),
    active: true,
    ...data,
  };
  void env.API_KEYS.put(full.key, JSON.stringify(full));
}

async function storedKey(env: Env, key: string): Promise<ApiKeyData> {
  const raw = await env.API_KEYS.get(key);
  return JSON.parse(raw ?? "{}") as ApiKeyData;
}

// ── Payload helpers ──────────────────────────────────────────────────────────

function subEvent(opts: {
  event: string;
  apiKey?: string;
  status?: string;
  subId?: string;
}): string {
  return JSON.stringify({
    meta: {
      event_name: opts.event,
      ...(opts.apiKey ? { custom_data: { api_key: opts.apiKey } } : {}),
    },
    data: {
      type: "subscriptions",
      id: opts.subId ?? "42",
      attributes: {
        status: opts.status ?? "active",
        user_email: "buyer@example.com",
      },
    },
  });
}

function sign(payload: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ── Signature verification ───────────────────────────────────────────────────

test("accepts a valid signature", async () => {
  const payload = subEvent({ event: "subscription_created", apiKey: "rsk_test" });
  assert.equal(await verifyLsSignature(payload, sign(payload), SECRET), true);
});

test("rejects a signature from the wrong secret", async () => {
  const payload = subEvent({ event: "subscription_created", apiKey: "rsk_test" });
  assert.equal(await verifyLsSignature(payload, sign(payload, "other"), SECRET), false);
});

test("rejects a tampered payload", async () => {
  const payload = subEvent({ event: "subscription_created", apiKey: "rsk_test" });
  const tampered = payload.replace("rsk_test", "rsk_evil");
  assert.equal(await verifyLsSignature(tampered, sign(payload), SECRET), false);
});

test("rejects malformed signature headers", async () => {
  const payload = subEvent({ event: "subscription_created", apiKey: "rsk_test" });
  assert.equal(await verifyLsSignature(payload, "", SECRET), false);
  assert.equal(await verifyLsSignature(payload, "not-hex", SECRET), false);
  assert.equal(await verifyLsSignature(payload, "deadbeef", SECRET), false);
});

// ── Event handling ───────────────────────────────────────────────────────────

test("subscription_created upgrades the key to Pro", async () => {
  const env = mockEnv();
  const res = await handleWebhookEvent(
    env,
    subEvent({ event: "subscription_created", apiKey: "rsk_new", subId: "77" }),
    sign(subEvent({ event: "subscription_created", apiKey: "rsk_new", subId: "77" })),
  );
  assert.deepEqual(res, { handled: true, type: "subscription_created" });
  const key = await storedKey(env, "rsk_new");
  assert.equal(key.tier, "pro");
  assert.equal(key.limit, 10_000);
  assert.equal(key.lsSubscriptionId, "77");
  assert.equal(key.email, "buyer@example.com");
});

test("subscription_updated with expired status downgrades to free", async () => {
  const env = mockEnv();
  seedKey(env, { key: "rsk_pro", tier: "pro", limit: 10_000 });
  const payload = subEvent({ event: "subscription_updated", apiKey: "rsk_pro", status: "expired" });
  await handleWebhookEvent(env, payload, sign(payload));
  const key = await storedKey(env, "rsk_pro");
  assert.equal(key.tier, "free");
  assert.equal(key.limit, 50);
});

test("subscription_updated active (re-activation) restores Pro", async () => {
  const env = mockEnv();
  seedKey(env, { key: "rsk_back", tier: "free", limit: 50 });
  const payload = subEvent({ event: "subscription_updated", apiKey: "rsk_back", status: "active" });
  await handleWebhookEvent(env, payload, sign(payload));
  const key = await storedKey(env, "rsk_back");
  assert.equal(key.tier, "pro");
  assert.equal(key.limit, 10_000);
});

test("grace_period keeps the current tier", async () => {
  const env = mockEnv();
  seedKey(env, { key: "rsk_grace", tier: "pro", limit: 10_000 });
  const payload = subEvent({ event: "subscription_updated", apiKey: "rsk_grace", status: "on_trial" });
  await handleWebhookEvent(env, payload, sign(payload));
  const key = await storedKey(env, "rsk_grace");
  assert.equal(key.tier, "pro");
});

test("subscription_created without custom api_key is acked but ignored", async () => {
  const env = mockEnv();
  const payload = subEvent({ event: "subscription_created" });
  const res = await handleWebhookEvent(env, payload, sign(payload));
  assert.equal(res.handled, true);
  assert.equal(await env.API_KEYS.get("unknown"), null);
});

test("unknown event types are acked as not-handled", async () => {
  const env = mockEnv();
  const payload = subEvent({ event: "order_created" });
  const res = await handleWebhookEvent(env, payload, sign(payload));
  assert.deepEqual(res, { handled: false, type: "order_created" });
});

test("bad signature makes handleWebhookEvent throw", async () => {
  const env = mockEnv();
  const payload = subEvent({ event: "subscription_created", apiKey: "rsk_x" });
  await assert.rejects(
    () => handleWebhookEvent(env, payload, "0".repeat(64)),
    /signature/i,
  );
});
