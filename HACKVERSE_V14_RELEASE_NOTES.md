# HackVerse v14 release notes

## Messaging and mobile experience

- Reworked the mobile Messages layout into a WhatsApp-style contact/conversation list first, with a dedicated full-screen chat view and a clear back button.
- Added a quick route from the chat list to the public Builders directory; opening a builder starts or resumes a direct chat, and the mobile back button returns to that directory.
- Kept message forwarding for text and shared cards, including a visible forwarded label.
- Reduced avoidable chat rendering and backend writes: message snapshots are batched per animation frame, initial history is capped at the latest 120 messages, typing updates are throttled, and read/delivery receipts are only written for new incoming messages.
- Preserved signed attachment previews across message snapshots and hydrate only the latest required attachment URLs.
- Reduced expensive decorative effects on small screens and improved scroll preservation while reading older messages.

## Posts, projects and opportunities

- Removed the “Choose what opens when you tap Home” preference and its routing behavior.
- The Posts composer is now collapsed by default and opens only after “Create post” is clicked; it can be closed without publishing.
- Added a consistent sharing menu for public posts, project showcases/build posts and opportunities: share in a HackVerse chat, share externally with a 1080 × 1080 PNG card, or copy the link.
- Added rich shared-item previews inside chat messages, with support for forwarding those cards to another conversation.
- Kept private and followers-only posts/projects from being forwarded or shared externally.
- Added Share actions to opportunity cards and details, and project cards.

## Verification

- `npm test` — 50 automated tests passed.
- `npm run check` — JavaScript syntax checks passed.
- Production Supabase permissions, OAuth, live opportunity links and real-device/browser behavior still require validation in the deployed environment.
