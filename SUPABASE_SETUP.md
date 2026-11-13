# HackVerse — Supabase setup

## 1. Create the project
Open Supabase and create a new project on the Free plan.

## 2. Create the database schema
Open **SQL Editor**, paste the contents of `supabase-schema.sql`, and run it.

## 3. Authentication and Google account chooser
In **Authentication → Providers**:
- enable Email
- enable Google and add the Google OAuth Client ID and Client Secret
- in Google Cloud Console, add this exact Supabase callback as an Authorized redirect URI: `https://iwrvyboweubwkjedjunh.supabase.co/auth/v1/callback`

In **Authentication → URL Configuration**:
- set Site URL to your deployed website origin, for example `https://your-domain.example`
- add the deployed origin and local development origin to Redirect URLs, for example `https://your-domain.example/**` and `http://localhost:3000/**`
- do not use a URL with a hash route as the Google redirect target

HackVerse requests Google's `select_account` prompt so the user can choose an account on each sign-in. Email confirmation can remain enabled. Google sign-in is verified through Supabase Auth.

## 4. Storage
Create these buckets:
- `chat-media` — private
- `profile-avatars` — public, 5 MB limit, JPG / PNG / WebP only (the current avatar endpoint renders its `getPublicUrl` value)
- `community-media` — public, 8 MB limit, JPG / PNG / WebP only (created by the v12 SQL migration)

The v12 SQL migration creates or updates the `community-media` bucket. Public read access is used so project cover images can render in the Builder feed; uploads are still issued through a signed URL created by a server-side authenticated endpoint.

Do not expose the service-role key in the browser.

## 5. Browser configuration
Edit `public/supabase-config.js` with:
- Project URL
- publishable/anon key

The publishable key is designed to be used in browser code. The service-role key is not.

## 6. GitHub Actions secrets
Repository → Settings → Secrets and variables → Actions → New repository secret:

`SUPABASE_URL`

`SUPABASE_SERVICE_ROLE_KEY`

Optional:

`HACKVERSE_YOUTUBE_API_KEY`

`HACKVERSE_BRABBLE_API_KEY`

## 7. Vercel environment variables
Add:

`SUPABASE_URL`

`SUPABASE_SERVICE_ROLE_KEY`

`AGENT37_API_KEY`

`AGENT37_INSTANCE_ID`

Optional `SUPABASE_COMMUNITY_BUCKET=community-media` and `SUPABASE_PROFILE_BUCKET=profile-avatars` can be added; these are the defaults. Optional Agent37 settings can also be added.

## 8. Upgrade to HackVerse v12 community features
For an existing v11 project, open **Supabase → SQL Editor** and run `supabase-community-v12.sql`. This adds public/private policies for posts and hackathon participation records and creates the `community-media` bucket. Do not skip this migration; without it, the Builder feed will show a database permission message.

Add the optional Vercel variable `SUPABASE_COMMUNITY_BUCKET=community-media`. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

## 9. Discovery
Run:

GitHub → Actions → HackVerse Automatic Opportunity Discovery → Run workflow

The job is scheduled once daily and can also be run manually.

## 10. Admin access

Admin privileges must be assigned server-side in Supabase `app_metadata` only. Use `functions/scripts/set-admin.js` with the user's Supabase Auth UUID and the server-only `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. Never grant admin access through editable `user_metadata`.
