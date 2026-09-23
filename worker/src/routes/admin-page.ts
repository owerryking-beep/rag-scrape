/**
 * GET /founding-admin — owner-only mini console (noindex). Enter the admin
 * key, the buyer's M-Pesa confirmation code, optionally their email, click
 * once: their API key upgrades on the spot. Nothing else on this page.
 */
import { Hono } from "hono";
import type { HonoEnv } from "../types.js";

export const adminPageRouter = new Hono<HonoEnv>();

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Founding desk — RagScrape</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏁</text></svg>">
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1220;color:#e5e7eb;margin:0;padding:40px 20px}main{max-width:520px;margin:0 auto}h1{font-size:22px}p{color:#9ca3af;font-size:14px;line-height:1.6}input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #374151;background:#111827;color:#fff;font-size:15px;margin-bottom:10px;outline:none}input:focus{border-color:#6366f1}button{width:100%;padding:13px;border-radius:10px;border:0;background:#6366f1;color:#fff;font-weight:600;font-size:15px;cursor:pointer}button:hover{background:#818cf8}button:disabled{opacity:.6}pre{background:#111827;border:1px solid #1f2937;border-radius:10px;padding:14px;font-size:13px;white-space:pre-wrap;word-break:break-word;margin-top:14px;display:none}.ok{color:#86efac}.bad{color:#fca5a5}label{display:block;font-size:12px;color:#9ca3af;margin:10px 0 4px}</style>
</head><body><main>
<h1>🏁 Founding desk</h1>
<p>Buyer paid to your M-Pesa → type their confirmation code here → their key upgrades instantly. Codes can only be used once.</p>
<label>Admin key</label><input id="k" type="password" placeholder="ADMIN_KEY">
<label>Buyer's M-Pesa confirmation code</label><input id="c" type="text" placeholder="QGH7XYZ123">
<label>Buyer email (optional, for records)</label><input id="e" type="email" placeholder="buyer@example.com">
<label>Existing rsk_ key (optional — leave empty to create one)</label><input id="a" type="text" placeholder="rsk_…">
<button id="go" type="button">Activate founding member</button>
<pre id="o"></pre>
<script>
document.getElementById('go').onclick=async function(){
  var b=this,o=document.getElementById('o');
  b.disabled=true;b.textContent='Working…';
  try{
    var r=await fetch('/admin/upgrade',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':document.getElementById('k').value.trim()},body:JSON.stringify({mpesaCode:document.getElementById('c').value.trim(),email:document.getElementById('e').value.trim()||undefined,apiKey:document.getElementById('a').value.trim()||undefined})});
    var d=await r.json();
    o.style.display='block';o.className=d.success?'ok':'bad';
    o.textContent=d.success?d.message+'\\n\\nShare this key with the buyer: '+d.apiKey:(d.error.message);
  }catch(e){o.style.display='block';o.className='bad';o.textContent='Network error.'}
  b.disabled=false;b.textContent='Activate founding member';
};
</script></main></body></html>`;

adminPageRouter.get("/founding-admin", (c) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.html(PAGE);
});
