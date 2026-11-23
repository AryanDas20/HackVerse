const test = require('node:test');
const assert = require('node:assert/strict');
const billingHandler = require('../api/billing/[action].js');

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; }
  };
}

async function invoke(action, method = 'GET', extra = {}) {
  const req = { method, query: { action }, headers: {}, body: {}, ...extra };
  const res = createResponse();
  await billingHandler(req, res);
  return res;
}

test('billing dynamic route rejects actions outside the allow-list', async () => {
  const response = await invoke('delete-everything');
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: 'Unknown billing action.' });
  assert.equal(response.headers['Cache-Control'], 'no-store, max-age=0');
  assert.equal(response.headers.Vary, 'Authorization');
});

test('billing status route only accepts GET', async () => {
  const response = await invoke('status', 'POST');
  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.body, { error: 'Method not allowed. Use GET.' });
  assert.equal(response.headers.Allow, 'GET');
});

test('billing create, verify and cancel actions only accept POST', async () => {
  for (const action of ['create-subscription', 'verify-subscription', 'cancel-subscription']) {
    const response = await invoke(action, 'GET');
    assert.equal(response.statusCode, 405, `${action} should reject GET`);
    assert.equal(response.headers.Allow, 'POST');
  }
});

test('known billing actions reach the shared handler and fail closed without server configuration', async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await invoke('status', 'GET');
    assert.equal(response.statusCode, 503);
    assert.match(response.body.error, /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    console.error = originalConsoleError;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
