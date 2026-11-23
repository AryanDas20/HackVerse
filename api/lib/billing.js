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
  // Existing accounts created before the billing migration do not receive a new trial.
  const inserted = await client.from('billing_subscriptions').upsert({ user_id: userId, status: 'expired' }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (inserted.error) throw Object.assign(new Error('Could not initialise billing status. Run the HackTheta billing SQL migration in Supabase.'), { status: 503 });
  ({ data, error } = await client.from('billing_subscriptions').select('*').eq('user_id', userId).single());
  if (error || !data) throw Object.assign(new Error('Could not initialise billing status.'), { status: 503 });
  return data;
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw Object.assign(new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to Vercel.'), { status: 503 });
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.description || payload?.error?.reason || `Razorpay returned HTTP ${response.status}.`;
    throw Object.assign(new Error(detail), { status: response.status >= 500 ? 502 : 400 });
  }
  return payload;
}

function verifyHexHmac(message, secret, signature) {
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(String(signature))) return false;
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  const received = Buffer.from(String(signature), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function getEntitlement(row, now = Date.now()) {
  const trialEnd = row?.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
  const trialActive = Number.isFinite(trialEnd) && trialEnd > now;
  if (trialActive) return { allowed: true, source: 'trial', endsAt: row.trial_ends_at };

  const periodEnd = row?.current_period_end ? new Date(row.current_period_end).getTime() : 0;
  const paidPeriodStatus = ['active', 'pending', 'halted', 'paused', 'cancelled', 'completed'].includes(row?.status);
  if (paidPeriodStatus && Number.isFinite(periodEnd) && periodEnd > now) {
    return { allowed: true, source: 'subscription', endsAt: row.current_period_end };
  }
  return { allowed: false, source: 'none', endsAt: null };
}

function toIsoFromUnix(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? new Date(number * 1000).toISOString() : null;
}

module.exports = { adminClient, authenticate, ensureBillingRow, razorpayRequest, verifyHexHmac, getEntitlement, toIsoFromUnix };
