# HackVerse messaging and floating AI hotfix (v10)

## Root cause fixed

The browser data layer did not preserve a parent document path when creating a nested collection reference. The chat sender calls `collection(conversationRef, "messages")`, but the old helper dropped the conversation path and generated an invalid message collection path. Nested document references are now resolved relative to their parent, including typing-state documents.

## Messaging improvements

- Correct nested paths for `conversations/{conversationId}/messages` and nested documents.
- Added regression tests for conversation messages, message documents, typing documents, and AI message collections.
- Confirmed sent messages render immediately after the database confirms the insert; the polling listener reconciles the result with the saved snapshot.
- Prevented duplicate submissions while a message is sending.
- Preserve the draft if a message insert fails, show a clear failure message, and distinguish a successful message insert from a secondary conversation-preview update failure.
- Added Enter-to-send and Shift+Enter for a new line.
- Attachment sends now report success only when the message record was saved.

## Floating AI responsive improvements

- Floating AI panel uses viewport-safe fixed positioning and a narrower desktop width.
- On phones, chat history becomes a horizontal strip and the conversation remains a single-column layout.
- The message area scrolls independently while the composer stays available.
- Short-height and landscape devices no longer inherit a 360px minimum panel height that can exceed the visible viewport.
- Added safe-area spacing for devices with display cutouts and home indicators.

## Validation

- `public/app.js`, `public/data-layer.js`, and `api/agent37/chat.js` passed JavaScript syntax checks.
- All public CSS files parsed successfully with PostCSS.
- All 44 automated tests passed, including four new nested-reference regression tests.
- Live authenticated Supabase message sending and live Agent37 inference were not testable from this offline source-editing environment. Deploy the ZIP and verify with two signed-in test accounts on desktop and mobile.
