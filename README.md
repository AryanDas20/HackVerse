# HackVerse v12.0.0

HackVerse is an automated opportunity discovery platform for hackathons, coding contests, scholarships, internships, fellowships, courses, certifications, research opportunities and related student opportunities.

## v12 architecture

- **Frontend:** existing HackVerse HTML/CSS/JavaScript UI
- **Auth:** Supabase Auth
- **Database:** Supabase PostgreSQL
- **Storage:** Supabase Storage for media
- **Discovery:** GitHub Actions + Node.js 22
- **AI:** existing Agent37 integration through Vercel API routes
- **Community:** Builder feed with public/private launch posts, project images and resource links, upvotes, comments, reposts, saved posts, sharing and post editing
- **Builder profiles:** published project activity and public/private hackathon participation history with a participation count for team matching
- **Supabase-only architecture**

## Setup

1. Create a Supabase project.
2. For a fresh project, run `supabase-schema.sql`; for an existing v11 project, run `supabase-community-v12.sql` instead.
3. Enable the authentication providers you want.
4. Create `chat-media` and `profile-avatars` buckets; run the v12 migration to create the public `community-media` image bucket.
5. Put the browser-safe Supabase URL and publishable key in `public/supabase-config.js`.
6. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions secrets.
7. Add the same server-only variables to Vercel, plus Agent37 variables if AI is enabled.
8. Push the repository and manually run **HackVerse Automatic Opportunity Discovery** once.

See `SUPABASE_SETUP.md` for the complete setup checklist and Google OAuth redirect configuration. The auth flow explicitly requests Google account selection and the AI composer refreshes the Supabase user before checking access.

## Builder network

Members can publish public or private launch posts with a project cover, working demo, source repository, pitch deck, video, documentation and other resources. Public posts support upvotes, comments, reposts, saves, sharing and builder follows. Profiles include uploaded or linked profile photos, project activity, detailed public/private hackathon participation records, certificate/proof links and an experience count. The hackathon count contributes to builder discovery and team-matching tie-breaks.

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
