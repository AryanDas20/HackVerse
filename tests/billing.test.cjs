const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { getEntitlement, verifyHexHmac, toIsoFromUnix } = require('../lib/billing');

const fixedNow = Date.parse('2026-11-23T10:00:00.000Z');

test('a new account with a future trial end is entitled during the trial', () => {
  const result = getEntitlement({ status: 'trialing', trial_ends_at: '2026-11-30T10:00:00.000Z' }, fixedNow);
  assert.deepEqual(result, { allowed: true, source: 'trial', endsAt: '2026-11-30T10:00:00.000Z' });
});

test('an expired trial without a paid period is not entitled', () => {
  const result = getEntitlement({ status: 'expired', trial_ends_at: '2026-11-20T10:00:00.000Z' }, fixedNow);
  assert.equal(result.allowed, false);
});

test('an active recurring period grants access through its confirmed end date', () => {
  const result = getEntitlement({ status: 'active', current_period_end: '2026-12-23T10:00:00.000Z' }, fixedNow);
  assert.equal(result.allowed, true);
  assert.equal(result.source, 'subscription');
});

test('a cancelled subscription remains entitled until its confirmed paid-through date', () => {
  const result = getEntitlement({ status: 'cancelled', current_period_end: '2026-11-24T10:00:00.000Z' }, fixedNow);
  assert.equal(result.allowed, true);
});

test('a cancelled subscription is not entitled after its paid-through date', () => {
  const result = getEntitlement({ status: 'cancelled', current_period_end: '2026-11-22T10:00:00.000Z' }, fixedNow);
  assert.equal(result.allowed, false);
});

test('Razorpay signatures use constant-time comparison against HMAC-SHA256', () => {
  const secret = 'billing-test-secret';
  const message = 'pay_example|sub_example';
  const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');
  assert.equal(verifyHexHmac(message, secret, signature), true);
  assert.equal(verifyHexHmac(message, secret, '0'.repeat(64)), false);
  assert.equal(verifyHexHmac(message, '', signature), false);
});

test('Unix seconds convert to ISO timestamps', () => {
  assert.equal(toIsoFromUnix(1795428000), new Date(1795428000 * 1000).toISOString());
  assert.equal(toIsoFromUnix(0), null);
});
