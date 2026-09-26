# 🏁 GO-LIVE — FINAL SETUP (decided 2026-09: PAYSTACK IS THE ONLY ACTIVE RAIL)

Strategy locked: Paystack only (Gumroad/Dodo/USDC/Polar stay dormant code, never
to be activated unless user asks; kept as freeze-insurance). Dual currency:
KES M-Pesa peg (1,200/2,500/6,500) + TRUE USD cards ($9/$19/$49, 3.8%).

MPESA TRUTHS (verified): KES-only wallet, cannot hold USD. GlobalPay Visa card
= spend outward only (3.5% FX, KES150k/txn cap, cannot RECEIVE). USD settlement
requires a bank domiciliary account; KES settlement may target M-Pesa wallet.
Use GlobalPay for paying own USD tools (domains, AI subs).

PHASE 1 — YOU: USD domiciliary account at your bank (does not block KES launch).
PHASE 2 — YOU: Paystack dashboard: Live toggle ON · paste sk_live to agent ·
  Webhook URL = https://rag-scrape-api.owerryking.workers.dev/webhook ·
  enable international payments · settlement targets (KES: bank/M-Pesa, USD: domiciliary).
PHASE 3 — AGENT: create 4 KES plans + 4 USD plans via API → update wrangler.toml
  plan codes → wrangler secret put PAYSTACK_SECRET_KEY → deploy → verify $9 + KES checkouts.
PHASE 4 — SELF-TEST: buy Founding via M-Pesa KES 1,200 → key auto-upgrades →
  verify webhook → refund in dashboard. DEFINITION OF DONE.
PHASE 5 — SHIP: revoke GitHub PAT (trigger reached) · fix RagBot (Make.com
  History) · launch posts (Show HN Tue-Thu, Reddit 1/day — CONTENT-ARSENAL.md).

Code already committed & waiting for this deploy:
- banner dual buttons (Pay with M-Pesa / Pay by card $9) · 4ca8e9f
- dual-currency Paystack (PS_PLAN_*_USD env placeholders; currency param) · 81d9a12
- agent-rail + 402 upsell + docs · 8b341c9 (77/77 tests)

STATUS UPDATE (go-live day):
✅ LIVE KES plans created + wired: founding PLN_48ae4nv4jwvomet · starter
   PLN_9hdfrzgc5c483c2 · pro PLN_hiyp0mhcjrh9ba1 · unlimited PLN_ou8si4ta7ftl5ob
✅ sk_live installed as PAYSTACK_SECRET_KEY · deploys 99e5817c/117d61e
✅ Live checkout verified (checkout.paystack.com, live mode)
⏸️ USD: Paystack rejected plan creation ("USD not a supported currency") —
   needs intl enabled + domiciliary a/c, THEN: create 4 USD plans + un-hide
   banner card button (marker comment sits in landing/index.html).
⏳ USER: webhook URL paste · KES 1,200 self-test → refund · revoke GitHub PAT ·
   RagBot Make.com check.


CRYPTO RAILS STATUS (agent-rail day):
✅ AGENT RAIL LIVE: BASE_USDC_ADDRESS=0xec0fc774487b1be98f42cf556322946982bdf131
   (Base). /pay + /crypto/claim verified against real Base RPC. Zero platform, 0%.
🟡 CoinRemitter (hosted page for humans): API key JENKDZG-… VALID format; API
   PASSWORD still missing (the UUID user sent = NOT the password). User must
   paste wallet API password → then build /v1 invoice+IPN (api.coinremitter.com/v1,
   headers x-api-key + x-api-password).
🟡 NOWPayments: IPN secret installed; real API key STILL missing (UUID was
   CoinRemitter's). Optional — CoinRemitter covers hosted-page role.


═══════════════════════════════════════════════════
🏆 PAYMENT INFRASTRUCTURE: COMPLETE (2026-09-26, ~14:00 EAT)
═══════════════════════════════════════════════════
✅ Agent USDC rail: LIVE, self-tested ($9 real, on-chain verified)
✅ NOWPayments hosted: LIVE, self-tested end-to-end (invoice → payment →
   signed IPN → key upgrade). API key DBCZGHH-… (invoice-creation works
   despite account IP whitelist; signed-IPN fallback covers the rest)
✅ Payout wallet 0xec0f…df131 (Base) confirmed · USDC/USDT coins enabled
✅ Paystack KES: live + idle (webhook paste + KES self-test optional, pending)
→ ERA OVER. Remaining work is DISTRIBUTION ONLY:
   1. RagBot fix (Make.com → History — the only broken machine left)
   2. GitHub PAT revoke (all pushed through 3dc85c7)
   3. Launch posts: Reddit/Quora this weekend · Show HN Tue Sep 30 13:00-16:00 EAT
   4. First stranger pays → domain purchase trigger (~$50 rule)
