# HackVerse v20 — Performance and Social UX Update

## What changed

- Reworked the global visual system around sage `#6F8F7B`, light sage `#AFC8B4`, cream `#F4EBDD`, oat `#D8C7A6`, and deep forest `#3E5F4D`, with dark and light surface variants.
- Moved Tech News, AI Wish, Profile, Saved, Safety & Reports, Activity, Settings, and the website tour into the responsive **More** navigation menu. The core navigation stays focused on Home, Posts, Builds, Explore, Builders, and Messages.
- Added a vote transparency panel. Clicking the upvote or downvote totals opens a paginated list of visible voters; clicking a voter opens that member's profile. Search works over loaded results.
- Added clickable account links for post authors and comment authors where a valid public username exists.
- Kept voting and comment submission optimistic: the UI updates immediately, then reconciles with the server response and rolls back on failure.
- Added short-lived session caching for the social feed so a recent feed is painted immediately on return instead of fetching it again on every quick route change.
- Removed the fixed-interval chat attachment hydration and opportunity polling loops. Opportunity data refreshes only on return to a relevant route after the freshness window, with duplicate-load protection.
- Added a resume safeguard that removes the boot overlay when a throttled background tab becomes visible again, preventing the overlay from leaving the page black.
- Refined responsive controls, card surfaces, vote states, loading skeletons, voter modal layout, focus states, and reduced-motion handling.
- Restored explicit consent enforcement before a profile is published in the public Builders directory, while retaining legacy handling for profiles that were already explicitly public.

## Files changed

- `VERSION.txt`
- `public/index.html`
- `public/app.js`
- `public/profile-policy.mjs`
- `public/performance-sage-v20.css` (new)
- `api/social-v13.js`

## Backend / database requirements

- No new database table or SQL migration is required for this update. The voter list uses the existing `votes`, `profiles`, `follows`, and `user_blocks` tables from the existing social schema.
- No new environment variables are required. The existing Vercel variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must remain configured for the social API. Keep the service-role key server-side only.
- Deploy the updated API and frontend together. The voter panel depends on the updated `api/social-v13.js` endpoint as well as the updated frontend.

## Validation performed

- `npm run check` — passed.
- `npm test` — passed, 62 tests.
- Additional `node --check` validation for the modified frontend and API files — passed as part of the project check.

## Known limitations / not claimed as tested

- I did not have a live authenticated Supabase/Vercel deployment or real user accounts in this environment, so real-world vote visibility, profile privacy combinations, and production network latency still need a deployed smoke test.
- I did not run browser-based Lighthouse, CPU-throttled, memory, or physical-device tests. The code removes identified repeated work and improves cache/resume behavior, but device-specific frame rates are not claimed.
- The attached larger enhancement brief describes a Career Match platform and Agent37 career copilot. This source project does not currently contain a Career Match route or existing career-analysis data model. I have not inserted a disconnected mock page or claimed those career tools were implemented in this performance-focused update.
- Existing Firebase/Supabase settings, auth, storage, and deployment architecture were preserved.

## Deployment

1. Replace the deployed project with this complete project version, including `public/performance-sage-v20.css` and the updated `api/social-v13.js`.
2. Keep the project's existing environment variables and database schema.
3. Deploy frontend and serverless API in the same release.
4. Sign in and smoke-test Posts: cast / switch / remove a vote, open both voter tabs, search and load more, open a voter profile, expand comments, and open a comment author's profile.
5. Repeat route and browser-tab switching, then verify the feed resumes without a persistent black loading overlay.
