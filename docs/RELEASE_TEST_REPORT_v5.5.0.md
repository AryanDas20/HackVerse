# HackVerse v5.5.0 release test report

## Automated checks
- `node --check public/app.js` — passed.
- `node --check api/agent37/chat.js` — passed.
- `node --check api/chat-media.js` — passed.
- `npm test --prefix functions` — 21 tests passed.
- `firebase.json` and `firestore.indexes.json` parse as JSON — passed.
- HTMLParser validation — 247 unique static IDs, no duplicate IDs; three runtime-generated IDs are intentionally inserted by the AI/tour/profile UI.
- Direct selector audit — 215 static selectors; all missing static IDs are the three documented runtime-generated elements.
- Guide PDF — generated as A4, 9 pages, rendered for visual inspection.
- ZIP integrity — verified with `unzip -t` for the final release archive.

## Important live-test limitations
- Firestore rules have not been compiled with the Firebase Emulator Suite (Firebase CLI is not installed in this environment) or deployed to the user's project.
- Supabase signed uploads/downloads have not been exercised with the user's Supabase project and credentials; the server/API code was syntax-checked only.
- Agent37 cannot be tested without a personal-agent API key and instance credentials permitted by the user's plan.
- Authentication, group membership, chat reactions, notifications, signed media access and role-based access need two or more real test accounts after deployment.

## Honest capability boundaries
The messenger is WhatsApp-inspired, not an exact WhatsApp replica; it does not implement WhatsApp's end-to-end encryption, voice/video calling, disappearing messages, full multi-device sync or full cloud backup. Pin/archive/star preferences are currently stored per browser. Activity/desktop notifications and sound require the app to be open; there is no background FCM push service in this release. The team matcher is a deterministic skills/roles coverage algorithm rather than a generative AI model. Guide illustrations are mockups rather than production account screenshots.
