# HackVerse — Product Requirements Document

## 1. Vision
HackVerse is the trusted home base for discovering, evaluating, tracking, joining, and showcasing hackathons. Promise: **Find every hackathon worth joining — in one place.**

## 2. Audiences
Students, developers, designers, product managers, founders, researchers, hobbyists, organizers, mentors, judges, recruiters, sponsors, moderators, and admins.

## 3. User outcomes
- Discover relevant events without searching many sites.
- Verify the event source and continue to the official registration page.
- Understand eligibility, dates, prize, mode, and team size.
- Save events and receive deadline reminders.
- Find complementary teammates.
- Turn participation into a durable project portfolio.

## 4. MVP requirements
P0 in this starter: responsive opportunity discovery feed; keyword search; mode/track filters; Firebase Google and email/password authentication; password reset; detailed profile onboarding; public member directory; saved events; direct and group text chat; project cards; profile reporting; Firestore rules; admin-controlled public event collection; RSS moderation scaffold.

Next: email-verification enforcement; App Check; contact requests and blocking; moderation console; notifications and reminders; deadline dashboard; project collaboration; organizer-submitted events; calendar export; full-text search; official source adapters; deduplication; AI recommendations; judge/recruiter tools.

## 5. Trust requirements
Every public event must expose source attribution, original/source URL, official event/registration URL where known, last-updated time, verification status, and a report action. Unverified social discoveries stay in moderation until reviewed. Never imply an unverified listing is official.

## 6. Success metrics
- Search-to-event-detail click-through.
- Save rate and saved-event return rate.
- Official registration click-through.
- Percentage of listings with verified official URLs.
- Duplicate rate and stale/cancelled listing rate.
- Time from source publication to indexed listing.
- Reminder engagement and missed-deadline reduction.
- Report resolution time.
- Team request acceptance and project showcase completion.

## 7. Non-goals for initial release
No universal ingestion guarantee; no prohibited scraping; no automated registration on third-party sites; no payment handling; no public messaging until reporting/blocking/moderation exist; no unsupported claims of AI verification.
