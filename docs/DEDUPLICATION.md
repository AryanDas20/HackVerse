# Deduplication and Event Identity

## Identity signals
- Canonical HTTPS event/registration URL is the strongest identity signal. Tracking parameters and URL fragments are removed before fingerprinting.
- A normalized exact title is only a candidate signal, never enough by itself. When URLs differ, the engine merges only if the organiser also matches, or if a close date (within 72 hours) and location both match.
- Title fingerprints retain multiple event IDs so recurring events with the same title are not forced into one record. Different opportunity categories are never merged.
- Similar titles alone are kept as separate opportunities. Fuzzy title similarity can be used for a future human-review queue, but it must not silently merge records.

## Merge behavior
- Source identifiers are combined and a bounded `sourceRecords` history retains the originating source name, platform, URL and first-seen time.
- A previously selected non-aggregator source URL is retained when another aggregator copy arrives. A direct platform source can replace an earlier Brabble aggregator link.
- Verified organiser details and official registration URLs are protected from unverified ingestion updates.
- Missing registration deadlines are not inferred from event end dates. Deadline values are parsed separately from event start/end dates.
- Dates are stored as Firestore timestamps (UTC instants); the browser renders them in the visitor's local timezone.

## Operational caution
The deduplication changes prevent common false merges, but they do not prove that every listing is accurate. Conflicting values from different providers still require organiser-page verification. Existing historical duplicates in Firestore are not automatically deleted or merged by this code change.
