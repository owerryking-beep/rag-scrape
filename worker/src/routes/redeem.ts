import { Hono } from "hono";
import type { HonoEnv, ErrorResponse } from "../types.js";
import { redeemLicense } from "../services/gumroad.js";
import { redeemPolarLicense } from "../services/polar.js";

export const redeemRouter = new Hono<HonoEnv>();

/**
 * POST /redeem — activate a Gumroad or Polar license against an API key.
 * Body: { licenseKey: string, apiKey?: string, email?: string }
 * No bearer auth: the license key itself is the credential.
 */
redeemRouter.post("/redeem", async (c) => {
  let body: { licenseKey?: string; apiKey?: string; email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      400,
    );
  }

  const licenseKey = (body.licenseKey ?? "").trim();
  if (!licenseKey || licenseKey.length > 128) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "MISSING_LICENSE", message: "'licenseKey' is required." } },
      400,
    );
  }
  if (body.apiKey !== undefined && (typeof body.apiKey !== "string" || body.apiKey.length > 128)) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_API_KEY", message: "'apiKey' must be a string." } },
      400,
    );
  }

  try {
    let result = await redeemLicense(c.env, licenseKey, {
      apiKey: body.apiKey,
      email: body.email,
    });
    if (!result.ok) {
      // Gumroad missed (or unconfigured) — try the Polar rail. A definitive
      // REVOKED verdict from either provider wins over the other's miss.
      const polar = await redeemPolarLicense(c.env, licenseKey, {
        apiKey: body.apiKey,
        email: body.email,
      });
      if (polar.ok) result = polar;
      else if (polar.code === "LICENSE_REVOKED") result = polar;
      else if (result.code === "NOT_CONFIGURED") result = polar;
    }
    if (!result.ok) {
      const status = result.code === "NOT_CONFIGURED" ? 503 : result.code === "LICENSE_REVOKED" ? 403 : 400;
      return c.json<ErrorResponse>(
        { success: false, error: { code: result.code, message: result.message } },
        status,
      );
    }
    return c.json(
      {
        success: true,
        apiKey: result.apiKey,
        tier: result.tier,
        limit: result.limit,
        email: result.email,
        created: result.created,
        message:
          `License activated — ${result.tier} tier (${result.limit.toLocaleString("en-US")} reqs/mo). ` +
          `Your API key: ${result.apiKey}`,
      },
      200,
    );
  } catch (err) {
    console.error("redeem error:", err);
    return c.json<ErrorResponse>(
      { success: false, error: { code: "REDEEM_ERROR", message: "License activation failed. Please retry." } },
      500,
    );
  }
});
