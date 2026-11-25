const crypto = require('node:crypto');
const {
  payuCommand,
  verifyPayUTransaction,
  checkPayuMandate,
  addUtcMonths,
  isoDate
} = require('./billing');

function amountNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : NaN;
}

async function updateAttempt(client, txnid, updates) {
  const { error } = await client.from('payu_billing_attempts').update({ ...updates, updated_at: new Date().toISOString() }).eq('txnid', txnid);
  if (error) throw Object.assign(new Error('PayU transaction was verified, but the billing attempt could not be updated.'), { status: 503 });
}

async function updateSubscription(client, userId, updates) {
  const { error } = await client.from('billing_subscriptions').update({ ...updates, updated_at: new Date().toISOString() }).eq('user_id', userId);
  if (error) throw Object.assign(new Error('PayU transaction was verified, but the subscription record could not be updated.'), { status: 503 });
}

async function verifyRegistration(client, attempt) {
  const txnid = String(attempt?.txnid || '');
  if (!txnid) throw Object.assign(new Error('PayU transaction reference is missing.'), { status: 400 });
  const detail = await verifyPayUTransaction(txnid);
  const status = String(detail?.status || '').toLowerCase();
  if (!detail || !['success', 'captured'].includes(status)) {
    const unresolvedStatus = status || 'pending';
    await updateAttempt(client, txnid, {
      status: unresolvedStatus,
      failure_reason: String(detail?.error_Message || detail?.field9 || 'PayU has not confirmed a successful transaction yet.').slice(0, 400)
    });
    return { verified: false, status: unresolvedStatus };
  }

  const actualAmount = amountNumber(detail.amt ?? detail.amount);
  const metadata = attempt.metadata && typeof attempt.metadata === 'object' ? attempt.metadata : {};
  const isTrialConsent = Boolean(metadata.is_trial_consent);
  const mode = String(detail.mode || '').toUpperCase();
  const expectedTrialAmount = ['NB', 'ENACH'].includes(mode) ? 0 : ['CC', 'DC', 'UPI'].includes(mode) ? 2 : NaN;
  const amountValid = isTrialConsent
    ? Number.isFinite(expectedTrialAmount) && Number.isFinite(actualAmount) && Math.abs(actualAmount - expectedTrialAmount) <= 0.01
    : Number.isFinite(actualAmount) && Math.abs(actualAmount - 30) <= 0.01;
  if (!amountValid) {
    await updateAttempt(client, txnid, {
      status: 'review_required',
      amount: Number.isFinite(actualAmount) ? actualAmount : 0,
      mihpayid: String(detail.mihpayid || '') || null,
      payment_mode: mode || null,
      failure_reason: 'The verified PayU amount or payment mode did not match the disclosed registration amount. No paid entitlement was granted.'
    });
    return { verified: false, status: 'review_required' };
  }

  const authPayuId = String(detail.mihpayid || '');
  if (!authPayuId) throw Object.assign(new Error('PayU did not return the mandate reference (mihpayid).'), { status: 502 });
  let mandate = { active: false, status: 'unknown' };
  try { mandate = await checkPayuMandate(authPayuId, mode); }
  catch (error) { console.error('PayU mandate status check failed:', String(error?.message || error).slice(0, 240)); }

  const userId = attempt.user_id;
  const now = new Date();
  const nextChargeAt = metadata.next_charge_at || (isTrialConsent ? null : addUtcMonths(now, 1).toISOString());
  const isUpfront = !isTrialConsent;
  const periodEnd = isUpfront ? addUtcMonths(now, 1).toISOString() : null;
  await updateSubscription(client, userId, {
    payment_provider: 'payu',
    payu_txnid: txnid,
    payu_mihpayid: authPayuId,
    payu_mandate_status: mandate.active ? 'active' : mandate.status,
    payu_payment_mode: mode || null,
    payu_phone: metadata.phone || null,
    payu_email: metadata.email || null,
    payu_predebit_for: null,
    payu_predebit_sent_at: null,
    payu_mandate_seq_no: 2,
    payu_last_error: mandate.active ? null : 'Payment was verified, but PayU has not confirmed an active mandate. Automatic renewal is not authorised yet.',
    scheduled_start_at: nextChargeAt,
    next_charge_at: nextChargeAt,
    cancel_at_cycle_end: false,
    status: isUpfront ? 'active' : 'trialing',
    ...(isUpfront ? { current_period_start: now.toISOString(), current_period_end: periodEnd } : {})
  });
  const paidAt = detail.addedon ? new Date(String(detail.addedon).replace(' ', 'T') + 'Z').toISOString() : now.toISOString();
  await updateAttempt(client, txnid, {
    status: 'captured', amount: actualAmount, mihpayid: authPayuId,
    payment_mode: mode || null, paid_at: paidAt,
    failure_reason: mandate.active ? null : 'Payment completed; mandate status is not active yet.'
  });
  return {
    verified: true,
    mandateActive: mandate.active,
    mandateStatus: mandate.status,
    amount: actualAmount,
    mode,
    nextChargeAt,
    entitlementGranted: isTrialConsent ? 'existing_trial' : 'verified_first_month'
  };
}

async function callPayuMandateRevoke(authPayuId, mode) {
  const normalized = String(mode || '').toUpperCase();
  const command = normalized === 'UPI' ? 'upi_mandate_revoke' : 'mandate_revoke';
  const var1 = { authPayuId: String(authPayuId), requestId: crypto.randomUUID() };
  return payuCommand(command, var1);
}

module.exports = { verifyRegistration, callPayuMandateRevoke, amountNumber, updateAttempt, updateSubscription };
