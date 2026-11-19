const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadReferenceHelpers() {
  const sourcePath = path.join(__dirname, '../../public/data-layer.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const start = source.indexOf('const uuid =');
  const end = source.indexOf('export function where(');
  assert.ok(start >= 0 && end > start, 'reference helper source should exist');
  const snippet = source.slice(start, end).replace(/export function /g, 'function ');
  return new Function(`${snippet}; return { collection, doc };`)();
}

test('root conversation message collection includes the conversation path', () => {
  const { collection, doc } = loadReferenceHelpers();
  const db = {};
  const conversation = doc(db, 'conversations', 'conversation-123');
  const messages = collection(conversation, 'messages');
  assert.equal(messages.path, 'conversations/conversation-123/messages');
});

test('nested message document includes both parent and message ID', () => {
  const { collection, doc } = loadReferenceHelpers();
  const conversation = doc({}, 'conversations', 'conversation-123');
  const message = doc(collection(conversation, 'messages'), 'message-456');
  assert.equal(message.path, 'conversations/conversation-123/messages/message-456');
});

test('nested typing document retains the conversation parent path', () => {
  const { doc } = loadReferenceHelpers();
  const conversation = doc({}, 'conversations', 'conversation-123');
  const typing = doc(conversation, 'typing', 'member-789');
  assert.equal(typing.path, 'conversations/conversation-123/typing/member-789');
});

test('AI conversation message paths remain correct', () => {
  const { collection } = loadReferenceHelpers();
  const messages = collection({}, 'aiConversations', 'ai-123', 'messages');
  assert.equal(messages.path, 'aiConversations/ai-123/messages');
});


function loadQueryMatcher() {
  const sourcePath = path.join(__dirname, '../../public/data-layer.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const start = source.indexOf('function getField(');
  const end = source.indexOf('async function requireSession', start);
  assert.ok(start >= 0 && end > start, 'query matcher source should exist');
  const snippet = source.slice(start, end);
  return new Function(`${snippet}; return { matches };`)();
}

test('query matcher supports Firestore in filters for scoped feed reads', () => {
  const { matches } = loadQueryMatcher();
  const row = { data: { postId: 'post-123' } };
  assert.equal(matches(row, { type: 'where', field: 'postId', op: 'in', value: ['post-001', 'post-123'] }), true);
  assert.equal(matches(row, { type: 'where', field: 'postId', op: 'in', value: ['post-001', 'post-002'] }), false);
  assert.equal(matches(row, { type: 'where', field: 'postId', op: 'in', value: [] }), false);
});


test('transaction helper waits for queued Supabase writes before resolving', async () => {
  const sourcePath = path.join(__dirname, '../../public/data-layer.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const start = source.indexOf('export async function runTransaction(');
  const end = source.indexOf('\nexport function onSnapshot(', start);
  assert.ok(start >= 0 && end > start, 'transaction helper source should exist');
  const snippet = source.slice(start, end).replace('export async function ', 'async function ');
  const writes = [];
  const waitWrite = async (kind, ref) => {
    await new Promise(resolve => setTimeout(resolve, 2));
    writes.push(`${kind}:${ref}`);
  };
  const runTransaction = new Function('getDoc', 'setDoc', 'updateDoc', 'deleteDoc', `${snippet}; return runTransaction;`) (
    async ref => ({ ref }),
    async ref => waitWrite('set', ref),
    async ref => waitWrite('update', ref),
    async ref => waitWrite('delete', ref)
  );
  const result = await runTransaction({}, async tx => {
    await tx.get('users/u1');
    tx.set('users/u1', { displayName: 'A' });
    tx.update('users/u1', { updatedAt: 'now' });
    tx.delete('publicProfiles/u1');
    return 'saved';
  });
  assert.equal(result, 'saved');
  assert.deepEqual(writes.sort(), ['delete:publicProfiles/u1', 'set:users/u1', 'update:users/u1']);
});
