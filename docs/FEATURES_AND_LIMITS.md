# Features, behaviour, and current limits

## Accounts and registration

Authentication is handled by Firebase Authentication (Google or email/password). Email/password signup triggers a verification email, but this starter does not block unverified sessions. The app requires a completed profile after the first sign-in. Email and optional phone are stored only in `users/{uid}`. Public directory data is copied to `publicProfiles/{uid}` after the user accepts the public-profile notice.

The username is reserved in `usernames/{usernameLower}`. It is immutable in this starter release. Username reservation prevents duplicate handles, but there is no username-change/release workflow yet.

## People search and teammate discovery

The directory searches public profile prefixes for username, name, and college, and exact skill tags. It can filter by a selected role or by `lookingForTeam`. A simple shared-skill/interest score sorts the results when the signed-in user has a completed profile. It is a heuristic, not an AI recommendation engine.

Firestore is not a full-text search engine. The current queries work for a modest directory; use a dedicated search index and server-side sync for a large user base.

## Chat

The chat system supports direct one-to-one conversations and group rooms with up to 11 total participants. Conversations are realtime through Firestore listeners. Messages are plain text only, limited to 2,000 characters. Conversation membership cannot be changed after creation in this starter; create a new room when membership changes. There are no attachments, reactions, typing state, read receipts, editing, or deletion yet.

A conversation's `participants` array is checked in Firestore rules for reading its parent and nested messages. Each message's `authorUid` must match the signed-in account. Do not loosen these rules to make chat queries work.

## Events

The site loads up to 100 documents from `hackathons` where `visibility == "public"`. Search/filter/sorting happens client-side. Only admins can write event documents under the supplied rules. The event feed intentionally has no local fallback or seeded events.

## Projects

Users can create public or private project cards. Owners can update/delete their own records; private projects are owner-only. Public projects are readable by all visitors. This starter renders the signed-in user's own projects in their profile area.

## Trust and safety boundaries

- Set admin status using Firebase Auth custom claims from a trusted Admin SDK environment.
- Never put private keys or service-account JSON in the `public` directory.
- Do not expose phone numbers or email addresses in `publicProfiles`.
- The app does not scrape X, Instagram, LinkedIn, Facebook, Reddit, Discord, Telegram, or YouTube. Use only official APIs, approved integrations, public RSS, or explicit user-authorized connections.
- The app does not provide a mature moderation system, anti-spam rate limiting, or abuse operations dashboard yet. Add these before inviting a large public audience.
