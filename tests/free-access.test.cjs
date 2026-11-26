const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('public/index.html');
const app = read('public/app.js');
const agent37 = read('api/agent37/chat.js');
const pitchArena = read('lib/pitch-arena.js');
const vercel = read('vercel.json');

test('the website has no billing page, payment navigation, or checkout UI', () => {
  assert.doesNotMatch(html, /billingPage|Billing & subscription|PayU|Razorpay|₹\s*30|subscription status|payment history/i);
  assert.doesNotMatch(app, /billingData|billingLoaded|billingRequest|startBillingCheckout|cancelBillingSubscription|\/api\/billing\//);
  assert.doesNotMatch(app, /"billing"/);
});

test('AI and Career routes have no trial or paid-plan frontend redirect', () => {
  assert.doesNotMatch(app, /billingLoaded|entitlement\?\.allowed|navigateToRoute\("billing"/);
  assert.match(app, /if \(view === "career"\) initCareerWorkspace\(\)/);
  assert.match(app, /if \(view === "pitch-arena"\) window\.dispatchEvent/);
});

test('Agent37 AI and AI Pitch Arena require sign-in but not a payment entitlement', () => {
  assert.match(agent37, /client\.auth\.getUser\(idToken\)/);
  assert.doesNotMatch(agent37, /billing_subscriptions|getEntitlement|trial_ends_at|current_period_end|status\(402\)/);
  assert.match(pitchArena, /client\.auth\.getUser\(token\)/);
  assert.match(pitchArena, /ownerUid\s*!==\s*uid/);
  assert.doesNotMatch(pitchArena, /billing_subscriptions|getEntitlement|trial_ends_at|current_period_end|status:\s*402/);
});

test('Vercel no longer schedules payment renewal jobs', () => {
  assert.doesNotMatch(vercel, /payu|razorpay|crons|billing/i);
});
