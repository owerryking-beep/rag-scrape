import { Hono } from "hono";
import type { HonoEnv, ErrorResponse } from "../types.js";
import { DAY_SECONDS } from "../types.js";

export const waitlistRouter = new Hono<HonoEnv>();

const PREFIX = "wait:";
const CAP = 25;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Add an email to the founding-member waitlist (exported for tests). */
export async function addWaitlistEntry(
  env: { API_KEYS: KVNamespace },
  emailRaw: string,
): Promise<{ ok: boolean; already?: boolean; position?: number; remaining?: number; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, error: "A valid email is required." };
  }
  const key = `${PREFIX}${email}`;
  const existing = await env.API_KEYS.get(key);
  if (existing) {
    const prev = JSON.parse(existing) as { position: number };
    return { ok: true, already: true, position: prev.position };
  }
  const list = await env.API_KEYS.list({ prefix: PREFIX });
  const position = list.keys.length + 1;
  await env.API_KEYS.put(
    key,
    JSON.stringify({ email, position, joinedAt: new Date().toISOString() }),
    { expirationTtl: DAY_SECONDS * 365 },
  );
  return { ok: true, position, remaining: Math.max(0, CAP - position) };
}

waitlistRouter.post("/waitlist", async (c) => {
  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      400,
    );
  }
  const result = await addWaitlistEntry(c.env, body.email ?? "");
  if (!result.ok) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_EMAIL", message: result.error ?? "Invalid email." } },
      400,
    );
  }
  return c.json(
    {
      success: true,
      already: result.already ?? false,
      position: result.position,
      remaining: result.remaining,
      message: result.already
        ? `You're already on the list (spot #${result.position}).`
        : `You're founding member #${result.position}. Founding checkout arrives by email when payments open.`,
    },
    200,
  );
});

waitlistRouter.get("/waitlist", async (c) => {
  const list = await c.env.API_KEYS.list({ prefix: PREFIX });
  const count = list.keys.length;
  return c.json({ success: true, count, cap: CAP, remaining: Math.max(0, CAP - count) });
});
