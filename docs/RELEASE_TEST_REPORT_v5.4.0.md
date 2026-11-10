# HackVerse v5.4.0 release checks

## Automated checks completed

- `node --check public/app.js` — passed.
- `node --check api/agent37/chat.js` — passed.
- JSON parsing for `package.json`, `vercel.json`, `firebase.json` and `firestore.indexes.json` — passed.
- Python HTML parser — passed; no duplicate HTML IDs found.
- CSS and Firestore rules brace-balance checks — passed.
- Existing Functions test suite (`npm test --prefix functions`) — 21 tests passed, 0 failed.
- Public asset scan for `AGENT37_API_KEY`, `sk_live_`, `FIREBASE_SERVICE_ACCOUNT_JSON` and private-key markers — no server credentials found in `public/`.
- ZIP integrity is checked when the release archive is created.

## Not tested against live services

This environment did not have access to the owner's Vercel environment variables, Agent37 personal agent credentials, Firebase service-account key, or production Firestore project. Consequently these items are **not** represented as end-to-end tested:

- Agent37 authentication, agent wake-up, model availability, usage and response latency.
- Firebase Admin verification against a real user's ID token.
- Firestore Rules compilation and emulator tests.
- Vercel deployment and function invocation.
- Sign-in/sign-out behaviour and event privacy using separate real Firebase accounts.
- Persisted AI history, rate limiting and action execution against the live Firestore database.

Complete the manual test checklist in `docs/AGENT37_AI_SETUP.md` before enabling the feature for public users. The Firestore rules and index files must be reviewed against the live project's existing configuration before deployment.
