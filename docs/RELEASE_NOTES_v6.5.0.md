# HackVerse v6.5.0 — Coverage + Resilient Discovery

## Discovery coverage
Added bounded official catalogue connectors for:
- Kaggle Competitions
- AtCoder Contests
- HackerRank Contests
- CodinGame Contests
- Topcoder Challenges
- Microsoft Imagine Cup
- MIT OpenCourseWare
- freeCodeCamp
- Cisco Networking Academy

Existing NPTEL, SWAYAM, IBM SkillsBuild, CodeChef and Microsoft Learn connectors remain enabled.

## Reliability
- HTML catalogue pages are limited to one page by default.
- Each HTML catalogue is capped at 80 imported links per run.
- HTML fetch timeout reduced to 12 seconds.
- HTML processing has a 40-second source budget.
- Source-specific logs now show fetched/published counts and truncation.
- Discovery writes total runtime to the ingestion run record and logs a completion summary.

The goal is to prevent one slow catalogue or a large catalogue from consuming the entire GitHub Actions run while keeping the scheduled six-hour discovery cycle broad.

## Verification
- Node syntax check: passed.
- `npm --prefix functions test`: 40 passed, 0 failed.
- Offline npm audit could not reach the npm registry in the build environment; dependency installation itself remains unchanged.
