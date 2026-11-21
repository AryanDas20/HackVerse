const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');

test('Public / Private visibility choices are inside Step 02 without a separate directory consent checkbox', () => {
  const stepTwo = html.indexOf('id="profileDiscoveryStep"');
  const stepThree = html.indexOf('03 · Your builder identity');
  const visibilityCards = html.indexOf('name="profileVisibilityChoice"');
  const stepFour = html.indexOf('04 · Links and contact privacy');
  assert.ok(stepTwo > 0 && stepTwo < visibilityCards && visibilityCards < stepThree);
  assert.ok(stepFour > stepThree);
  assert.equal((html.match(/id="profileVisibility"/g) || []).length, 1);
  assert.doesNotMatch(html, /I agree to appear in the public Builders directory|id="profilePublicConsent"/);
  assert.match(app, /evaluateProfilePublication\(\{ visibility, displayName: name, username \}\)/);
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

test('Career Match is a first-class member route with the career workspace and Agent37 copilot', () => {
  assert.match(html, /href="\/career" data-route="career"/);
  assert.match(html, /id="careerPage" data-view="career"/);
  for (const panel of ['overview','resume','roadmap','sprint','interview','studio','portfolio','applications']) {
    assert.match(html, new RegExp(`data-career-panel="${panel}"`));
  }
  assert.match(app, /function careerAnalyse\(/);
  assert.match(app, /api\/agent37\/chat/);
  assert.match(html, /career-match-v21\.css/);
});
