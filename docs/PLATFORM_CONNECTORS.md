# Direct opportunity source connectors

HackStop's discovery runner now has independent direct connectors for these public hackathon listing surfaces:

| Platform | Direct source | Access type | Notes |
|---|---|---|---|
| Unstop | `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons` | Public JSON listing endpoint | Bounded page traversal (up to 8 pages); response fields and page behavior can change. |
| Devpost | `https://devpost.com/api/hackathons` | Public JSON listing endpoint | Attempts up to 5 pages; repeat-page detection stops if pagination is ignored. |
| Devfolio | `https://api.devfolio.co/api/hackathons` | Public JSON endpoint observed in public integrations | Attempts up to 5 pages; India-heavy; endpoint/response availability must be monitored. |
| HackerEarth | `https://www.hackerearth.com/chrome-extension/events/` | Public JSON endpoint used by its events surface/extension | Single-page featured set; not a complete archive. |
| Brabble | `https://brabble.ai/api/listings?hub=hackathons` | Key-authenticated JSON aggregator API | Paginates in 200-row batches, bounded to 1,000 rows per run; aggregates multiple upstream platforms. |
| Hackalendar | `https://hackalendar.com/feed.xml` | RSS | Existing feed retained. |
| Brabble | Existing Brabble RSS feeds | Aggregator RSS | Optional additional source only; it is not the sole hackathon source. |

Direct platform connectors run independently. One provider failing does not prevent the other connectors from being attempted. Each run writes source health information to the `discoverySources` collection (`lastRunAt`, `lastError`, `lastItemCount`, and `lastPublishedCount`). Listings retain the source platform and original listing URL.

## Important access and coverage notes

- Public listing endpoints are not necessarily supported third-party APIs. They can change, impose rate limits, or disallow automated collection. Check each provider's current terms and robots policy before production use; do not bypass login, anti-bot, or access controls.
- MLH's published developer documentation describes MyMLH OAuth/user-data access; it is not a general public hackathon-events API. MLH event pages can remain a browse source until a permitted event feed is confirmed.
- The direct connector set is not a guarantee that every event on each platform is returned. Pagination is bounded and guarded against repeated pages; each provider can change its public response or pagination behavior without notice.
- Bootcamps and courses are different catalogues. This project retains the existing openHPI dated course-feed importer and the provider catalogue links in the UI. Coursera, edX, SWAYAM, NPTEL, SWAYAM Plus, Infosys Springboard, Google Cloud Skills Boost, AWS Skill Builder, Microsoft Learn, Cisco Networking Academy and IBM SkillsBuild are not represented as automatic imports unless a provider-specific public feed/API has been verified and implemented. A catalogue link is not an automatic Firestore import.
- Source-attributed listings are not manually verified. Users should confirm deadlines, eligibility, price and registration status at the original provider page.

## Adding another direct source

Implement a source-specific fetcher and mapper in `functions/index.js`, add its source ID to `DIRECT_PLATFORM_SOURCES`, map dates/country/mode/eligibility into the canonical event document, and add a fixture test for its response shape. Keep each source isolated so failures are recorded and do not stop the rest of discovery.
