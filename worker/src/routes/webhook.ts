import { Hono } from "hono";
import type { HonoEnv, ErrorResponse, WebhookAck } from "../types.js";
import { handleWebhookEvent } from "../services/lemonsqueezy.js";

export const webhookRouter = new Hono<HonoEnv>();

webhookRouter.post("/webhook", async (c) => {
  const signature = c.req.header("X-Signature");

  if (!signature) {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: {
          code: "MISSING_SIGNATURE",
          message: "Missing X-Signature header.",
        },
      },
      400,
    );
  }

  let payload: string;
  try {
    payload = await c.req.text();
  } catch {
    return c.json<ErrorResponse>(
      {
        success: false,
        error: { code: "INVALID_PAYLOAD", message: "Could not read request body." },
      },
      400,
    );
  }

  try {
    const result = await handleWebhookEvent(c.env, payload, signature);
    return c.json<WebhookAck>(
      { received: true, type: result.type, handled: result.handled },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("webhook error:", msg);

    if (msg.includes("signature") || msg.includes("verification")) {
      return c.json<ErrorResponse>(
        {
          success: false,
          error: {
            code: "INVALID_SIGNATURE",
            message: "Webhook signature verification failed.",
          },
        },
        400,
      );
    }

    // 500 → Lemon Squeezy retries with backoff, so a transient KV blip self-heals.
    return c.json<ErrorResponse>(
      {
        success: false,
        error: {
          code: "WEBHOOK_ERROR",
          message: "Failed to process webhook event.",
        },
      },
      500,
    );
  }
});
