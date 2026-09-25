/**
 * GET /pay          — USDC payment desk (human page + ?format=json for agents)
 * POST /crypto/claim — { txHash, apiKey?, email? } → verify on-chain → upgrade
 * Dormant until BASE_USDC_ADDRESS is configured (see /services/usdc.ts).
 */
import { Hono } from "hono";
import type { HonoEnv, ErrorResponse } from "../types.js";
import { claimUsdcPayment, usdcConfigured, USDC_PRICE } from "../services/usdc.js";

export const cryptoRouter = new Hono<HonoEnv>();

cryptoRouter.post("/crypto/claim", async (c) => {
  let body: { txHash?: string; apiKey?: string; email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      400,
    );
  }
  if (!body.txHash) {
    return c.json<ErrorResponse>(
      { success: false, error: { code: "MISSING_TXHASH", message: "'txHash' is required (Base mainnet transaction hash)." } },
      400,
    );
  }

  const result = await claimUsdcPayment(c.env, body.txHash, { apiKey: body.apiKey, email: body.email });
  if (!result.ok) {
    const status =
      result.code === "NOT_CONFIGURED" ? 503 :
      result.code === "ALREADY_CLAIMED" ? 409 :
      result.code === "TX_NOT_FOUND" ? 404 : 400;
    return c.json<ErrorResponse>(
      { success: false, error: { code: result.code, message: result.message } },
      status,
    );
  }
  return c.json({
    success: true,
    apiKey: result.apiKey,
    tier: result.tier,
    limit: result.limit,
    expiresAt: result.expiresAt,
    message: `Payment verified on-chain — ${result.tier} tier active until ${result.expiresAt.slice(0, 10)}. Your API key: ${result.apiKey}`,
  });
});

const PAGE_HEAD = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Pay in USDC — RagScrape</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🤖</text></svg>">
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1220;color:#e5e7eb;margin:0;padding:40px 20px}main{max-width:560px;margin:0 auto}h1{font-size:22px}p,li{color:#9ca3af;font-size:14px;line-height:1.7}.box{display:flex;gap:8px;margin:14px 0}input{flex:1;padding:12px 14px;border-radius:10px;border:1px solid #374151;background:#111827;color:#fff;font-size:14px;font-family:monospace}button{padding:12px 18px;border-radius:10px;border:0;background:#6366f1;color:#fff;font-weight:600;cursor:pointer}button:hover{background:#818cf8}.amt{display:inline-block;background:#111827;border:1px solid #1f2937;border-radius:10px;padding:10px 14px;margin:4px;font-size:14px}b{color:#fff}</style>
</head><body><main>`;

cryptoRouter.get("/pay", (c) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");

  if (!usdcConfigured(c.env)) {
    if (c.req.query("format") === "json") {
      return c.json({ success: false, error: { code: "NOT_CONFIGURED", message: "USDC rail not active yet." } }, 503);
    }
    return c.html(
      `${PAGE_HEAD}<h1>🤖 USDC payments</h1><p>The crypto rail is not active on this deployment yet. Meanwhile: <a href="/redeem" style="color:#818cf8">redeem a license</a> or <a href="/" style="color:#818cf8">start on the free tier</a>.</p></main></body></html>`,
      503,
    );
  }

  const address = c.env.BASE_USDC_ADDRESS.trim();
  if (c.req.query("format") === "json") {
    return c.json({
      success: true,
      chain: "base",
      token: "USDC",
      address,
      amounts_usdc: USDC_PRICE,
      period_days: 31,
      claim: { method: "POST", path: "/crypto/claim", body: { txHash: "<your transaction hash>" } },
    });
  }
  return c.html(`${PAGE_HEAD}
<h1>🤖 Pay in USDC (Base)</h1>
<p>Send <b>USDC on Base</b> to the address below, then claim your upgrade — instantly, no account, no card.</p>
<div class="box"><input id="a" readonly value="${address}"><button onclick="navigator.clipboard.writeText(document.getElementById('a').value);this.textContent='Copied ✓'">Copy</button></div>
<p>Amounts (each = 31 days):</p>
<span class="amt"><b>${USDC_PRICE.founding} USDC</b> — Founding (Pro limits)</span>
<span class="amt"><b>${USDC_PRICE.pro} USDC</b> — Pro</span>
<span class="amt"><b>${USDC_PRICE.unlimited} USDC</b> — Unlimited</span>
<p style="margin-top:16px">After the transfer confirms (<b>Base network only</b>), go to <a href="/redeem" style="color:#818cf8">the claim desk</a> pattern: agents <code>POST /crypto/claim {"txHash":"0x…"}</code>. Renew by sending again and claiming the new hash.</p>
</main></body></html>`);
});
