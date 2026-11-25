const { adminClient, payuConfig, verifyPayUResponseHash } = require('../lib/billing');
const { verifyRegistration, updateAttempt } = require('../lib/payu-billing');

function parseBody(body) {
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') return Object.fromEntries(new URLSearchParams(body));
  return {};
}

function redirect(res, state) {
  res.statusCode = 303;
  res.setHeader('Location', `/billing?payu=${encodeURIComponent(state)}`);
  return res.end();
}

module.exports = async function payuCallback(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'PayU callback accepts POST only.' });
  }
  try {
    const payload = parseBody(req.body);
    const txnid = String(payload.txnid || '').trim();
    const config = payuConfig();
    if (!txnid || String(payload.key || '') !== config.key || !verifyPayUResponseHash(payload, config.salt)) {
      return redirect(res, 'verification-failed');
    }
    const client = adminClient();
    const { data: attempt, error } = await client.from('payu_billing_attempts').select('*').eq('txnid', txnid).maybeSingle();
    if (error || !attempt || String(payload.udf1 || '') !== String(attempt.user_id)) {
      return redirect(res, 'verification-failed');
    }
    if (attempt.status === 'captured') return redirect(res, 'success');
    if (String(payload.status || '').toLowerCase() !== 'success') {
      await updateAttempt(client, txnid, {
        status: String(payload.status || 'failed').toLowerCase(),
        mihpayid: String(payload.mihpayid || '') || null,
        payment_mode: String(payload.mode || '') || null,
        failure_reason: String(payload.field9 || payload.error_Message || 'PayU returned an unsuccessful authorisation.').slice(0, 400)
      });
      return redirect(res, 'failed');
    }
    const result = await verifyRegistration(client, attempt);
    if (!result.verified) return redirect(res, result.status || 'pending');
    return redirect(res, 'success');
  } catch (error) {
    console.error('PayU callback processing failed:', String(error?.message || error).slice(0, 500));
    return redirect(res, 'pending');
  }
};
