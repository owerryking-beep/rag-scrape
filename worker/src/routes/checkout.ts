import { Hono } from "hono";
import type {
  HonoEnv,
  CheckoutRequest,
  CheckoutResponse,
  ErrorResponse,
} from "../types.js";
import { createCheckoutSession as lsCreateCheckout } from "../services/lemonsqueezy.js";
import { createCheckoutSession as psCreateCheckout } from "../services/paystack.js";
import { usdcConfigured, USDC_PRICE } from "../services/usdc.js";

export const checkoutRouter = new Hono<HonoEnv>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

checkoutRouter.post("/create-checkout", async (c) => {
  let body: CheckoutRequest;
  try {
    body = (await c.req.json()) as CheckoutRequest;
  } catch {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON with an 'email' field.",
        },
      },
      400,
    );
  }

  if (!body.email || typeof body.email !== "string") {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "MISSING_EMAIL", message: "'email' is required." } },
      400,
    );
  }

  if (body.email.length > 254 || !EMAIL_RE.test(body.email)) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: { code: "INVALID_EMAIL", message: "Provide a valid email address." },
      },
      400,
    );
  }

  if (
    body.apiKey !== undefined &&
    (typeof body.apiKey !== "string" || body.apiKey.length > 128)
  ) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_API_KEY", message: "'apiKey' must be a string." } },
      400,
    );
  }

  if (
    body.plan !== undefined &&
    body.plan !== "starter" &&
    body.plan !== "pro" &&
    body.plan !== "unlimited" &&
    body.plan !== "founding"
  ) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: { code: "INVALID_PLAN", message: "'plan' must be \"starter\", \"pro\" or \"unlimited\"." },
      },
      400,
    );
  }

  try {
    const plan = body.plan ?? "pro";
    // Machine-readable payment options: autonomous agents pick crypto (no
    // human needed); humans pick the hosted checkout. checkoutUrl stays for
    // backwards compatibility with existing integrations.
    const options: CheckoutResponse["options"] = [];
    if (usdcConfigured(c.env)) {
      options.push({
        type: "crypto_usdc",
        chain: "base",
        token: "USDC",
        address: c.env.BASE_USDC_ADDRESS.trim(),
        amount_usdc: USDC_PRICE[plan as "founding" | "pro" | "unlimited"] ?? USDC_PRICE.pro,
        days: 31,
        claim: { method: "POST", path: "/crypto/claim", body: { txHash: "<transaction hash>", apiKey: body.apiKey ?? "<optional>" } },
      });
    }
    const provider = (c.env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
    const checkoutUrl =
      provider === "paystack"
        ? await psCreateCheckout(c.env, body.email, body.apiKey, plan)
        : await lsCreateCheckout(c.env, body.email, body.apiKey, plan);
    options.push({ type: "hosted_checkout", provider, url: checkoutUrl });
    return c.json<CheckoutResponse>({ success: true, checkoutUrl, options }, 200);
  } catch (err) {
    console.error("checkout error:", err);
    return c.json<ErrorResponse>(
      {
        success: false,
        error: {
          code: "CHECKOUT_ERROR",
          message: "Failed to create checkout session. Please retry.",
        },
      },
      500,
    );
  }
});
