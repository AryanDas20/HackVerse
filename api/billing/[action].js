const crypto = require('node:crypto');
const {
  adminClient,
  authenticate,
  ensureBillingRow,
  getEntitlement,
  payuConfig,
  buildPayUConsentHash,
  getAppBaseUrl,
  isoDate,
  addUtcMonths,
  checkPayuMandate
} = require('../../lib/billing');
const { verifyRegistration, callPayuMandateRevoke } = require('../../lib/payu-billing');

function makeTxnId(prefix = 'HT') {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.slice(0, 25);
}

function firstNameFor(user) {
  const metadata = user.user_metadata || {};
  const candidate = metadata.full_name || metadata.name || metadata.display_name || user.email?.split('@')[0] || 'HackTheta User';
  return String(candidate).trim().split(/\s+/)[0].replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 60) || 'HackTheta User';
}

function isFuture(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) && time > Date.now();
}

async function createSubscription(req, res) {
  const client = adminClient();
  const user = await authenticate(client, req);
  const row = await ensureBillingRow(client, user.id);
  const config = payuConfig();
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const phone = String(body.phone || '').replace(/[^0-9]/g, '');
  if (!/^\d{10,15}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid mobile number with 10 to 15 digits for PayU authorisation.' });
  if (body.acceptRecurringConsent !== true) return res.status(400).json({ error: 'Please confirm the ₹30/month automatic renewal terms before continuing.' });
  if (!user.email || user.email.length > 50) return res.status(400).json({ error: 'A valid account email is required for PayU recurring billing.' });

  if (row.payment_provider === 'payu' && row.payu_mihpayid && row.payu_mandate_status === 'active' && !row.cancel_at_cycle_end) {
    return res.status(409).json({ error: 'Your PayU automatic renewal mandate is already active.' });
  }
  if (row.payment_provider === 'payu' && row.payu_mihpayid && !['active', 'revoked', 'cancelled', 'expired', 'failed', 'discarded', 'deleted'].includes(String(row.payu_mandate_status || '').toLowerCase())) {
    return res.status(409).json({ error: 'A PayU mandate setup is already recorded and its status is still being checked. Refresh billing status or contact support before creating another mandate.' });
  }
  const legacyPaidStatuses = ['active', 'pending', 'halted', 'paused', 'past_due'];
  if (row.payment_provider !== 'payu' && legacyPaidStatuses.includes(String(row.status || '').toLowerCase()) && isFuture(row.current_period_end)) {
    return res.status(409).json({ error: 'A historical subscription period is still active until its recorded end date. Contact support before creating a second mandate.' });
  }

  const trialActive = isFuture(row.trial_ends_at);
  if (trialActive && new Date(row.trial_ends_at).getTime() - Date.now() < 48 * 60 * 60 * 1000) {
    return res.status(409).json({ error: 'Your trial has less than 48 hours remaining. To avoid an invalid pre-debit schedule, finish the trial first, then subscribe with the ₹30 first-month payment.' });
  }

  const existingAttempt = await client.from('payu_billing_attempts')
    .select('txnid,status,metadata,created_at')
    .eq('user_id', user.id)
    .eq('transaction_type', 'mandate_registration')
    .in('status', ['created', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingAttempt.error) throw Object.assign(new Error('Could not check an existing PayU setup attempt. Run the PayU billing SQL migration.'), { status: 503 });
  if (existingAttempt.data?.metadata?.checkout_fields && existingAttempt.data.created_at && Date.now() - new Date(existingAttempt.data.created_at).getTime() < 30 * 60 * 1000) {
    return res.status(200).json({ checkoutUrl: config.checkoutUrl, fields: existingAttempt.data.metadata.checkout_fields, reused: true });
  }

  const now = new Date();
  const firstCharge = trialActive ? new Date(row.trial_ends_at) : addUtcMonths(now, 1);
  const txnid = makeTxnId();
  const siDetails = JSON.stringify({
    billingAmount: '30.00',
    billingCurrency: 'INR',
    billingCycle: 'MONTHLY',
    billingInterval: 1,
    paymentStartDate: isoDate(firstCharge),
    paymentEndDate: isoDate(addUtcMonths(now, 120))
  });
  const appBaseUrl = getAppBaseUrl(req);
  const fields = {
    key: config.key,
    txnid,
    amount: '30.00',
    productinfo: 'HackTheta Premium Monthly Subscription',
    firstname: firstNameFor(user),
    email: user.email,
    phone,
    surl: `${appBaseUrl}/api/payu-callback`,
    furl: `${appBaseUrl}/api/payu-callback`,
    api_version: '7',
    si: '1',
    si_details: siDetails,
    udf1: user.id,
    udf2: 'hacktheta-premium-monthly',
    udf3: trialActive ? 'trial-consent' : 'paid-start',
    udf4: '',
    udf5: ''
  };
  if (trialActive) fields.free_trial = '1';
  fields.hash = buildPayUConsentHash(fields, siDetails, config.salt);

  const metadata = {
    is_trial_consent: trialActive,
    phone,
    email: user.email,
    firstname: fields.firstname,
    productinfo: fields.productinfo,
    next_charge_at: firstCharge.toISOString(),
    accepted_recurring_consent_at: now.toISOString(),
    checkout_fields: fields
  };
  const inserted = await client.from('payu_billing_attempts').insert({
    txnid,
    user_id: user.id,
    transaction_type: 'mandate_registration',
    cycle_date: trialActive ? isoDate(firstCharge) : null,
    amount: trialActive ? (2.00) : 30.00,
    currency: 'INR',
    status: 'created',
    metadata
  });
  if (inserted.error) throw Object.assign(new Error('Could not create a PayU billing attempt. Check the PayU SQL migration and try again.'), { status: 503 });

  return res.status(201).json({
    checkoutUrl: config.checkoutUrl,
    fields,
    reused: false,
    trialEndsAt: trialActive ? row.trial_ends_at : null,
    firstChargeAt: firstCharge.toISOString(),
    notice: trialActive
      ? 'PayU free-trial consent may include a ₹2 card/UPI authorisation or ₹0 Net Banking authorisation. The ₹30 recurring debit is scheduled after the trial, subject to mandate status and pre-debit rules.'
      : 'The first ₹30 payment is due during setup; recurring monthly debits require a successful active mandate.'
  });
}

async function verifySubscription(req, res) {
  const client = adminClient();
  const user = await authenticate(client, req);
  const txnid = String(req.body?.txnid || '').trim();
  if (!txnid) return res.status(400).json({ error: 'PayU transaction reference is required.' });
  const { data: attempt, error } = await client.from('payu_billing_attempts')
    .select('*').eq('txnid', txnid).eq('user_id', user.id).maybeSingle();
  if (error) throw Object.assign(new Error('Could not load your PayU attempt.'), { status: 503 });
  if (!attempt) return res.status(404).json({ error: 'PayU attempt was not found for your account.' });
  const result = await verifyRegistration(client, attempt);
  return res.status(200).json(result);
}

function isMandateFinalInactive(status) {
  return ['revoked', 'cancelled', 'cancel_success', 'discarded', 'deleted', 'expired', 'failed'].includes(String(status || '').toLowerCase());
}

async function getStatus(req, res) {
  const client = adminClient();
  const user = await authenticate(client, req);
  let row = await ensureBillingRow(client, user.id);

  // A user may return from hosted checkout before the callback is received or
  // while PayU is still settling. Recheck only recent unresolved registrations.
  const { data: unresolvedRegistrations, error: unresolvedError } = await client.from('payu_billing_attempts')
    .select('*').eq('user_id', user.id).eq('transaction_type', 'mandate_registration')
    .in('status', ['created', 'pending', 'not_found']).order('created_at', { ascending: false }).limit(3);
  if (unresolvedError) throw Object.assign(new Error('Could not check pending PayU authorisations.'), { status: 503 });
  for (const attempt of unresolvedRegistrations || []) {
    const ageMs = Date.now() - new Date(attempt.created_at || 0).getTime();
    if (ageMs < 15000) continue;
    try { await verifyRegistration(client, attempt); }
    catch (error) { console.warn('PayU authorisation refresh deferred:', String(error?.message || error).slice(0, 200)); }
  }

  // Refresh mandate state from PayU. Never treat an accepted revoke request as
  // a completed cancellation until the provider reports an inactive state.
  if (row.payment_provider === 'payu' && row.payu_mihpayid && row.payu_payment_mode) {
    try {
      const mandate = await checkPayuMandate(row.payu_mihpayid, row.payu_payment_mode);
      const status = String(mandate.status || '').toLowerCase();
      const updates = { updated_at: new Date().toISOString() };
      if (row.cancel_at_cycle_end) {
        if (isMandateFinalInactive(status)) updates.payu_mandate_status = status;
        else updates.payu_mandate_status = 'cancel_pending';
      } else if (mandate.active) {
        updates.payu_mandate_status = 'active';
      } else if (isMandateFinalInactive(status)) {
        updates.payu_mandate_status = status;
        updates.status = 'cancelled';
        updates.next_charge_at = null;
      }
      if (Object.keys(updates).length > 1) {
        const { error } = await client.from('billing_subscriptions').update(updates).eq('user_id', user.id);
        if (!error) row = { ...row, ...updates };
      }
    } catch (error) {
      console.warn('PayU mandate status refresh deferred:', String(error?.message || error).slice(0, 200));
    }
  }

  const [legacyResult, payuResult] = await Promise.all([
    client.from('billing_payments').select('razorpay_payment_id,amount,currency,status,transaction_type,method,paid_at,created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    client.from('payu_billing_attempts').select('txnid,amount,currency,status,transaction_type,mihpayid,payment_mode,paid_at,created_at,failure_reason')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
  ]);
  if (legacyResult.error) throw Object.assign(new Error('Could not load historical payment history.'), { status: 503 });
  if (payuResult.error) throw Object.assign(new Error('Could not load PayU payment history. Run the PayU billing SQL migration.'), { status: 503 });
  const legacyPayments = (legacyResult.data || []).map(payment => ({
    payment_id: payment.razorpay_payment_id,
    amount: Number(payment.amount || 0),
    currency: payment.currency || 'INR',
    status: payment.status,
    transaction_type: payment.transaction_type,
    method: payment.method,
    paid_at: payment.paid_at,
    created_at: payment.created_at,
    provider: 'legacy'
  }));
  const payuPayments = (payuResult.data || []).map(payment => ({
    payment_id: payment.mihpayid || payment.txnid,
    amount: Math.round(Number(payment.amount || 0) * 100),
    currency: payment.currency || 'INR',
    status: payment.status,
    transaction_type: payment.transaction_type === 'mandate_registration' ? 'authorization' : 'recurring',
    method: payment.payment_mode,
    paid_at: payment.paid_at,
    created_at: payment.created_at,
    provider: 'PayU',
    failure_reason: payment.failure_reason
  }));
  const payments = [...legacyPayments, ...payuPayments]
    .sort((a, b) => new Date(b.created_at || b.paid_at || 0) - new Date(a.created_at || a.paid_at || 0))
    .slice(0, 20);
  const entitlement = getEntitlement(row);
  return res.status(200).json({
    subscription: {
      status: row.status,
      provider: row.payment_provider || (row.razorpay_subscription_id ? 'legacy' : null),
      trialStartedAt: row.trial_started_at,
      trialEndsAt: row.trial_ends_at,
      payuMandateId: row.payu_mihpayid,
      payuMandateStatus: row.payu_mandate_status,
      payuPaymentMode: row.payu_payment_mode,
      payuLastError: row.payu_last_error,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      scheduledStartAt: row.scheduled_start_at,
      nextChargeAt: row.next_charge_at,
      cancelAtCycleEnd: Boolean(row.cancel_at_cycle_end),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    },
    entitlement,
    payments,
    plan: { name: 'HackTheta Premium', amount: 3000, currency: 'INR', interval: 'monthly', trialDays: 7, provider: 'PayU' }
  });
}

async function cancelSubscription(req, res) {
  const client = adminClient();
  const user = await authenticate(client, req);
  const row = await ensureBillingRow(client, user.id);
  if (row.payment_provider !== 'payu' || !row.payu_mihpayid) {
    return res.status(400).json({ error: 'There is no active PayU mandate to cancel. Legacy provider records are kept for reference and cannot be cancelled through PayU.' });
  }
  if (row.payu_mandate_status !== 'active') {
    return res.status(409).json({ error: `PayU mandate status is ${row.payu_mandate_status || 'unknown'}; refresh billing status or contact support before proceeding.` });
  }
  const commandResponse = await callPayuMandateRevoke(row.payu_mihpayid, row.payu_payment_mode);
  if (Number(commandResponse?.status) !== 1) {
    return res.status(502).json({ error: commandResponse?.message || 'PayU did not accept the mandate cancellation request.' });
  }
  let mandateStatus = 'cancel_pending';
  try {
    const mandate = await checkPayuMandate(row.payu_mihpayid, row.payu_payment_mode);
    if (isMandateFinalInactive(mandate.status)) mandateStatus = mandate.status;
  } catch (error) {
    console.warn('PayU cancellation status pending:', String(error?.message || error).slice(0, 200));
  }
  const { error } = await client.from('billing_subscriptions').update({
    status: 'cancelled',
    payu_mandate_status: mandateStatus,
    cancel_at_cycle_end: true,
    next_charge_at: null,
    payu_predebit_for: null,
    payu_predebit_sent_at: null,
    payu_last_error: mandateStatus === 'cancel_pending' ? 'PayU accepted the cancellation request; waiting for the provider to confirm the mandate is inactive.' : null,
    updated_at: new Date().toISOString()
  }).eq('user_id', user.id);
  if (error) throw Object.assign(new Error('PayU accepted cancellation, but the local billing record could not be updated. Refresh billing status.'), { status: 503 });
  return res.status(200).json({
    cancelled: mandateStatus !== 'cancel_pending',
    cancellationPending: mandateStatus === 'cancel_pending',
    status: 'cancelled',
    mandateStatus,
    currentPeriodEnd: row.current_period_end || row.trial_ends_at
  });
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
