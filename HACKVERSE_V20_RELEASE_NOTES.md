# HackVerse v20.0.0 — Career Match, visual system and performance

## What changed

### Career Match
- Added a sign-in-protected `/career-match` route, loaded only when opened. The module is integrated into the existing vanilla JavaScript application; it is not a separate demo or a framework migration.
- Added resume and job-description input, PDF/TXT/Markdown upload, text extraction, optional in-browser OCR for scanned PDF pages, resume section analysis, skill comparison, direct job-description evidence, transferable-skill hints, missing-skill priorities and a weighted match estimate.
- Skill matching uses explicit aliases and word boundaries. For example, ReactJS and React.js map to React, while Java does not match JavaScript.
- Added the Resume Enhancement Studio, 7/14/30-day learning plans, Skill Sprint check-ins, interview practice, Career Studio writing tools, a portfolio checklist, an application tracker and a summary dashboard.
- Added a Career Copilot that sends requests through the existing `/api/agent37/chat` server endpoint. The browser sends the signed-in Supabase access token; Agent37 secrets remain server-side. Candidate resume/job context is included only while the Career Context setting is enabled.
- Career data is stored per signed-in member in the existing `documents` store under `careerMatchData/{uid}`. The owner UID is written with the record so existing owner-based policies can enforce access. A browser-local fallback is used when cloud sync fails.
- Career Match has a separately scoped peach/taupe design and does not inherit the global sage palette.

### Global visual system and Settings
- Added the global sage, light-sage, cream, oat-beige and deep-forest theme in a separate stylesheet, applied over the existing design system.
- Added responsive refinements for Settings, including security/session status, connected sign-in method status, password-reset email action and Career Copilot / Career Context preferences.
- Settings preference controls now preview changes locally. **Save preferences** persists them in the current browser; **Discard changes** restores the saved browser preferences. Profile visibility is an immediate Supabase account setting and is labelled separately.
- Reduced-motion preferences and `prefers-reduced-motion` are respected by the new styles and motion choices.

### Community voter transparency
- Added a voter detail panel for upvotes and downvotes on normalized Community posts, with search, avatar/name links to public profiles and visible/hidden identity handling.
- The `/api/social-v13` voters action authenticates the member, verifies the post is visible to them, rate-limits requests and applies block/profile-visibility/follow checks before returning voter identities.
- Results are capped at the 500 most recent votes. The UI indicates when the returned list is a recent subset.

### Performance
- Deferred Career Match module loading until the route is opened.
- Updated the existing document snapshot/polling helper to avoid overlapping fetches, pause background refresh while the browser tab is hidden and clean up listener/timer work when stopped.

## Files changed

- `public/index.html` — Career Match route mount, navigation entry, settings panels and voter modal.
- `public/app.js` — route integration/lazy loading, settings save/discard and voter panel interactions.
- `public/data-layer.js` — background polling and visibility lifecycle improvements.
- `api/social-v13.js` — authenticated, privacy-aware voter lookup action.
- `api/agent37/chat.js` — Career Match product context and guardrails for Career Copilot responses.
- `public/career-match.js` — new Career Match application module.
- `public/career-match-v20.css` — new isolated Career Match theme and component styling.
- `public/global-sage-v20.css` — new global sage theme and responsive settings/voter styles.
- `functions/test/career-match-analysis.test.cjs` — skill alias and false-positive regression tests.
- `package.json` — Career Match module included in the syntax check script.
- `VERSION.txt` — set to `20.0.0`.
- `HACKVERSE_V20_RELEASE_NOTES.md` — this release summary and deployment guidance.

## Database migration requirements

No new SQL migration is required for this release. Career Match uses the existing generic `documents` collection with `ownerUid` and the existing owner-based `documents` RLS policies. Voter details reuse the existing `posts`, `votes`, `profiles`, `follows`, and `user_blocks` tables and the existing `social_rate_limit` RPC from the v13 community schema.

Before deploying, confirm that your Supabase project has already applied the repository's existing `supabase-schema.sql` and `supabase-community-v13.sql` setup/migrations, including RLS and the `social_rate_limit` RPC. Do not blindly rerun older schema files over a live database; review your current migration state first.

## Environment configuration

The project already contains browser-safe Supabase URL and publishable/anon key configuration in `public/supabase-config.js`. That key is expected to be public; never put a service-role key in browser files.

Vercel server-side environment variables required by the existing API routes:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only; do not expose to the browser.
- `AGENT37_API_KEY` — server-side only.
- `AGENT37_INSTANCE_ID`

Optional Agent37 settings supported by the existing endpoint:

- `AGENT37_INSTANCE_URL` — must be an HTTPS Agent37 instance URL.
- `AGENT37_REASONING_EFFORT` — one of `ultra`, `max`, `xhigh`, `high`, `medium`, `low`.
- `AGENT37_AGENT`
- `AGENT37_PROFILE`

The Career Match copilot does not require a separate API key or a new frontend secret. It reuses `/api/agent37/chat`.

## Deployment

1. Confirm the Supabase schema and RLS policies described above are already present.
2. Confirm the Vercel environment variables are configured for the target deployment (Production, Preview and/or Development as appropriate).
3. Deploy the contents of this project root to the existing Vercel project. Keep the existing `vercel.json` and API routes.
4. Sign in with a normal member account and open **Career Match** from the main navigation.
5. Upload or paste a resume, add a target job description, inspect extracted text and run the analysis. Test saving and reload to verify the member's career data persists.
6. Enable Career Copilot only after the Agent37 environment variables are configured. Test both a successful request and the graceful unavailable-service response.
7. Use two test accounts to validate voter visibility: public profile, private profile without follow approval, followed private profile, and blocked account. Confirm the profile link opens the intended member.
8. Check Settings on desktop and narrow mobile widths; test preview, Save, and Discard.

## Verification performed in this workspace

- `npm run check` — passed. Node syntax checks completed for the app, Career Match module, data layer, profile policy, and server APIs.
- `npm test` — passed: **65 tests passed, 0 failed**.
- The test suite includes regression coverage for ReactJS/React.js aliases and confirms Java is not incorrectly detected as JavaScript (and other skill-boundary checks).

These are code-level checks and automated tests. A live browser session, real Supabase account/RLS exercise, real Agent37 request, OAuth redirect, and device-level visual/responsive test were **not** run in this workspace. Verify those against the deployed project before treating the release as production-validated.

## Known limitations and honest boundaries

- Resume extraction is best-effort. The two-column ordering is heuristic; unusual tables, columns, icons, charts and image-heavy layouts can be misread. OCR is optional and depends on loading its browser library/language assets; English OCR is the supported fallback. Always review extracted text before relying on the analysis.
- The initial skill catalogue and alias matching are rule-based, not a full semantic NLP model. Skills mentioned in a resume are not proof of proficiency. The match score is a weighted keyword estimate, not a measure of depth, an ATS vendor score, or a hiring probability.
- Requirement classification (required/preferred/not specified), ATS checks, section checks, weak-bullet detection and repeated-word alerts are heuristics. Job descriptions should be reviewed for context.
- Learning time values are planning estimates, not promises of mastery. Resource suggestions are starting points and should be checked for current availability and suitability.
- Interview questions are generated from detected job/resume content; they are practice prompts, not a guarantee of what an employer will ask.
- Portfolio Audit evaluates information the member enters. It does not crawl GitHub, test a live website, inspect a repository, or verify screenshots and documentation links.
- Application reminders are surfaced in the tracker/dashboard; this release does not add server-side email, calendar, or push reminder delivery.
- Settings appearance/notification preferences continue to persist in browser `localStorage`, consistent with the previous app behavior. They do not automatically sync between devices. Profile visibility continues to persist through the existing account backend.
- Career Match cloud records are private per member through the existing owner-based document policies. If those policies are missing or not applied in the live Supabase project, do not deploy until they are corrected and tested.
- The voter list applies to the normalized Community `posts`/`votes` feature. Large lists display only the 500 most recent vote records and explicitly disclose truncation.
