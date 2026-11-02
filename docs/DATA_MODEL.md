# Firestore data model — v5

## `users/{uid}` — private account document

Owner/admin only. Contains base `email` and `phone`, account metadata, visibility settings, `mutedNotificationCategories`, `blockedUsers`, profile completion state and `profileData` snapshot for Private profiles. When profile visibility is Private, the public directory record is deleted and the complete profile snapshot stays only here. Do not allow public reads of this collection.

## `publicProfiles/{uid}` — searchable public directory record

Public-readable curated profile document. Fields can include `uid`, `displayName`, `nameLower`, `username`, `usernameLower`, `college`, `collegeLower`, `collegeShort`, `collegeShortLower`, `course`, `courseLower`, `studyLevel`, `graduationYear`, `city`, `country`, `bio`, `skills`, `skillsLower`, `rolesInterested`, `rolesLower`, `interests`, `interestsLower`, `availability`, `preferredMode`, `avatarUrl`, optional selected GitHub/LinkedIn/portfolio URLs, `lookingForTeam`, `profileVisibility`, `publicEmail`, `publicEmailLower`, `publicPhone`, `publicPhoneDigits`, `skillLevel`, `tracks`, `profileConsentAt` and `updatedAt`. Email and phone fields are blank unless the member opts in; a Private profile has no document in this collection.

## `usernames/{usernameLower}` — username reservation

Contains `uid` and `createdAt`. A username is reserved once. Username change/release is not implemented in this starter.

## `hackathons/{eventId}` — opportunity catalogue

Stores hackathons, case competitions, coding events, bootcamps, courses and certifications in one collection. Typical fields include `title`, `category`, `opportunityType`, `organizer`, `summary`, `description`, `mode`, `location`, `city`, `region`, `country`, `tracks`, `technologies`, `skills`, `level`, `teamSize`, `prize`, `prizePool`, `currency`, `isFree`, `price`, `registrationDeadline`, `startAt`, `endAt`, `officialRegistrationUrl`, `officialEventUrl`, `sourceUrl`, `sourceName`, `sourcePlatform`, `attributionText`, `verificationStatus`, `visibility`, `status`, `createdAt`, `updatedAt` and ingestion timestamps. `source-attributed` means source linked, not independently verified.

## `users/{uid}/savedEvents/{eventId}`

Contains `eventId` and `savedAt`. Only the owner can read/create/delete their saved records.

## `conversations/{conversationId}`

Contains `isGroup`, `groupName`, `participants` (UID array), `participantNames` (UID-to-display-name map), `createdBy`, `admins`, `lastMessage`, `lastMessageSender`, `createdAt`, `updatedAt`, `lastMessageAt`, `entityType`, `requiredSkills`, `teamSize`, `availability`, and optional team planning metadata. New members join only through `teamInvitations` acceptance. Creator-only deletion creates an audit record and member notifications. Group creator/admin can update membership (up to 10 total); private profiles can participate in an existing conversation without being published in the directory.

### `conversations/{conversationId}/messages/{messageId}`

Contains `authorUid`, `authorName`, `text`, `createdAt`, optional `replyTo`, `edited`, `editedAt`, `deleted`, `deletedAt`, and `reactionsByUser` (UID → emoji list). Only participants can read. Author can edit or soft-delete their own messages within 15 minutes. Conversation members can change only their own reaction list. Hard deletion by an ordinary member is denied; creator cascade-delete is used for permanent group/team deletion.

## `projects/{projectId}`

Contains `ownerUid`, `ownerName`, `title`, `description`, `techStack`, `projectUrl`, `githubUrl`, `visibility`, `createdAt`, and `updatedAt`. Owners can manage their records. Public records are readable by all.

## `discoverySources/{sourceId}`

Admin-managed RSS registry. Browser writes are blocked; trusted callables manage these records. The Spark-compatible GitHub Actions runner also accepts the comma-separated `HACKVERSE_RSS_FEEDS` environment variable, so it can run without Firestore source documents.

## `eventFingerprints/{fingerprintId}`

Admin-only URL/title fingerprints map duplicate source announcements to one `hackathons/{eventId}` record. Written by the Admin SDK during ingestion.

## `ingestionRuns/{runId}`

Admin-only run summaries containing source counts, fetched/relevant/published counts, expiry counts, errors and timestamps.

## `reports/{reportId}`

Profile reports are stored for moderation review. A complete moderation dashboard and abuse workflow are not included yet.

## `teamInvitations/{invitationId}`

Contains conversation/team name, entity type, inviter and invitee UIDs/names, required skills, target size, `status` (`pending`, `accepted`, `declined`), `createdAt`, `expiresAt` (seven days by default) and `respondedAt`. Only the invitee can accept or decline. The conversation participant list is updated in the same transaction as acceptance.

## `users/{uid}/notifications/{notificationId}`

Recipient-owned in-app notifications. Fields include `type`, `category`, `title`, `body`, actor details, optional `conversationId`, `invitationId`, `eventId`, `profileUid`, `targetHash`, `expiresAt`, `createdAt` and `read`.

## `auditLogs/{auditId}`

Append-only group/team deletion audit record with `action`, `actorUid`, `conversationId`, `conversationName`, `affectedUsers` and `createdAt`. Admin-only read.

## `users/{uid}.blockedUsers`

Private array of UIDs blocked by the owner. The inbox hides blocked direct chats; message-create rules deny DMs if either account has blocked the other. Group messages remain governed by group membership.
