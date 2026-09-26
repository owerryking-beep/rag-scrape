import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Env } from "../src/types.js";
import {
  applyNwPayment,
  canonicalize,
  hmacSha512Hex,
  verifyIpnSignature,
} from "../src/services/nowpayments.js";

class MemoryKV {
  private m = new Map<string, string>();
  async get(k: string): Promise<string | null> { return this.m.get(k) ?? null; }
  async put(k: string, v: string): Promise<void> { this.m.set(k, v); }
  async list(opts: { prefix: string }): Promise<{ keys: Array<{ name: string }> }> {
    return { keys: [...this.m.keys()].filter((k) => k.startsWith(opts.prefix)).map((name) => ({ name })) };
  }
}

const SECRET = "KJSJP5W-Y49MN24-JR8487R-0XAF8H8";
function mockEnv(): Env {
  return {
    API_KEYS: new MemoryKV() as unknown as Env["API_KEYS"],
    NW_API_KEY: "898e8053-d088-4e5a-a6df-be442a0a4f7d",
    NW_IPN_SECRET: SECRET,
  } as unknown as Env;
}

test("canonicalize sorts keys recursively like NOWPayments spec", () => {
  const obj = { b: 1, a: { d: [2, 1], c: "x" } };
  assert.equal(canonicalize(obj), '{"a":{"c":"x","d":[2,1]},"b":1}');
});

test("ipn signature verify accepts valid HMAC-SHA512 and rejects tampering", async () => {
  const env = mockEnv();
  const body = JSON.stringify({ payment_id: 55, payment_status: "finished" });
  const good = createHmac("sha512", SECRET).update(canonicalize(JSON.parse(body))).digest("hex");
  assert.equal(await verifyIpnSignature(env, body, good), true);
  assert.equal(await verifyIpnSignature(env, body, "deadbeef"), false);
  const tampered = JSON.stringify({ payment_id: 56, payment_status: "finished" });
  assert.equal(await verifyIpnSignature(env, tampered, good), false);
  assert.equal(await hmacSha512Hex(SECRET, "x"), createHmac("sha512", SECRET).update("x").digest("hex"));
});

test("applyNwPayment: finished payment with invoice intent upgrades key once", async () => {
  const env = mockEnv();
  await env.API_KEYS.put("ninv:INV1", JSON.stringify({ plan: "founding", apiKey: "", email: "human@x.io" }));
  globalThis.fetch = (async (_u: string, init?: { headers?: Record<string, string> }) => {
    assert.equal((init?.headers ?? {})["X-API-KEY"], "898e8053-d088-4e5a-a6df-be442a0a4f7d");
    return { json: async () => ({ payment_id: 55, payment_status: "finished", price_amount: 9, invoice_id: "INV1" }) };
  }) as unknown as typeof fetch;
  const res = await applyNwPayment(env, "55");
  assert.equal(res.handled, true);
  // replay blocked
  const again = await applyNwPayment(env, "55");
  assert.equal(again.handled, false);
});

test("applyNwPayment: unpaid or underpaid statuses never upgrade", async () => {
  const env = mockEnv();
  globalThis.fetch = (async () => ({ json: async () => ({ payment_id: 56, payment_status: "waiting", price_amount: 9 }) })) as unknown as typeof fetch;
  assert.equal((await applyNwPayment(env, "56")).handled, false);
  globalThis.fetch = (async () => ({ json: async () => ({ payment_id: 57, payment_status: "finished", price_amount: 3, invoice_id: "INV2" }) })) as unknown as typeof fetch;
  assert.equal((await applyNwPayment(env, "57")).handled, false);
});
