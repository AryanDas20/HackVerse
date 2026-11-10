# HackVerse v5.5 — Agent37, messaging and builder community

HackVerse is a mobile-first web app built with HTML, CSS, JavaScript modules, Firebase Authentication and Cloud Firestore. Chat attachments are stored in a private Supabase Storage bucket; the Firebase project does not need Firebase Storage.

## Current v5.5 release additions
- Agent37 Website Help chatbot and AI Wish action planner, with per-user conversation history. AI Wish requires review and explicit approval before supported website actions are applied.
- WhatsApp-inspired realtime messaging: direct/group chats, replies, emoji reactions, edit/soft-delete, text forwarding, starred items, typing and read indicators, files/media and voice notes. Media uses Firebase-ID-token-verified Vercel endpoints and short-lived Supabase signed URLs.
- Separate hash-routed areas for Explore, Saved, Community, Messages, Profile, Activity and Settings.
- Nine-step guided website tour which navigates to and spotlights each feature.
- Activity centre for unread/recent chats and reminders for saved opportunities approaching their registration deadline. Browser notifications and sound work only while the site is open and permitted by browser settings.
- Settings for theme, animation intensity, text size, profile visibility and notification preferences.
- Automatic skill-coverage team suggestions, with balanced team allocation and candidate review before group creation. This matcher is deterministic profile matching, not a generative AI model.
- A standalone illustrated guide in `public/HackVerse-Website-Guide.pdf` and `public/guide.html`. The PDF can be downloaded from the home hero or footer. Its UI visuals are explanatory mockups, not live production screenshots.

See `docs/AGENT37_AI_SETUP.md`, `docs/WHATSAPP_INSPIRED_MESSAGING.md`, and `docs/WEBSITE_TOUR_AND_GUIDE.md` before deploying.

## What changed in v5

### Opportunity discovery
- The home page shows a preview of up to six latest opportunities. **Explore** opens a dedicated directory page; **Saved** opens a separate saved-opportunities page.
- Opportunity cards are compact. **Read details** opens a modal with the available description, organiser, country/region/city, format, track, skills, level, team size, prize, dates, eligibility, source attribution and original source/registration link.
- Filters include opportunity type, country, region/state, format (online/in-person/hybrid), track, skill/technology, level, free/paid (only when explicitly stated), deadline and source platform. Country, region, track and source choices are derived from the event data available in Firestore.
- Supported categories include hackathons, case competitions, coding events, bootcamps, online courses and certifications. The workflow now imports dated, current/upcoming courses from the public openHPI JSON course feed and ignores historical courses whose end date has passed. Bootcamp and certification filters are supported; official provider catalogues are shown for those categories because a reliable public bootcamp feed is not currently connected.
- The feed reads up to 500 public records. Search, filters and sort run in the browser. This is suitable for a starter catalogue; add server-side pagination and a search service before scaling much further.

### Community profiles and privacy
- Search public profiles by name, username, full college name, college short name, course, skills and interests. Search for phone/email works only when the member explicitly publishes that field.
- Profile visibility can be **Public** or **Private**. A private profile is kept in the signed-in user's private `users/{uid}` document and removed from `publicProfiles`; other users cannot search or open it.
- Phone and email have their own independent Public/Private settings. They default to Private. Public contact fields are copied to the public profile only after the member opts in.
- Profile views include education, location, bio, skills, interested roles, interests, availability and optional GitHub/LinkedIn/portfolio links.

**Privacy / matching limitation:** The smart team matcher currently ranks *public, discoverable* profiles using a deterministic skills-and-roles matching score. It is not an LLM-powered AI service. A private user can run the matcher using their own profile locally, but their private profile is never included as a candidate in another person’s client-side search. Allowing every browser to read hidden profile data in order to match it would defeat the privacy setting. To let other people match private candidates without exposing their data, HackVerse needs a trusted server-side matching endpoint. Firebase Cloud Functions deployment requires Blaze; this package does not enable that because this project is staying on Spark.

### Messaging and teams
- Real-time direct messages and group chat rooms, conversation search and in-chat message search.
- Click a direct-chat title to open the other member's profile. Click a group title to open group details.
- A message author can edit or soft-delete their own message for 15 minutes after sending. Deleted messages become a deleted-message marker for all members; they are not physically erased from Firestore.
- Group creators/admins can add and remove members. Group creation includes a searchable member picker and selected-member chips; groups support up to 11 people including the creator.
- Smart team matching lets the user specify the project name, team size and needed skills/roles, review candidates, select members and create a team chat.

The current messaging implementation includes replies, reactions, edit/soft-delete, text forwarding, attachments, voice notes, typing indicators, read receipts and inbox filters. Private media uses Supabase Storage; see the Agent37 setup guide for its required bucket and Vercel variables. It is not WhatsApp parity and does not include end-to-end encryption, calls, disappearing messages, offline push or cloud backup.

## Existing discovery automation retained

The GitHub Actions workflow is retained in `.github/workflows/hackathon-discovery.yml`. It runs every six hours and can also be started manually from GitHub Actions. It authenticates to Google Cloud using the repository's existing Workload Identity Federation configuration; no service-account JSON key is stored in GitHub or this ZIP.

The three feeds already tested from the current project are configured:

1. `https://hackalendar.com/feed.xml`
2. `https://brabble.ai/rss/hackathons.xml`
3. `https://brabble.ai/rss/in/delhi-ncr.xml`

The discovery engine includes independent direct public-listing connectors for Unstop, Devpost, Devfolio and HackerEarth, plus the existing Hackalendar/Brabble RSS feeds and the openHPI dated course feed. It normalizes listings, writes to Firestore, deduplicates URL/title fingerprints and expires passed registration deadlines. Brabble is an optional additional aggregator source, not the only source. See `docs/PLATFORM_CONNECTORS.md` for exact coverage and limitations. Source-attributed listings are not independently fact-checked. Always confirm details at the linked organiser/source page. Coverage is broad but cannot guarantee every hackathon or opportunity on the internet.

**Spark plan note:** GitHub Actions is the six-hour scheduler. Do not deploy `scheduledRssIngestion` as a Firebase scheduled Cloud Function while staying on Spark. The Cloud Functions callable admin/source-management panel is an optional path and is not required for the GitHub Actions pipeline.

## Important: preserve your existing Firebase configuration before replacing files

This ZIP includes a browser-side Firebase Web App configuration for project `hackverseneo`, and `.firebaserc` is also set to `hackverseneo`. Compare these values with your Firebase Console before deployment; if your live app uses another Firebase project, restore that project's `public/firebase-config.js` and `.firebaserc` from your backup. Before replacing your old project folder:

1. Make a backup copy of the existing `HackVerse` folder.
2. Preserve or restore the correct `public/firebase-config.js` for the Firebase project you intend to use.
3. Preserve or restore your existing hidden `.firebaserc` file if you use Firebase CLI locally. Do not overwrite it with `.firebaserc.example`.
4. Keep your existing Firebase project `hackverseneo`, Vercel project and GitHub repository connection. This ZIP does not change those cloud resources.
5. Preserve any local-only files you need, such as `.env.*`, `functions/package-lock.json`, or editor settings. Do not add private environment files or service-account keys to Git.

The code and Firestore schema are updated, but no cloud database or Supabase project is changed by extracting this ZIP. Configure your own Supabase project before testing chat attachments.

## Deploying the updated version

### 1. Replace the local source safely

Extract this ZIP into a new folder first. Restore `public/firebase-config.js` and `.firebaserc` from your backup as described above. Then replace the old source files with the v5 files. Do not delete your backup until the website is confirmed working.

### 2. Update Firestore security rules

From the project root, with Firebase CLI logged into the account that owns `hackverseneo`, run:

```bash
firebase use hackverseneo
firebase deploy --only firestore:rules,firestore:indexes
```

The rules update adds public/private profile handling, group membership administration and the 15-minute message edit/delete window. Test with two separate user accounts after deploying.

### 3. Push to your existing GitHub repository

The project is connected to `https://github.com/AryanDas20/VerseNeo.git`. Review changes before committing. Then:

```bash
git add README.md VERSION.txt .env.example docs firestore.rules firestore.indexes.json functions public api package.json vercel.json .gitignore .github/workflows/hackathon-discovery.yml
git commit -m "Upgrade HackVerse opportunity and social workspace"
git push origin main
```

If the new folder is not already a Git clone, do not run these commands blindly; first use your existing clone or connect the folder to the repository. Vercel should redeploy from the connected `main` branch.

### 4. Verify automatic discovery

Open <https://github.com/AryanDas20/VerseNeo/actions>, select **HackVerse Automatic Hackathon Discovery**, then choose **Run workflow**. Confirm the job ends with a green check. Scheduled runs are at 00:00, 06:00, 12:00 and 18:00 UTC (approximately 05:30, 11:30, 17:30 and 23:30 India time).

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
- Direct chats, group creation, group membership controls, message search and 15-minute edit/delete work with two test accounts.

## Technical notes

- Frontend: vanilla JavaScript ES modules, Firebase Web SDK 13.1, Firestore realtime listeners.
- Backend discovery: Node.js 22, `firebase-admin` modular API v14, `firebase-functions` v2 exports, `rss-parser`.
- Hosting: static frontend can be served by Vercel or Firebase Hosting; the Agent37 connector in this release requires the Vercel `/api/agent37/chat` function (or an equivalent separately deployed secure API).
- AI backend: `api/agent37/chat.js` (Firebase Admin ID-token verification, private Agent37 proxy, session continuity and per-user daily rate limiting).
- Chat media: private Supabase Storage bucket (`chat-media`) accessed through `/api/chat-media`; Firebase Storage is not used.
- Rules: `firestore.rules`; indexes: `firestore.indexes.json`.
- Discovery runner: `functions/scripts/run-discovery.js`.
- Admin claim helper: `functions/scripts/set-admin.js` (uses Application Default Credentials; keep credentials outside this project).

## Before a public launch

Publish a real Privacy Policy and Terms of Service, replace the `hello@hackverse.example` footer placeholder, configure abuse reporting and moderation operations, test Firestore rules with the Emulator Suite, configure backups/monitoring, add rate limits, and review privacy requirements for each country where users will register. Do not describe source-attributed events as independently verified. Do not use unofficial scraping for sites without a permitted RSS feed or API.


## v5.2.0 social UX refresh

This release is based on the supplied v5.1 ZIP. It refreshes the interface with a pink/sky-blue palette, increases common text sizes, improves mobile chat/community layouts, adds a View members control and opt-in Contact actions, expands team matching to 1–10 teams with optional college/year preferences and related-skill matching, and adds creator-only group soft deletion requiring a typed explanation note. Existing message edit and soft-delete controls are retained.

### Important feature-status notes

- Group deletion is a Firestore soft delete. It hides the conversation from inboxes; it does not physically erase the messages subcollection.
- Group creation currently uses a creator-side consent acknowledgement. It is **not** a full invitee Accept/Decline workflow. Do not use it as a substitute for individual member consent.
- Profile details are available from chat through the existing profile modal; a dedicated shareable profile route is not included in this release.
- The detailed notification centre and invitation-driven notifications are not included in this release.
- Team generator matching is deterministic client-side matching over public profiles; it is not an AI model and cannot see private profiles.
- Existing Firestore rules must be deployed for the group soft-delete feature to work. Review `firestore.rules` before deployment and test against a non-production Firebase project first.

See `docs/HACKSTOP_COMPLETE_UPGRADE_PROMPT.md` for the full requested product specification, including the features still to implement.


## Opportunity directory data notes

- `country` represents the event's actual country/location when the source supplies it; online delivery does not imply a country. Unknown event countries are left blank rather than stored as `Global / Online`.
- `eligibility` is organiser-provided text. `eligibleCountries` and `isWorldwide` are optional structured fields when a source supplies them. The directory's eligibility filter is best-effort and users should confirm rules on the organiser's page.
- Unrecognised opportunity categories are displayed under `Other / unclassified`, not silently labelled as hackathons.
- Provider connectors are public-source integrations and can change when providers change their APIs or response formats. A successful import is source-attributed, not an independent verification of event details.


## v5.4.0 — Agent37 AI workspace and member-only opportunities

This update adds a floating **HackVerse AI** assistant with Website Help and **AI Wish** modes. The Vercel serverless endpoint verifies the caller's Firebase ID token, calls the user's Agent37 instance without exposing its key to the browser, stores the Agent37 session ID against a private per-user conversation, defaults to Agent37 `ultra` reasoning/orchestration (configurable), and enforces a server-side daily request limit. Conversation headers and messages are stored in owner-only Firestore paths.

AI Wish currently supports reviewed/approved navigation, opportunity search/open/save, public builder search and project creation (private by default). It does not have unrestricted access to every feature, cannot perform destructive/admin/payment actions, and never applies an action until the member confirms.

Opportunity cards and details are now hidden from signed-out visitors, and `firestore.rules` requires authentication for the `hackathons` collection. The `/api/agent37/chat` Vercel Function is required; a Firebase Hosting static deployment alone does not provide that endpoint.

**Setup:** follow [`docs/AGENT37_AI_SETUP.md`](docs/AGENT37_AI_SETUP.md) for the personal Agent37 instance, server-only Vercel environment variables, Firebase service account, rules deployment and test checklist. An instance ID alone is not API authentication; confirm that your Agent37 personal plan exposes a server-to-server key before deploying. No card details or secrets belong in this ZIP. Automated checks and live-service test limitations are recorded in [`docs/RELEASE_TEST_REPORT_v5.4.0.md`](docs/RELEASE_TEST_REPORT_v5.4.0.md).
