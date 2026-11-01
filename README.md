# HackVerse — Firebase-backed collaboration starter

A clean, mobile-first hackathon and builder community starter built with plain HTML, CSS, JavaScript modules, Firebase Authentication, Cloud Firestore, and Firebase Hosting. Firebase Cloud Storage is not used or required.

## This release contains no seeded/sample event or member data

The event catalogue starts empty. There are no hard-coded demo hackathons or fallback event records. The discovery engine can automatically publish qualifying hackathon announcements from public RSS feeds you explicitly connect in the admin control center.

## Features in this release

- **Authentication:** Google sign-in, email/password registration and login, password reset, and email-verification email on email signup.
- **Detailed onboarding:** required name, unique username, college/university, course, study level, bio, and at least one skill; optional graduation year, city/country, roles, interests, availability, preferred event format, avatar URL, GitHub, LinkedIn, portfolio, and private phone number.
- **Member directory:** search by username, name, college, skills, and interests; role and “looking for a team” filters; skill-overlap ordering.
- **Public/private profile split:** contact email and phone are stored in `users/{uid}`. Only the fields shown in the public profile form are copied to `publicProfiles/{uid}`.
- **Opportunity discovery:** real Firestore event feed, keyword search, mode/track filters, sorting, official registration links, and saved events.
- **Live messaging:** one-to-one conversations, multi-member group rooms, real-time inbox/message updates, and a 2,000-character message limit.
- **Project showcase:** create, publish, make private, and delete project cards with tech stack and links.
- **Responsive layout:** mobile navigation, dark/light theme, modal close controls, empty states, and toast feedback.
- **Security baseline:** Firestore rules scope private records and chats to their owners/participants; admin powers use Firebase Authentication custom claims.
- **Automatic discovery:** scheduled six-hour RSS/Atom feed checks plus optional YouTube Data API searches, relevance filtering, canonical URL/title deduplication, source attribution, automatic publication, per-source enable/disable, manual admin refresh, ingestion logs, and expired-deadline hiding. No sample listings are seeded.

## What is not included yet

This is a deployable foundation, not a claim that every feature of a mature social platform is finished. It does not yet include message attachments, typing indicators, read receipts, message editing/deletion, member blocking, push notifications, video calls, account deletion/export UI, organizer dashboards, payments, AI matching, or dedicated full-text search infrastructure. The current event search loads up to 100 public event documents and filters them in the browser; the member directory uses Firestore prefix/skill queries. Use a dedicated search service such as Algolia, Typesense, or Meilisearch before scaling to a large catalogue.

The browser uses the Firebase Web SDK for Authentication and Cloud Firestore only. This project does not initialize Firebase Cloud Storage, upload files, or require a Storage bucket. Profile avatars and project media are represented by externally hosted URLs; no binary files are uploaded by this starter. Firebase Web configuration is public client configuration, not a service-account secret. Never place service-account JSON, private API tokens, or admin credentials in `public/`.

## 1. Configure Firebase

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Register a Web app and copy its Firebase config into `public/firebase-config.js`.
3. In **Authentication → Sign-in method**, enable **Google** and **Email/Password**.
4. In **Authentication → Settings → Authorized domains**, add `localhost` for local testing and your deployed domain.
5. Create a **Cloud Firestore** database in Production mode. Choose a nearby region carefully because the database location is difficult to change later.
6. From this project folder, run:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```

   Select your Firebase project and use the `default` alias.
7. Deploy the Firestore rules, indexes, and Hosting site:

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,hosting
   ```

8. Open the Hosting URL printed by Firebase, register a new account, and complete the profile onboarding.

## 2. Local preview

From the project directory run:

```bash
python3 -m http.server 5500 --directory public
```

Then open <http://localhost:5500>. This local preview uses your configured Firebase project directly; it is not automatically connected to the Firebase Emulator Suite. Do not use production data while experimenting unless that is intended.

## 3. Turn on automatic discovery

The engine reads public RSS feeds you add and can optionally search YouTube through the official YouTube Data API. It checks every six hours after Cloud Functions are deployed. An event is auto-published when its source item has a secure HTTPS link and the title/summary clearly identifies a hackathon. It is labelled `source-attributed`; this is not a guarantee that every prize, deadline, or eligibility detail has been independently verified. Each card links to its source. A deadline detected in the source text is stored and expired deadlines are hidden from the public feed.

### Give your account admin access

1. Create a normal HackVerse account and complete your profile.
2. In Firebase Authentication, copy that account's UID.
3. Create/download a service-account key only on a trusted computer. Keep it outside this project and never upload it to GitHub.
4. From the `functions` folder, run:

   ```bash
   npm install
   GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json" node scripts/set-admin.js YOUR_AUTH_UID
   ```

5. Sign out of HackVerse and sign in again. Your account will then see the **Admin Control Center** below the event feed.

### Add RSS sources

1. Paste an RSS/Atom feed URL whose publisher terms permit this kind of discovery and display.
2. Choose a clear source name and click **Add source**.
3. Click **Run discovery now** to test immediately, or wait for the six-hour schedule.
4. The admin panel shows configured feeds. Disable any feed that becomes unavailable or changes its terms.

To enable YouTube, enable YouTube Data API v3 in Google Cloud Console and set `HACKVERSE_YOUTUBE_API_KEY` in `functions/.env.<your-project-id>` (see `.env.example`). Restrict that key to the YouTube Data API and never commit the environment file. The default three search terms use about 1,200 YouTube search quota units per day at a six-hour schedule; adjust `HACKVERSE_YOUTUBE_QUERIES` if needed. The system deliberately does not crawl arbitrary websites. If a website has no permitted RSS feed or API, do not add its ordinary page URL as a feed. Add a dedicated adapter only when the publisher/platform authorizes it. Automatic publication is based on conservative relevance checks and source attribution, not human fact-checking. Do not describe source-attributed entries as independently verified.

### Deploy the discovery backend

Cloud Functions and scheduled jobs require the Firebase Blaze plan. Review pricing and set budget alerts before enabling billing. From the project root:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules,firestore:indexes,hosting
```

If your site is hosted on Vercel instead of Firebase Hosting, deploy only `functions,firestore:rules,firestore:indexes` and redeploy the frontend through your connected Git/Vercel workflow. The callable functions use Firebase Authentication custom admin claims. App Check is not enforced by these discovery callables in this starter; configure App Check and enable enforcement before a public production launch.

## 4. Chat and groups

Users must sign in and complete a public profile before using messaging. Open **People**, search for a member, and choose **Message**. To start a team room, choose **New group** and enter the usernames of up to 10 other registered users. Group membership is fixed after creation in this starter version. Firestore rules restrict conversation and message reads/writes to listed participants.

## 5. Social-platform scope

This package currently supports public RSS/Atom feeds and optional YouTube Data API search. Reddit, X, LinkedIn, Instagram, Facebook, Discord and Telegram are not connected yet; each needs its own official API access, credentials, permissions and provider-specific adapter. There is no scraping or unofficial browser automation.

## 6. Before public launch

- Publish real Terms of Service and Privacy Policy and replace the contact email placeholder in the footer.
- Configure Firebase App Check and enable enforcement before exposing callable functions publicly. Discovery callables currently rely on Firebase admin custom claims and do not enforce App Check.
- Test `firestore.rules` using the Firebase Emulator Suite and test with two separate user accounts.
- Add moderation/report handling, rate limits, account deletion/export, abuse response, backups, monitoring, and an incident process.
- Consider a dedicated search provider, pagination, server-side message notifications, data-retention policies before scaling.
- Review applicable privacy, consumer, and student-data requirements for the regions where you operate.

## Project structure

```text
HackVerse/
  public/
    index.html
    styles.css
    workspace.css
    app.js
    firebase-config.js
  functions/
    index.js
    package.json
    scripts/set-admin.js
  docs/
  firebase.json
  firestore.rules
  firestore.indexes.json
```

Read `docs/FEATURES_AND_LIMITS.md`, `docs/DATA_MODEL.md`, and `docs/DEPLOYMENT.md` before production deployment.
