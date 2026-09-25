# Payment Provider Vetting Checklist (run BEFORE trusting any new gateway)

Score any candidate. 2+ failures = walk away, no exceptions.

1. [ ] Named legal entity, physical address, and financial regulator on the site
2. [ ] Domain older than 2 years (check whois / scam-detector.com)
3. [ ] Names WHO actually processes the cards (acquiring bank / sponsor)
4. [ ] Independent reviews exist (Reddit/Trustpilot with account age + variety —
       beware 5-10 same-week anonymous perfect reviews)
5. [ ] Eats its own cooking (a card processor must accept card payment for its own product)
6. [ ] Verifiable license: CBK register (Kenya) or checkable foreign license
7. [ ] No "impossible pitch": no-KYC + card acquiring + instant crypto settlement
       cannot all be true — card networks require a licensed entity somewhere

Known results (2026-09):
- PASS: Paystack, IntaSend, Dodo Payments, Gumroad, PayPal, Polar (+Stripe caveat)
- FAIL/BIN: nexapay.one (soft-scam: hidden owner, 10-mo domain, KYC-trap terms,
  fake Trustpilot, name-imitates legit Singapore NexaPay), Cryptomus (freeze reports)

CRYPTO DOOR BENCH (client pays crypto → we receive USDC; owner-only note)
- CoinRemitter: 0.23%, NO KYC, non-custodial auto-withdraw ~30min — top pick
- NOWPayments (crypto-only mode): email signup, 0.5-1%, 300+ coins — fiat mode = KYC
- BTCPay Server: 0% self-hosted — when domain+VPS budget exists
- x402/USDC: agent rail on Cloudflare — build when an agent asks / waitlist clears
RULES: USDC only · one-time/manual-renewal only (never founding subs) ·
door #6 (never default) · $20 test first · off-ramp to M-Pesa monthly (own timing)
CARD-IN→CRYPTO-OUT "no KYC" = scam sector (nexapay family; Cryptomus = freeze reports).
Card clients who want crypto: THEY convert on their side → send USDC to our address.

GUMROAD PAYOUT ROUTES (Kenya) — decided 2026-09
1. TRY FIRST: Direct deposit (Stripe Connect) — Kenya now listed in Gumroad's
   bank-payout expansion. Best rate (~97-98% of balance). Needs Stripe ID pass.
2. FALLBACK: PayPal → M-Pesa (Super App, 3% conv + ~2-4% receiving). Works regardless.
3. SETTLEMENT LAYER (upgrade): Grey (grey.co) — licensed MSB (FINTRAC Canada +
   FinCEN USA, verified 2026-09). NOT a checkout (no card acquiring, no
   subscriptions, no customer payments — can NEVER replace Paystack's charging
   role). Opens when: (a) crypto door goes live — Grey accepts USDC deposits →
   instant USD → market-FX KES off-ramp (kills the Binance-P2P problem), or
   (b) weekly balances >$50. KYC: ID + selfie, document-based, no Stripe.
NEVER: Gumroad→crypto (no such payout; don't bridge rails).
Notes: $10 min payout (first sale rolls a week — normal). Gumroad cut per $9
founding seat ≈ $1.96 → $7.04 balance before payout-route fees.

FLUTTERWAVE — evaluated 2026-09: PARKED (needs registered business)
- Real unicorn, scam-filter pass. M-Pesa 1.4% (best), 35-country pan-African rail.
- BLOCKER for us: Kenya merchant KYC requires Business Registration Cert +
  KRA PIN + company resolution letter → cannot onboard as individual.
- Caution: $55M frozen by Kenya ARA 2022-24 (cleared, funds returned; was
  operating without CBK license) — poster child for multi-rail architecture.
- TRIGGER to revisit: day we register a business name (eCitizen ~KES 1,000)
  AND get pan-African customer demand (NG/GH/FR-lafricaine).

SPECIES 4 — HIGH-RISK BROKERS: PaymentCloud, eMerchantBroker, CCBill (2026-09: BIN)
US-centric ISOs for businesses REJECTED by Stripe (adult/CBD/gambling). Demand
MORE KYC than Paystack (bank statements, SSN/EIN, 3-mo financials) + reserves +
fees (CCBill: $950/yr Visa + $500/yr MC + rolling reserve holds). Wrong species
for us: we are low-risk SaaS + Kenya individual, not a spicy US company.
FIELD GUIDE COMPLETE — four species exist: MoRs, local gateways, crypto doors,
high-risk brokers/scams. Bench has the best of species 1-3. Research phase DONE.

FINAL DECISION (2026-09): PAYSTACK = the only ACTIVE rail (user's call).
All other rails = dormant insurance code. No further user actions on Gumroad,
Dodo, USDC wallets, Polar, Grey unless user reopens. M-Pesa = KES payment
channel + optional KES settlement; never USD (domiciliary bank owns USD leg).
