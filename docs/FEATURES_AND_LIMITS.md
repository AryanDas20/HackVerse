# Features, behaviour, and current limits — HackStop v5.2.2

## Opportunities

The home route previews up to six opportunities. Explore opens a dedicated directory; Saved opens a separate shortlist page. Cards stay concise and open a detail modal with available organiser, location, format, track, skills, eligibility, prize, deadline, dates and source links. Filters cover opportunity type, country, region/state, format, track, source, skill, level, cost, deadline and sort order. Search normalizes case/spacing and supports partial and approximate word matches. Options depend on metadata actually supplied by the event sources.

The connected discovery feeds focus on hackathons and coding events; the openHPI adapter imports dated current/upcoming courses. Bootcamp and certification categories are available and link to official provider catalogues, but individual bootcamp/certificate records are not auto-imported unless a permitted source adapter is configured.

## Accounts and profiles

Firebase Authentication supports Google and email/password. Profile setup is a three-step flow (identity, builder skills/interests, education/privacy); optional fields can be skipped. Public/private visibility is supported. Private profiles are stored in the owner-only user document and removed from `publicProfiles`; email and phone sharing are independent opt-ins. Public profiles open on a dedicated page and may show skills, availability, links and public projects. Only public fields can be searched or viewed by other members.

## Community search

The community landing area shows a View Members action instead of a full username list. The directory supports normalized case-insensitive, partial and typo-tolerant matching across public names, usernames, colleges, locations, roles and skills, plus skill/college/year/availability/interest filters. Search uses Firestore prefix/array queries and a bounded client-side fuzzy pass; this is suitable for a modest directory, not large-scale full-text search.

## Teams and groups

Team size is configurable from 2 to 10 members including the creator. Required fields are team name, required skills and availability. College, year, course, location, hackathon, project idea and other context are optional. Skill matching provides exact/related skill scores and reasons; it is a deterministic heuristic, not an LLM. Candidate members are invited and only join after explicitly accepting. Invitations expire after seven days by default. Group/team creators can remove members and permanently delete their own room only after typing `DELETE GROUP` or `DELETE TEAM`; deletion adds member notifications and an audit record. Non-admin members can leave a room through the member controls.

## Chat

Direct and group conversations use Firestore realtime listeners. Chat includes case-insensitive inbox/message search, clear timestamps, profile links, reply metadata, emoji reactions, copy, report/block, and author-only edit/soft-delete for 15 minutes. A deleted message remains as a marker. Reactions are stored per-user and Firestore rules limit updates to the acting member. Blocking is persisted in the owner's private profile and direct-message creation is denied if either participant blocks the other. Message text is limited to 2,000 characters.

Attachments, file/image uploads, voice/video calls, typing indicators, read receipts, message forwarding and multi-device presence are not included. Firebase Storage is intentionally not used.

## Notifications

The in-app notification centre supports All, Teams, Chat, Hackathons, Community and System categories, unread state, mark-all-read, clearing, team invitation Accept/Decline actions, conversation routing, event detail routing when the event is already loaded, and per-category mute preferences. Current generators cover chat messages, team invitations/responses and group/team deletion. Automatic deadline reminders, matching-event alerts, project/social alerts, profile-view alerts and admin announcements still need corresponding event producers. Email and Web Push delivery are not enabled; they require separately configured delivery services, user consent and push/service-worker infrastructure.

## Projects and safety

Members can create public/private project cards and manage their own projects. Firestore rules restrict private user documents to the owner/admin, public directory fields to a curated whitelist, and conversations/messages to participants. Admin claims must be assigned from a trusted Admin SDK environment. No Firebase Storage uploads are provided.

The starter does not yet include a complete moderation operations dashboard, rate limiting, appeals workflow, account data export/deletion UI, production anti-abuse automation or automated moderation. Test the Firestore rules with the Emulator Suite before a public release.
