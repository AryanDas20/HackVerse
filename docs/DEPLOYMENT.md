# Firebase deployment guide

1. Create a Firebase project and add a Web app.
2. Paste the Web app config into `public/firebase-config.js`.
3. Enable Google and Email/Password in Authentication.
4. Add `localhost` and your deployed hostname to Authentication authorized domains.
5. Create Cloud Firestore in Production mode.
6. Install the Firebase CLI and authenticate:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```

7. Deploy Hosting and database rules:

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,hosting
   ```

8. Test with two separate accounts. Complete each profile, find each other from People, start a direct chat, create a group room, and send messages.
9. Create a public `hackathons` record in Firestore to confirm the event feed. No event records are seeded. If an earlier version wrote demo records to this Firebase project, clean up those specific test documents manually; deploying this code does not delete cloud data.

## Optional RSS functions

Cloud Functions and scheduled jobs require the Firebase Blaze plan. In `functions/`, run `npm install`; then from the project root run `firebase deploy --only functions`. Set `HACKVERSE_RSS_FEEDS` only to approved public RSS feed URLs. RSS candidates are written to `sourceItems` with `visibility: "moderation"`; they are not automatically promoted to public events.

## Admin custom claim

Use a trusted machine with Firebase Admin SDK credentials. From `functions/` run:

```bash
GOOGLE_APPLICATION_CREDENTIALS="/secure/path/service-account.json" node scripts/set-admin.js FIREBASE_AUTH_UID
```

Never commit the service-account file. Ask the target account to sign out and back in so its ID token contains the new claim.
