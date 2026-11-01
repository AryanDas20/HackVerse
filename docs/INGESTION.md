# Automatic discovery and ingestion

## Implemented in this release

- Admin-managed public RSS/Atom source registry (`discoverySources`).
- Optional YouTube Data API video search (configured by a server-side API key and query list).
- Six-hour Cloud Scheduler run in Asia/Kolkata.
- Manual admin-triggered run from the HackVerse admin panel.
- HTTPS-only feed URLs; feed items are capped per source and normalized.
- Conservative hackathon relevance check (title/summary must include hackathon or a clear hack/build challenge phrase).
- Stable URL and normalized-title fingerprints to reduce duplicate records across feeds.
- Automatic publication to `hackathons` when a source has `autoPublish: true` (the admin UI currently enables this by default).
- Source URL and publisher attribution are retained on each event.
- Extracts a deadline only when a recognizable date is explicitly labelled in the source text.
- Expired deadlines are marked `status: expired` and hidden by the frontend.
- Per-source enabled/disabled controls and ingestion-run logs.

## Automatic publishing safeguards

A listing is marked `verificationStatus: source-attributed`, not independently verified. The relevance check is heuristic and cannot validate prizes, organizer identity, eligibility, or registration links. Cards link to the original announcement. Do not label the content as fact-checked. Events without an explicit deadline remain visible until their source is updated or an admin removes/updates them. Review the feed and source terms regularly.

## Add sources

1. Assign a trusted Firebase Auth custom admin claim using `functions/scripts/set-admin.js`.
2. Sign out/in to refresh the ID token.
3. Use the Admin Control Center in HackVerse to add a public RSS/Atom feed URL.
4. Use **Run discovery now** to test, then confirm listings and source attribution.
5. The scheduled job repeats every six hours.

Only add feed endpoints where the publisher's terms allow fetching and displaying the metadata. Do not add normal webpage URLs, login pages, social profile URLs, or feed endpoints that prohibit this use.

## Social platforms

YouTube search uses the official YouTube Data API v3 when `HACKVERSE_YOUTUBE_API_KEY` is configured. Search requests cost 100 quota units each; the default three queries run every six hours (about 1,200 units/day). Restrict the API key to YouTube Data API v3 and keep the Functions environment file out of version control. Social scraping is intentionally not implemented. Reddit, X, LinkedIn, Instagram, Facebook, Discord and Telegram still need their own official API access, credentials, permissions and provider adapters.

## Data flow

`discoverySources` → scheduled/manual RSS fetch → normalize/relevance filter → `eventFingerprints` → `hackathons` → public event feed. `ingestionRuns` stores per-run counts and source errors.
