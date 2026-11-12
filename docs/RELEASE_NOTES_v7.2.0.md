# HackVerse v7.2.0 — High-volume ingestion expansion

Devfolio was intentionally left unchanged.

Added high-volume public catalog connectors for:
- IndiaScholarships
- WeMakeScholars
- Buddy4Study
- Toph contest calendar
- Naukri Code360 contests
- GeeksforGeeks contests
- Kattis contests
- SPOJ contests

These sources are real public catalogues. The discovery job still deduplicates records and only publishes links it can extract from the configured source domains. A source definition alone does not guarantee a particular number of records; GitHub Actions logs must be checked after the run.

Validation: `npm test` — 40 passed, 0 failed.
