# Testing Plan

## Functional
- Google sign-in success/cancel/error; email signup/signin; verification email; password reset; signout.
- Saved event add/remove; saved list scoped to current UID.
- Profile onboarding, username collision, public/private field separation, and profile edits.
- Member directory prefix/skill search, role filter, and looking-for-team filter.
- Direct chat with two accounts, group chat with multiple accounts, message size limit, and participant-only message reads.
- Project create/delete and profile report submission.
- Search typo/empty/no-result behavior; track/mode/sort filters.
- Official links open in new tab with noopener.
- Feed handles missing fields, malformed dates, long titles, no prize, expired events.

## Security
- Anonymous user cannot read private account documents/saved events; public profiles are intentionally public.
- User A cannot read or mutate User B private account data, saved events, projects, or conversations they do not belong to.
- Client cannot set admin role or publish/edit hackathons.
- Non-admin cannot invoke manual refresh.
- App Check and callable auth enforced.
- No secrets in public assets or git history.

## Ingestion
- RSS timeouts, malformed feeds, duplicate links, redirects, rate limits, empty feed, retry.
- Candidate is moderation-only; never auto-published.
- Preserve attribution and source URL; only minimum permitted content stored.
- Date/timezone and cancellation tests before enabling publishing.

## Accessibility/responsive
- Keyboard-only navigation; visible focus; labels; modal focus/escape; screen reader status.
- WCAG contrast checks; 320px mobile, tablet, desktop, 200% zoom.
- Reduced-motion preference and light/dark theme.

## Operational
- Emulator Suite CI; rules tests; function unit tests; scheduled-job monitoring; backup restore drill; budget alerts.
