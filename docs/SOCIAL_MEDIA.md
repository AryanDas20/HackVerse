# Social Discovery and Platform Compliance

Every social connector must use the platform's official API or an approved/user-authorized integration. Preserve the original post/video permalink, store only permitted metadata, comply with API scopes, quotas, display and retention rules, and keep credentials server-side.

| Platform | Permitted integration pattern | Current package status |
|---|---|---|
| YouTube | Official YouTube Data API v3 search | Implemented optionally; requires `HACKVERSE_YOUTUBE_API_KEY` |
| RSS/Atom | Public organizer/community feed where terms permit use | Implemented; admin-managed, auto-published |
| X | Official X API with suitable access tier and scopes | Not implemented; requires API access and adapter |
| LinkedIn | Approved official API product or authorized organizer integration | Not implemented; no general public-post search connector |
| Instagram | Meta Graph API only for permitted account/use cases | Not implemented |
| Facebook | Meta Graph API for permitted Pages/content | Not implemented |
| Reddit | Official Reddit Data API under current developer terms and OAuth | Not implemented |
| Discord | Official bot/API only in servers where the bot is installed with permission | Not implemented |
| Telegram | Official Bot API only in channels/groups where the bot is authorized | Not implemented |

## Auto-publishing safeguards

The current engine auto-publishes only RSS/YouTube items with an HTTPS source permalink and clear hackathon-related wording. It labels them `source-attributed`. This does not independently verify organizer identity, prizes, eligibility, deadlines, or registration links. Users are sent to the source announcement.

## Explicit prohibitions

No scraping, browser automation, unofficial bots, credential-based access, login-wall bypass, private group collection, or collection from sources that prohibit the required use. A user connection must be opt-in, scoped, revocable, and documented.
