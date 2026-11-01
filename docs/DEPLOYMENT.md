# Firebase Deployment Guide

## 1. Create Firebase project
Create a project at Firebase Console. Add a Web app and copy its config into `public/firebase-config.js`. Do not commit service account keys or API secrets.

## 2. Enable services
- Authentication → Sign-in method → enable Google and Email/Password.
- Firestore Database → create database.
- Hosting → get started.
- Functions → upgrade to Blaze when deploying scheduled Cloud Functions (billing may apply).
- App Check → configure for Hosting/Functions before public launch.

## 3. Local setup
Install Node.js 20+, then:
```bash
npm install -g firebase-tools
firebase login
firebase use --add
cd functions && npm install && cd ..
firebase emulators:start
```
For a static Hosting-only preview, `firebase hosting:channel:deploy preview`.

## 4. Deploy
```bash
firebase deploy --only firestore:rules,firestore:indexes,hosting
firebase deploy --only functions
```
Configure `HACKVERSE_RSS_FEEDS` using the Firebase Functions parameter prompt on first deployment, or the supported parameter/secret workflow for your environment. Only add feed URLs whose terms allow this use.

## 5. Authorized domains
Authentication → Settings → Authorized domains. Add your production domain and localhost for local testing.

## 6. Admin provisioning
Do not set `role: "admin"` from the browser. Use a trusted operator script with Firebase Admin SDK or custom claims. The sample rules assume a trusted admin role document; harden with custom claims and dedicated admin endpoints before launch.

## 7. Production checklist
- Replace all demo listings and example.com URLs.
- Publish Terms, Privacy, cookie notice, contact/support details.
- Implement account export/deletion and retention cleanup.
- Configure backups, monitoring, error reporting, quotas, billing alerts.
- Enable App Check, abuse throttling, email action templates, MFA policy.
- Test rules with Emulator Suite; verify no cross-user reads/writes.
- Review platform/API terms and legal basis for every connector.
