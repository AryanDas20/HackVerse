const crypto = require('node:crypto');

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error('Billing is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel.'), { status: 503 });
  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticate(client, req) {
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw Object.assign(new Error('Sign in to manage your subscription.'), { status: 401 });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw Object.assign(new Error('Your sign-in session has expired. Sign in again.'), { status: 401 });
  return data.user;
}

async function ensureBillingRow(client, userId) {
  let { data, error } = await client.from('billing_subscriptions').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw Object.assign(new Error('Could not read billing status. Run the HackTheta billing SQL migration in Supabase.'), { status: 503 });
  if (data) return data;
  const inserted = await client.from('billing_subscriptions').upsert({ user_id: userId, status: 'expired' }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (inserted.error) throw Object.assign(new Error('Could not initialise billing status. Run the HackTheta billing SQL migration in Supabase.'), { status: 503 });
  ({ data, error } = await client.from('billing_subscriptions').select('*').eq('user_id', userId).single());
  if (error || !data) throw Object.assign(new Error('Could not initialise billing status.'), { status: 503 });
  return data;
}

function getEntitlement(row, now = Date.now()) {
  const trialEnd = row?.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
  const trialActive = Number.isFinite(trialEnd) && trialEnd > now;
  if (trialActive) return { allowed: true, source: 'trial', endsAt: row.trial_ends_at };

  const periodEnd = row?.current_period_end ? new Date(row.current_period_end).getTime() : 0;
  const paidPeriodStatus = ['active', 'pending', 'halted', 'paused', 'cancelled', 'completed', 'past_due'].includes(row?.status);
  if (paidPeriodStatus && Number.isFinite(periodEnd) && periodEnd > now) {
    return { allowed: true, source: 'subscription', endsAt: row.current_period_end };
  }
  return { allowed: false, source: 'none', endsAt: null };
}

function payuConfig() {
  const key = process.env.PAYU_MERCHANT_KEY || process.env.PAYU_KEY;
  const salt = process.env.PAYU_MERCHANT_SALT || process.env.PAYU_SALT;
  const mode = String(process.env.PAYU_MODE || 'test').trim().toLowerCase();
  if (!['test', 'production', 'live'].includes(mode)) throw Object.assign(new Error('PAYU_MODE must be test or production.'), { status: 503 });
  if (!key || !salt) throw Object.assign(new Error('PayU is not configured. Add PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT to Vercel.'), { status: 503 });
  const production = mode === 'production' || mode === 'live';
  return {
    key,
    salt,
    mode: production ? 'production' : 'test',
    checkoutUrl: production ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment',
    commandUrl: production ? 'https://info.payu.in/merchant/postservice.php?form=2' : 'https://test.payu.in/merchant/postservice.php?form=2'
  };
}

function sha512(value) {
  return crypto.createHash('sha512').update(String(value), 'utf8').digest('hex');
}

function safeEqualHex(left, right) {
  if (!left || !right || !/^[a-f0-9]{128}$/i.test(String(left)) || !/^[a-f0-9]{128}$/i.test(String(right))) return false;
  const a = Buffer.from(String(left), 'hex');
  const b = Buffer.from(String(right), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function buildPayUConsentHash(fields, siDetails, salt) {
  const parts = [
    fields.key, fields.txnid, fields.amount, fields.productinfo, fields.firstname, fields.email,
    fields.udf1 || '', fields.udf2 || '', fields.udf3 || '', fields.udf4 || '', fields.udf5 || '',
    '', '', '', '', '', String(siDetails), salt
  ];
  return sha512(parts.join('|'));
}

function verifyPayUResponseHash(payload, salt) {
  const status = String(payload?.status || '');
  const fields = [
    status, '', '', '', '', '',
    payload?.udf5 || '', payload?.udf4 || '', payload?.udf3 || '', payload?.udf2 || '', payload?.udf1 || '',
    payload?.email || '', payload?.firstname || '', payload?.productinfo || '', payload?.amount || '',
    payload?.txnid || '', payload?.key || ''
  ];
  const additionalCharges = String(payload?.additionalCharges || payload?.additional_charges || '');
  const input = additionalCharges
    ? [additionalCharges, salt, ...fields].join('|')
    : [salt, ...fields].join('|');
  return safeEqualHex(sha512(input), payload?.hash);
}

async function payuCommand(command, var1) {
  const config = payuConfig();
  const var1String = typeof var1 === 'string' ? var1 : JSON.stringify(var1);
  const hash = sha512(`${config.key}|${command}|${var1String}|${config.salt}`);
  const body = new URLSearchParams({ form: '2', key: config.key, command, var1: var1String, hash });
  const response = await fetch(config.commandUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw Object.assign(new Error('PayU returned an unreadable response. Check the PayU dashboard and integration mode.'), { status: 502 }); }
  if (!response.ok) throw Object.assign(new Error(`PayU returned HTTP ${response.status}.`), { status: 502 });
  return payload;
}

async function verifyPayUTransaction(txnid) {
  const payload = await payuCommand('verify_payment', String(txnid));
  return payload?.transaction_details?.[String(txnid)] || null;
}

function getPayuMandateStatusCommand(mode) {
  const value = String(mode || '').toUpperCase();
  if (value === 'UPI') return 'upi_mandate_status';
  if (value === 'NB' || value === 'ENACH') return 'NB_mandate_status';
  if (['CC', 'DC', 'CREDIT CARD', 'DEBIT CARD'].includes(value)) return 'check_mandate_status';
  return null;
}

async function checkPayuMandate(authPayuId, mode) {
  const command = getPayuMandateStatusCommand(mode);
  if (!command) return { active: false, status: 'unsupported_mode', payload: null };
  const payload = await payuCommand(command, { authPayuId: String(authPayuId), requestId: crypto.randomUUID() });
  const status = String(payload?.status || '').toLowerCase();
  const active = status === 'active' || status === 'success';
  return { active, status: active ? 'active' : status, payload };
}

function getAppBaseUrl(req) {
  const configured = process.env.APP_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (configured) {
    const url = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    return url.replace(/\/+$/, '');
  }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host || /[\s/\\]/.test(host)) throw Object.assign(new Error('Set APP_BASE_URL in Vercel to your public HackTheta website URL.'), { status: 503 });
  return `https://${host}`;
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid billing date.');
  return date.toISOString().slice(0, 10);
}

function addUtcMonths(value, count = 1) {
  const source = new Date(value);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + Number(count), 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

module.exports = {
  adminClient,
  authenticate,
  ensureBillingRow,
  getEntitlement,
  payuConfig,
  sha512,
  safeEqualHex,
  buildPayUConsentHash,
  verifyPayUResponseHash,
  payuCommand,
  verifyPayUTransaction,
  getPayuMandateStatusCommand,
  checkPayuMandate,
  getAppBaseUrl,
  isoDate,
  addUtcMonths
};
