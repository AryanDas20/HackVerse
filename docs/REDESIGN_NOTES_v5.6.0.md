# HackVerse v5.6.0 redesign notes

## Visual system
- Introduced a unified red, pink and green design system with consistent button sizing, card radii, borders, spacing and focus states.
- Added a bold red hero, clearer call-to-action hierarchy and a scenic gradient/mountain-style footer inspired by the supplied visual references, without copying protected game characters or artwork.
- Added responsive breakpoints for navigation, cards, profiles, chat, forms and the AI workspace.
- Added higher-contrast light-mode styling for inputs, cards, text, controls and muted descriptions.

## Navigation and AI
- Simplified the primary navigation and moved secondary destinations into the More menu.
- Added AI Wish as a full page (`#aiwish`), a navigation item and a main-page CTA.
- Kept the floating Agent37 control as the website-help chatbot entry point only.
- Added `aiwish` to the Agent37 navigation action schema.

## Messaging and profiles
- Group info is available to all group participants; add/remove/delete controls remain restricted to group admins/owners.
- Message author names and group roster members open their public profiles when available.
- Expanded the signed-in profile overview and group roster presentation.

## AI history and team builder
- AI history loading retries without the composite sort query, then sorts client-side, reducing dependency on a composite index for the history list.
- Team matching displays an animated matching state before showing the result.

## Configuration safety
- No secret values were added to this archive. Keep Firebase service-account JSON, Agent37 API keys and Supabase secret/service-role keys in Vercel Secret environment variables only.
- `public/supabase-config.js` contains only the Supabase publishable key, which is intended for browser use.
