import { Hono } from "hono";
import type {
  HonoEnv,
  CheckoutRequest,
  CheckoutResponse,
  ErrorResponse,
} from "../types.js";
import { createCheckoutSession } from "../services/stripe.js";

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

  try {
    const checkoutUrl = await createCheckoutSession(c.env, body.email, body.apiKey);
    return c.json<CheckoutResponse>({ success: true, checkoutUrl }, 200);
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
