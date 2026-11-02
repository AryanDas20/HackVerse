# HackVerse v5 deployment guide

Firebase Cloud Storage is not used or required. The app uses Firebase Authentication and Cloud Firestore. The automatic discovery schedule runs through GitHub Actions so the project can remain on Firebase Spark.

## Preserve existing project settings

Before replacing the old local folder, back it up and copy your existing `public/firebase-config.js` and hidden `.firebaserc` into the v5 folder. This ZIP intentionally includes a placeholder Web App config, not your real Firebase project settings. Do not overwrite the user's actual config with the placeholder.

## Frontend and Firestore

1. Keep the existing Firebase project and Vercel deployment.
2. Confirm Google and Email/Password are enabled in Firebase Authentication and your Vercel domain is in Authorized domains.
3. Deploy the updated Firestore rules and indexes from the project root:

   ```bash
   firebase use hackverseneo
   firebase deploy --only firestore:rules,firestore:indexes
   ```

4. Push the updated source to the existing GitHub `main` branch. Vercel should build from the connected repository.
5. Test two accounts to verify public/private profiles, direct chats, group membership changes and message editing/deletion.

## Automatic discovery on Firebase Spark

The GitHub Actions workflow in `.github/workflows/hackathon-discovery.yml` executes every six hours and has a manual `workflow_dispatch` option. It authenticates using the existing GitHub Workload Identity Federation provider and the `hackverse-discovery` service account. No service-account key is required. Its three RSS sources are Hackalendar, Brabble's hackathons feed and Brabble's Delhi-NCR feed.

Open GitHub → Actions → **HackVerse Automatic Hackathon Discovery** to monitor or manually run the job. The cron is UTC: 00:00, 06:00, 12:00 and 18:00 UTC (approximately 05:30, 11:30, 17:30 and 23:30 India time).

Do not run `firebase deploy --only functions` while staying on Spark. Firebase Cloud Functions / Cloud Scheduler deployments require Blaze billing. The source retains Cloud Functions exports for a future migration, but the GitHub Actions workflow is the scheduler for this release. The browser-based admin source-management callables are optional and not needed for the scheduled runner.

## Local discovery test (optional)

On a trusted computer with Node.js 22 and Google Application Default Credentials configured for the project:

```bash
npm install --prefix functions
HACKVERSE_RSS_FEEDS="https://hackalendar.com/feed.xml,https://brabble.ai/rss/hackathons.xml,https://brabble.ai/rss/in/delhi-ncr.xml" node functions/scripts/run-discovery.js
```

Never commit `.env.*`, service-account JSON, private API tokens or admin credentials.

## Limits and launch checklist

- RSS classification is heuristic and source-attributed, not independently fact-checked.
- Dedicated bootcamp/course feeds are not configured yet; categories are supported if suitable sources are added.
- Private profiles are intentionally excluded from public directory and client-side team matching. Securely matching private profiles needs a trusted server-side endpoint.
- Before a public launch, publish real Terms and Privacy Policy, replace the example footer email, add moderation/rate limiting, test rules in the Emulator Suite, configure backups/monitoring and review applicable privacy requirements.
