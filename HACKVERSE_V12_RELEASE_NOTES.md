# HackVerse v12 — Builder Network & Authentication Update

## Authentication fixes

- Google OAuth requests `prompt=select_account`, so Google presents its account chooser on sign-in. The chooser can only show Google accounts already signed into the current browser profile.
- OAuth redirects back to the current site path without a hash fragment, with the PKCE session restored by Supabase.
- The auth-state listener subscribes before restoring the session and deduplicates repeated initial events.
- The AI composer refreshes the current Supabase user at send time and clears stale signed-in state instead of relying on an outdated in-memory user.
- ID-token retrieval now returns an explicit expired-session error instead of silently returning an empty token.

## Builder community features

- Builder feed filters: Latest, Following, Top, Saved and My posts. Authors can edit or delete their own posts.
- Project/launch posts with title, hook, story, category, build stage, tech stack, cover image, working demo, GitHub/source, pitch deck/PPT, video demo, documentation and other resource links.
- Public/private post visibility. Private posts are only available to their author.
- Upvotes, comments, comment deletion by author, reposts, saved posts, browser share/native share, and builder follows.
- Public profiles show a creator's public post previews and public hackathon journey.
- Profile photos can be linked or uploaded from a device through the server-side signed-upload endpoint.
- Hackathon participation records include event, organizer, year, role, team, outcome, description, project/demo, proof, certificate and media links. Each record can be public or private. Private records count toward the member's personal/public participation total where a public profile is enabled, but their details are not shown publicly.
- Hackathon participation count contributes to people discovery and team-matching tie-breaks.

## Database collections

`builderPosts`, `builderPostVotes`, `builderPostComments`, `builderReposts`, `builderPostSaves`, `builderFollows`, and `hackathonHistory`. Run `supabase-community-v12.sql` for an existing v11 database. The full `supabase-schema.sql` includes the v12 policies for fresh installs.

## Storage and server settings

- `community-media`: public Supabase Storage bucket for project cover images; 8 MB limit; JPG/PNG/WebP. Created by the v12 migration.
- `profile-avatars`: public bucket for profile photos; 5 MB limit; JPG/PNG/WebP.
- The API endpoints require server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Never place the service-role key in browser code.
- Optional defaults: `SUPABASE_COMMUNITY_BUCKET=community-media`, `SUPABASE_PROFILE_BUCKET=profile-avatars`.

## Your deployment checklist

1. Back up the current repository, replace it with this v12 project, and push the changes to the connected Git provider.
2. For an existing v11 Supabase project, run `supabase-community-v12.sql` once in Supabase SQL Editor. For a fresh database, run `supabase-schema.sql` instead; do not run both as a setup sequence.
3. In Supabase Authentication → Providers, enable Google and enter the OAuth Client ID and Client Secret from your Google Cloud OAuth client.
4. In Google Cloud Console, add this Supabase callback URI as an Authorized redirect URI: `https://iwrvyboweubwkjedjunh.supabase.co/auth/v1/callback`. It must match the Supabase project URL in `public/supabase-config.js`.
5. In Supabase Authentication → URL Configuration, set Site URL to your deployed website origin and add the deployed domain (for example `https://your-domain.example/**`) and local test origin (for example `http://localhost:3000/**`) to Redirect URLs. Replace examples with your actual domains.
6. In Supabase Storage, verify that `profile-avatars` exists and is public with a 5 MB image limit. The v12 SQL migration creates `community-media`; verify its bucket is public with an 8 MB image limit. Keep `chat-media` private.
7. In Vercel Project Settings → Environment Variables, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep existing AI variables such as `AGENT37_API_KEY` and `AGENT37_INSTANCE_ID`. Optional bucket variables may be left unset because the endpoints use the defaults.
8. Redeploy the site after environment variable changes.
9. Test sign-in: open Google sign-in, choose the intended browser account, wait for the redirect, then open the AI chatbot and send a short message.
10. Test the community: create a profile, upload a photo, publish a test project post, upvote/comment/repost/save it from a second account, and add one public and one private hackathon record. Check the public profile from the second account to confirm private details stay hidden.

## Validation performed in this workspace

- JavaScript syntax checks passed for the frontend and API routes.
- The existing Node automated suite passed 44/44 tests.
- HTML ID uniqueness and presence of the new controls checked.
- The added community stylesheet parsed without CSS syntax errors.
- Live Google OAuth, Supabase RLS, Storage uploads and deployed mobile behavior still require testing against your actual Supabase/Google/Vercel configuration.

## Important scaling note

Common query filters, orderings and limits are now pushed to Supabase instead of downloading up to 50,000 documents for each bounded request. The current feed still uses capped collection reads rather than a fully cursor-based infinite feed, so a large production community should add server-side pagination and aggregate counters as usage grows.
