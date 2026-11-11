# Automatic discovery and ingestion — Spark-compatible schedule

## Implemented

- Expanded public RSS coverage: Hackalendar; Brabble hackathons, case-competition and coding-contest feeds; and Brabble city feeds for Delhi-NCR, Kolkata, Pune, Bengaluru, Hyderabad, Mumbai and Chennai.
- Direct public contest adapter for Codeforces (`contest.list?gym=false`), queried once per scheduled run and limited to not-yet-finished contests.
- Brabble JSON aggregator API connector. It requests the `hackathons` hub, pages in 200-item batches, preserves Brabble attribution and links to each original organiser, and imports up to 1,000 rows per run. The API key is kept in a GitHub Actions secret and never exposed to users.
- Broader official browse directories in the Explore UI for global hackathons, case competitions, coding contests, bootcamps, courses and certifications. These catalogues link users to providers when a public ingestion feed is not available; they do not pretend to have imported every provider's listings.

- Public RSS/Atom feed ingestion with HTTPS URL validation.
- Standalone Node.js discovery runner (`functions/scripts/run-discovery.js`) using Firebase Admin SDK Application Default Credentials.
- GitHub Actions schedule every six hours plus manual `workflow_dispatch`.
- GitHub Actions authenticates to Google Cloud using the repository's existing Workload Identity Federation provider and dedicated service account; no service-account JSON key is stored in GitHub.
- Original baseline feeds: Hackalendar global RSS, Brabble hackathons RSS, and Brabble Delhi-NCR RSS. The workflow now contains additional category and city feeds; validate them from the next GitHub Actions run.
- Public JSON course adapter: openHPI `https://open.hpi.de/feeds/courses`; imports dated courses that have not ended and skips historical/undated entries.
- Categories recognized: hackathons, bootcamps, certifications, online courses, case competitions and coding events.
- Canonical URL and normalized-title fingerprints, source attribution, automatic publication and expired-deadline status updates.
- Ingestion summaries are written to `ingestionRuns`.

## Firebase Spark constraint

The scheduled runner does not use Firebase Cloud Scheduler or scheduled Cloud Functions. GitHub Actions is the scheduler, so this pipeline can remain on Firebase Spark. Do not deploy `scheduledRssIngestion` or other Cloud Functions while staying on Spark; Firebase Functions deployment requires the Blaze billing plan. Existing callable admin functions are retained in source but are not required by the GitHub Actions workflow.

## Current source coverage

The discovery runner combines Unstop, Devpost, Devfolio and HackerEarth adapters with the Brabble aggregate API (22 upstream platforms reported by its documentation), expanded Brabble RSS facets, Codeforces public contest API and openHPI dated course feed. The Explore UI also links to official provider catalogues including MLH, DoraHacks, ETHGlobal, Hack Club, Lablab.ai, Hack2skill, CodeChef, LeetCode, AtCoder, HackerRank, Kaggle, CTFtime, SWAYAM, NPTEL, freeCodeCamp, MIT OpenCourseWare, CS50, Microsoft Learn, Google Skills, AWS Skill Builder, IBM SkillsBuild, Cisco Networking Academy and established bootcamp providers.

**Coverage limitation:** there is no universal, unrestricted internet-wide opportunities API. Some sites require API keys, prohibit automated collection, restrict commercial reuse, or do not publish feeds. The directory therefore aggregates accessible, terms-compatible sources and links to additional official directories. New sources can be added by an admin through approved public RSS/Atom feed URLs or by adding a reviewed official API adapter. Do not scrape login-only/private pages or claim completeness.

The original three-feed baseline listed in the earlier release was reported to produce 47 published records in a prior run. This historical count is not a guarantee for the expanded set or for current provider availability. The workflow also reads the public openHPI JSON catalogue, imports only dated courses whose end date has not passed, and preserves the provider link and instructor/language metadata when present. This adapter has syntax-level validation in this ZIP; it still needs a successful GitHub Actions run against the live Firestore project before its first production confirmation. Brabble entries preserve source attribution and may route through a Brabble detail page before reaching the organiser.

Bootcamp and certification filters are supported and the Explore page provides official provider catalogue links for those categories. No verified public bootcamp feed has been connected, so these catalogues are linked rather than copied into the HackVerse events database.

## Optional Brabble API key setup

1. Create a free API key from Brabble's dashboard → Developer settings: https://brabble.ai/dashboard.
2. In the GitHub repository, open Settings → Secrets and variables → Actions → New repository secret.
3. Set the name to `HACKVERSE_BRABBLE_API_KEY` and paste the key as the secret value. Never put it in `public/`, browser JavaScript, a Vercel public variable or a committed `.env` file.
4. The discovery workflow will use it on its next scheduled/manual run. The free plan documents 1,000 requests/day; this workflow requests paginated batches only during scheduled discovery runs.

The Brabble API is optional. Without the key, RSS feeds, direct provider adapters, Codeforces and openHPI continue to run. Brabble asks downstream users to retain its attribution and send users to the organiser's own URL. See https://brabble.ai/docs for current API limits and fair-use terms.

## Workflow operation

- File: `.github/workflows/hackathon-discovery.yml`
- Cron: `0 */6 * * *` (UTC; approximately 05:30, 11:30, 17:30 and 23:30 Asia/Kolkata).
- Manual run: GitHub repository → Actions → HackVerse Automatic Opportunity Discovery → Run workflow.
- Dependencies: installed with `npm install --prefix functions`; a package lock is not required for this workflow.
- Auth: Workload Identity Federation; provider and service account identifiers are set in the workflow.

## Adding sources

Only connect public RSS/Atom URLs whose terms permit ingestion and display. Brabble asks downstream users to cache feed content, keep attribution, and send users through to the original organiser where possible. Verify a candidate feed manually before adding it to the workflow. Do not enter normal website pages, login-required endpoints or scrape pages behind authentication. Do not claim that an item is fact-checked: `verificationStatus` is source attribution, not independent validation.

## Optional and unavailable connectors

The engine retains optional YouTube Data API v3 support through `HACKVERSE_YOUTUBE_API_KEY`. Other platforms require their own official APIs, credentials, permissions and adapters. Do not scrape X, LinkedIn, Instagram, Facebook, Reddit, Discord or Telegram. Course/bootcamp providers may publish APIs or feeds, but each connector must be evaluated separately.
