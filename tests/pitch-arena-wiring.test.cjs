const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('public/index.html');
const app = read('public/app.js');
const client = read('public/pitch-arena.js');
const api = read('lib/pitch-arena.js');
const apiDispatcher = read('api/agent37/chat.js');
const sql = read('supabase-pitch-arena.sql');
const guide = read('PITCH_ARENA_SETUP.md');
const vercel = read('vercel.json');

test('AI Pitch Arena is registered as an authenticated HackVerse route', () => {
  assert.match(app, /APP_ROUTE_NAMES\s*=\s*new Set\([^)]*pitch-arena/);
  assert.match(app, /"pitch-arena"\s*:\s*"AI Pitch Arena"/);
  assert.match(app, /hackverse:pitch-arena:route/);
  assert.match(html, /data-route="pitch-arena"/);
  assert.match(html, /data-view="pitch-arena"/);
  assert.match(html, /src="pitch-arena\.js"/);
});

test('interview UI includes voice, local camera preview, controls and printable report', () => {
  for (const id of ['paRoom', 'paJudgeScreen', 'paCameraPreview', 'paMicToggle', 'paCameraToggle', 'paSpeakerToggle', 'paSpeakerVolume', 'paCaptionToggle', 'paPitchTimer', 'paAnswerForm', 'paClarifyBtn', 'paReport', 'paPrintReport', 'paReadinessStrip', 'paReadinessValue', 'paReadinessGrade', 'paReadinessChange', 'paCategoryProgress']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(client, /SpeechRecognition\s*\|\|\s*window\.webkitSpeechRecognition/);
  assert.match(client, /getUserMedia/);
  assert.match(client, /speechSynthesis/);
  assert.match(client, /window\.print\(\)/);
});

test('API enforces signed-in ownership and server-side Agent37 calls', () => {
  assert.match(api, /client\.auth\.getUser\(token\)/);
  assert.doesNotMatch(api, /billing_subscriptions|getEntitlement|trial_ends_at|current_period_end/);
  assert.match(apiDispatcher, /action=pitch-arena/);
  assert.match(apiDispatcher, /require\('..\/..\/lib\/pitch-arena'\)/);
  assert.match(vercel, /\/api\/pitch-arena/);
  assert.match(vercel, /\/api\/agent37\/chat\?action=pitch-arena/);
  assert.match(api, /ownerUid\s*!==\s*uid/);
  assert.match(api, /process\.env\.AGENT37_API_KEY/);
  assert.match(api, /X-Agent37-Key/);
  assert.match(api, /\/v1\/responses/);
  assert.doesNotMatch(client, /AGENT37_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test('archive processing is bounded and rejects path traversal without executing code', () => {
  assert.match(api, /function normalizeZipEntry/);
  assert.match(api, /part === '\.\.'/);
  assert.match(api, /entries\.length > 120/);
  assert.match(api, /MAX_TOTAL_FILE_BYTES = 30 \* 1024 \* 1024/);
  assert.match(api, /actualTotal > MAX_TOTAL_FILE_BYTES/);
  assert.match(api, /segments\.length !== 3/);
  assert.match(api, /10 \* 1024 \* 1024/);
  assert.match(api, /maxOutputLength:\s*2 \* 1024 \* 1024/);
  assert.match(api, /function isIgnoredPath/);
  assert.match(api, /node_modules/);
  assert.doesNotMatch(api, /child_process|execFile\(|spawn\(|eval\(/);
});

test('score rubric uses fixed category maxima and calculates total from bounded marks', () => {
  const rubric = api.match(/const RUBRIC = \[([\s\S]*?)\n\];/);
  assert.ok(rubric, 'rubric must exist');
  const maxima = [...rubric[1].matchAll(/\['[^']+',\s*'[^']+',\s*(\d+)\]/g)].map(match => Number(match[1]));
  assert.deepEqual(maxima, [10, 10, 15, 15, 10, 10, 15, 5, 10]);
  assert.equal(maxima.reduce((sum, value) => sum + value, 0), 100);
  assert.match(api, /const totalScore = RUBRIC\.reduce\(\(sum, \[key\]\) => sum \+ categoryScores\[key\]\.score, 0\)/);
});

test('private Supabase Storage migration and setup guide are included', () => {
  assert.match(sql, /'pitch-arena-private'/);
  assert.match(sql, /public\s*=\s*false/);
  assert.match(sql, /auth\.uid\(\)::text/);
  assert.match(guide, /PITCH_ARENA_SETUP|Supabase setup/);
  assert.match(guide, /turn-based/);
  assert.match(guide, /No new AI provider credentials/);
});
