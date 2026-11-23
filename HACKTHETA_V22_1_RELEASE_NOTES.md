# HackTheta v22.1 — Razorpay UI and webhook setup package

This package builds on v22. The project already includes the Billing & subscription page and server-side Razorpay subscription endpoints; this release makes the account-specific Test Mode setup explicit and adds a standalone webhook runbook.

## Included billing experience
- Billing & subscription page at `/billing` (also linked from More).
- ₹30/month HackTheta Premium plan display.
- Eligible new-account seven-day trial display and subscription authorisation flow.
- Razorpay Checkout integration and server-side signature verification.
- Billing status, payment history, refresh and cancellation controls.
- Signed webhook receiver at `/api/razorpay-webhook`, raw-body HMAC validation, event de-duplication and subscription reconciliation.
- Supabase migration `supabase-billing-v2.sql`.

## Current Test Mode plan
`plan_U3akXCdH3TGXun`

## Important
The Test Mode API keys and webhook secret remain in Vercel environment variables and are not included in this ZIP. The webhook must be configured in Razorpay after the updated project has been deployed. No real Razorpay account operation, mandate authorisation, webhook delivery or charge has been executed from this environment.

See `HACKTHETA_BRANDING_AND_BILLING_SETUP.md` and `RAZORPAY_WEBHOOK_SETUP_HACKTHETA.md` for the step-by-step deployment and configuration procedure.
