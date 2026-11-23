const { adminClient, authenticate, ensureBillingRow, razorpayRequest, toIsoFromUnix } = require('../lib/billing');

const REUSABLE_STATES = new Set(['created', 'authenticated', 'active', 'pending', 'halted', 'paused']);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const client = adminClient();
    const user = await authenticate(client, req);
    const row = await ensureBillingRow(client, user.id);
    const planId = process.env.RAZORPAY_PLAN_ID;
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!planId || !keyId || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_PLAN_ID to Vercel before enabling checkout.' });
    }

    if (row.razorpay_subscription_id && row.status === 'cancelled' && row.current_period_end && new Date(row.current_period_end).getTime() > Date.now()) {
      return res.status(409).json({ error: 'Your current subscription remains valid until its confirmed end date. You can start a new subscription after that date.', currentPeriodEnd: row.current_period_end });
    }

    if (row.razorpay_subscription_id && REUSABLE_STATES.has(row.status)) {
      return res.status(200).json({
        keyId,
        subscriptionId: row.razorpay_subscription_id,
        startAt: row.scheduled_start_at,
        trialEndsAt: row.trial_ends_at,
        reused: true
      });
    }

    if (!/^plan_[A-Za-z0-9]+$/.test(planId)) {
      return res.status(503).json({ error: 'RAZORPAY_PLAN_ID must be a valid Razorpay Plan ID.' });
    }
    const plan = await razorpayRequest(`/plans/${planId}`);
    const planAmount = Number(plan.item?.amount ?? plan.item?.unit_amount ?? 0);
    if (plan.period !== 'monthly' || Number(plan.interval) !== 1 || planAmount !== 3000 || plan.item?.currency !== 'INR') {
      return res.status(503).json({ error: 'The configured Razorpay Plan must be INR ₹30 billed every 1 month. Create the correct Test Mode or Live Mode plan and update RAZORPAY_PLAN_ID.' });
    }

    const now = Date.now();
    const trialEndMs = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
    const startAt = trialEndMs > now ? Math.ceil(trialEndMs / 1000) : Math.ceil((now + 60_000) / 1000);
    const subscription = await razorpayRequest('/subscriptions', {
      method: 'POST',
      body: {
        plan_id: planId,
        total_count: 120,
        quantity: 1,
        customer_notify: true,
        start_at: startAt,
        notes: {
          account_uid: user.id,
          product: 'HackTheta Premium',
          trial_days: trialEndMs > now ? '7' : '0'
        }
      }
    });

    const updated = await client.from('billing_subscriptions').update({
      razorpay_subscription_id: subscription.id,
      razorpay_plan_id: planId,
      status: subscription.status || 'created',
      scheduled_start_at: toIsoFromUnix(subscription.start_at || startAt),
      next_charge_at: toIsoFromUnix(subscription.charge_at || subscription.start_at || startAt),
      cancel_at_cycle_end: false,
      updated_at: new Date().toISOString()
    }).eq('user_id', user.id).select('razorpay_subscription_id').single();
    if (updated.error) {
      // Do not leave an untracked subscription running if persistence fails.
      try { await razorpayRequest(`/subscriptions/${subscription.id}/cancel`, { method: 'POST', body: { cancel_at_cycle_end: false } }); } catch (cancelError) { console.error('Could not cancel untracked Razorpay subscription', cancelError); }
      throw Object.assign(new Error('Could not save the subscription. Please retry; contact support if Razorpay shows an authorisation attempt.'), { status: 503 });
    }

    return res.status(201).json({
      keyId,
      subscriptionId: subscription.id,
      startAt: toIsoFromUnix(subscription.start_at || startAt),
      trialEndsAt: row.trial_ends_at,
      reused: false
    });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('Create subscription error', error);
    return res.status(status).json({ error: status === 500 ? 'Could not start the subscription. Please try again.' : error.message });
  }
};
