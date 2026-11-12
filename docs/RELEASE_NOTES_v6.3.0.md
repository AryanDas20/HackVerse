# HackVerse v6.3.0 — All-in-one opportunity discovery

## Product coverage
HackVerse is positioned as a single discovery platform for:

- Hackathons
- Coding events and programming contests
- Case and technical competitions
- Online coding and technology courses
- Bootcamps and developer programmes
- Certifications and professional credentials
- Internships, scholarships, fellowships, grants and research opportunities

## Automatic discovery
The existing automatic pipeline remains unchanged for its verified connectors:

- Unstop
- Devpost
- Devfolio
- HackerEarth
- Brabble.ai feeds/API where configured
- Hackalendar/other configured HTTPS RSS feeds
- Codeforces public contest API
- openHPI public dated course feed

The platform also exposes official provider catalogues for categories where a reliable public automatic feed/API is not connected. This avoids fabricating or scraping unsupported data while still giving students one place to discover trusted providers.

## Safety and reliability
- Existing deduplication and canonical URL handling are retained.
- Expired opportunities continue to be excluded/expired by deadline or end time.
- Existing Firestore, Firebase Spark, Node.js 22 and GitHub Actions architecture is retained.
- No Firebase Storage or Blaze-only Cloud Functions deployment is introduced.
- Source attribution remains visible and users are directed to the official organiser/provider page for final details.

## Verification
Run from the repository root:

```bash
npm ci --prefix functions
npm --prefix functions test
npm --prefix functions audit
```

The GitHub Actions workflow can be started manually or runs every six hours.
