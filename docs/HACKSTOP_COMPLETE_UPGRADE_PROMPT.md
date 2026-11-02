# HackVerse / HackStop — Complete Social Collaboration Upgrade Prompt

Act as a senior full-stack engineer, Firebase architect, UX designer, accessibility specialist, and QA engineer. Upgrade the existing **HackVerse v5.1 — Social Opportunity Platform** codebase. Preserve its existing opportunity discovery, Firebase Authentication, Firestore data, profiles, projects, and deployment workflow. Do not rebuild from scratch or remove working features.

## Non-negotiable engineering constraints
- Keep the existing Firebase project and compatible data model. Do not create a new Firebase project.
- Use Firebase Authentication and Cloud Firestore. Do not use Firebase Cloud Storage.
- Keep the app compatible with Firebase Spark plan; do not require paid Cloud Functions, Blaze, or paid third-party APIs.
- Do not put Admin SDK credentials, service-account keys, or private secrets in browser code.
- Respect Firestore security rules. Never rely on client-side hiding as the only authorization check.
- Keep public profile contact fields private unless the profile owner explicitly opts in.
- Use external image URLs or initials; do not upload image binaries.
- Preserve existing routes, event discovery, filters, saved events, and GitHub Actions discovery workflow.
- Do not claim a feature works until it has been tested. Provide migration notes for any changed Firestore schema/rules.
- Prefer accessible native controls, clear validation, loading states, empty states, error messages, and keyboard support.

## 1. Chat message management
- Every message authored by the signed-in user must expose Edit and Delete actions where permitted.
- Editing must update the same message document, preserve author and creation timestamp, set `edited: true`, and store `editedAt`.
- Deletion should be a soft delete for all participants: replace message content with a deleted marker and store `deleted`, `deletedAt`, and `deletedBy`. Never let one user edit or delete another user's message.
- Enforce edit/delete limits and authorization in Firestore rules, not just JavaScript. Clearly communicate the time limit in the UI.
- Show an edited indicator, deleted-message state, message timestamp, and useful error feedback.
- Avoid browser `prompt()` for ordinary message edits; use an in-app edit composer or modal with Save and Cancel.

## 2. Group and team lifecycle
- Group creator can manage and delete their own group.
- Group deletion must open an accessible confirmation dialog with a required explanation note. Require the creator to type a clear confirmation phrase before final deletion.
- Use a safe soft-delete/archive strategy and explain what happens to existing messages and member inboxes. Do not claim Firestore subcollections are physically cascaded unless they are actually deleted by a trusted process.
- Group admins may manage members only if the creator has granted that permission.
- Add a genuine invitation/consent workflow:
  1. Creator selects proposed members.
  2. Create pending invitation records, not active membership.
  3. Notify each invitee.
  4. Invitee can Accept or Decline.
  5. Only after acceptance may the user be added to `participants` and read group messages.
  6. Expired, declined, revoked, and accepted states must be handled.
- Never add a person to a group merely because another user selected them. A creator-side checkbox or confirmation is not a substitute for invitee consent.
- Limit groups to 10 invited members plus creator (or clearly define and enforce the selected maximum).

## 3. Chat profile access
- From a direct chat, clicking the other member's name/avatar must open that member's detailed profile.
- From group chat, clicking a member must open their profile.
- Provide a dedicated, shareable in-app profile route/page rather than losing the chat context.
- Include only profile fields that the member has made public: display name, username, college, course, study level/year, city/country, bio, skills, interests, roles, availability, and opted-in portfolio/GitHub/LinkedIn/contact details.
- Include clear Chat, Contact (only when contact is public), and Back to chat actions.
- If a profile is private or deleted, show a clear privacy/unavailable state.

## 4. Community member directory
- Replace the permanently expanded people list with a clear **View members** action.
- Clicking it opens the full member list with search, role filters, and “looking for a team” filter.
- Each member row/card has three distinct actions: View profile, Chat, and Contact.
- Contact is enabled only for fields explicitly shared by that member; otherwise explain that contact details are private and offer Chat.
- Search must be case-insensitive across display name, username, college, course, skills, interests, and public contact fields.
- Normalize search input and stored searchable fields consistently. Handle punctuation and whitespace sensibly.
- Do not expose private phone/email or private profiles through search.

## 5. Smart team generator
- Ask for project/team name, required skills/roles, members per team, and number of teams to generate (1–10).
- Optional, never-required fields: college preference, college year/study level, timezone, availability, preferred mode, and other useful constraints.
- Match exact and related skills using a transparent synonym/related-skill map. Display exact matches separately from related skills.
- Explain why each person matched. Do not invent match percentages; if a score is shown, define how it is calculated.
- Avoid selecting the same candidate into multiple teams unless the user explicitly enables that.
- Show separate editable candidate lists for each suggested team.
- Let the user regenerate, remove candidates, and manually search/add candidates.
- Creating a team must use the invitation/consent workflow above; do not activate group membership before invitees accept.
- Provide options to delete or archive generated teams.

## 6. Account creation and profile completion
- Make account creation concise, friendly, and mobile-first.
- Split required identity/authentication fields from optional profile enrichment.
- Use progressive disclosure: ask only for essential account details first; let users add college, year, skills, interests, and links later.
- Clearly mark required and optional fields.
- Provide inline validation, password visibility toggle, password reset, Google sign-in, loading and disabled states, and actionable error messages.
- Never silently fail when Firebase is unavailable or configuration is missing.

## 7. Notifications
- Build a detailed notification centre with unread count, read/unread states, mark-one-read, mark-all-read, and optional delete/dismiss.
- Notification types should include group invitation, invitation accepted/declined, new direct message, group message, group member added/removed, team match, and relevant platform activity.
- Every notification must have a working action button that navigates to the exact related chat, group, profile, or page.
- Use Firestore notification records with secure per-user rules. Do not let a user read or modify another user's notifications.
- Avoid duplicate notifications on retries and real-time listener reconnects.
- Provide empty, loading, error, and offline states. Respect user notification preferences.

## 8. Design system and responsive UI
- Refresh the visual theme to a professional **pink + sky-blue** palette with accessible contrast.
- Increase small text sizes and line-height. Keep body text comfortably readable on desktop and mobile.
- Make every page, modal, form, card, chat panel, navigation menu, and notification panel responsive.
- Use mobile-first breakpoints. Prevent horizontal overflow and overlapping buttons.
- Ensure touch targets are comfortable, inputs are legible, and modals fit within the viewport with independent scrolling.
- Keep light mode and dark mode fully functional. Persist the user's choice and apply it before first paint to prevent theme flash.
- Verify focus states, keyboard navigation, reduced motion, labels, accessible names, and contrast.

## 9. Firestore rules, indexes, and migrations
- Update Firestore rules for messages, group deletion, invitations, membership acceptance, notifications, and public/private profile access.
- Validate field types, allowed keys, lengths, immutable fields, actor identity, membership, and state transitions.
- Do not allow client-side users to assign admin claims or alter another user's private data.
- Add any required composite indexes and include a migration guide.
- Keep compatibility with existing users, profiles, conversations, and messages. Do not erase existing data.

## 10. QA and delivery
- Audit every button, link, form, modal, route, and navigation action.
- Test sign-up/sign-in/sign-out, profile save, public/private visibility, chat, message edit/delete, group creation, invitations, accept/decline, group deletion, community search, team generation, notifications, and both themes.
- Test mobile widths (320px, 375px, 390px, 430px) and desktop widths.
- Run JavaScript syntax checks, lint/build checks if configured, Firestore rules validation, and ZIP integrity checks.
- Fix console errors, rejected promises, missing DOM selectors, broken imports, and permission-denied errors.
- Deliver the complete updated source as a ZIP with a version number, a concise changelog, setup instructions, Firestore rules/indexes, and a test report.
- Include a feature-status table: Implemented and tested / Implemented but needs Firebase verification / Not implemented. Never label the project “error-free” without exhaustive evidence.

## Expected deliverables
1. Complete updated website source ZIP.
2. Detailed changelog and beginner-friendly setup/deployment steps.
3. Updated Firestore rules and any indexes/migration steps.
4. A test report with actual checks performed and remaining limitations.
5. A list of any Firebase Console settings the owner must enable manually.
