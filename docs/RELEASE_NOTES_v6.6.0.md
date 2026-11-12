# HackVerse v6.6.0 — Deep Coverage

## Discovery coverage
- Expanded HTML/catalogue discovery across courses, certifications, coding contests, competitions, hackathons, internships, scholarships, fellowships, grants and research.
- Added/expanded Open Opportunities, World Chances, Takadam, Circlebreaker, Blueprint Project, Empower, Resquare and Accountra catalogue sources.
- Expanded existing NPTEL, SWAYAM/SWAYAM Plus, IBM SkillsBuild, Microsoft Learn, MIT OpenCourseWare, freeCodeCamp and Cisco catalogue limits.
- Expanded coding/competition coverage for CodeChef, Kaggle, AtCoder, HackerRank, CodinGame, Topcoder and Microsoft Imagine Cup.

## Coverage behavior
- Category-specific relevance matching now works for internship, scholarship, fellowship, grant, research, volunteering and bootcamp listings instead of using only course-style keywords.
- Catalogue pagination can process up to 5 pages per source and up to 500 extracted rows per source, while retaining per-source timeouts and failure isolation.
- No synthetic opportunities are generated. Counts increase only when real source listings pass validation and deduplication.

## Verification
- `npm --prefix functions test` — 40 passed, 0 failed.
- `npm --prefix functions audit --offline --audit-level=high` — 0 vulnerabilities.
- `node --check functions/index.js` — passed.
