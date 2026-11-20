const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');

test('Step 02 offers only a simple Public / Private choice (no separate directory consent)', () => {
  const stepTwo = html.indexOf('id="profileDiscoveryStep"');
  const stepThree = html.indexOf('Your builder identity');
  const choices = html.indexOf('name="profileVisibilityChoice"');
  assert.ok(stepTwo > 0 && stepTwo < choices && choices < stepThree);
  assert.equal((html.match(/name="profileVisibilityChoice"/g) || []).length, 2);
  assert.match(html, /value="public"/);
  assert.doesNotMatch(html, /profilePublicConsent/);
  assert.doesNotMatch(html, /Followers-only/);
  assert.doesNotMatch(html, /Who can discover your profile/);
  assert.equal((html.match(/id="profileVisibility"/g) || []).length, 1);
});

test('Builders directory has paginated loading instead of the previous 24-profile cap', () => {
  assert.match(app, /const pageSize = 48/);
  assert.match(app, /constraints\.push\(startAfter\(peopleCursor\)\)/);
  assert.match(html, /id="loadMorePeopleBtn"/);
  assert.doesNotMatch(app, /orderBy\("updatedAt", "desc"\), limit\(24\)/);
});

test('animated profile form styles and accessible typography are present', () => {
  const base = fs.readFileSync(path.join(__dirname, '../../public/accessibility-v19.css'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../../public/profile-form-v20.css'), 'utf8');
  assert.match(css, /\.pf-vis-card\.is-selected/);
  assert.match(css, /@keyframes pfRise/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(base, /body \{ font-size: 16px; \}/);
  assert.match(base, /small \{ font-size:13px !important; \}/);
});

test('saving a public profile never requires a second consent step', () => {
  assert.match(app, /const consent = visibility === "public";/);
  assert.doesNotMatch(app, /profilePublicConsent/);
});
