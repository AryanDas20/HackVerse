# HackVerse v6.1.0 — Directory Efficiency & Data Quality

## Firestore read reduction
- Public opportunity records are cached in the visitor's browser for 30 minutes, keyed by Firebase project.
- Cached records are re-filtered against current deadlines before display, so a deadline passing during the cache window does not keep an opportunity visible.
- The normal background refresh runs every 30 minutes and reuses a fresh cache. Returning to a tab also respects the cache lifetime.
- The manual Refresh control and the post-manual-discovery refresh bypass the cache and fetch current Firestore data.
- Cache storage is best-effort. If browser storage is disabled or full, the live Firestore directory continues to work normally.

## Discovery and data integrity
- Preserves v6.0.0's bounded global source pagination, source attribution, canonical URL handling, conservative duplicate matching, and six-hour GitHub Actions schedule.
- No new provider scraping or private/login-only sources were added. Add future providers only through documented public APIs or permitted RSS/Atom feeds.
- Existing Firestore records, authentication, rules, indexes, and GitHub secrets are not migrated or rewritten by this release.

## Validation
- `node --check public/app.js`
- `npm test --prefix functions` — all 32 tests pass.

## Deployment
- Replace the repository source with this release while preserving existing Firebase configuration and GitHub repository secrets.
- No Firestore rules, indexes, IAM, service-account, or Vercel environment-variable changes are required for the browser cache improvement.
- The six-hour GitHub Actions discovery schedule remains unchanged.
