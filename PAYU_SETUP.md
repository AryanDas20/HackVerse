# HackTheta PayU India Billing Setup

This release replaces the active Razorpay checkout and webhook code with PayU India Hosted Checkout + Standing Instructions (SI). The ₹30/month plan and existing one-time 7-day account trial remain. Historical Razorpay identifiers/rows are retained only for record continuity; no active Razorpay payment endpoint or browser widget is shipped.

## 1. Prerequisites and PayU account approval

1. Complete PayU India merchant onboarding with HackTheta's actual business model described accurately, including community/social networking, opportunity discovery, career tools and educational resources. Do not misclassify the business to obtain approval.
2. Ask PayU to enable Standing Instructions (SI)/recurring payments for your Merchant ID. PayU's official recurring-integration documentation says SI must be enabled on the MID and identifies the PayU Key Account Manager as the activation contact.
3. Obtain separate Test and Production Merchant Key + Salt values from PayU. Do not use production credentials in Test Mode.
4. Test Hosted Checkout and mandate/cancellation using PayU's sandbox first. Do not set `PAYU_MODE=production` until PayU approves the merchant, enables SI, and confirms live credentials.

PayU references:
- Hosted SI consent transaction: https://docs.payu.in/reference/payment-consent-transaction-payu-hosted
- Hash generation and response validation: https://docs.payu.in/docs/hashing-request-and-response
- Recurring API: https://docs.payu.in/reference/recurring_payment_api
- Pre-debit API: https://docs.payu.in/reference/pre_debit_notification_api
- SI parameters: https://docs.payu.in/reference/si-parameter-json-details
- Recurring integration overview: https://docs.payu.in/docs/using-api-integration-recurring-payments

## 2. Apply the additive Supabase migration

Use the EXISTING HackTheta Supabase project:

1. Open Supabase Dashboard → SQL Editor → New query.
2. Open `supabase-payu-billing-v3.sql` from this project.
3. Copy the complete SQL into the editor and Run it.
4. Confirm `payu_billing_attempts` exists and `billing_subscriptions` now has the `payment_provider`, `payu_*` fields.

This migration is additive. It does not drop the old Razorpay columns or delete `billing_payments`. Existing accounts are not newly granted a trial. New-account 7-day trial creation remains handled by the existing v2 trigger.

## 3. Configure Vercel environment variables

In the existing Vercel project → Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `PAYU_MERCHANT_KEY` | PayU Test Merchant Key |
| `PAYU_MERCHANT_SALT` | Matching PayU Test Salt |
| `PAYU_MODE` | `test` |
| `APP_BASE_URL` | `https://hackverse-theta.vercel.app` |
| `CRON_SECRET` | A long random secret you generate and keep private |

Retain the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values. The service-role key must remain server-side. Retain all existing Firebase and Agent37 variables; this migration does not require replacing them.

Example generation of a cron secret on macOS:

```bash
openssl rand -hex 32
```

Paste the result into Vercel as `CRON_SECRET`. Do not commit it. `.env.example` contains empty placeholders only.

## 4. Configure PayU callback URLs

The generated Hosted Checkout form sends both `surl` and `furl` to:

```text
https://hackverse-theta.vercel.app/api/payu-callback
```

The callback checks PayU's reverse SHA-512 hash, binds the returned `udf1` user ID to the stored transaction, and independently calls PayU `verify_payment` before changing billing state. Do not set a frontend success page as proof of payment.

## 5. Trial and consent disclosure

- Eligible new users retain the existing seven-day trial. Existing accounts are not automatically granted a new trial by the migration.
- A trial user may authorize PayU recurring billing. PayU's current hosted SI documentation says `free_trial=1` adjusts the registration authorisation amount to ₹2 for Cards/UPI or ₹0 for Net Banking. This is a payment-method authorisation/consent amount, not the ₹30 subscription fee; disclose the amount PayU shows at checkout.
- The first ₹30 monthly debit is scheduled after the saved trial expiry. If the trial has less than 48 hours remaining, this build blocks setting up a new trial mandate because a required Cards/UPI pre-debit could not be sent at least 48 hours ahead. The user can subscribe after the trial ends with a ₹30 first-month payment.
- Customers who do not authorise automatic renewal can still use their eligible trial until it expires.

## 6. Recurring process

`api/payu-recurring-cron.js` runs daily through Vercel Cron at `0 3 * * *` (UTC). It checks mandate state, sends the PayU pre-debit request for Cards/UPI, waits at least 48 hours, then sends the documented `si_transaction` recurring request. A recurring payment grants/extends Premium only after PayU reports a captured payment and the server-side verification succeeds. Pending payments remain pending and are reconciled on later runs.

The job uses `CRON_SECRET` via `Authorization: Bearer <secret>`. Check Vercel → Settings → Cron Jobs after deployment to verify the schedule was registered. PayU states pre-debit notification is required at least 48 hours before a Cards/UPI recurring debit; Net Banking does not use this pre-debit API in the documented flow.

## 7. Local checks and deployment

```bash
npm install
npm run check
npm test
```

After checks pass:

```bash
git status
git add .
git commit -m "Replace Razorpay billing with PayU India"
git push origin main
```

Use your actual production branch if it is not `main`. Vercel should deploy from the existing GitHub repository/project.

## 8. Vercel function count

The former `api/razorpay-webhook.js` endpoint is removed. PayU uses `api/payu-callback.js` and `api/payu-recurring-cron.js`; `api/billing/[action].js` remains a single dynamic route for create, verify, status and cancel. Run `npm run check` to see source-level API function candidates. The count script is a source check, not a guarantee of Vercel's final bundling/deployment result; confirm the deployed build output and Cron Job list in Vercel.

## 9. Hosting-plan policy warning

The source check reports 12 API function candidates, but this is only a source-level count and does not verify the deployed build. More importantly, Vercel currently restricts the Hobby plan to personal or non-commercial use. Because HackTheta offers a paid ₹30/month subscription, confirm with Vercel whether your intended deployment is permitted; paid/commercial use may require a Pro or Enterprise plan even if the function count fits. Do not treat the 12-function source count as an exception to Vercel's plan terms. See https://vercel.com/legal/terms and https://vercel.com/docs/limits/fair-use-guidelines.

## 10. Important limitations and go-live checklist

- This source package cannot create or approve a PayU merchant account, activate SI, or test your merchant credentials.
- Live payment processing has not been tested in this environment. Use the PayU sandbox first.
- PayU merchant eligibility for HackTheta must be confirmed directly by PayU after they review the actual business model.
- Test mandate creation, status checks, cancellation, trial expiry, pre-debit, captured/pending/failed recurring states and duplicate callbacks with your PayU test account before production.
- Monitor Vercel Cron execution logs. A missed/failed pre-debit intentionally prevents a card/UPI debit in that cycle rather than charging without the required notice.
