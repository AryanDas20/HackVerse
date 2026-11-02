# Automatic discovery and ingestion — Spark-compatible schedule

## Implemented

- Public RSS/Atom feed ingestion with HTTPS URL validation.
- Standalone Node.js discovery runner (`functions/scripts/run-discovery.js`) using Firebase Admin SDK Application Default Credentials.
- GitHub Actions schedule every six hours plus manual `workflow_dispatch`.
- GitHub Actions authenticates to Google Cloud using the repository's existing Workload Identity Federation provider and dedicated service account; no service-account JSON key is stored in GitHub.
- Existing checked feeds: Hackalendar global RSS, Brabble hackathons RSS, and Brabble Delhi-NCR RSS.
- Public JSON course adapter: openHPI `https://open.hpi.de/feeds/courses`; imports dated courses that have not ended and skips historical/undated entries.
- Categories recognized: hackathons, bootcamps, certifications, online courses, case competitions and coding events.
- Canonical URL and normalized-title fingerprints, source attribution, automatic publication and expired-deadline status updates.
- Ingestion summaries are written to `ingestionRuns`.

## Firebase Spark constraint

The scheduled runner does not use Firebase Cloud Scheduler or scheduled Cloud Functions. GitHub Actions is the scheduler, so this pipeline can remain on Firebase Spark. Do not deploy `scheduledRssIngestion` or other Cloud Functions while staying on Spark; Firebase Functions deployment requires the Blaze billing plan. Existing callable admin functions are retained in source but are not required by the GitHub Actions workflow.

## Current source coverage

The three RSS feeds listed in `.github/workflows/hackathon-discovery.yml` were manually tested from the project's local environment. They produced 47 published records in the most recent three-feed run reported by the project owner. The workflow also reads the public openHPI JSON catalogue, imports only dated courses whose end date has not passed, and preserves the provider link and instructor/language metadata when present. This adapter has syntax-level validation in this ZIP; it still needs a successful GitHub Actions run against the live Firestore project before its first production confirmation. Brabble entries preserve source attribution and may route through a Brabble detail page before reaching the organiser.

Bootcamp and certification filters are supported and the Explore page provides official provider catalogue links for those categories. No verified public bootcamp feed has been connected, so these catalogues are linked rather than copied into the HackStop events database.

## Workflow operation

- File: `.github/workflows/hackathon-discovery.yml`
- Cron: `0 */6 * * *` (UTC; approximately 05:30, 11:30, 17:30 and 23:30 Asia/Kolkata).
- Manual run: GitHub repository → Actions → HackStop Automatic Hackathon Discovery → Run workflow.
- Dependencies: installed with `npm install --prefix functions`; a package lock is not required for this workflow.
- Auth: Workload Identity Federation; provider and service account identifiers are set in the workflow.

## Adding sources

Only connect public RSS/Atom URLs whose terms permit ingestion and display. Verify a candidate feed manually before adding it to the workflow. Do not enter normal website pages, login-required endpoints or scrape pages behind authentication. Do not claim that an item is fact-checked: `verificationStatus` is source attribution, not independent validation.

## Optional and unavailable connectors

The engine retains optional YouTube Data API v3 support through `HACKVERSE_YOUTUBE_API_KEY`. Other platforms require their own official APIs, credentials, permissions and adapters. Do not scrape X, LinkedIn, Instagram, Facebook, Reddit, Discord or Telegram. Course/bootcamp providers may publish APIs or feeds, but each connector must be evaluated separately.
