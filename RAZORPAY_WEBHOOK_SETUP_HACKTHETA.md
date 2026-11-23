# HackTheta — Razorpay Test Mode webhook setup

## What the webhook does

Razorpay sends a signed HTTP POST to HackTheta when a subscription/payment event occurs. HackTheta verifies the signature against the raw request body, rejects invalid signatures, ignores duplicate event IDs, reconciles the subscription with Razorpay, and updates Supabase. The webhook does not launch the payment window; the Billing page does that through Razorpay Checkout.

## Before configuring it

1. Deploy the HackTheta billing code to your existing Vercel project.
2. Confirm the API route is deployed: `/api/razorpay-webhook`.
3. Keep Razorpay in **Test Mode**.
4. Use the Test Mode plan ID `plan_U3akXCdH3TGXun` with Test Mode API keys.

## Add the webhook in Razorpay

1. In Razorpay Dashboard, ensure the **TEST** mode indicator is active.
2. Open **Account & Settings → Webhooks**. Depending on the dashboard layout, Webhooks may be under the account settings search.
3. Click **+ Add New Webhook**.
4. Enter the full URL, replacing the example domain with your actual Vercel custom domain:

```text
https://YOUR-HACKTHETA-DOMAIN/api/razorpay-webhook
```

Do not include a trailing slash or a placeholder domain. Use the real HTTPS production domain that serves the deployed Vercel project.

5. Create a long, random webhook secret (different from the Razorpay Key Secret). Save it in a password manager.
6. Paste the exact same secret into Vercel as `RAZORPAY_WEBHOOK_SECRET`. Never put it in browser code or GitHub.
7. Select these event names if they are available in the Razorpay dashboard:

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

8. Save the webhook.
9. In Vercel → Settings → Environment Variables, verify `RAZORPAY_WEBHOOK_SECRET` is set for Production. Save changes and redeploy so the serverless function can read it.

## Test it

1. Open HackTheta → More → Billing & subscription while signed in.
2. Click the subscription/renewal button and complete Razorpay Test Mode Checkout using the test instructions shown in Checkout.
3. Return to Razorpay → Account & Settings → Webhooks and inspect the delivery log for the webhook you created.
4. Confirm successful deliveries return HTTP `200`. If a delivery fails, inspect the response/status and Vercel Function Logs for `/api/razorpay-webhook`.
5. In HackTheta Billing, click **Refresh status** and confirm the subscription state is reconciled.

## Important

- Test Mode and Live Mode webhooks are configured separately. Do not configure Live Mode until Test Mode works and your Razorpay onboarding is approved.
- The webhook secret is not the Key Secret. Keep them separate.
- Do not share either secret in chat, screenshots, source code or GitHub.
- Razorpay can deliver events more than once or out of order; the endpoint has event deduplication and reconciles the current subscription state.
- If the endpoint is not deployed yet, creating the webhook now will cause delivery failures. Deploy the billing code first.
- Razorpay documents webhooks as asynchronous notifications; the Checkout handler and server-side signature verification are also used for the immediate customer flow.
