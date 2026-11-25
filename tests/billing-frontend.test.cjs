const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

test('Billing & subscription is linked from the More menu and has a real page section', () => {
  assert.match(html, /<div class="nav-more-menu" id="navMoreMenu"[\s\S]*?<a href="\/billing" data-route="billing">Billing & subscription<\/a>/);
  assert.match(html, /<section[^>]*id="billingPage"[^>]*data-view="billing"/);
  for (const id of ['billingRefreshBtn', 'billingSubscribeBtn', 'billingCancelBtn', 'billingHistory', 'billingError', 'billingPhone', 'billingRecurringConsent']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /PayU/);
  assert.doesNotMatch(html, /Razorpay/);
});

test('frontend uses PayU hosted checkout and preserves the billing API actions', () => {
  assert.match(app, /"billing"/);
  assert.match(app, /if \(view === "billing"\) void loadBillingStatus/);
  for (const action of ['create-subscription', 'status', 'cancel-subscription']) {
    assert.ok(app.includes(`/api/billing/${action}`), `missing frontend request for ${action}`);
  }
  assert.match(app, /form\.action = created\.checkoutUrl/);
  assert.match(app, /acceptRecurringConsent: true/);
  assert.doesNotMatch(app, /checkout\.razorpay\.com|window\.Razorpay/);
});
