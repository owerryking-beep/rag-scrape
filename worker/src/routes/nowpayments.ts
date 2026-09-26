/**
 * POST /crypto-checkout  — create a hosted crypto invoice ({plan, email?, apiKey?})
 * POST /nowpayments/ipn — NOWPayments webhook (HMAC-verified + API re-verified)
 */
import { Hono } from "hono";
import type { HonoEnv, ErrorResponse } from "../types.js";
import {
  applyNwPayment,
  createInvoice,
  nowpaymentsConfigured,
  verifyIpnSignature,
  type NwPlan,
} from "../services/nowpayments.js";

export const nowpaymentsRouter = new Hono<HonoEnv>();

nowpaymentsRouter.post("/crypto-checkout", async (c) => {
  let body: { plan?: string; email?: string; apiKey?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>({ success: false, error: { code: "INVALID_JSON", message: "Valid JSON required." } }, 400);
  }
  const plan = (body.plan ?? "founding") as NwPlan;
  if (!["founding", "starter", "pro", "unlimited"].includes(plan)) {
    return c.json<ErrorResponse>({ success: false, error: { code: "INVALID_PLAN", message: "'plan' must be founding|starter|pro|unlimited." } }, 400);
  }
  const result = await createInvoice(c.env, plan, { apiKey: body.apiKey, email: body.email });
  if (!result.ok) {
    return c.json<ErrorResponse>({ success: false, error: { code: "NOT_CONFIGURED", message: result.message } }, 503);
  }
  return c.json({ success: true, invoiceId: result.invoiceId, invoiceUrl: result.invoiceUrl, plan, message: `Send any supported coin — page: ${result.invoiceUrl}` });
});

nowpaymentsRouter.post("/nowpayments/ipn", async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header("x-nowpayments-sig") ?? "";
  let paymentId = "";
  try {
    const parsed = JSON.parse(raw) as { payment_id?: number | string };
    paymentId = String(parsed.payment_id ?? "");
  } catch {
    /* handled below */
  }
  // Defense in depth: signature check first, then authoritative API re-check
  // inside applyNwPayment (webhook payloads are never trusted for money math).
  const sigOk = paymentId ? await verifyIpnSignature(c.env, raw, sig).catch(() => false) : false;
  if (!paymentId || !sigOk) {
    return c.json<ErrorResponse>({ success: false, error: { code: "BAD_SIGNATURE", message: "Invalid or missing x-nowpayments-sig." } }, 403);
  }
  const result = await applyNwPayment(c.env, paymentId);
  // Always 200 for recognized events so NOWPayments stops retrying.
  return c.json({ success: true, handled: result.handled, message: result.message });
});
