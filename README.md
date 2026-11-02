# HackStop v5.2.3 — Discover, team up and build

HackStop is a mobile-first web app built with HTML, CSS, JavaScript modules, Firebase Authentication and Cloud Firestore. It uses no Firebase Cloud Storage and does not require a Firebase Blaze upgrade for the scheduled discovery pipeline included in this package.

Release detail: see `docs/HACKSTOP_V5_2_2.md`.

## What is included in v5.2.2

### Opportunity discovery
- The home page shows a preview of up to six latest opportunities. **Explore** opens a dedicated directory page; **Saved** opens a separate saved-opportunities page.
- Opportunity cards are compact. **Read details** opens a modal with the available description, organiser, country/region/city, format, track, skills, level, team size, prize, dates, eligibility, source attribution and original source/registration link.
- Filters include opportunity type, country, region/state, format (online/in-person/hybrid), track, skill/technology, level, free/paid (only when explicitly stated), deadline and source platform. Country, region, track and source choices are derived from the event data available in Firestore.
- Supported categories include hackathons, case competitions, coding events, bootcamps, online courses and certifications. The workflow now imports dated, current/upcoming courses from the public openHPI JSON course feed and ignores historical courses whose end date has passed. Bootcamp and certification filters are supported; official provider catalogues are shown for those categories because a reliable public bootcamp feed is not currently connected.
- The feed reads up to 500 public records. Search, filters and sort run in the browser. This is suitable for a starter catalogue; add server-side pagination and a search service before scaling much further.

### Account onboarding
- The account setup is a short three-step wizard: basic identity, skills/interests, then privacy/contact choices. College, course, location and contact information remain optional; contact defaults to private.

### Community profiles and privacy
- Search public profiles by name, username, full college name, college short name, course, skills and interests. Search for phone/email works only when the member explicitly publishes that field.
- Profile visibility can be **Public** or **Private**. A private profile is kept in the signed-in user's private `users/{uid}` document and removed from `publicProfiles`; other users cannot search or open it.
- Phone and email have their own independent Public/Private settings. They default to Private. Public contact fields are copied to the public profile only after the member opts in.
- Public profile pages include education, location, bio, skills and skill level, tracks, interested roles, interests, availability, public projects and optional GitHub/LinkedIn/portfolio links. Community cards have View profile, Chat and Contact actions; Contact only exposes email/phone that the member explicitly made public. The directory has case-normalized text search and skill, college, study-level, availability and interest filters.

**Privacy / matching limitation:** The smart team matcher currently ranks *public, discoverable* profiles using a deterministic skills-and-roles matching score. It is not an LLM-powered AI service. A private user can run the matcher using their own profile locally, but their private profile is never included as a candidate in another person’s client-side search. Allowing every browser to read hidden profile data in order to match it would defeat the privacy setting. To let other people match private candidates without exposing their data, HackStop needs a trusted server-side matching endpoint. Firebase Cloud Functions deployment requires Blaze; this package does not enable that because this project is staying on Spark.

### Messaging and teams
- Real-time direct messages and group chat rooms, conversation search and in-chat message search.
- Click a direct-chat title to open the other member's profile. Click a group title to open group details.
- A message author can edit or soft-delete their own message for 15 minutes after sending. Deleted messages become a deleted-message marker for all members; they are not physically erased from Firestore. Chat includes replies, emoji reactions, copy, timestamps, report/block actions and profile links from message authors. Firestore rules limit edits to the author and keep reactions scoped to the acting member.
- Group creators/admins can invite and remove members. New members are not added until they accept a seven-day invitation. Group creation includes a searchable member picker and selected-member chips; groups and teams support up to 10 people including the creator. Group/team deletion requires typing `DELETE GROUP` or `DELETE TEAM` and writes an audit record.
- Smart team matching supports 2–10 member teams, exact/related skill scoring, required availability, optional college/year/course/location, optional hackathon and project details, and candidate selection. Selected candidates receive an invitation and must explicitly accept before joining. Team/group creators can delete their space only after typing the matching confirmation phrase.

The current chat supports text messages and the controls listed above. It does not include attachments, voice/video calls, typing indicators, read receipts, message forwarding, email notifications or push notifications. No image/file uploads are provided because Firebase Storage is intentionally not used. The notification centre includes All, Teams, Chat, Hackathons, Community and System categories, unread state, mark-read/clear actions, deep-link metadata and per-category mute preferences. Current producers cover chat activity, team invitations/responses and group/team deletion; automated deadline alerts, profile-view alerts and project/social notifications still need event generators.

## Existing discovery automation retained

The GitHub Actions workflow is retained in `.github/workflows/hackathon-discovery.yml`. It runs every six hours and can also be started manually from GitHub Actions. It authenticates to Google Cloud using the repository's existing Workload Identity Federation configuration; no service-account JSON key is stored in GitHub or this ZIP.

The three feeds already tested from the current project are configured:

1. `https://hackalendar.com/feed.xml`
2. `https://brabble.ai/rss/hackathons.xml`
3. `https://brabble.ai/rss/in/delhi-ncr.xml`

The discovery engine normalizes RSS entries, filters relevant listings, writes to Firestore, deduplicates URL/title fingerprints and expires passed registration deadlines. Source-attributed listings are not independently fact-checked. Always confirm details at the linked organiser/source page. Coverage is broad but cannot guarantee every hackathon or opportunity on the internet.

**Spark plan note:** GitHub Actions is the six-hour scheduler. Do not deploy `scheduledRssIngestion` as a Firebase scheduled Cloud Function while staying on Spark. The Cloud Functions callable admin/source-management panel is an optional path and is not required for the GitHub Actions pipeline.

## Important: preserve your existing Firebase configuration before replacing files

This ZIP intentionally contains a placeholder `public/firebase-config.js`; it does not contain your private deployment state or actual Web App config. Before replacing your old project folder:

1. Make a backup copy of the existing `HackStop` folder.
2. Copy your working `public/firebase-config.js` from the old folder into the new v5 folder, replacing the placeholder.
3. Copy your existing hidden `.firebaserc` file into the new folder if you use Firebase CLI locally. Do not overwrite it with `.firebaserc.example`.
4. Keep your existing Firebase project `hackverseneo`, Vercel project and GitHub repository connection. This ZIP does not change those cloud resources.
5. Preserve any local-only files you need, such as `.env.*`, `functions/package-lock.json`, or editor settings. Do not add private environment files or service-account keys to Git.

The code and Firestore schema are updated, but no cloud database is changed by extracting this ZIP. The team invitation, chat reaction, and block-list rules must be deployed before using those features in the live site.

## Deploying the updated version

### 1. Replace the local source safely

Extract this ZIP into a new folder first. Restore `public/firebase-config.js` and `.firebaserc` from your backup as described above. Then replace the old source files with the v5 files. Do not delete your backup until the website is confirmed working.

### 2. Update Firestore security rules

From the project root, with Firebase CLI logged into the account that owns `hackverseneo`, run:

```bash
firebase use hackverseneo
firebase deploy --only firestore:rules,firestore:indexes
```

The rules update adds public/private profile handling, invitation-only membership, group/team creator deletion, message edit/delete, per-user reactions, block enforcement for direct messages, notification validation and audit logs. Test with at least two separate user accounts after deploying.

### 3. Push to your existing GitHub repository

The project is connected to `https://github.com/AryanDas20/VerseNeo.git`. Review changes before committing. Then:

```bash
git add README.md docs firestore.rules firestore.indexes.json functions public firebase.json .github/workflows/hackathon-discovery.yml
git commit -m "Upgrade HackStop opportunity and social workspace"
git push origin main
```

If the new folder is not already a Git clone, do not run these commands blindly; first use your existing clone or connect the folder to the repository. Vercel should redeploy from the connected `main` branch.

### 4. Verify automatic discovery

Open <https://github.com/AryanDas20/VerseNeo/actions>, select **HackStop Automatic Hackathon Discovery**, then choose **Run workflow**. Confirm the job ends with a green check. Scheduled runs are at 00:00, 06:00, 12:00 and 18:00 UTC (approximately 05:30, 11:30, 17:30 and 23:30 India time).

The workflow uses `npm install --prefix functions` so a locally retained `functions/package-lock.json` is not required for this ZIP to run. On your Mac, install dependencies once before running the standalone script:

```bash
npm install --prefix functions
```

### 5. Check the live site

Open your Vercel site and confirm:
- Home shows a limited preview and Explore opens the full opportunity directory.
- Read details opens the event modal with the source link and (for courses) provider, instructor and language when supplied.
- Country, region, format, type, skill, level, cost, deadline and source filters respond.
- Selecting Courses shows openHPI-backed upcoming/current listings plus official course catalogues; Bootcamps and Certifications show relevant provider catalogues.
- Saved opens a separate page.
- Public profiles can be searched; private profiles and unshared contact information are not exposed.
- Direct chats, message reply/reactions/copy/edit/delete, report/block, invitation accept/decline, member contact privacy, team/group typed deletion, in-app notification actions and member filters work with two test accounts.

## Technical notes

- Frontend: vanilla JavaScript ES modules, Firebase Web SDK 13.1, Firestore realtime listeners.
- Backend discovery: Node.js 22, `firebase-admin` modular API v14, `firebase-functions` v2 exports, `rss-parser`.
- Hosting: compatible with Vercel static deployment or Firebase Hosting.
- Storage: no Firebase Storage import, bucket, upload code or dependency.
- Rules: `firestore.rules`; indexes: `firestore.indexes.json`.
- Discovery runner: `functions/scripts/run-discovery.js`.
- Admin claim helper: `functions/scripts/set-admin.js` (uses Application Default Credentials; keep credentials outside this project).

## HackStop branding

The frontend uses the HackStop wordmark, SVG favicon, web manifest, Open Graph metadata and the pink/sky-blue brand system. The CSS is mobile-first and sets a 16px base font, larger controls, responsive cards/forms/chat and small-screen bottom-sheet dialogs. The theme defaults to light and supports a saved dark theme preference. Responsive styles target 320, 375, 414, 768, 1024 and desktop layouts; complete interactive-device testing remains a release checklist item.

Firebase Authentication verification and password-reset emails are sent by Firebase. Their sender name, templates and authorized domains are configured in Firebase Console → Authentication → Templates; changing the website's HTML cannot rebrand those provider-generated emails. The `hello@hackstop.example` footer address is a placeholder and must be replaced with a real monitored address before launch. The Google Cloud service-account name, Firebase project ID, and legacy `HACKVERSE_*` workflow environment variable names are retained to avoid breaking your existing Workload Identity and GitHub Secrets. They are infrastructure identifiers, not user-facing brand copy.

## Feature boundaries and deployment checks

- Notifications are in-app only. Email sending and Web Push require separately configured providers, consent, delivery credentials and service-worker support; these are not enabled by this static package.
- Private profiles are excluded from client-side team recommendations. A trusted server-side matcher would be required to recommend private users without exposing their information to other browsers.
- Read receipts and online/typing states are not generated because the existing data model does not provide presence state.
- The team generator records optional team metadata on the group conversation; it is not an AI or guaranteed optimizer. Candidates are ranked by a deterministic exact/related skill score and availability/college hints.
- Firestore rules in this ZIP have been reviewed and syntax-checked at the JavaScript/config layer, but they have not been deployed or validated in your Firebase Emulator in this environment. Deploy to a test project/emulator first.

## Before a public launch

Publish a real Privacy Policy and Terms of Service, replace the `hello@hackstop.example` footer placeholder, configure abuse reporting and moderation operations, test Firestore rules with the Emulator Suite, configure backups/monitoring, add rate limits, and review privacy requirements for each country where users will register. Do not describe source-attributed events as independently verified. Do not use unofficial scraping for sites without a permitted RSS feed or API.
