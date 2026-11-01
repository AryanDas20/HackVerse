# Social Discovery and Platform Compliance

Social discoveries are candidate signals, not proof of an event. The original post URL must be preserved and linked. Store the minimum metadata needed; show a short factual summary rather than republishing full post text. If an official event/registration page exists, link it separately.

| Platform | Allowed integration pattern | Launch state |
|---|---|---|
| X | Official X API with approved tier/scopes and display/retention compliance | Not configured |
| LinkedIn | Approved official API product or authorized organizer integration | Not configured |
| Instagram | Meta Graph API where the account/use case is permitted | Not configured |
| Facebook | Meta Graph API for permitted Pages/content | Not configured |
| Reddit | Official Reddit API under current developer terms | Not configured |
| Discord | Official bot/API in servers where installed with permission | Not configured |
| Telegram | Official Bot API in channels/groups where bot is authorized | Not configured |
| YouTube | YouTube Data API under quota and display requirements | Not configured |
| RSS | Public organizer/community feeds where reuse is permitted | Scaffold included |

## Moderation path
API/RSS post signal → event classifier → extract structured fields → resolve official page → risk checks → moderation queue → admin review → publish with source link. No social candidate is public by default.

## Explicit prohibitions
No scraping, browser automation, unofficial bots, credential-based access, login-wall bypass, private group collection, or collection from sources that prohibit the required use. A user connection must be opt-in, scoped, revocable, and documented.
