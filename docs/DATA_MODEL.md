# Data Model and Relationships

Firestore MVP collections:
- `users/{uid}`: private profile, role, preferences, consent, timestamps.
- `users/{uid}/savedEvents/{eventId}`: saved event reference and savedAt.
- `users/{uid}/notifications/{notificationId}`: user-visible notification.
- `hackathons/{eventId}`: normalized, admin-approved public listing.
- `sourceItems/{sourceKey}`: minimal raw source payload, normalized candidate, source reference, ingestion state.
- `ingestionRuns/{runId}`: job metrics/errors.
- `reports/{reportId}`: user-submitted listing issue.
- `auditLogs/{logId}`: immutable moderation/admin action record (server write only).

Production relational model:
`User 1—1 Profile`; `User M—N Skill` through `UserSkill`; `Hackathon 1—N HackathonVersion`; `Source 1—N SourceItem`; `Hackathon M—N Tag`; `User M—N Hackathon` through SavedEvent and Registration; `Hackathon 1—N Team`; `Team M—N User` through TeamMember; `Team 1—N TeamRequest`; `Team 1—N Message`; `Hackathon 1—N Project`; `Project M—N User` through ProjectMember; `Project 1—N Submission`; `Submission 1—N Score`; `Judge M—N Hackathon` through JudgeAssignment; `Hackathon 1—N JudgingCriteria`; `User 1—N Notification`; `Hackathon 1—N Report`; `User 1—N AuditLog actor`.

## Canonical Hackathon schema
```json
{
  "id": "evt_01J...",
  "slug": "future-of-ai-challenge",
  "title": "Future of AI Challenge",
  "organizer": "Organizer name",
  "sourcePlatform": "RSS | Devpost | MLH | Reddit | ...",
  "sourceType": "Official platform | College | Company | Social media | Community",
  "sourceUrl": "https://source.example/post",
  "officialEventUrl": "https://organizer.example/event",
  "officialRegistrationUrl": "https://organizer.example/register",
  "summary": "Short factual summary",
  "fullDescriptionUrl": "https://organizer.example/rules",
  "bannerImageUrl": null,
  "startAt": null,
  "endAt": null,
  "registrationDeadline": null,
  "timezone": "Asia/Kolkata",
  "mode": "Online | In-person | Hybrid",
  "venue": null,
  "city": null,
  "country": "India",
  "eligibility": [],
  "tracks": ["AI / ML"],
  "technologies": [],
  "prizePool": null,
  "currency": "INR",
  "categoryPrizes": [],
  "teamMin": 1,
  "teamMax": 4,
  "registrationFee": 0,
  "participantCount": null,
  "difficulty": "Beginner | Intermediate | Advanced | Unknown",
  "beginnerFriendly": false,
  "travelAccommodation": null,
  "status": "Upcoming | Open | Closing soon | Ongoing | Judging | Ended | Cancelled",
  "verificationStatus": "Verified | Unverified | Needs review | Reported",
  "tags": [],
  "sourceAttribution": "Organizer RSS feed",
  "ingestedAt": "server timestamp",
  "updatedAt": "server timestamp",
  "visibility": "moderation | public | rejected"
}
```

All event dates should be stored as UTC timestamps plus the source timezone. Preserve unknown values as null, not fabricated estimates.
