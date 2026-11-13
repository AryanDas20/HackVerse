const test = require('node:test');
const assert = require('node:assert/strict');
const { plainText, safeHttpUrl, parseTags, parseMentions, validatePost, validateReport } = require('../lib/social');

test('plainText strips control characters and enforces a length ceiling', () => {
  assert.equal(plainText('hello\u0000world', 5), 'hello');
});

test('safeHttpUrl accepts HTTP(S) and rejects executable schemes', () => {
  assert.equal(safeHttpUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('not a URL'), null);
});

test('hashtags and mentions are deduplicated and normalized', () => {
  assert.deepEqual(parseTags('#Build #build #HackVerse'), ['build', 'hackverse']);
  assert.deepEqual(parseMentions('@Builder_01 and @builder_01'), ['builder_01']);
});

test('post validation requires text and normalizes visibility', () => {
  assert.throws(() => validatePost({ content: '   ' }), /Write something/);
  const post = validatePost({ content: 'Ship it #HackVerse', visibility: 'followers' });
  assert.equal(post.visibility, 'followers');
  assert.deepEqual(post.hashtags, ['hackverse']);
});

test('post validation rejects a media URL without a media type', () => {
  assert.throws(() => validatePost({ content: 'Demo', mediaUrl: 'https://example.com/image.png' }), /Choose whether/);
});

test('report validation requires useful detail and accepts only safe evidence URLs', () => {
  assert.throws(() => validateReport({ targetType: 'user', details: 'short' }), /at least 10 characters/);
  assert.throws(() => validateReport({ details: 'This is a long enough report', evidenceUrl: 'javascript:alert(1)' }), /Evidence links/);
  const report = validateReport({ targetType: 'site_issue', category: 'technical_issue', details: 'The feed stays blank after sign in.' });
  assert.equal(report.target_type, 'site_issue');
  assert.equal(report.category, 'technical_issue');
});
