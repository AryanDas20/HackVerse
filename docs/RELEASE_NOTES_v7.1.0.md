# HackVerse 7.1.0 — More Opportunity Sources

This release keeps the existing UI, Firebase/Firestore architecture, scheduled discovery, deduplication and Devfolio connector unchanged. Devfolio is intentionally not modified.

## Added RSS sources
- Opportunity Desk
- Scholars4Dev
- Opportunities for Youth
- Scholarships Corner
- Brabble.ai coding contests
- Brabble.ai case competitions
- Brabble.ai school opportunities
- Brabble.ai college opportunities
- Brabble.ai platform feeds for Unstop, Devpost, MLH, Internshala, Codeforces, CodeChef, LeetCode and ETHGlobal

RSS ingestion now accepts up to 120 items per feed per run instead of 60.

## Added public catalogue sources
- AICTE National Internship Portal / Internshala
- NASA Space Apps Challenge

## Important
These sources are real feeds/catalogues; the workflow still validates relevance, HTTPS URLs, deadlines where present, and deduplicates against existing Firestore records. The final count will increase only when the scheduled/manual GitHub Action successfully fetches and publishes new active records.
