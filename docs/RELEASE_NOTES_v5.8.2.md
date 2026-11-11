# HackVerse v5.8.2 — automatic opportunity freshness and visible deduplication

- The opportunity directory now removes historical duplicates from the visible feed using canonical HTTPS URLs and conservative identity checks. Exact normalized titles are not enough on their own: a reliable organiser match, or a close date plus matching non-online location, is also required. Categories are kept separate.
- When duplicate copies exist, the directory prefers the record with stronger verification, official links, deadline, organiser, eligibility, prize information and source history. This changes the displayed feed only; it does not destructively delete Firestore documents.
- The live feed excludes records marked expired and records with passed registration deadlines. Courses, bootcamps and certifications also leave the active feed after their end date.
- The browser refreshes the opportunity feed every 15 minutes while the user is signed in and refreshes when the user returns to the tab.
- The GitHub Actions discovery workflow remains the automatic ingestion mechanism (every six hours); no Firebase Blaze upgrade or Cloud Functions deployment is required for this patch.

## Important
This patch does not delete or rewrite historical Firestore duplicates. It safely deduplicates the public display. A permanent database merge/deletion should only happen after reviewing records and preserving saved-event references.
