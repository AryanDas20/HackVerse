# HackVerse v17 — Career navigation and performance polish

- Replaced the Career Match horizontal feature tabs with a desktop sticky vertical sidebar.
- Added a compact mobile Career Toolkit navigation control that opens the feature list from the page navigation area.
- Added keyboard arrow/Home/End navigation between toolkit tabs and synchronised the mobile active-section label.
- Added responsive wrapping and grid constraints to prevent action buttons and tracker controls from overlapping.
- Reduced continuous decorative animations and expensive backdrop filters within Career Match.
- Kept the existing route, authentication, API, database and storage architecture unchanged.

## Validation
- `npm run check`
- `npm test` — 61 tests passing.

Visual verification on real desktop and mobile browsers is still required; browser/device rendering cannot be fully certified by automated syntax and unit tests.
