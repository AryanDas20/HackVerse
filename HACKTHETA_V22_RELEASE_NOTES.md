# HackTheta v22 — Display branding + Razorpay subscription foundation

## Display branding
Visible website branding and product copy are now HackTheta. The existing HackVerse project identity and connected service configuration remain unchanged.

## Billing
- Added the Billing & subscription page.
- Plan: ₹30 INR per month.
- Trial: one-time 7 days for newly registered accounts after the SQL migration is installed.
- Razorpay Checkout subscription creation with a scheduled future start date while a trial is active.
- Server-side Checkout signature verification and subscription reconciliation.
- Razorpay webhook raw-body HMAC verification and event idempotency.
- Billing history, cancellation-at-cycle-end endpoint and entitlement display.
- Agent37 API enforces trial/subscription entitlement for AI features.
- Career Match route is gated by verified entitlement.

## Required owner setup
Run `supabase-billing-v2.sql`, create a Razorpay monthly ₹30 Test Mode Plan, configure the Razorpay/Vercel server-side environment variables, configure the webhook, deploy and complete Test Mode verification. See `HACKTHETA_BRANDING_AND_BILLING_SETUP.md`.

## Notes
This is an integration-ready release, not proof of live payment processing. No Razorpay account keys were supplied, so live payment, real mandate authorisation, webhook delivery and cancellation have not been tested here. The recurring subscription uses 120 billing cycles because the Razorpay subscription API requires a bounded cycle count or end date.
