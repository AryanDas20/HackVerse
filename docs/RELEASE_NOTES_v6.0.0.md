# HackVerse v6.0.0 — Global Discovery Expansion

## Discovery coverage
- Brabble ingestion now explicitly requests its `hackathons` hub, which aggregates public listings from multiple upstream platforms. It paginates in 200-row batches, follows the API's reported total, and is bounded to 1,000 rows per run. With the existing six-hour GitHub Actions cadence, this stays comfortably below the provider's documented 1,000-request/day free quota.
- Valid Brabble hackathons without a published deadline are retained with an unspecified deadline instead of being silently discarded. Listings with a known deadline already in the past are skipped. The original organiser URL and Brabble attribution are preserved.
- Unstop, Devpost and Devfolio connectors now attempt bounded pagination. Repeated pages are detected so providers that ignore page parameters do not cause an endless loop. HackerEarth remains a single-page connector until a supported pagination contract is confirmed.
- Direct source health records now expose the configured page limit, last fetched count, published count and errors. A missing Brabble API secret is recorded visibly in the admin source-health list.

## Directory capacity
- The browser now reads up to 5,000 public Firestore records in 500-document pages rather than silently stopping at the first 500. Existing expiry and duplicate filters remain in place.
- The directory continues to refresh every 15 minutes while signed in; GitHub Actions continues to ingest every six hours.

## Important coverage and licensing notes
- There is no universal API that can enumerate every hackathon on the internet. Some platforms publish no public feed, restrict reuse, require credentials or expose only partial listings. This release expands the permitted public discovery surface; it does not promise complete internet coverage.
- Brabble's API requires an API key, has a documented 1,000-request/day free limit, asks consumers to cache responses and retain attribution, and requires links to the original organiser. The runner uses five or fewer paginated requests per run and keeps the original source link.
- No login-only, private, anti-bot-protected or social-network content is scraped. Additional providers should be added only through a documented public API or permitted RSS/Atom feed.

## Deployment
- Keep the existing GitHub Actions secret `HACKVERSE_BRABBLE_API_KEY`; never place it in browser code or commit it.
- No Firebase Cloud Functions deployment is required. The scheduled runner remains GitHub Actions + Workload Identity Federation and stays compatible with the existing Spark-oriented setup.
