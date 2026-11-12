# HackVerse v6.2.0 — Unified Opportunity Discovery

## What changed
- Expanded the unified opportunity taxonomy to include internships, scholarships, fellowships, grants, research opportunities, competitions and volunteering alongside hackathons, coding events, case competitions, bootcamps, courses and certifications.
- Added classification rules and regression tests for all supported categories.
- Expanded the opportunity type filter and admin RSS-source category selector.
- Expanded the six-hour GitHub Actions discovery job with category-focused Google News RSS search feeds for internships, scholarships, fellowships, bootcamps, online courses/certifications, competitions, research/grants and volunteering. Existing hackathon feeds and direct provider connectors remain enabled.
- Existing Firestore collection, deduplication fingerprints, authentication rules, hosting and Firebase Spark-compatible GitHub Actions architecture are retained. No secrets or credentials are added.

## Important limitations
- Discovery coverage depends on public feeds and provider APIs that remain available. Search feeds can surface announcements rather than the original registration page; members should verify dates, eligibility, fees and application links at the linked organiser/provider.
- Sites that require login, prohibit automated collection, or do not offer a permitted public feed/API are not scraped or bypassed. Add further permitted RSS feeds through the admin source panel.
- Six-hour automation means the next GitHub Actions run checks connected sources; it cannot guarantee that every opportunity on the internet is found or that every listing is still open.

## Validation
- `node --check functions/index.js` passed.
- `node --check public/app.js` passed.
- `npm test --prefix functions` passed after adding category regression coverage.
- GitHub Actions YAML parsed successfully.
- Live Firebase/GitHub Actions execution was not run from this local ZIP; verify the next workflow run after pushing the release.
