# HackVerse v5 testing checklist

## Opportunities
- Home displays no more than six preview cards; Explore opens a distinct directory route; Saved opens a distinct shortlist route.
- Read details opens the modal; close button, Escape and backdrop close work.
- Card descriptions are truncated; detail modal contains full available description, source attribution and safe external source link.
- Test type, country, region, format, track, skill, level, cost, deadline and source filters, plus clear/reset and pagination.
- Test unknown data: missing track, prize, team size, deadline, country and description should not display fabricated TBA values as facts.
- Confirm course/bootcamp filters stay empty until a permitted source supplies records; do not treat category support as proof of source coverage.

## Accounts and privacy
- Create two accounts and complete profiles.
- Public profile is searchable by name, username, full college and short name; test contact search only after opting in.
- Private profile is removed from `publicProfiles`, is not returned in search/team matching, and remains visible to its owner from the private user document.
- Email/phone default Private; opt-in publishes only the selected field; switching back to Private clears it from `publicProfiles`.
- Verify User A cannot read User B `users/{uid}` or saved-event records.

## Community and teams
- Search name, college/short college name, skill, public email and public phone.
- Open a member profile; verify education, skills, interests, bio, public links and only opted-in contact details.
- Build a team with multiple required skills, change candidate checkboxes and create its group chat.
- Create a group with the picker; add/remove members as owner/admin; verify groups cannot exceed 11 members and owner cannot be removed.
- Verify private profiles do not appear in client-side matching; do not bypass this by exposing private profile documents.

## Messaging
- Send direct messages between two test accounts and create group rooms.
- Click a direct chat heading to open the other user's profile; click a group heading to open member/settings view.
- Search conversations and the currently loaded messages (up to 200).
- Edit and soft-delete your own message inside 15 minutes; verify other participants see the change. Verify controls disappear after 15 minutes and other users cannot edit it.
- Verify non-members cannot read conversation or message documents.

## Security and operations
- Test rules in Firebase Emulator Suite before production deployment.
- Confirm publicProfiles contains only its allowlisted fields; private snapshots and base email/phone values remain in users/{uid}.
- Confirm browser cannot write events/discovery sources or set admin claims.
- Confirm no service-account JSON or API key appears in the Git tree or public assets.
- Run the GitHub Actions workflow manually and verify the job writes an `ingestionRuns` record and events to Firestore.

## Responsive/accessibility
- Test 320px mobile, tablet and desktop widths; nav, filters, cards, chat panels and modals should fit.
- Test keyboard access, visible focus, input labels, Escape/backdrop modal close and reduced-motion preferences.


## Learning catalogue checks

- Run the standalone discovery job and verify the openHPI source adds only courses with valid HTTPS URLs and dates that have not ended.
- Verify old openHPI courses are skipped and course `endAt` values are expired by the discovery expiry pass.
- Select Courses, Bootcamps and Certifications in Explore and confirm the matching official provider catalogue cards appear.
- Confirm provider links open in a new tab and event details preserve the original course URL.


## v6.1.0 opportunity directory efficiency checks
- Sign in and open the opportunity directory; confirm the live directory loads and the count is populated.
- Navigate away and return within 30 minutes; confirm the directory is displayed from the browser cache without a new full-directory read.
- Select **Refresh**; confirm a fresh Firestore read occurs even when the cache is still valid.
- Run discovery as an administrator; confirm the directory refreshes from Firestore after the run completes.
- With a previously loaded cache, simulate a temporary Firestore read failure; confirm the last loaded directory remains visible with a stale-data notice.
- Wait beyond 30 minutes or clear the browser cache; confirm the next directory load fetches fresh records.
