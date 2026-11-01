# HackVerse

A mobile-first hackathon discovery MVP built with HTML, CSS, JavaScript, Firebase Authentication, Firestore, Firebase Hosting, and Cloud Functions.

## What's included
- Responsive dark-first HackVerse discovery interface.
- Search, mode/track filters, sorting, sample event cards, official-site links.
- Firebase Google sign-in and email/password sign-up/sign-in.
- Email verification and password reset.
- User-scoped saved-event shortlist.
- Firestore security rules and index.
- Scheduled RSS ingestion scaffold (every 6 hours) with admin-only manual refresh.
- Product, architecture, schema, ingestion, moderation, AI guardrails, deployment, and testing docs.

## Important
The three events in the UI are **sample/demo records**, not real opportunities. They are labelled as sample listings and use example.com links. No external source has been connected by default. Social-media ingestion is intentionally not implemented as scraping. Use official APIs, approved integrations, public RSS, or explicit user-authorized connections only.

## Run locally
1. Install Node.js 20+ and Firebase CLI: `npm install -g firebase-tools`.
2. Create a Firebase project and register a Web app.
3. Copy `public/firebase-config.js` and replace every `YOUR_...` value with your Web app config.
4. In Firebase Console enable Authentication → Google and Email/Password.
5. Create Firestore in production mode.
6. From this folder run `firebase login`, then `firebase use --add` and select your project.
7. `firebase emulators:start` (optional) or `firebase hosting:channel:deploy preview`.
8. Deploy with `firebase deploy`.

## Cloud Functions
`cd functions && npm install`, then configure permitted public RSS feed URLs:
`firebase functions:config:set` is deprecated; use the parameter prompt or set `HACKVERSE_RSS_FEEDS` during deployment as documented in `docs/DEPLOYMENT.md`.
Deploy with `firebase deploy --only functions`.

## Before public launch
- Replace demo events and example URLs.
- Set admin claims/roles through a trusted server-side process. Never let users self-assign `role`.
- Complete privacy policy, terms, consent, deletion/export flows, moderation UI, abuse controls, App Check, monitoring, backups, and source/API legal review.
- Add real event detail pages and organizer/team workflows.
- Review and test Firestore rules with the Emulator Suite.
