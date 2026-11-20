const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/feature-art-v21.css'), 'utf8');

const features = [
  ['opportunities', 'opportunities.svg'],
  ['builderFeedPage', 'builds.svg'],
  ['techNewsPage', 'news.svg'],
  ['people', 'builders.svg'],
  ['postsPage', 'posts.svg'],
  ['messages', 'messages.svg'],
  ['profile', 'profile.svg'],
  ['aiWishPage', 'ai-wish.svg'],
  ['notificationsPage', 'notifications.svg'],
  ['settingsPage', 'settings.svg'],
  ['saved', 'saved.svg'],
  ['reportsPage', 'safety.svg'],
];

test('the responsive header has an explicit tablet menu breakpoint and reserves space for the brand', () => {
  assert.match(css, /grid-template-columns:\s*max-content\s+minmax\(0,\s*1fr\)\s+max-content/);
  assert.match(css, /@media\s*\(max-width:\s*1240px\)/);
  assert.match(css, /\.topbar \.desktop-nav\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /\.topbar \.desktop-nav\.mobile-open\s*\{[\s\S]*?display:\s*flex\s*!important/);
  assert.match(css, /@media \(max-width:\s*420px\)[\s\S]*?#authButton\s*\{\s*display:\s*inline-flex\s*!important/);
  assert.match(css, /@media \(max-width:\s*360px\)[\s\S]*?#themeToggle\s*\{\s*display:\s*none\s*!important/);
});

test('each major feature page has a matching local vector thumbnail', () => {
  for (const [feature, asset] of features) {
    const assetPath = path.join(root, 'public/illustrations', asset);
    assert.ok(fs.existsSync(assetPath), `${asset} should exist`);
    assert.match(fs.readFileSync(assetPath, 'utf8'), /<svg\b[\s\S]*<\/svg>/, `${asset} should be an SVG`);
    assert.ok(html.includes(`/illustrations/${asset}`), `${feature} should reference ${asset}`);
  }
});

test('feature thumbnails are decorative, lazy-loaded and decoded asynchronously', () => {
  const matches = [...html.matchAll(/<img class="hv-feature-thumb[^>]*>/g)].map(match => match[0]);
  assert.ok(matches.length >= features.length, `expected at least ${features.length} feature thumbnails`);
  for (const tag of matches) {
    assert.match(tag, /alt=""/);
    assert.match(tag, /aria-hidden="true"/);
    assert.match(tag, /loading="lazy"/);
    assert.match(tag, /decoding="async"/);
  }
});
