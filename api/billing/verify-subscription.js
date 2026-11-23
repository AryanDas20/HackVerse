const { adminClient, authenticate, ensureBillingRow, razorpayRequest, verifyHexHmac, toIsoFromUnix } = require('../lib/billing');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
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
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('Verify subscription error', error);
    return res.status(status).json({ error: status === 500 ? 'Could not verify subscription authorisation.' : error.message });
  }
};
