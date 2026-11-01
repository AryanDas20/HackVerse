# API Specification (MVP + target)

The MVP uses Firebase client SDK for user-scoped operations and callable Cloud Functions for privileged actions.

| Operation | Method / Function | Auth | Purpose |
|---|---|---|---|
| List public events | Firestore query `hackathons` | Optional | Read approved listings |
| Save event | Firestore `users/{uid}/savedEvents/{eventId}` | Required | Save to own shortlist |
| Remove saved event | Firestore delete | Required | Remove own saved event |
| Create account | Firebase Auth | Public | Email/password |
| Google login | Firebase Auth popup | Public | Google OAuth |
| Reset password | Firebase Auth | Public | Password reset email |
| Manual RSS refresh | `manualRssRefresh` callable | Admin | Trigger approved feed ingestion |
| Connector status | `socialConnectorStatus` callable | Required | Report configured/not-configured adapters |

## Target REST endpoints
- `GET /v1/hackathons?q=&track=&mode=&deadlineBefore=&verified=&sort=&cursor=`
- `GET /v1/hackathons/{id}`
- `POST /v1/hackathons/{id}/save`
- `DELETE /v1/hackathons/{id}/save`
- `POST /v1/reports`
- `GET /v1/me/saved-events`
- `PATCH /v1/me/profile`
- `GET /v1/teams?skills=&timezone=&availability=`
- `POST /v1/teams/{id}/requests`
- `POST /v1/organizer/events` (verified organizer)
- `POST /v1/admin/events/{id}/approve` (admin)
- `POST /v1/admin/events/{id}/reject` (admin)

Use Firebase ID tokens or secure session cookies. Validate payloads server-side, enforce App Check, rate-limit write endpoints, and use cursor pagination. Never trust client-supplied role, verification status, prize, or source attribution.
