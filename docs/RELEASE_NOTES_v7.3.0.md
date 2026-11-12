# HackVerse v7.3.0 — Firestore Quota-Safe Discovery

## Critical fix
The previous discovery writer used a Firestore transaction that read multiple event/fingerprint documents for every candidate and then wrote multiple documents. On Firebase Spark this could exhaust the daily Firestore quota and cause the run to fail with `RESOURCE_EXHAUSTED` before any source was processed.

v7.3.0 changes ingestion to:
- write each candidate directly to `hackathons/{sha256(canonicalSourceUrl)}`;
- skip duplicate URLs/titles in memory during the current run;
- avoid per-candidate fingerprint/event reads;
- avoid writing the `eventFingerprints` collection during discovery;
- keep repeat runs idempotent for the same canonical URL;
- reduce expiry maintenance from 350 to 75 records per deadline field per run.

This is designed for Firebase Spark and does not require Blaze billing, Cloud Storage, or a backend migration.

## Important
The first run after the quota has been exhausted may still fail until the Firestore daily quota resets. After the reset, run the workflow again.
