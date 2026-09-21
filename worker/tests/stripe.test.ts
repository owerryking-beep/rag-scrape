import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "../src/services/stripe.js";

const SECRET = "whsec_test_secret_123";

function makeHeader(
  payload: string,
  secret: string = SECRET,
  ts: number = Math.floor(Date.now() / 1000),
): string {
  const sig = createHmac("sha256", secret)
    .update(`${ts}.${payload}`)
    .digest("hex");
  return `t=${ts},v1=${sig}`;
}

const PAYLOAD = JSON.stringify({
  id: "evt_123",
  type: "checkout.session.completed",
  data: { object: { metadata: { api_key: "rsk_test" } } },
});

test("accepts a valid signature", async () => {
  assert.equal(
    await verifyStripeSignature(PAYLOAD, makeHeader(PAYLOAD), SECRET),
    true,
  );
});

test("rejects a signature from the wrong secret", async () => {
  assert.equal(
    await verifyStripeSignature(PAYLOAD, makeHeader(PAYLOAD, "whsec_other"), SECRET),
    false,
  );
});

test("rejects a tampered payload", async () => {
  const header = makeHeader(PAYLOAD);
  const tampered = PAYLOAD.replace("rsk_test", "rsk_evil");
  assert.equal(await verifyStripeSignature(tampered, header, SECRET), false);
});

test("rejects stale timestamps (replay protection)", async () => {
  const stale = Math.floor(Date.now() / 1000) - 400; // > 5 min old
  assert.equal(
    await verifyStripeSignature(PAYLOAD, makeHeader(PAYLOAD, SECRET, stale), SECRET),
    false,
  );
});

test("accepts signatures slightly in the past (clock skew)", async () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  assert.equal(
    await verifyStripeSignature(PAYLOAD, makeHeader(PAYLOAD, SECRET, past), SECRET),
    true,
  );
});

test("rejects malformed headers", async () => {
  assert.equal(await verifyStripeSignature(PAYLOAD, "", SECRET), false);
  assert.equal(await verifyStripeSignature(PAYLOAD, "t=123", SECRET), false);
  assert.equal(
    await verifyStripeSignature(PAYLOAD, "t=notanumber,v1=abc", SECRET),
    false,
  );
});
