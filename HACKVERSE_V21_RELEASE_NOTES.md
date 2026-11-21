# HackVerse v21 — Career Match, Illustrations and Directory Privacy

## Included in this release

### Career Match (new `/career` route)
- Added Career Match to the responsive **More** navigation menu.
- Created an illustrated career dashboard with a warm peach / taupe / brown theme isolated from the global sage theme.
- Added local PDF text extraction using PDF.js loaded on demand. For image-only scanned PDFs, an optional OCR action loads Tesseract.js only when requested and processes rendered pages in the browser (up to 12 pages). If extraction/OCR cannot run, users can paste resume text.
- Added deterministic resume/JD skill matching with aliases (e.g. React / ReactJS / React.js) and word boundaries to avoid conflating Java with JavaScript.
- Added a transparent skill-overlap score, matched and missing skills, exact job-description evidence snippets, gap frequency/priority estimates, transferable-skill hints and estimated first-learning-sprint ranges. The score is not a hiring probability or proficiency assessment.
- Added resume bullet review, heuristic ATS/readability checks, section signals, a 7/14/30-day checklist roadmap, Skill Sprint self-assessment, role-oriented interview prompts and STAR answer review.
- Added Career Studio draft templates, a portfolio self-audit checklist and an application tracker with search, status changes, dates, follow-up reminders and status history.
- Integrated Agent37 through the existing `/api/agent37/chat` endpoint. The copilot creates an owner-scoped AI conversation and sends only a compact analysis summary plus the user's prompt. Service errors are shown honestly with retry-by-resubmitting behavior.
- Added lightweight CSS/SVG illustrations, micro-interactions, panel transitions and responsive layouts. All career animations respect `prefers-reduced-motion`.

### Public / Private Builders directory
- Removed the separate **“I agree to appear in the public Builders directory”** checkbox.
- The existing Public / Private choice is now the single directory visibility control. Public profiles automatically appear in Builders after a valid display name and username are present; Private profiles remain hidden from the directory.
- Updated legacy directory reconciliation to restore profiles based on Public visibility even if an old `profileConsentAt` field is absent or empty.
- Kept email and phone visibility as separate profile controls. Private contact details are not copied into public directory projections.

### Existing HackVerse features preserved
- Retained v20 social feed caching, optimistic voting/comments, voter transparency panel, clickable profile links, responsive More menu, reduced polling and visibility-resume safeguard.
- Preserved the existing Supabase/Firebase hybrid architecture and deployment configuration.

## Data and privacy notes

- Resume PDF extraction and OCR run in the browser. The raw resume and full job description are not written to localStorage and are not uploaded by the analysis flow.
- The compact skill/evidence summary is sent to Agent37 only when the signed-in user submits a Career Copilot message. Agent37 availability still depends on the existing server-side configuration, credits and usage limits.
- Career Match application tracker, roadmap checklist, sprint state and portfolio checklist are stored in browser localStorage, scoped by signed-in UID. They are device/browser-local and do not sync across devices in this release.
- PDF.js and optional Tesseract.js are fetched from public CDNs on demand. OCR can be CPU-intensive; only the first 12 pages are processed in this implementation.
- The resume analyser is a transparent keyword/alias heuristic, not a full semantic ATS parser. Complex layouts and scanned PDFs may need user review. It does not assess actual proficiency.
- Career Studio outputs are editable starter drafts, not AI-generated verified statements. The user must review and correct placeholders before sending.
- Portfolio audit is a user-guided checklist, not an automated crawl of GitHub or portfolio sites.

## Database migrations / environment variables

- No new SQL migration or environment variable is required.
- Existing Supabase / Firebase configuration and existing Agent37 server secrets remain required and unchanged.
- Deploy frontend and API together. Keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, existing Firebase configuration and the existing Agent37 instance settings as already configured. Never put service-role or Agent37 secrets in frontend code.

## Files changed

- `VERSION.txt`
- `public/index.html`
- `public/app.js`
- `public/profile-policy.mjs`
- `public/career-match-v21.css` (new)
- `api/lib/profile-directory.js`
- `functions/test/data-layer-paths.test.cjs`
- `functions/test/profile-ui-pagination.test.cjs`
- `api/test/profile-directory-reconcile.test.cjs`

## Validation performed

- `npm run check` — passed.
- `node --check api/lib/profile-directory.js` — passed.
- `npm test` — 63 tests passed.
- HTML structure, browser interaction, live Agent37 credentials, OCR CDN execution, live database permissions and real device performance were not browser-tested in this environment. Do not treat those as passed.

## Deployment

1. Replace the deployed project with the complete v21 ZIP contents.
2. Deploy the frontend and existing serverless API together.
3. Keep existing environment variables and database schema.
4. Sign in, open **More → Career Match**, test PDF extraction or paste text, enter a job description and run the analysis.
5. Test Agent37 Career Copilot only after confirming the existing Agent37 server configuration and account quota are active.
6. In Profile settings, choose Public to be listed automatically in Builders or Private to hide the profile. Verify public email and phone settings separately.
7. Smoke-test Posts, Builds, voting, comments, voter profile links, Messages, Settings, and repeated tab switching after deployment.
