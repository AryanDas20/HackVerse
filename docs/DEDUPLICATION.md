# Deduplication and Event Identity

## Candidate identity
Canonicalize URLs (lowercase host, remove tracking parameters, normalize trailing slash) and retain original URL separately. Exact canonical registration/event URL is the strongest match.

## Scoring model (0–100)
- Canonical official URL exact: +45
- Title token/Jaro-Winkler similarity: up to +20
- Organizer normalized similarity: up to +10
- Start/end/deadline date agreement: up to +10
- City/country/mode agreement: up to +7
- Prize/currency agreement: up to +4
- Track overlap: up to +4

Decision bands: 85+ auto-link as duplicate candidate (never silently overwrite); 65–84 human review; below 65 separate candidate. Require at least two independent matching signals when no canonical URL exists. Similar title alone is insufficient.

## Merge behavior
Maintain one canonical event and a list of source records. Prefer official organizer values over third-party aggregators. Keep conflicting values with provenance and mark review required. Never replace a verified official registration URL with an unverified social link. Store version snapshots for meaningful changes.
