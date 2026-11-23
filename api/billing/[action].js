const {
  adminClient,
  authenticate,
  ensureBillingRow,
  razorpayRequest,
  verifyHexHmac,
  getEntitlement,
  toIsoFromUnix
} = require('../../lib/billing');

const REUSABLE_STATES = new Set(['created', 'authenticated', 'active', 'pending', 'halted', 'paused']);

async function createSubscription(req, res) {
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
    try {
      await razorpayRequest(`/subscriptions/${subscription.id}/cancel`, {
        method: 'POST',
        body: { cancel_at_cycle_end: false }
      });
    } catch (cancelError) {
      console.error('Could not cancel untracked Razorpay subscription', cancelError);
    }
    throw Object.assign(new Error('Could not save the subscription. Please retry; contact support if Razorpay shows an authorisation attempt.'), { status: 503 });
  }

  return res.status(201).json({
    keyId,
    subscriptionId: subscription.id,
    startAt: toIsoFromUnix(subscription.start_at || startAt),
    trialEndsAt: row.trial_ends_at,
    reused: false
  });
}

async function verifySubscription(req, res) {
  const client = adminClient();
  const user = await authenticate(client, req);
  const row = await ensureBillingRow(client, user.id);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const paymentId = String(body.razorpay_payment_id || '');
  const responseSubscriptionId = String(body.razorpay_subscription_id || '');
  const signature = String(body.razorpay_signature || '');
  const subscriptionId = row.razorpay_subscription_id;
  if (!subscriptionId || responseSubscriptionId !== subscriptionId || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId) || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
    return res.status(400).json({ error: 'The subscription authorisation response is incomplete.' });
  }
  const valid = verifyHexHmac(`${paymentId}|${subscriptionId}`, process.env.RAZORPAY_KEY_SECRET, signature);
  if (!valid) return res.status(400).json({ error: 'Razorpay signature verification failed. No access has been granted.' });

  const remote = await razorpayRequest(`/subscriptions/${subscriptionId}`);
  if (remote.id !== subscriptionId || remote.plan_id !== process.env.RAZORPAY_PLAN_ID) {
    return res.status(400).json({ error: 'The verified subscription does not match the configured HackTheta plan.' });
  }
  const { error } = await client.from('billing_subscriptions').update({
    status: remote.status || 'authenticated',
    scheduled_start_at: toIsoFromUnix(remote.start_at),
    current_period_start: toIsoFromUnix(remote.current_start),
    current_period_end: toIsoFromUnix(remote.current_end),
    next_charge_at: toIsoFromUnix(remote.charge_at),
    updated_at: new Date().toISOString()
  }).eq('user_id', user.id).eq('razorpay_subscription_id', subscriptionId);
  if (error) throw Object.assign(new Error('Razorpay verified the response, but billing status could not be updated. Webhook reconciliation will retry.'), { status: 503 });

  return res.status(200).json({ verified: true, status: remote.status || 'authenticated', message: 'Recurring payment authorisation verified. Your trial remains active until its scheduled end date.' });
}

async function getStatus(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const client = adminClient();
  const user = await authenticate(client, req);
  const row = await ensureBillingRow(client, user.id);
  const { data: payments, error: paymentsError } = await client.from('billing_payments')
    .select('razorpay_payment_id,amount,currency,status,transaction_type,paid_at,created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
  if (paymentsError) throw Object.assign(new Error('Could not load payment history.'), { status: 503 });
  const entitlement = getEntitlement(row);
  return res.status(200).json({
    subscription: {
      status: row.status,
      trialStartedAt: row.trial_started_at,
      trialEndsAt: row.trial_ends_at,
      razorpaySubscriptionId: row.razorpay_subscription_id,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      scheduledStartAt: row.scheduled_start_at,
      nextChargeAt: row.next_charge_at,
      cancelAtCycleEnd: Boolean(row.cancel_at_cycle_end),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    },
    entitlement,
    payments: payments || [],
    plan: { name: 'HackTheta Premium', amount: 3000, currency: 'INR', interval: 'monthly', trialDays: 7 }
  });
}

async function cancelSubscription(req, res) {
  const client = adminClient();
  const user = await authenticate(client, req);
  const row = await ensureBillingRow(client, user.id);
  if (!row.razorpay_subscription_id) return res.status(400).json({ error: 'There is no Razorpay subscription to cancel.' });
  const trialStillActive = row.trial_ends_at && new Date(row.trial_ends_at).getTime() > Date.now();
  const subscriptionNotStarted = !row.current_period_start && row.scheduled_start_at && new Date(row.scheduled_start_at).getTime() > Date.now();
  // During the free trial, cancel the future subscription immediately so it
  // cannot convert to paid. The trial entitlement remains until trial_ends_at.
  // For an already-billed subscription, preserve access through cycle end.
  const cancelAtCycleEnd = !(trialStillActive && subscriptionNotStarted);
  const remote = await razorpayRequest(`/subscriptions/${row.razorpay_subscription_id}/cancel`, {
    method: 'POST',
    body: { cancel_at_cycle_end: cancelAtCycleEnd }
  });
  const { error } = await client.from('billing_subscriptions').update({
    status: remote.status || row.status,
    cancel_at_cycle_end: cancelAtCycleEnd,
    current_period_end: toIsoFromUnix(remote.current_end) || row.current_period_end,
    next_charge_at: toIsoFromUnix(remote.charge_at),
    updated_at: new Date().toISOString()
  }).eq('user_id', user.id);
  if (error) throw Object.assign(new Error('Razorpay accepted the cancellation request, but local billing status did not update. Refresh billing status.'), { status: 503 });
  return res.status(200).json({ cancelled: true, cancelAtCycleEnd, status: remote.status || row.status, currentPeriodEnd: toIsoFromUnix(remote.current_end) || row.current_period_end });
}

const ACTIONS = Object.freeze({
  'create-subscription': { method: 'POST', run: createSubscription },
  'verify-subscription': { method: 'POST', run: verifySubscription },
  status: { method: 'GET', run: getStatus },
  'cancel-subscription': { method: 'POST', run: cancelSubscription }
});

module.exports = async function billingActionHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  const rawAction = req.query?.action;
  const action = Array.isArray(rawAction) ? rawAction[0] : rawAction;
  const route = typeof action === 'string' ? ACTIONS[action] : null;
  if (!route) return res.status(404).json({ error: 'Unknown billing action.' });

  if (req.method !== route.method) {
    res.setHeader('Allow', route.method);
    return res.status(405).json({ error: `Method not allowed. Use ${route.method}.` });
  }

  try {
    return await route.run(req, res);
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error(`Billing ${action} error`, error);
    return res.status(status).json({ error: status === 500 ? 'Billing request failed. Please try again.' : error.message });
  }
};
