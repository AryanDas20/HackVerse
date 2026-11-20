# HackVerse v20 — Career Match refresh, palette system and interaction polish

## Visual system
- Applied the requested forest / sage / oat palette across the main HackVerse website: `#6F8F7B`, `#AFC8B4`, `#F4EBDD`, `#D8C7A6`, `#3E5F4D`.
- Scoped the peach / taupe palette to Career Match only: `#FFDBBB`, `#CCBEB1`, `#997E67`.
- Added a warm, animated Agent37 Career Copilot panel with three guided prompt actions.

## Career Match Copilot
- The three guided actions open a new conversation in the existing HackVerse AI workspace.
- When a Career Match report is visible, the prompt includes the recognised matched/missing skills and a limited job-description excerpt. It does not send the uploaded PDF itself.
- AI suggestions are labelled as drafts and users are reminded not to invent experience or metrics.
- Uses the existing Agent37 integration and existing AI conversation flow; no new environment variables or database migration were added.

## Performance and responsive UI
- Added `content-visibility` containment for inactive app views and Career Match panels.
- Removed entrance animation replay from settings panels and added reduced-motion safeguards.
- Added compact responsive rules for the Copilot panel and settings layout.

## Community voting transparency
- Upvote/downvote totals are now interactive.
- The voter list uses the existing authenticated social API, verifies that the post is visible to the requesting member, and returns only public-facing profile fields needed for profile navigation.
- Clicking a listed voter opens their public profile.

## Validation
- `npm run check`
- `npm test`
- No Supabase schema migration or new Vercel environment variable is required by this update.
