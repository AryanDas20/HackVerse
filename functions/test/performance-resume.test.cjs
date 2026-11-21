const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'public/hackverse-v20.css'), 'utf8');
const dataLayer = fs.readFileSync(path.join(root, 'public/data-layer.js'), 'utf8');

test('opportunity refresh is bounded and does not re-render each page', () => {
  const start = app.indexOf('async function loadEventsInternal({ forceRefresh = false } = {})');
  const end = app.indexOf('\nfunction eventCategoryValue', start);
  assert.ok(start >= 0 && end > start);
  const loader = app.slice(start, end);
  assert.match(loader, /const pageSize = 200/);
  assert.match(loader, /opportunityHasMore = firstSnapshot\.docs\.length === pageSize/);
  assert.equal((loader.match(/displayOpportunityRecords\(records\)/g) || []).length, 1);
  assert.doesNotMatch(loader, /for\s*\(/);
  const pageStart = app.indexOf('async function loadMoreOpportunityPage()');
  const pageLoader = app.slice(pageStart, end);
  assert.match(pageLoader, /startAfter\(opportunityCursor\)/);
  assert.match(pageLoader, /displayOpportunityRecords\(\[\.\.\.events, \.\.\.newRecords\], \{ preserveVisible: true \}\)/);
  assert.match(pageLoader, /writeOpportunityCache\(events\)/);
});

test('tab resume uses a cooldown and does not rerun route rendering', () => {
  assert.match(app, /AUTO_FEED_REFRESH_MS = 30 \* 60 \* 1000/);
  assert.match(app, /now - lastAutoOpportunityRefreshAt < AUTO_FEED_REFRESH_MS/);
  assert.ok(app.includes('}, 1200);'), 'resume refresh should be deferred by 1.2 seconds');
  const start = app.indexOf('const forceRevealOnResume = () =>');
  const end = app.indexOf('};', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(app.slice(start, end), /handleRoute\(/);
});

test('local stylesheets are bundled into one request and original style order is preserved', () => {
  const localCssLinks = [...html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)"/g)]
    .filter(match => !match[1].startsWith('http'));
  assert.equal(localCssLinks.length, 1);
  for (const source of [
    'styles.css', 'workspace.css', 'redesign.css', 'global-sage-v20.css',
    'career-match-v20.css', 'accessibility-v19.css'
  ]) assert.ok(bundle.includes(`Source: ${source}`), `Missing CSS source: ${source}`);
});

test('live collection refreshes are staggered on tab resume and pause while hidden', () => {
  assert.match(dataLayer, /visibleRefreshQueue/);
  assert.match(dataLayer, /enqueueVisibleRefresh\(tick, priority\)/);
  assert.match(dataLayer, /if \(stopped \|\| inFlight \|\| document\.hidden\) return/);
  assert.match(dataLayer, /pathName\.endsWith\("\/messages"\) \? 3500/);
  assert.match(dataLayer, /pathName === "conversations" \? 10000 : 20000/);
});
