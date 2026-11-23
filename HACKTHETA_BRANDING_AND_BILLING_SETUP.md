# HackTheta branding + Razorpay billing setup

This ZIP changes the **visible website name** to **HackTheta**. The underlying project identity remains **HackVerse**: Supabase project details, Firebase identifiers, Vercel project settings, package identifiers, API names, existing database records, and `hackverse-*` browser storage keys are intentionally unchanged.

## What changed

- Visible website copy, wordmarks, page titles, navigation labels, legal/help pages and the Agent37 product guide now say **HackTheta**.
- Added a **Billing & subscription** page under **More**.
- Added a ₹30/month HackTheta Premium plan display and a one-time 7-day signup trial.
- Added server-side Razorpay subscription creation, Checkout signature verification, cancellation, payment history, webhook signature validation and duplicate-event handling.
- Added server-side entitlement checks for Agent37 AI / AI Wish / Career Copilot. The Career Match route is also protected by the client router. The community, messages, builder directory and opportunity discovery remain available without a paid subscription.
- Added a Supabase SQL migration and a setup/test guide.

## Before you begin

You need access to the existing HackVerse Supabase project, its Vercel deployment, and a Razorpay account. Do not create a new Supabase project or replace the existing Supabase URL/key, service-role key, Firebase IDs or Agent37 credentials.

## Step 1 — Download and extract

1. Download `HackTheta-v22-branding-razorpay.zip` and extract it.
2. Find your existing local HackVerse Git repository folder (the folder that already contains `.git`). Make a backup of that folder first.
3. Copy the extracted project files into that existing repository folder and allow the source files to be replaced.
4. **Do not replace or delete the existing `.git` folder, `.env` files, Vercel configuration, or your locally customised `public/supabase-config.js` / `.firebaserc`.** The ZIP contains the HackVerse project configuration from the supplied v21 source, but your own local account values may be newer. Keep your current values.
5. Open the existing repository folder in VS Code and open a terminal there. It should contain `package.json` and the `.git` directory.

If you no longer have a local Git clone, clone your existing repository first (`git clone https://github.com/AryanDas20/HackVerse.git`), then copy the extracted project files into that cloned folder while preserving `.git` and your own config files. Do not run `git init` in the extracted ZIP folder just to make the push commands work.

## Step 2 — Run the Supabase billing migration

1. Sign in to the Supabase Dashboard for the **existing HackVerse Supabase project**.
2. Open **SQL Editor** and create a new query.
3. Open `supabase-billing-v2.sql` from this project, copy all of its SQL and paste it into the editor.
4. Click **Run** and confirm it completes successfully.

The migration creates three tables: `billing_subscriptions`, `billing_payments` and `billing_webhook_events`. It also creates a trigger that grants exactly one 7-day trial to accounts created after the migration is installed. Re-running the migration does not reset an existing user's trial. Accounts that already existed before the migration are not automatically granted a new trial; they can subscribe immediately.

Browser users can read their own subscription/payment information, but cannot write trial dates, payment records or subscription status. Only the server-side service-role code updates billing state.

## Step 3 — Create the ₹30 monthly plan in Razorpay Test Mode

1. Sign in to Razorpay Dashboard.
2. Switch to **Test Mode** first.
3. Open **Subscriptions / Plans** (the exact menu wording can vary by Dashboard version).
4. Create a plan with:
   - Plan name: `HackTheta Premium`
   - Billing period: `Monthly`
   - Billing interval: `1`
   - Amount: `₹30` (3000 paise)
   - Currency: `INR`
5. Save the plan. The Test Mode Plan ID you created for this setup is `plan_U3akXCdH3TGXun`. If you create another plan, use that plan's ID instead.

The code sends a future `start_at` to Razorpay when the account is still within the 7-day trial, so the first recurring cycle is scheduled for the trial end. Razorpay requires a bounded subscription count or end date; this implementation uses **120 monthly cycles** (up to 10 years), not an unlimited subscription. Plan/subscription fields should be checked against Razorpay's live documentation and your account's payment-method support.

## Step 4 — Add environment variables in Vercel

1. Open the Vercel Dashboard and select the **existing HackVerse deployment project**.
2. Open **Settings → Environment Variables**.
3. Add the following variables for Development/Preview/Production as appropriate:

```env
RAZORPAY_KEY_ID=rzp_test_your_test_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_PLAN_ID=plan_U3akXCdH3TGXun
RAZORPAY_WEBHOOK_SECRET=choose_a_long_random_webhook_secret
```

4. Confirm the existing server-only variables are still present and unchanged:

```env
SUPABASE_URL=your_existing_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_existing_supabase_service_role_key
```

5. Do not put `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` in browser JavaScript, `public/supabase-config.js`, GitHub or screenshots. Only the Razorpay Key ID is returned to the browser for Checkout.

## Step 5 — Configure Razorpay webhooks

A webhook is a server-to-server notification. It lets Razorpay tell HackTheta when a subscription is authenticated, charged, cancelled, halted or otherwise updated. It does not open Checkout; the website opens Checkout and the webhook keeps the database in sync.

1. Deploy the updated code to Vercel first, so the webhook route exists. The endpoint is `/api/razorpay-webhook`.
2. In Razorpay Dashboard Test Mode, open **Account & Settings → Webhooks**.
3. Add your deployment URL:

```text
https://YOUR-HACKTHETA-DOMAIN/api/razorpay-webhook
```

4. Use exactly the same secret you entered as `RAZORPAY_WEBHOOK_SECRET` in Vercel.
5. Subscribe to these supported events (select only event names that Razorpay shows in your Dashboard):

```text
subscription.authenticated
subscription.activated
subscription.charged
subscription.pending
subscription.halted
subscription.cancelled
subscription.paused
subscription.resumed
subscription.completed
subscription.updated
payment.authorized
payment.captured
payment.failed
payment.refunded
```

6. Save the webhook configuration in **Test Mode**. Test Mode webhooks are separate from Live Mode webhooks.
7. In Vercel → Project → Settings → Environment Variables, add `RAZORPAY_WEBHOOK_SECRET` with the exact same secret you entered in Razorpay. Save it for the Production environment (and Preview/Development if you test there), then redeploy Vercel.
8. After redeployment, use a Test Mode subscription/checkout to generate events. In Razorpay Dashboard → Webhooks, inspect webhook delivery attempts and confirm the endpoint returns HTTP 200. Do not send a fake manual JSON payload as proof of a real subscription event.

The endpoint verifies the Razorpay signature against the **raw request body**, deduplicates event IDs, and reconciles subscription status against Razorpay's current subscription record to reduce the effect of delayed/out-of-order webhook delivery.

## Step 6 — Install and deploy the updated project

From the existing Git repository root, run:

```bash
npm install
npm run check
npm test
git status
```

Review `git status` before committing. Confirm the diff does not replace your existing account credentials/configuration. If checks pass and the changed files look correct:

```bash
git add .
git commit -m "Rebrand website to HackTheta and add Razorpay billing"
git push origin main
```

If your default branch is not `main`, push to the branch already connected to Vercel. Vercel should deploy the latest commit through the existing GitHub connection. Do not create a new GitHub repository or Vercel project for this update.

## Step 7 — Test in Razorpay Test Mode

1. Register a **new test account after the SQL migration**. It should receive a 7-day trial row automatically.
2. Sign in and open **More → Billing & subscription**.
3. Confirm the trial start and expiry dates display.
4. Click **Set up automatic renewal**.
5. Complete Razorpay Test Mode Checkout using the test payment method/instructions shown by Razorpay.
6. Return to Billing and click **Refresh status**. The page should show Razorpay's verified subscription state.
7. Confirm the first recurring billing date is shown as the scheduled trial-end date when Razorpay accepts the future-start subscription.
8. Test cancellation both during the trial (which cancels the future conversion while the trial remains usable) and after a paid billing cycle starts (where cycle-end cancellation keeps access until the confirmed paid-through date).
9. Test with a second new account and confirm it receives its own one-time 7-day trial.
10. Sign in with an account created before the SQL migration: it should not receive a new trial automatically, but can subscribe immediately.

A recurring payment mandate/authorisation step may involve a temporary payment-method verification or authorisation transaction depending on payment method and Razorpay's flow. Read the amount and terms displayed by Razorpay Checkout; this website does not invent a fixed authorisation amount. The ₹30 recurring subscription charge is scheduled after the 7-day trial when the future start date is accepted.

## Step 8 — Switch to Live Mode only after testing

1. Complete Razorpay's account/business verification and enable Live Mode.
2. Create a **separate Live Mode monthly plan** for ₹30.
3. Generate Live Mode API keys.
4. Update Vercel `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_PLAN_ID` with the Live values.
5. Create/verify the Live Mode webhook using the same endpoint and a separately saved webhook secret, then update `RAZORPAY_WEBHOOK_SECRET` in Vercel to match it.
6. Redeploy Vercel.
7. Run one controlled live subscription test only after reviewing Razorpay fees, mandate disclosures, cancellation behaviour, tax obligations and your customer-facing terms.

Do not mix Test Mode keys/Plan IDs with Live Mode, or vice versa.

## Important behaviour and limitations

- The signup trial is created at account creation time, not when the user first opens the Billing page.
- Existing users do not receive a new trial through this migration. A new signup after migration is the easiest way to verify the 7-day trial.
- Authorising recurring billing is a separate explicit Checkout step. A user who does not authorise it still gets their trial period, but must manually subscribe after the trial ends.
- No ₹30 recurring charge should be initiated before the scheduled future subscription start date, if Razorpay accepts that `start_at` for the selected payment method/account. A temporary verification authorisation may still appear as described by Razorpay.
- The subscription uses `total_count=120`, which caps it at 120 monthly billing cycles; it is not unlimited.
- Entitlement is checked server-side for Agent37 AI requests and via the route gate for Career Match. Client-side route hiding is not a security boundary for any future new backend feature: add the same server-side entitlement check to every new premium API.
- This project has not been connected to your Razorpay account and no real charge, mandate, webhook delivery or live cancellation has been executed from this environment. You must complete the Test Mode steps with your own account before enabling Live Mode.
- The existing Supabase URL/key, service role, Firebase project identifiers, Agent37 credentials, Vercel/GitHub identity, package name and `hackverse-*` browser storage keys stay under the HackVerse project identity by design. Only the visible product display name is HackTheta.
