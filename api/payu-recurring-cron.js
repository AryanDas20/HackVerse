const crypto = require('node:crypto');
const {
  adminClient,
  payuCommand,
  verifyPayUTransaction,
  checkPayuMandate,
  isoDate,
  addUtcMonths
} = require('../lib/billing');
const { updateAttempt, updateSubscription, amountNumber } = require('../lib/payu-billing');

function makeTxnId() {
  return `HTR${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.slice(0, 25);
}

function indiaHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(date));
}

function isUppiPeakHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  const minutes = hour * 60 + minute;
  return (minutes >= 600 && minutes < 780) || (minutes >= 1020 && minutes < 1290);
}

function amountMatches(value) {
  const amount = amountNumber(value);
  return Number.isFinite(amount) && Math.abs(amount - 30) <= 0.01;
}

async function findExistingCycleAttempt(client, userId, cycleDate) {
  const { data, error } = await client.from('payu_billing_attempts').select('*')
    .eq('user_id', userId).eq('transaction_type', 'recurring').eq('cycle_date', cycleDate).maybeSingle();
  if (error) throw Object.assign(new Error('Could not check the existing recurring payment attempt.'), { status: 503 });
  return data;
}

async function finaliseCaptured(client, attempt, detail, subscription) {
  const status = String(detail?.status || '').toLowerCase();
  const amount = amountNumber(detail?.amt ?? detail?.amount);
  if (!['success', 'captured'].includes(status) || !amountMatches(amount)) {
    await updateAttempt(client, attempt.txnid, {
      status: 'review_required',
      amount: Number.isFinite(amount) ? amount : attempt.amount,
      failure_reason: 'PayU verification did not confirm a captured ₹30 recurring debit.'
    });
    return false;
  }
  const mihpayid = String(detail.mihpayid || detail.payuid || attempt.mihpayid || '');
  const now = new Date();
  const cycleStart = attempt.cycle_date ? new Date(`${attempt.cycle_date}T00:00:00.000Z`) : now;
  const next = addUtcMonths(cycleStart, 1);
  const periodEnd = next.toISOString();
  await updateAttempt(client, attempt.txnid, {
    status: 'captured', amount, mihpayid: mihpayid || null,
    payment_mode: subscription.payu_payment_mode || null,
    paid_at: detail.addedon ? new Date(String(detail.addedon).replace(' ', 'T') + 'Z').toISOString() : now.toISOString(),
    failure_reason: null
  });
  await updateSubscription(client, attempt.user_id, {
    status: 'active',
    current_period_start: cycleStart.toISOString(),
    current_period_end: periodEnd,
    scheduled_start_at: periodEnd,
    next_charge_at: periodEnd,
    payu_predebit_for: null,
    payu_predebit_sent_at: null,
    payu_mandate_seq_no: Number(subscription.payu_mandate_seq_no || 2) + 1,
    payu_last_error: null
  });
  return true;
}

async function reconcilePending(client, attempt) {
  const { data: row, error } = await client.from('billing_subscriptions').select('*').eq('user_id', attempt.user_id).maybeSingle();
  if (error || !row) return { action: 'pending_without_subscription', txnid: attempt.txnid };
  const detail = await verifyPayUTransaction(attempt.txnid);
  const status = String(detail?.status || '').toLowerCase();
  if (['success', 'captured'].includes(status)) {
    const ok = await finaliseCaptured(client, attempt, detail, row);
    return { action: ok ? 'pending_captured' : 'pending_review', txnid: attempt.txnid };
  }
  if (['failure', 'failed', 'cancelled'].includes(status)) {
    await updateAttempt(client, attempt.txnid, { status: 'failed', failure_reason: String(detail?.error_Message || detail?.field9 || 'PayU recurring debit failed.').slice(0, 400) });
    await updateSubscription(client, attempt.user_id, { status: 'past_due', payu_last_error: 'The last PayU recurring debit failed. Update your mandate or subscribe again.' });
    return { action: 'pending_failed', txnid: attempt.txnid };
  }
  return { action: 'still_pending', txnid: attempt.txnid };
}

async function processSubscription(client, row, now) {
  const mode = String(row.payu_payment_mode || '').toUpperCase();
  const dueAt = new Date(row.next_charge_at);
  if (!Number.isFinite(dueAt.getTime())) return { action: 'skipped_invalid_due_date', userId: row.user_id };
  const cycleDate = isoDate(dueAt);

  const existing = await findExistingCycleAttempt(client, row.user_id, cycleDate);
  if (existing) {
    if (existing.status === 'pending') return reconcilePending(client, existing);
    return { action: `skipped_existing_${existing.status}`, userId: row.user_id, cycleDate };
  }

  const mandate = await checkPayuMandate(row.payu_mihpayid, mode);
  if (!mandate.active) {
    await updateSubscription(client, row.user_id, {
      status: 'cancelled', payu_mandate_status: mandate.status,
      next_charge_at: null, payu_last_error: `PayU mandate is ${mandate.status}; no recurring debit was attempted.`
    });
    return { action: 'mandate_inactive', userId: row.user_id, mandateStatus: mandate.status };
  }
  await updateSubscription(client, row.user_id, { payu_mandate_status: 'active' });

  const needsPredebit = ['CC', 'DC', 'UPI'].includes(mode);
  if (needsPredebit) {
    const sentAt = row.payu_predebit_sent_at ? new Date(row.payu_predebit_sent_at) : null;
    const hoursSince = sentAt ? (now.getTime() - sentAt.getTime()) / 3600000 : -1;
    if (!sentAt || row.payu_predebit_for !== cycleDate || hoursSince < 48) {
      if (now.getTime() >= dueAt.getTime() - 48 * 3600000) {
        await updateSubscription(client, row.user_id, { payu_last_error: 'Pre-debit notice was not confirmed at least 48 hours before the due date. This cycle was not charged; please contact support or renew manually.' });
        return { action: 'skipped_predebit_window_missed', userId: row.user_id, cycleDate };
      }
      const debitDate = cycleDate;
      const requestId = crypto.randomUUID();
      const invoiceDisplayNumber = `HT-${cycleDate.replace(/-/g, '')}`;
      const var1 = {
        authpayuid: String(row.payu_mihpayid),
        requestId,
        amount: '30.00',
        debitDate,
        invoiceDisplayNumber,
        ...(mode === 'UPI' ? { mandateSeqNo: Number(row.payu_mandate_seq_no || 2) } : {})
      };
      const predebit = await payuCommand('pre_debit_SI', var1);
      // E9254 means the pre-debit was already sent for this mandate sequence.
      // E9256 means an execution already exists; do not launch another debit.
      if (Number(predebit?.status) !== 1 && String(predebit?.status || '') !== 'E9254') {
        await updateSubscription(client, row.user_id, { payu_last_error: String(predebit?.message || 'PayU did not confirm the pre-debit notice.').slice(0, 300) });
        return { action: 'predebit_failed', userId: row.user_id, cycleDate };
      }
      await updateSubscription(client, row.user_id, {
        payu_predebit_for: cycleDate,
        payu_predebit_sent_at: now.toISOString(),
        payu_last_error: null
      });
      return { action: 'predebit_sent', userId: row.user_id, cycleDate };
    }
  }

  if (now.getTime() < dueAt.getTime()) return { action: 'not_due', userId: row.user_id, cycleDate };
  if (mode === 'UPI' && isUppiPeakHour(now)) return { action: 'deferred_upi_peak_hours', userId: row.user_id, cycleDate };
  if (needsPredebit) {
    const sentAt = row.payu_predebit_sent_at ? new Date(row.payu_predebit_sent_at) : null;
    if (!sentAt || row.payu_predebit_for !== cycleDate || now.getTime() - sentAt.getTime() < 48 * 3600000) {
      return { action: 'skipped_predebit_not_ready', userId: row.user_id, cycleDate };
    }
  }

  const txnid = makeTxnId();
  const attempt = {
    txnid,
    user_id: row.user_id,
    transaction_type: 'recurring',
    cycle_date: cycleDate,
    amount: 30,
    currency: 'INR',
    status: 'created',
    metadata: { mandate_id: row.payu_mihpayid, payment_mode: mode }
  };
  const inserted = await client.from('payu_billing_attempts').insert(attempt);
  if (inserted.error) return { action: 'duplicate_or_insert_failed', userId: row.user_id };

  const var1 = {
    authpayuid: String(row.payu_mihpayid),
    invoiceDisplayNumber: `HT-${cycleDate.replace(/-/g, '')}`,
    amount: '30.00',
    txnid,
    phone: String(row.payu_phone || ''),
    email: String(row.payu_email || ''),
    ...(mode === 'UPI' ? { mandateSeqNo: Number(row.payu_mandate_seq_no || 2) } : {}),
    udf1: row.user_id,
    udf2: '', udf3: '', udf4: '', udf5: ''
  };
  let response;
  try {
    response = await payuCommand('si_transaction', var1);
  } catch (error) {
    // A network timeout can happen after PayU accepted the request. Record an
    // uncertain state and reconcile by txnid before any retry to avoid double debit.
    await updateAttempt(client, txnid, {
      status: 'pending',
      failure_reason: 'The PayU recurring request response was not received. The transaction will be verified before any retry.'
    });
    throw error;
  }
  const detail = response?.details?.[txnid] || null;
  const payuStatus = String(detail?.status || '').toLowerCase();
  if (payuStatus === 'captured' && amountMatches(detail.amount)) {
    const finalDetail = await verifyPayUTransaction(txnid);
    const ok = await finaliseCaptured(client, attempt, finalDetail || detail, row);
    return { action: ok ? 'captured' : 'verification_review', userId: row.user_id, txnid };
  }
  if (['pending', 'in progress', 'in-progress'].includes(payuStatus)) {
    await updateAttempt(client, txnid, { status: 'pending', amount: 30, failure_reason: String(detail?.field9 || 'PayU recurring debit is pending final bank settlement.').slice(0, 400) });
    return { action: 'pending', userId: row.user_id, txnid };
  }
  await updateAttempt(client, txnid, {
    status: 'failed', amount: Number(detail?.amount) || 30,
    failure_reason: String(detail?.field9 || response?.message || response?.msg || 'PayU recurring payment failed.').slice(0, 400)
  });
  await updateSubscription(client, row.user_id, { status: 'past_due', payu_last_error: 'The last recurring payment failed. Premium access ends on the confirmed paid-through date.' });
  return { action: 'failed', userId: row.user_id, txnid };
}

module.exports = async function payuRecurringCron(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const cronSecret = process.env.CRON_SECRET;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!cronSecret || supplied.length !== cronSecret.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(cronSecret))) {
    return res.status(401).json({ error: 'Unauthorized cron request.' });
  }
  try {
    const client = adminClient();
    const now = new Date();
    const { data: pendingAttempts, error: pendingError } = await client.from('payu_billing_attempts')
      .select('*').eq('transaction_type', 'recurring').eq('status', 'pending').limit(100);
    if (pendingError) throw Object.assign(new Error('Could not load pending PayU payments.'), { status: 503 });
    const results = [];
    for (const attempt of pendingAttempts || []) {
      try { results.push(await reconcilePending(client, attempt)); }
      catch (error) { results.push({ action: 'reconcile_error', txnid: attempt.txnid, message: String(error?.message || error).slice(0, 200) }); }
    }
    const { data: rows, error } = await client.from('billing_subscriptions')
      .select('*').eq('payment_provider', 'payu').not('payu_mihpayid', 'is', null)
      .eq('cancel_at_cycle_end', false).not('next_charge_at', 'is', null)
      .in('status', ['trialing', 'active', 'past_due']).limit(250);
    if (error) throw Object.assign(new Error('Could not load PayU subscriptions for recurring billing.'), { status: 503 });
    for (const row of rows || []) {
      try { results.push(await processSubscription(client, row, now)); }
      catch (error) { results.push({ action: 'processing_error', userId: row.user_id, message: String(error?.message || error).slice(0, 200) }); }
    }
    return res.status(200).json({ processed: results.length, results });
  } catch (error) {
    const status = Number(error.status) || 500;
    console.error('PayU recurring cron error:', String(error?.message || error).slice(0, 500));
    return res.status(status).json({ error: status === 500 ? 'PayU recurring job failed.' : error.message });
  }
};
