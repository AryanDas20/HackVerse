# Event Ingestion Pipeline

## Source policy
Prefer official APIs and organizer feeds. For websites without APIs, ingest only where terms, robots directives, rate limits, and redistribution rules permit. Do not bypass login walls, paywalls, CAPTCHAs, anti-bot controls, or access restrictions. If permission is unclear, do not ingest.

## Pipeline
1. Registry: source ID, owner, source type, API/feed URL, allowed fields, terms URL, rate limit, retention policy, enabled flag.
2. Scheduler: run every six hours with per-source jitter and rate budget.
3. Fetch: use official API, authorized integration, or approved public RSS.
4. Raw capture: store only minimal allowed payload plus source URL and fetchedAt; encrypt secrets in Secret Manager.
5. Normalize: map to canonical schema; parse dates with explicit timezone; keep unknown fields null.
6. Enrich: resolve official event and registration pages; summarize only permitted text; retain attribution.
7. Deduplicate: compare canonical URL, organizer, title, dates, location, and source IDs.
8. Validate: flag missing registration URL, impossible dates, suspect prize claims, incomplete organizer identity.
9. Moderate: candidates default to `visibility=moderation`; admin approves/rejects/edits.
10. Publish: public event gets source attribution, verification state, last-updated time.
11. Refresh/expire: detect changed, cancelled, expired, or stale records; preserve version history.
12. Audit: log source, actor, decision, before/after, and timestamps.

## Included implementation
`functions/index.js` demonstrates a six-hour RSS ingestion scaffold. It creates moderation candidates in `sourceItems`, not public events. Feed URLs must be deliberately configured and approved. The MVP does not yet parse dates or auto-publish.

## Future adapters
Each adapter must implement `fetchPage(cursor)`, `normalize(item)`, `getAttribution(item)`, `complianceCheck()`, and `retentionCleanup()`. Use independent credentials and rate limits per provider. Add idempotency keys and exponential backoff.
