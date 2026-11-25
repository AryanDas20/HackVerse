# HackTheta PayU Billing + AI Pitch Arena Release

- Replaced active Razorpay checkout, signature verification and webhook handling with PayU India Hosted Checkout and Standing Instructions consent.
- Added server-side SHA-512 consent hashing and reverse-response validation, plus independent PayU `verify_payment` checks before changing subscription state.
- Added secure PayU callback handling and daily recurring charge processing with mandate-status checks, required Cards/UPI pre-debit workflow, idempotent cycle attempts, and cancellation/revocation.
- Preserved the existing seven-day trial trigger, ₹30/month plan, Supabase project, Firebase settings, Agent37 integration, community and opportunity features, and AI Pitch Arena.
- Added the additive migration `supabase-payu-billing-v3.sql`; old Razorpay columns/payment rows remain for historical continuity only.
- Added `.env.example` and `PAYU_SETUP.md` with empty placeholders and account setup steps.

## Verification boundaries

Local source/test validation is performed in this package. PayU test/live transactions, merchant onboarding, Standing Instructions activation, production cancellation, the deployed Vercel Cron and the deployed function count must be verified using the owner's PayU/Vercel/Supabase accounts. Do not enable production mode before PayU confirms merchant eligibility and SI activation.

## Hosting policy note

The source-level function count is 12, but Vercel's Hobby plan is limited to personal/non-commercial use. Since HackTheta includes a paid ₹30/month subscription, confirm permitted use with Vercel or use a plan that supports the project's commercial operation. Function-count compliance does not override plan terms.
