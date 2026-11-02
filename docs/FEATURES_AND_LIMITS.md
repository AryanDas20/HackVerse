# Features, behaviour, and current limits — v5

## Opportunities

The home route previews up to six opportunities. Explore opens a dedicated directory; Saved opens a separate shortlist page. Cards are compact and link to a modal with all available metadata and the source/organiser URL. Filters cover type (hackathons, case competitions, coding events, bootcamps, courses, certifications), country, region, format, track, skill, level, cost, deadline and source platform. Country/region/source options are derived from available records; fields missing from a source cannot be filtered reliably.

The current checked feeds focus on hackathons and coding/case competitions. Bootcamp, course and certification categories are supported by classification logic, but verified dedicated sources for those categories have not yet been configured. The browser reads up to 500 public events and filters locally. Add pagination/search infrastructure for larger datasets.

## Accounts and privacy

Firebase Authentication handles Google and email/password auth. A completed builder profile is required. The member chooses Public or Private profile visibility; Private stores profile data in the owner-only `users/{uid}` document and removes the public `publicProfiles/{uid}` record. Phone and email are separately opt-in, defaulting to private. Only explicitly shared contact fields are published in the public profile.

Public directory fields include display name, username, college and short name, course, study level, location, bio, skills, interested roles, interests, availability, selected links and consent metadata. Private users are not searchable by other users.

**Important privacy/matching trade-off:** The current browser-based team matcher reads public profiles only. It cannot safely expose private users as candidate profiles to other browsers while keeping their details hidden. Secure matching over private profiles requires a trusted server endpoint. This build does not deploy Cloud Functions because the project is staying on Firebase Spark.

## People and team matching

People search supports username, display name, college full/short name, course, public email/phone, skills and interests; public contact search only matches members who have opted in. The team matcher ranks public profiles using a deterministic role/skill/interest overlap score. This is a transparent heuristic, not an LLM-powered AI service. Users can review candidates and create a group chat from selected matches.

Firestore is not full-text search. Search queries are prefix/token based and designed for modest data volumes; use a dedicated search service when scaling.

## Chat

Direct and group conversations use Firestore realtime listeners. Search is available for the inbox and the currently loaded messages (up to 200). Clicking the other member's direct-chat title opens their public profile; clicking a group title opens group management. Group creators/admins can add or remove participants; group size is capped at 11 total.

The author can edit or soft-delete their own message within 15 minutes. Deleted messages remain as deleted-message markers. Messages are plain text, at most 2,000 characters. Attachments, file/image upload, voice/video calls, read receipts, reactions, typing indicators, forwarding and push notifications are not included.

## Projects and safety

Members can create public/private project cards and manage their own projects. Firestore rules restrict private user documents to the owner/admin, public directory fields to the curated whitelist, and conversations/messages to participants. Admin claims must be assigned from a trusted Admin SDK environment. The app does not upload to Firebase Storage.

The starter does not yet include a complete moderation operations dashboard, rate limiting, appeals workflow, account data export/deletion UI or anti-abuse automation. These are needed before large-scale public launch.


## Learning catalogues

The discovery workflow includes a public openHPI JSON catalogue adapter for dated courses that are current or upcoming. Bootcamp, certification and course filters are available. The Explore page links to official provider catalogues (such as edX, Coursera, Codecademy and SWAYAM) where a permitted, reliable direct feed is not connected. External catalogues open at their provider; they are not imported as individual HackVerse records.
