# API / data operations

The current frontend uses Firebase client SDK operations directly. Firestore Security Rules are the authorization boundary for browser writes.

| Operation | Client operation | Auth | Purpose |
|---|---|---|---|
| List public events | Query `hackathons` where `visibility == public` | Optional | Discover approved opportunities |
| Search members | Prefix/array queries on `publicProfiles` | Optional | Search public directory |
| Register / sign in | Firebase Auth | Public | Email/password and Google authentication |
| Save/remove event | `users/{uid}/savedEvents/{eventId}` | Required | Manage personal shortlist |
| Save profile | Transaction across `users`, `publicProfiles`, `usernames` | Required | Private account + public directory record |
| Start direct chat | Create/read `conversations/{id}` | Required | One-to-one messaging |
| Create group chat | Create `conversations/{id}` with creator as sole initial member; create `teamInvitations` for selected people | Required | Team room with up to 10 members including the creator |
| Send message | Create `conversations/{id}/messages/{id}` | Participant | Text message up to 2,000 characters, optional reply metadata; reactions are per-user; edit/delete limited to 15 minutes |
| Create/delete project | `projects/{id}` | Owner | Project showcase |
| Report member profile | Create `reports/{id}` | Required | Submit a profile safety report |
| Update notification preferences | Update `users/{uid}.mutedNotificationCategories` | Owner | Mute categories in the in-app notification centre |
| Accept/decline invitation | Transaction on `teamInvitations/{id}` and `conversations/{id}` | Invitee | Explicit consent before group/team membership |
| Invite a group/team member | Create `teamInvitations/{id}` and recipient notification | Creator/admin | Invitation only; recipient must accept |
| Delete group/team | Delete nested messages, add notifications + `auditLogs`, delete conversation | Creator only | UI requires typed confirmation phrase |
| React to message | Update only `reactionsByUser/{currentUid}` | Conversation member | Firestore rule limits changed reaction key to actor UID |
| Block direct-message user | Update own `users/{uid}.blockedUsers` | Owner | Rules deny DMs if either participant blocks the other |
| In-app notifications | Read/update/delete `users/{uid}/notifications` | Recipient | Category, unread and deep-link metadata |
| Add RSS source | `addDiscoverySource` callable | Admin custom claim | Register an approved public feed |
| Run discovery | `runDiscoveryNow` callable | Admin custom claim | Fetch RSS/YouTube and auto-publish qualifying source-attributed events |
| Toggle RSS source | `setDiscoverySourceEnabled` callable | Admin custom claim | Enable/disable a feed |

## Future REST/API layer

- `GET /v1/hackathons?q=&track=&mode=&deadlineBefore=&verified=&sort=&cursor=`
- `GET /v1/members?q=&skills=&roles=&availability=&cursor=`
- `POST /v1/conversations` and `POST /v1/conversations/{id}/messages`
- `POST /v1/reports`
- `PATCH /v1/me/profile`
- `POST /v1/admin/events/{id}/approve` and `/reject`

Use Firebase ID tokens or secure session cookies. Validate payloads server-side, enforce App Check, rate-limit write endpoints, and use cursor pagination. Never trust client-supplied role, verification status, prize, or source attribution.
