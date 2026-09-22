import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Env, ApiKeyData } from "../src/types.js";
import {
  verifyPaystackSignature,
  handleWebhookEvent,
  PS_PRICES_KES,
} from "../src/services/paystack.js";

const SECRET = "sk_test_supersecretkey123";

function mockEnv(): Env {
  return {
    API_KEYS: mockKV(),
    RATE_LIMITS: mockKV(),
    PAYMENT_PROVIDER: "paystack",
    PAYSTACK_SECRET_KEY: SECRET,
    PS_PLAN_STARTER: "PLN_starter",
    PS_PLAN_PRO: "PLN_pro",
    PS_PLAN_UNLIMITED: "PLN_unlimited",
    LS_API_KEY: "x", LS_WEBHOOK_SECRET: "x", LS_STORE_ID: "1",
    LS_VARIANT_ID_PRO: "1", LS_VARIANT_ID_STARTER: "2", LS_VARIANT_ID_UNLIMITED: "3",
    LS_TEST_MODE: "",
    CHECKOUT_SUCCESS_URL: "https://worker.test/?checkout=success",
    CHECKOUT_CANCEL_URL: "https://worker.test/?checkout=cancelled",
    DEMO_KEY: "demo_rsk_free_tier_2024",
  } as unknown as Env;
}

function mockKV(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => {
      m.set(k, v);
    },
  } as unknown as KVNamespace;
}

function chargeEvent(opts: { apiKey?: string; plan?: string; id?: number }): string {
  return JSON.stringify({
    event: "charge.success",
    data: {
      id: opts.id ?? 4_721_234,
      status: "success",
      customer: { email: "buyer@example.com" },
      metadata: {
        ...(opts.apiKey ? { api_key: opts.apiKey } : {}),
        ...(opts.plan ? { plan: opts.plan } : {}),
        email: "buyer@example.com",
      },
    },
  });
}

function sign(payload: string, secret: string = SECRET): string {
  return createHmac("sha512", secret).update(payload).digest("hex");
}

async function storedKey(env: Env, key: string): Promise<ApiKeyData> {
  const raw = await env.API_KEYS.get(key);
  return JSON.parse(raw ?? "{}") as ApiKeyData;
}

test("accepts a valid sha512 signature", async () => {
  const payload = chargeEvent({ apiKey: "rsk_x" });
  assert.equal(await verifyPaystackSignature(payload, sign(payload), SECRET), true);
});

test("rejects wrong secret / tampered payload / bad hex", async () => {
  const payload = chargeEvent({ apiKey: "rsk_x" });
  assert.equal(await verifyPaystackSignature(payload, sign(payload, "other"), SECRET), false);
  const tampered = payload.replace("rsk_x", "rsk_evil");
  assert.equal(await verifyPaystackSignature(tampered, sign(payload), SECRET), false);
  assert.equal(await verifyPaystackSignature(payload, "nothex", SECRET), false);
});

test("charge.success upgrades pro + resets counter", async () => {
  const env = mockEnv();
  const payload = chargeEvent({ apiKey: "rsk_p", plan: "pro" });
  const res = await handleWebhookEvent(env, payload, sign(payload));
  assert.deepEqual(res, { handled: true, type: "charge.success" });
  const key = await storedKey(env, "rsk_p");
  assert.equal(key.tier, "pro");
  assert.equal(key.limit, 10_000);
  assert.equal(key.subscriptionId, "4721234");
});

test("charge.success honors starter and unlimited plans", async () => {
  const envS = mockEnv();
  await handleWebhookEvent(envS, chargeEvent({ apiKey: "rsk_s", plan: "starter" }), sign(chargeEvent({ apiKey: "rsk_s", plan: "starter" })));
  const s = await storedKey(envS, "rsk_s");
  assert.equal(s.tier, "starter");
  assert.equal(s.limit, 2_000);

  const envU = mockEnv();
  await handleWebhookEvent(envU, chargeEvent({ apiKey: "rsk_u", plan: "unlimited" }), sign(chargeEvent({ apiKey: "rsk_u", plan: "unlimited" })));
  const u = await storedKey(envU, "rsk_u");
  assert.equal(u.tier, "unlimited");
  assert.equal(u.limit, 1_000_000);
});

test("charge.success without metadata is acked, ignored", async () => {
  const env = mockEnv();
  const payload = JSON.stringify({ event: "charge.success", data: { id: 1, status: "success" } });
  const res = await handleWebhookEvent(env, payload, sign(payload));
  assert.equal(res.handled, true);
});

test("unknown events are not-handled (cancellations manual in v1)", async () => {
  const env = mockEnv();
  const payload = JSON.stringify({ event: "subscription.not_renewed", data: {} });
  const res = await handleWebhookEvent(env, payload, sign(payload));
  assert.deepEqual(res, { handled: false, type: "subscription.not_renewed" });
});

test("bad signature makes handleWebhookEvent throw", async () => {
  const env = mockEnv();
  await assert.rejects(
    () => handleWebhookEvent(env, chargeEvent({ apiKey: "rsk_x" }), "0".repeat(128)),
    /signature/i,
  );
});

test("KES prices are sane", () => {
  assert.equal(PS_PRICES_KES.starter, 1_200);
  assert.equal(PS_PRICES_KES.pro, 2_500);
  assert.equal(PS_PRICES_KES.unlimited, 6_500);
});
