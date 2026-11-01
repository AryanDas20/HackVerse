# HackVerse — Firebase-backed collaboration starter

A clean, mobile-first hackathon and builder community starter built with plain HTML, CSS, JavaScript modules, Firebase Authentication, Cloud Firestore, and Firebase Hosting.

## This release contains no seeded/sample event or member data

The event catalogue starts empty. There are no hard-coded demo hackathons, fallback event records, sample community users, or example registration buttons. The opportunity feed displays a clear empty state until real documents with `visibility: "public"` are published in Firestore or approved RSS items are reviewed and promoted.

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
- **Optional ingestion scaffold:** scheduled public-RSS ingestion to a moderation collection. Nothing is auto-published, and no social-media scraping is used.

## What is not included yet

This is a deployable foundation, not a claim that every feature of a mature social platform is finished. It does not yet include message attachments, typing indicators, read receipts, message editing/deletion, member blocking, push notifications, video calls, account deletion/export UI, organizer dashboards, payments, AI matching, or dedicated full-text search infrastructure. The current event search loads up to 100 public event documents and filters them in the browser; the member directory uses Firestore prefix/skill queries. Use a dedicated search service such as Algolia, Typesense, or Meilisearch before scaling to a large catalogue.

The browser uses the Firebase Web SDK. Firebase Web configuration is public client configuration, not a service-account secret. Never place service-account JSON, private API tokens, or admin credentials in `public/`.

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

## 3. Add real hackathons

Create documents in the Firestore `hackathons` collection. Set `visibility` to `public` only after reviewing the listing. Suggested fields are documented in `docs/DATA_MODEL.md`. At minimum, use a real title, organizer, summary, event format, and an official registration or event URL. If you used an older build that wrote demo documents into Firestore, those cloud records are not deleted when you deploy new code. Inspect the `hackathons` collection and manually remove only the known test/demo documents before launch; do not delete real member or event data.

## 4. Chat and groups

Users must sign in and complete a public profile before using messaging. Open **People**, search for a member, and choose **Message**. To start a team room, choose **New group** and enter the usernames of up to 10 other registered users. Group membership is fixed after creation in this starter version. Firestore rules restrict conversation and message reads/writes to listed participants.

## 5. Admin access and RSS (optional)

The admin flag is a Firebase Authentication custom claim, not a field users can edit. To assign it, use a trusted environment with Firebase Admin SDK credentials:

```bash
cd functions
npm install
GOOGLE_APPLICATION_CREDENTIALS="/secure/path/service-account.json" node scripts/set-admin.js FIREBASE_AUTH_UID
```

Keep that service-account file outside the project and never commit it. The target user must sign out and sign in again to refresh the token. Only then can the account access admin-only collections/functions.

The optional RSS function uses `HACKVERSE_RSS_FEEDS` and stores candidates in `sourceItems` for review; it does not publish automatically. Deploying Cloud Functions and scheduled jobs requires the Firebase Blaze plan and a billing account. Install function dependencies and deploy only when you intend to use this feature:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Set `HACKVERSE_RSS_FEEDS` when prompted, using only public RSS feeds whose terms permit this use. Leave it blank to ingest nothing. Social platforms must be connected only through official APIs, approved integrations, public RSS, or explicit user-authorized connections. Do not scrape private pages or automate logged-in browsing.

## 6. Before public launch

- Publish real Terms of Service and Privacy Policy and replace the contact email placeholder in the footer.
- Enable and configure Firebase App Check before exposing callable functions or other sensitive endpoints; the optional callable functions currently enforce App Check.
- Test `firestore.rules` using the Firebase Emulator Suite and test with two separate user accounts.
- Add moderation/report handling, rate limits, account deletion/export, abuse response, backups, monitoring, and an incident process.
- Consider a dedicated search provider, pagination, server-side message notifications, file upload rules, and data-retention policies before scaling.
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
