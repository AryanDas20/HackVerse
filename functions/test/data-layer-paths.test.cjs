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
