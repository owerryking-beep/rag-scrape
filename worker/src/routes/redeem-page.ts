/**
 * GET /redeem — customer-facing license redemption desk.
 * A buyer pastes the license key Gumroad (or Polar/Dodo later) emailed them,
 * optionally their existing rsk_ key, and gets their upgraded API key on
 * screen. Pure static page; talks to POST /redeem (the existing endpoint).
 */
import { Hono } from "hono";
import type { HonoEnv } from "../types.js";

export const redeemPageRouter = new Hono<HonoEnv>();

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Redeem your license — RagScrape</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔑</text></svg>">
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1220;color:#e5e7eb;margin:0;padding:40px 20px}main{max-width:520px;margin:0 auto}h1{font-size:22px}p{color:#9ca3af;font-size:14px;line-height:1.6}input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #374151;background:#111827;color:#fff;font-size:15px;margin-bottom:10px;outline:none;box-sizing:border-box}input:focus{border-color:#6366f1}button{width:100%;padding:13px;border-radius:10px;border:0;background:#6366f1;color:#fff;font-weight:600;font-size:15px;cursor:pointer}button:hover{background:#818cf8}button:disabled{opacity:.6}pre{background:#111827;border:1px solid #1f2937;border-radius:10px;padding:14px;font-size:13px;white-space:pre-wrap;word-break:break-word;margin-top:14px;display:none}.ok{color:#86efac}.bad{color:#fca5a5}label{display:block;font-size:12px;color:#9ca3af;margin:10px 0 4px}</style>
</head><body><main>
<h1>🔑 Redeem your RagScrape license</h1>
<p>Paste the license key from your purchase email. We'll upgrade (or create) your API key instantly. This is the only step — no account, no waiting.</p>
<label>License key *</label><input id="k" type="text" placeholder="e.g. 7C4A8D9C-2F1B-4E3A-9D5E-…">
<label>Existing rsk_ API key (optional — leave empty and we'll create one)</label><input id="a" type="text" placeholder="rsk_…">
<label>Email (optional, for your records)</label><input id="e" type="email" placeholder="you@example.com">
<button id="go" type="button">Activate my subscription</button>
<pre id="o"></pre>
<p style="margin-top:18px;font-size:12px">No license yet? <a href="/" style="color:#818cf8">Start on the free tier →</a></p>
<script>
document.getElementById('go').onclick=async function(){
  var b=this,o=document.getElementById('o');
  if(!document.getElementById('k').value.trim()){o.style.display='block';o.className='bad';o.textContent='Please paste your license key.';return;}
  b.disabled=true;b.textContent='Verifying with the payment provider…';
  try{
    var r=await fetch('/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({licenseKey:document.getElementById('k').value.trim(),apiKey:document.getElementById('a').value.trim()||undefined,email:document.getElementById('e').value.trim()||undefined})});
    var d=await r.json();
    o.style.display='block';o.className=d.success?'ok':'bad';
    o.textContent=d.success?d.message+'\\n\\nBookmark this key — it is your subscription.':('✗ '+(d.error?d.error.message:'Something went wrong.'));
  }catch(e){o.style.display='block';o.className='bad';o.textContent='Network error — please retry.'}
  b.disabled=false;b.textContent='Activate my subscription';
};
</script></main></body></html>`;

redeemPageRouter.get("/redeem", (c) => {
  c.header("Cache-Control", "public, max-width=3600");
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.html(PAGE);
});
