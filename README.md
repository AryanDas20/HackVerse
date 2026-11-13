# HackVerse v13 — Builder Network

HackVerse combines opportunity discovery, team matching, project showcases, direct chat, and a developer-focused social network. The v13 release separates **Posts** (updates, questions, learning, discussions) from **Builds** (project/demo showcases) and adds detailed individual profiles, moderation reports, and selectable home-feed defaults.

## Architecture

- **Frontend:** Vanilla JavaScript ES modules, HTML and CSS in `public/`.
- **Identity and sessions:** Supabase Auth (email/password and Google OAuth). Password hashes remain in Supabase Auth; the app does not store or handle raw passwords.
- **Document compatibility layer:** `public/data-layer.js` presents the existing Firestore-like API over the Supabase `documents` table so existing HackVerse chat and opportunity features continue to work.
- **Social data:** Normalized PostgreSQL tables (`profiles`, `posts`, `follows`, `votes`, `comments`, `reposts`, `notifications`, `reports`, `profile_feed_preferences`, and `user_blocks`).
- **Backend:** Vercel serverless routes under `api/`. `/api/social-v13` authenticates the Supabase bearer token and uses the service-role key only on the server.
- **Storage:** Supabase Storage signed uploads. Public image URLs are used for public community media and avatars; chat files remain private and use the existing signed URL flow.

## Feature map

- **Home:** Choose the default landing feed: overview, public posts, following posts, Builds, or opportunities. The preference is saved locally and to the user preference table.
- **Posts:** Public, following and home feeds; cursor-based paging; text and image/video URLs or image upload; hashtags and mentions extraction; public/followers/private visibility; upvotes, downvotes, comments, reposts, share links, edit and soft delete.
- **Post detail:** Stable `/post/:postId` URL with a dedicated page and working reload/deep-link rewrite.
- **Builds:** Existing project showcase flow remains separate from general Posts.
- **Profiles:** `/@username` individual pages with banner, avatar, biography, links, location, pronouns, counts, posts, replies, media, liked posts, followers, following and public hackathon history.
- **Follows:** Directional relationships. Public accounts accept immediately; followers-only and private accounts create a pending request until approved by the profile owner.
- **Privacy:** Public, followers-only and private profile visibility. The API returns a restricted profile summary when a visitor has no access. Private hackathon entries remain hidden; public participation entries can appear on the profile.
- **Safety:** Report users, posts, comments, messages, technical issues or other concerns. Users can view their own reports; the moderator queue is available only to accounts with server-controlled `app_metadata.admin=true` or `app_metadata.role=admin`. Profile block controls remove the follow relationship and hide community content from both participants.
- **Notifications:** Follow, follow-request, upvote/downvote, comment, repost and related activity.
- **Chat:** Reuses the existing conversation store. Opening a profile chat uses a deterministic direct-message conversation ID, and chat listeners pause when the Messages view is inactive.

## Data model decisions

- `auth.users` is the canonical account and email identity table. Do **not** create a public `password_hash` column. Supabase Auth handles credential hashing, verification, reset and OAuth.
- `profiles.id` references `auth.users.id`. Usernames are case-insensitively unique using `username_lower`.
- A follow is directional: `(follower_id, following_id)` is unique. A private/followers-only account receives `pending` requests; only the profile owner can accept or reject.
- A vote is one row per `(user_id, post_id)`. `value` is `upvote` or `downvote`; the API removes the row when the same vote is selected and updates it when switching direction.
- Vote, follow, repost, comment and post counters are maintained by PostgreSQL triggers to prevent browser clients from directly changing denormalized counts.
- Posts and comments use soft-delete flags so audit/history behavior can be extended without losing the row immediately.
- Feed and profile post lists use `(created_at, id)` keyset cursors rather than offset pagination.
- User-facing inputs are length-checked and URL inputs are limited to HTTP(S). API writes are rate-limited in Postgres. Service-role credentials never belong in browser code.

## Local development

Requirements: Node.js 22+, a Supabase project, and a Vercel-compatible environment.

```bash
npm install
npm run check
npm test
```

Serve the `public/` directory with a static server for frontend-only work, or use Vercel CLI to exercise `/api/*` routes locally. The API functions require the environment variables below.

### Environment variables

Required on the Vercel server/API runtime:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

Retain existing project-specific AI variables if used:

```text
AGENT37_API_KEY=...
AGENT37_INSTANCE_ID=...
```

The browser uses the public Supabase publishable/anon key in `public/supabase-config.js`. Never expose `SUPABASE_SERVICE_ROLE_KEY` in `public/`, frontend build variables, screenshots, or client logs.

## Supabase migration

For an existing HackVerse deployment:

1. Back up the database (Supabase Dashboard → Database → Backups or export a SQL snapshot).
2. Confirm v11 base schema and v12 add-on have already been applied.
3. Run `supabase-community-v13.sql` once in Supabase SQL Editor.
4. Do **not** run `supabase-schema.sql` on an existing production database. That file is for an empty project.
5. Sign in with each existing account and save its builder profile once so `sync-profile` fills the normalized `profiles` row.

The migration is additive and intended to be rerunnable. Still, always test on a staging project first; this repository cannot execute SQL against your hosted Supabase database.

## Storage buckets

| Bucket | Visibility | Limit | Suggested MIME types |
| --- | --- | ---: | --- |
| `community-media` | Public | 8 MB | `image/jpeg`, `image/png`, `image/webp` |
| `profile-avatars` | Public | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| `chat-media` | Private | 15 MB | Existing chat file MIME policy |

The `community-media` bucket should exist before uploading post images. Create `profile-avatars` if it does not exist. Do not change `chat-media` to public.

## Google OAuth

In Google Cloud Console, authorize the Supabase callback URI:

```text
https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

In Supabase → Authentication → URL Configuration, set the deployed Site URL and add exact local and production redirect URLs. In Authentication → Providers → Google, add the matching OAuth client ID and secret. Google OAuth requests the account chooser; the browser can only show accounts signed into that browser or allow “Use another account.”

## Admin and moderation

The report queue is intentionally unavailable to normal accounts. Set the admin claim from a trusted server using the Supabase Admin API (service role), never from browser `user_metadata`. For example, in a secure server-side script:

```js
await supabase.auth.admin.updateUserById(USER_ID, {
  app_metadata: { admin: true }
});
```

Sign out and sign back in (or refresh the session) so the updated claim appears in the access token. Never commit the script or service-role key.

## Optional development seed data

The seed script creates 30 marked posts, follow edges, votes and comments for **10 existing disposable Auth users**. It does not create passwords or users. It refuses to run unless `ALLOW_SEED_DATA=true`.

1. Create 10 disposable test users in Supabase Auth.
2. Copy their UUIDs from Authentication → Users.
3. Run from the repository root with server-only environment variables:

```bash
ALLOW_SEED_DATA=true SUPABASE_URL=https://YOUR_PROJECT.supabase.co SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY SEED_USER_IDS=uuid1,uuid2,uuid3,uuid4,uuid5,uuid6,uuid7,uuid8,uuid9,uuid10 npm run seed:social
```

Only seed posts containing `[HV13-SEED]` are replaced on repeat runs. Do not use this script against production accounts or a production database.

## Deploy to Vercel

1. Commit and push the updated project.
2. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Vercel Project → Settings → Environment Variables for the correct deployment environments.
3. Preserve the existing AI environment variables used by your app.
4. Confirm Supabase Storage buckets and OAuth redirect URLs.
5. Deploy and test using two separate accounts.
6. Test `/@username` and `/post/:postId` after direct reload, not just in-app navigation.

## Verification checklist

- `npm run check` — JavaScript syntax checks.
- `npm test` — unit and compatibility tests.
- Register/sign in with email and Google; reset password; check Google account chooser.
- Open profiles from directory, chat message author and group member roster.
- Start a chat from a profile, leave Messages, return, and reopen the same chat.
- Create posts, vote both directions, comment, repost, share and soft-delete.
- Check profile/follower lists, private follow requests and public/private hackathon records using two accounts.
- Submit user, post, message and technical issue reports; verify a normal account cannot open the moderator queue.
- Test 320px, 375px, 768px and desktop widths, keyboard navigation, dark/light mode and reduced-motion preference.

## Known boundaries

- This repository can run code/unit/static checks but cannot validate live OAuth, production Supabase RLS, Storage policies, email delivery, Vercel secrets, or actual devices. Those need staging deployment tests.
- The legacy document adapter uses visibility-aware polling, not a persistent realtime socket for every collection. It pauses inactive chat listeners and backs off polling to reduce load. A future Realtime migration or server-sent event layer can further reduce request volume for very large usage.
- The report queue stores and reviews reports; staff must still investigate, apply moderation decisions and publish a clear appeals/escalation policy.
