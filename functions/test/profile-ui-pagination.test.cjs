const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');

test('visibility choices and Builders consent are inside Step 02', () => {
  const stepTwo = html.indexOf('id="profileDiscoveryStep"');
  const stepThree = html.indexOf('03 · Your builder identity');
  const visibilityCards = html.indexOf('name="profileVisibilityChoice"');
  const directoryConsent = html.indexOf('id="profilePublicConsent"');
  const stepFour = html.indexOf('04 · Links and contact privacy');
  assert.ok(stepTwo > 0 && stepTwo < visibilityCards && visibilityCards < stepThree);
  assert.ok(stepTwo < directoryConsent && directoryConsent < stepThree);
  assert.ok(stepFour > stepThree);
  assert.equal((html.match(/id="profileVisibility"/g) || []).length, 1);
});

test('Builders directory has paginated loading instead of the previous 24-profile cap', () => {
  assert.match(app, /const pageSize = 48/);
  assert.match(app, /constraints\.push\(startAfter\(peopleCursor\)\)/);
  assert.match(html, /id="loadMorePeopleBtn"/);
  assert.doesNotMatch(app, /orderBy\("updatedAt", "desc"\), limit\(24\)/);
});

test('profile visibility step is highlighted and accessible typography is increased', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../public/accessibility-v19.css'), 'utf8');
  assert.match(css, /#profileDiscoveryStep > summary[^{]*\{[^}]*border-left/);
  assert.match(css, /\.profile-directory-description \{[^}]*font-size:15px/);
  assert.match(css, /body \{ font-size: 16px; \}/);
  assert.match(css, /small \{ font-size:13px !important; \}/);
});
