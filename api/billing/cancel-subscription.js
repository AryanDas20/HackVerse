const { adminClient, authenticate, ensureBillingRow, razorpayRequest, toIsoFromUnix } = require('../lib/billing');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
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
      method: 'POST', body: { cancel_at_cycle_end: cancelAtCycleEnd }
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
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('Cancel subscription error', error);
    return res.status(status).json({ error: status === 500 ? 'Could not cancel the subscription.' : error.message });
  }
};
