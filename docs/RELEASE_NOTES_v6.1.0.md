# HackVerse v6.1.0 — Directory Read Efficiency

## What changed
- Added a 30-minute browser-side cache for the public opportunity directory. A valid cache is reused when a signed-in member returns to the directory, navigates back to it, or the tab becomes active, avoiding repeated full Firestore reads during that window.
- Automatic background refresh now runs every 30 minutes instead of every 15 minutes, aligned with the cache lifetime.
- The directory's **Refresh** button bypasses the cache and fetches the latest Firestore records immediately.
- Admin-triggered discovery now forces a fresh directory read after the discovery function completes, so newly published listings are reflected immediately.
- If a live refresh fails but a previous cache exists, the directory displays the last loaded records and informs the user rather than showing an empty error state.
- Existing pagination (up to 5,000 public records), expiry filtering, duplicate consolidation, and the six-hour GitHub Actions discovery schedule are retained.

## Compatibility and data handling
- No Firestore schema, security rules, indexes, GitHub Actions secrets, Workload Identity Federation settings, or Vercel environment variables are changed.
- Cache data is stored in the browser's local storage and is public opportunity data only; it does not contain user profiles, saved IDs, chat messages, or credentials.
- Cached records are re-filtered for expired deadlines whenever displayed. The cache is local to each browser and expires after 30 minutes.
- Manual refresh and post-discovery refresh always bypass the cache.

## Validation
- `node --check public/app.js` passed.
- `npm test` in `functions/` passed: 32 tests, 0 failures.
- ZIP integrity and required release files should be verified after packaging.

## Deployment
- Replace the repository contents with this release, preserving the existing repository and GitHub configuration, then commit to `main`.
- Vercel should deploy the new commit automatically. No Firebase Functions deployment is required for this browser-only change.
