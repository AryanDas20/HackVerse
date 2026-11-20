const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/top-navigation-v19.css'), 'utf8');

test('global navigation is in the top header, with no persistent sidebar shell', () => {
  assert.match(html, /<header class="topbar"[\s\S]*?<nav class="desktop-nav" id="mainNavigation"/);
  assert.doesNotMatch(html, /<aside class="hv-sidebar"/);
  assert.match(html, /id="menuToggle"[^>]*aria-controls="mainNavigation"/);
  assert.match(html, /id="navMoreMenu"/);
});

test('secondary pages and utility controls are grouped in the More dropdown', () => {
  const moreStart = html.indexOf('id="navMoreMenu"');
  const moreEnd = html.indexOf('</div>', html.indexOf('class="nav-menu-utilities"', moreStart));
  const menu = html.slice(moreStart, html.indexOf('</div>\n      </div>\n    </nav>', moreStart));
  for (const route of ['/people', '/aiwish', '/profile', '/saved', '/reports', '/notifications', '/settings']) {
    assert.ok(menu.includes(`href="${route}"`), `More menu should include ${route}`);
  }
  for (const id of ['notificationBell', 'themeToggle', 'authButton', 'navTourBtn']) {
    assert.ok(menu.includes(`id="${id}"`), `More menu should include ${id}`);
  }
});

test('Career Match explains its six placement tools in plain language', () => {
  for (const tab of ['readiness', 'learning', 'interview', 'studio', 'portfolio', 'tracker']) {
    assert.ok(html.includes(`data-career-panel="${tab}"`), `Missing ${tab} panel`);
  }
  for (const summary of [
    'How does Career Match read my PDF',
    'What does Resume Intelligence check?',
    'How does the 14-day Skill Sprint help me?',
    'What can I practise in Interview Lab?',
    'How do the Cover Letter Builder and Bullet Workshop work?',
    'What does the Portfolio Audit score mean?',
    'How should I use the Application Tracker?'
  ]) assert.ok(html.includes(summary), `Missing help text: ${summary}`);
});

test('top navigation has desktop, tablet/mobile and compact-screen responsive rules', () => {
  assert.match(css, /@media\s*\(max-width:\s*1040px\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
  assert.match(css, /\.topbar \.desktop-nav\.mobile-open\s*\{\s*display:\s*flex/s);
});

test('Career Match uses the dedicated peach palette and includes Agent37 Career Copilot', () => {
  const palette = fs.readFileSync(path.join(root, 'public/palette-performance-v20.css'), 'utf8');
  assert.match(html, /palette-performance-v20\.css/);
  assert.match(html, /career-copilot/);
  assert.match(html, /data-career-agent-prompt=/);
  for (const color of ['#ffdbbb', '#ccbeb1', '#997e67']) assert.ok(palette.includes(color), `Missing Career Match palette color ${color}`);
  for (const color of ['#6f8f7b', '#afc8b4', '#f4ebdd', '#d8c7a6', '#3e5f4d']) assert.ok(palette.includes(color), `Missing site palette color ${color}`);
});

test('Career Match includes responsive layout and reduced-motion performance safeguards', () => {
  const palette = fs.readFileSync(path.join(root, 'public/palette-performance-v20.css'), 'utf8');
  assert.match(palette, /prefers-reduced-motion/);
  assert.match(palette, /content-visibility:auto/);
  assert.match(palette, /@media\(max-width:720px\)/);
  assert.match(palette, /settings-grid/);
});

test('community feed exposes clickable voter lists backed by a profile-safe API action', () => {
  const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'api/social-v13.js'), 'utf8');
  assert.match(app, /data-voter-list/);
  assert.match(app, /data-voter-profile/);
  assert.match(api, /action === "voter-list"/);
  assert.match(api, /from\("profiles"\)\.select\("id,username,display_name,avatar_url"\)/);
});
