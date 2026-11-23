# HackTheta v22.2 — Vercel Hobby function consolidation

This release keeps the existing HackTheta site and billing experience, while reducing the API route count to fit Vercel Hobby's 12-function deployment limit.

## Changes

- Consolidated the four billing operations into `api/billing/[action].js`.
- Preserved the current public API paths:
  - `/api/billing/create-subscription`
  - `/api/billing/verify-subscription`
  - `/api/billing/status`
  - `/api/billing/cancel-subscription`
- Moved the shared billing, social and profile-directory helpers from `api/lib/` to the repository-level `lib/` directory.
- Moved API tests from `api/test/` to `tests/` so they are not deployed as API routes.
- Updated all affected imports and the npm test/check scripts.
- Added `scripts/count-vercel-functions.mjs`; `npm run check` now validates JavaScript syntax and counts API function candidates.

## Function inventory

The source tree contains 11 deployable API route candidates:

1. `api/addDiscoverySource.js`
2. `api/agent37/chat.js`
3. `api/billing/[action].js`
4. `api/chat-media.js`
5. `api/community-media.js`
6. `api/profile-avatar.js`
7. `api/profile-directory-reconcile.js`
8. `api/razorpay-webhook.js`
9. `api/runDiscoveryNow.js`
10. `api/setDiscoverySourceEnabled.js`
11. `api/social-v13.js`

`api/_discovery-admin.js` remains in place as a shared helper. Vercel excludes underscore-prefixed utility files from function routing.

The count is source-verified; the project still needs a Vercel build/deployment to confirm the platform's final deployment summary.

## Billing UI and database

The uploaded v22.1 source already had the Billing & subscription More-menu link and `/billing` page. Those existing components were preserved, along with the ₹30/month pricing, trial/status display, checkout, payment history, refresh and cancellation UI.

No Supabase migration is added in this release. The existing `supabase-billing-v2.sql` remains unchanged. Do not rerun or replace it merely for this function-count update. The billing API continues to use the existing Supabase service-role variables on the server only.

## Validation boundary

Local validation covers JavaScript syntax, route dispatch and the repository's Node test suite. It does not execute a real Razorpay payment, mandate, renewal, webhook delivery or live Supabase transaction. Complete the Test Mode checklist in `HACKTHETA_BRANDING_AND_BILLING_SETUP.md` after deployment.
