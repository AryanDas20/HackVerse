# HackVerse v8.0.0

HackVerse is an automated opportunity discovery platform for hackathons, coding contests, scholarships, internships, fellowships, courses, certifications, research opportunities and related student opportunities.

## v8 architecture

- **Frontend:** existing HackVerse HTML/CSS/JavaScript UI
- **Auth:** Supabase Auth
- **Database:** Supabase PostgreSQL
- **Storage:** Supabase Storage for media
- **Discovery:** GitHub Actions + Node.js 22
- **AI:** existing Agent37 integration through Vercel API routes
- **Supabase-only architecture**

## Setup

1. Create a Supabase project.
2. Run `supabase-schema.sql` in Supabase SQL Editor.
3. Enable the authentication providers you want.
4. Create private `chat-media` and `profile-avatars` storage buckets.
5. Put the browser-safe Supabase URL and publishable key in `public/supabase-config.js`.
6. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions secrets.
7. Add the same server-only variables to Vercel, plus Agent37 variables if AI is enabled.
8. Push the repository and manually run **HackVerse Automatic Opportunity Discovery** once.

See `SUPABASE_SETUP.md` for the complete setup checklist.

## Discovery

The workflow runs once per day and can be started manually. Discovery fetches sources, parses candidates, deduplicates canonical URLs in memory, and writes only legitimate records to Supabase.

The system does not invent opportunity listings. The dashboard count will therefore reflect the real number of active, accepted records.

## Required GitHub secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `HACKVERSE_YOUTUBE_API_KEY`
- `HACKVERSE_BRABBLE_API_KEY`

## Required Vercel variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENT37_API_KEY`
- `AGENT37_INSTANCE_ID`

Optional Agent37 variables are documented in the Vercel project settings.

## Important security rule

Never put `SUPABASE_SERVICE_ROLE_KEY` in `public/`, browser JavaScript, GitHub source, or screenshots. Only the server-side discovery job and Vercel API routes may use it.
