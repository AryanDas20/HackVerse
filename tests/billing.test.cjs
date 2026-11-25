const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getEntitlement,
  sha512,
  safeEqualHex,
  buildPayUConsentHash,
  verifyPayUResponseHash,
  getPayuMandateStatusCommand,
  addUtcMonths
} = require('../lib/billing');

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

test('a past-due subscription is entitled only through its verified current period', () => {
  const active = getEntitlement({ status: 'past_due', current_period_end: '2026-11-24T10:00:00.000Z' }, fixedNow);
  const expired = getEntitlement({ status: 'past_due', current_period_end: '2026-11-22T10:00:00.000Z' }, fixedNow);
  assert.equal(active.allowed, true);
  assert.equal(expired.allowed, false);
});

test('PayU consent hash is a SHA-512 digest and does not expose the merchant salt', () => {
  const fields = { key: 'test-key', txnid: 'HTTEST123', amount: '30.00', productinfo: 'HackTheta Premium', firstname: 'Aryan', email: 'test@example.com', udf1: 'user-1', udf2: '', udf3: '', udf4: '', udf5: '' };
  const hash = buildPayUConsentHash(fields, '{"billingAmount":"30.00"}', 'test-salt');
  assert.match(hash, /^[a-f0-9]{128}$/);
  assert.notEqual(hash, 'test-salt');
});

test('PayU reverse response hash accepts an exact response and rejects tampering', () => {
  const salt = 'test-salt';
  const response = { status: 'success', udf5: '', udf4: '', udf3: '', udf2: '', udf1: 'user-1', email: 'test@example.com', firstname: 'Aryan', productinfo: 'HackTheta Premium', amount: '2.00', txnid: 'HTTEST123', key: 'test-key' };
  response.hash = sha512([salt, response.status, '', '', '', '', '', response.udf5, response.udf4, response.udf3, response.udf2, response.udf1, response.email, response.firstname, response.productinfo, response.amount, response.txnid, response.key].join('|'));
  assert.equal(verifyPayUResponseHash(response, salt), true);
  assert.equal(verifyPayUResponseHash({ ...response, amount: '30.00' }, salt), false);
});

test('PayU hash comparison is constant-time and rejects malformed values', () => {
  const digest = sha512('billing-test');
  assert.equal(safeEqualHex(digest, digest), true);
  assert.equal(safeEqualHex(digest, '0'.repeat(128)), false);
  assert.equal(safeEqualHex('not-a-hash', digest), false);
});

test('PayU mandate status command is selected by payment mode', () => {
  assert.equal(getPayuMandateStatusCommand('UPI'), 'upi_mandate_status');
  assert.equal(getPayuMandateStatusCommand('CC'), 'check_mandate_status');
  assert.equal(getPayuMandateStatusCommand('NB'), 'NB_mandate_status');
  assert.equal(getPayuMandateStatusCommand('UNKNOWN'), null);
});

test('monthly billing dates clamp to the final day of shorter months', () => {
  assert.equal(addUtcMonths('2026-01-31T00:00:00.000Z', 1).toISOString(), '2026-02-28T00:00:00.000Z');
});
