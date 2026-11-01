# Firestore data model

## `users/{uid}` — private account document

Contains `email`, optional `phone`, `displayName`, `username`, `usernameLower`, college/course/study details, `profileComplete`, role metadata, and timestamps. Readable only by the owner and admins. Do not copy private contact details into the public profile.

## `publicProfiles/{uid}` — searchable public directory record

Fields written by the app: `uid`, `displayName`, `nameLower`, `username`, `usernameLower`, `college`, `collegeLower`, `course`, `studyLevel`, `graduationYear`, `city`, `country`, `bio`, `skills`, `skillsLower`, `rolesInterested`, `rolesLower`, `interests`, `availability`, `preferredMode`, `avatarUrl`, `github`, `linkedin`, `portfolio`, `lookingForTeam`, `profileConsentAt`, and `updatedAt`. This collection is public-readable by design. Do not add email, phone, student ID, or private account identifiers.

## `usernames/{usernameLower}` — username reservation

Contains `uid` and `createdAt`. A username is reserved once. This starter does not support username changes or release.

## `hackathons/{eventId}` — curated event catalogue

Suggested fields: `title`, `organizer`, `summary`, `mode` (`Online`, `In-person`, or `Hybrid`), `tracks` (array), `technologies` (array), `teamSize`, `prizePool`, `currency`, `registrationDeadline`, `startAt`, `endAt`, `officialRegistrationUrl`, `officialEventUrl`, `sourceUrl`, `verificationStatus`, `visibility`, `createdAt`, `updatedAt`. `visibility` must be `public` to appear in the app. Only admin custom-claim accounts can write these documents under the provided rules.

## `users/{uid}/savedEvents/{eventId}`

Contains `eventId` and `savedAt`. Only the owner can read/create/delete their saved records.

## `conversations/{conversationId}`

Contains `isGroup`, `groupName`, `participants` (UID array), `participantNames` (UID-to-display-name map), `lastMessage`, `createdAt`, `updatedAt`, and `lastMessageAt`. Members can read the conversation. Membership is fixed after creation in this starter.

### `conversations/{conversationId}/messages/{messageId}`

Contains `authorUid`, `authorName`, `text`, and `createdAt`. Only participants can read. A signed-in participant can create a message only with their own UID as `authorUid`; text is limited to 2,000 characters.

## `projects/{projectId}`

Contains `ownerUid`, `ownerName`, `title`, `description`, `techStack`, `projectUrl`, `githubUrl`, `visibility` (`public` or `private`), `createdAt`, and `updatedAt`. Owners can manage their records. Public records are readable by all.

## `sourceItems/{sourceId}` and `ingestionRuns/{runId}`

Admin-only RSS moderation candidates and ingestion logs. RSS ingestion never publishes directly to `hackathons`.

## `reports/{reportId}`

Reserved for moderation reports. The client does not yet include a complete report UI or moderation workflow.
