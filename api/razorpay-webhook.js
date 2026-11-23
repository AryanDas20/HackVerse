const crypto = require('node:crypto');
const { adminClient, razorpayRequest, verifyHexHmac, toIsoFromUnix } = require('../lib/billing');

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('Webhook payload is too large.'), { status: 413 });
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

function paymentRow(payment, userId, subscriptionId, eventId, eventType, existingType = null) {
  if (!payment?.id) return null;
  return {
    user_id: userId,
    razorpay_payment_id: payment.id,
    razorpay_subscription_id: subscriptionId,
    amount: Number(payment.amount || 0),
    currency: payment.currency || 'INR',
    status: String(payment.status || 'unknown'),
    transaction_type: eventType === 'payment.authorized' ? 'authorization' : eventType === 'payment.refunded' ? (existingType || 'recurring') : 'recurring',
    method: payment.method || null,
    paid_at: toIsoFromUnix(payment.captured_at || payment.created_at),
    source_event_id: eventId
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const raw = await rawBody(req);
    const signature = String(req.headers['x-razorpay-signature'] || '');
    if (!verifyHexHmac(raw, process.env.RAZORPAY_WEBHOOK_SECRET, signature)) {
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }
    const eventId = String(req.headers['x-razorpay-event-id'] || crypto.createHash('sha256').update(raw).digest('hex'));
    const event = JSON.parse(raw.toString('utf8'));
    const eventType = String(event.event || '');
    const subscription = event.payload?.subscription?.entity || null;
    const payment = event.payload?.payment?.entity || null;
    const subscriptionId = subscription?.id || payment?.subscription_id || null;
    if (!subscriptionId) return res.status(200).json({ received: true, ignored: true });

    const client = adminClient();
    const { data: existingEvent, error: existingError } = await client.from('billing_webhook_events').select('event_id').eq('event_id', eventId).maybeSingle();
    if (existingError) throw existingError;
    if (existingEvent) return res.status(200).json({ received: true, duplicate: true });

    const { data: row, error: rowError } = await client.from('billing_subscriptions').select('user_id,razorpay_plan_id,status,current_period_end').eq('razorpay_subscription_id', subscriptionId).maybeSingle();
    if (rowError) throw rowError;
    if (!row) return res.status(200).json({ received: true, ignored: true });

    const allowedEvents = new Set([
      'subscription.authenticated', 'subscription.activated', 'subscription.charged',
      'subscription.pending', 'subscription.halted', 'subscription.cancelled',
      'subscription.paused', 'subscription.resumed', 'subscription.completed',
      'subscription.updated', 'payment.authorized', 'payment.captured', 'payment.failed', 'payment.refunded'
    ]);
    if (!allowedEvents.has(eventType)) return res.status(200).json({ received: true, ignored: true });

    // Events can arrive late or out of order. Reconcile against Razorpay's current
    // subscription resource rather than blindly applying an older event snapshot.
    const remote = await razorpayRequest(`/subscriptions/${subscriptionId}`);
    if (row.razorpay_plan_id && remote.plan_id && row.razorpay_plan_id !== remote.plan_id) {
      return res.status(200).json({ received: true, ignored: true, reason: 'plan_mismatch' });
    }
    const updates = { updated_at: new Date().toISOString() };
    const statusMap = {
      created: 'created', authenticated: 'authenticated', active: 'active',
      pending: 'pending', halted: 'halted', cancelled: 'cancelled',
      paused: 'paused', completed: 'completed', expired: 'expired'
    };
    if (statusMap[remote.status]) updates.status = statusMap[remote.status];
    if (remote.plan_id) updates.razorpay_plan_id = remote.plan_id;
    updates.current_period_start = toIsoFromUnix(remote.current_start);
    updates.current_period_end = toIsoFromUnix(remote.current_end);
    updates.scheduled_start_at = toIsoFromUnix(remote.start_at);
    updates.next_charge_at = toIsoFromUnix(remote.charge_at);
    updates.cancel_at_cycle_end = Boolean(remote.cancel_at_cycle_end);
    if (eventType === 'payment.failed' && !['active', 'pending', 'halted', 'cancelled', 'completed'].includes(remote.status)) {
      updates.status = 'failed';
    }
    const { error: updateError } = await client.from('billing_subscriptions').update(updates).eq('user_id', row.user_id);
    if (updateError) throw updateError;

    let existingPaymentType = null;
    if (payment?.id && eventType === 'payment.refunded') {
      const { data: priorPayment } = await client.from('billing_payments').select('transaction_type').eq('razorpay_payment_id', payment.id).maybeSingle();
      existingPaymentType = priorPayment?.transaction_type || null;
    }
    const recordedPayment = paymentRow(payment, row.user_id, subscriptionId, eventId, eventType, existingPaymentType);
    if (recordedPayment) {
      const { error: paymentError } = await client.from('billing_payments').upsert(recordedPayment, { onConflict: 'razorpay_payment_id' });
      if (paymentError) throw paymentError;
    }
    const { error: eventError } = await client.from('billing_webhook_events').insert({ event_id: eventId, event_type: eventType, processed_at: new Date().toISOString() });
    if (eventError && eventError.code !== '23505') throw eventError;
    return res.status(200).json({ received: true });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('Razorpay webhook processing error', error);
    return res.status(status).json({ error: status === 500 ? 'Webhook processing failed. Razorpay can retry delivery.' : error.message });
  }
};

module.exports.config = { api: { bodyParser: false } };
