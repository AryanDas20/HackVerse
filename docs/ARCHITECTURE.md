# System Architecture

## Current release topology

Browser (HTML/CSS/ES modules, Firebase Web SDK + Supabase JS for signed uploads) → Firebase Authentication → Cloud Firestore; chat media is stored in private Supabase Storage through a Vercel API.

- Firebase Hosting serves the static site.
- Firestore stores private user accounts, public member profiles, username reservations, events, saved events, conversations/messages, project cards, and profile reports.
- Conversation and message access is restricted by participant membership in Firestore Security Rules.
- Public event publishing and ingestion candidate writes are reserved for trusted admin/server environments.
- Optional Cloud Functions handle approved RSS ingestion and admin-only maintenance. They are not required for the core website/chat to run.

## Trust boundaries

- Browser clients can update only their own private and public profile records, saved events, owned projects, and messages in conversations they belong to.
- Browser clients cannot publish or edit `hackathons` documents.
- Admin access is granted with Firebase Authentication custom claims assigned through a trusted Admin SDK environment.
- Never put service-account credentials, source API keys, AI provider tokens, or admin credentials in `public/`.
- `publicProfiles` is a public directory by design. Never put email addresses, phone numbers, student IDs, or other private contact information in it.
- Social sources require approved official APIs, integrations, public RSS, or explicit user-authorized connections. No scraping or logged-in browser automation.

## Known limits

This starter is a single-page static client. It has no backend search service, message attachments, typing indicators, read receipts, group membership management, server-side message notifications, or mature anti-abuse moderation. It permits direct messages to other directory members and includes profile reporting, but no block/report review console yet. Launch this as a controlled beta until moderation, rate limiting, abuse response, and account deletion/export are completed.

## Suggested scaling path

1. Add contact requests, block/mute, report triage, rate limits, and notifications.
2. Add Firebase App Check and rules/emulator tests to CI.
3. Add Cloud Tasks/Pub/Sub for ingestion retry and source fan-out.
4. Add dedicated search indexing (Algolia, Typesense, or Meilisearch).
5. Add App Check, signed-URL rate limits, media retention/deletion and Supabase quota monitoring before scaling chat attachments.
