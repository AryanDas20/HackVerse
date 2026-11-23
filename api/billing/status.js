const { adminClient, authenticate, ensureBillingRow, getEntitlement } = require('../lib/billing');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
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
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('Billing status error', error);
    return res.status(status).json({ error: status === 500 ? 'Could not load billing information.' : error.message });
  }
};
