# HackVerse v5.8.1 — opportunity data-quality patch

- Replaced title-only duplicate merging with safer matching: exact normalized titles require a matching reliable organiser, or a close date plus matching location, unless the canonical URL already matches.
- Title fingerprints now retain multiple event IDs, so repeated annual events and unrelated listings with the same title are less likely to be collapsed together.
- Added source provenance history (`sourceRecords`) to event records while retaining source IDs.
- Prevented direct platform event end dates from being mistaken for registration deadlines.
- Improved RSS deadline parsing for weekday-prefixed GMT strings such as `Wed Nov 11 2026 23:59 GMT`.
- Opportunity cards and detail views show the local time when a source provides a time, making timezone conversion more transparent.

This patch does not automatically clean up duplicate records already stored in Firestore. Review historical records before any manual merge or deletion.
