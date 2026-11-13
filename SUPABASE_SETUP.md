# HackVerse — Supabase setup

## 1. Create the project
Open Supabase and create a new project on the Free plan.

## 2. Create the database schema
Open **SQL Editor**, paste the contents of `supabase-schema.sql`, and run it.

## 3. Authentication
In **Authentication → Providers**:
- enable Email
- enable Google only if you want Google sign-in
- configure the site URL and redirect URL for your Vercel deployment

Email confirmation can remain enabled. HackVerse checks the Supabase confirmation state.

## 4. Storage
Create these private buckets:
- `chat-media`
- `profile-avatars`

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

Optional Agent37 settings can also be added.

## 8. Discovery
Run:

GitHub → Actions → HackVerse Automatic Opportunity Discovery → Run workflow

The job is scheduled once daily and can also be run manually.

## 9. Admin access

Admin privileges must be assigned server-side in Supabase `app_metadata` only. Use `functions/scripts/set-admin.js` with the user's Supabase Auth UUID and the server-only `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. Never grant admin access through editable `user_metadata`.
