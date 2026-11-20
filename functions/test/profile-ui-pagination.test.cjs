const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');

test('public/private profile visibility choices are inside Step 02 without separate directory consent', () => {
  const stepTwo = html.indexOf('id="profileDiscoveryStep"');
  const stepThree = html.indexOf('03 · Your builder identity');
  const visibilityCards = html.indexOf('name="profileVisibilityChoice"');
  const stepFour = html.indexOf('04 · Links and contact privacy');
  assert.ok(stepTwo > 0 && stepTwo < visibilityCards && visibilityCards < stepThree);
  assert.match(html, /value="public"/);
  assert.match(html, /value="private"/);
  assert.doesNotMatch(html, /id="profilePublicConsent"/);
  const visibilityStep = html.slice(stepTwo, stepThree);
  assert.doesNotMatch(visibilityStep, /value="followers"/);
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

test('Tech News is available as a main tab with topic filters, saved stories and search', () => {
  assert.match(html, /href="\/news" data-route="news">Tech News<\/a>/);
  assert.match(html, /id="techNewsPage" data-view="news"/);
  for (const filter of ['all', 'ai', 'developer', 'security', 'startup', 'opensource', 'hardware', 'saved']) {
    assert.match(html, new RegExp(`data-news-filter="${filter}"`));
  }
  assert.match(html, /id="newsSearch"/);
  assert.match(html, /id="newsSort"/);
  assert.match(app, /hackverse-news-saved-items/);
});

test('news and opportunity shares support external destinations, HackVerse chat and branded card images', () => {
  assert.match(app, /https:\/\/wa\.me/);
  assert.match(app, /https:\/\/t\.me\/share\/url/);
  assert.match(app, /linkedin\.com\/sharing\/share-offsite/);
  assert.match(app, /twitter\.com\/intent\/tweet/);
  assert.match(app, /data-share-branded-card/);
  assert.match(app, /async function shareBrandedCard/);
  assert.match(app, /openShareMenu\(shareItem\)/);
  assert.match(app, /HACKVERSE/);
});

test('profile form has live completion progress and public/private is its only visibility choice', () => {
  assert.match(html, /id="profileProgressTrack"/);
  assert.match(html, /id="profileProgressBar"/);
  assert.match(html, /id="profileCompletionValue"/);
  assert.match(html, /id="profileProgressLabel"/);
  assert.doesNotMatch(html, /Who can discover your profile\?/);
  assert.doesNotMatch(html, /Followers-only/);
  assert.doesNotMatch(html, /Show my builder profile in the public Builders directory/);
  const profileVisibilityChoices = [...html.matchAll(/name="profileVisibilityChoice"/g)];
  assert.equal(profileVisibilityChoices.length, 2);
  assert.match(app, /function updateProfileFormProgress/);
  assert.match(app, /profileConsentAt: publicProfile\?\.profileConsentAt/);
});
