# Firebase deployment guide

**Firebase Cloud Storage is not part of this project.** Do not create a Storage bucket or run Storage deployment commands. The app uses Firebase Authentication, Cloud Firestore, and Cloud Functions only; image/avatar fields are URLs and this starter does not upload binary files.

1. Create a Firebase project and add a Web app.
2. Paste the Web app config into `public/firebase-config.js`.
3. Enable Google and Email/Password in Authentication.
4. Add localhost and your deployed hostname to Authentication authorized domains.
5. Create Cloud Firestore in Production mode.
6. From the project root, run `firebase login` and `firebase use --add`.
7. Deploy Hosting, rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes,hosting`. If Vercel hosts the frontend, deploy only `firestore:rules,firestore:indexes` here and deploy the frontend via Vercel.
8. For automatic discovery, enable the Firebase Blaze plan, review billing, and set budget alerts. From the root run `cd functions && npm install && cd .. && firebase deploy --only functions`. Optionally create `functions/.env.<project-id>` from `.env.example` to enable YouTube Data API discovery.
9. Assign your trusted account the admin custom claim using `functions/scripts/set-admin.js` (instructions in README.md). Sign out and sign in again.
10. Add approved public RSS/Atom feeds in the Admin Control Center, click **Run discovery now**, and inspect the source-attributed listings. The scheduled job repeats every six hours.

## Important limits

This release implements automatic RSS/Atom discovery only. Social networks are not automatically searchable without their official APIs, provider approval, credentials and specific adapters. No website scraping or unofficial social bots are used. RSS text parsing is heuristic: deadlines and tags can be missed, and source attribution is not independent verification.

## Test before launch

- Verify the admin panel is hidden for non-admin accounts.
- Add a permitted feed and run discovery manually.
- Confirm only relevant hackathon announcements are published and duplicates reuse the same event.
- Confirm event cards link to the original source.
- Confirm expired deadlines are hidden.
- Check `ingestionRuns` and source last-run/error fields.
- Test with two non-admin accounts and ensure they cannot write source registry or event documents.
- Configure Firebase App Check, abuse controls, monitoring, backups, Terms and Privacy Policy before inviting public users.
