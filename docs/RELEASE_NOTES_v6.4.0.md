# HackVerse v6.4.0 — Maximum Coverage Opportunity Discovery

## Added
- Hack Club public Events RSS ingestion.
- NPTEL public course catalogue ingestion.
- SWAYAM public course catalogue ingestion.
- IBM SkillsBuild public learning catalogue ingestion.
- Microsoft Learn learning paths and modules catalogue ingestion.
- CodeChef contest and learning-roadmap catalogue ingestion.
- HTML catalogue pagination with duplicate-page protection.
- Per-source health/error tracking for the new catalogue connectors.

## Preserved
- Existing Devfolio, Devpost, Unstop and HackerEarth connectors.
- Codeforces and openHPI discovery.
- Firestore deduplication and expiry handling.
- Firebase Spark architecture and GitHub Actions discovery runner.
- Existing frontend and filters.

## Coverage note
This release maximizes legitimate coverage from public feeds/catalogues available to the application. It does not claim to contain every opportunity on the internet. Providers without a verified public feed/API are not scraped through login walls or anti-bot controls.
