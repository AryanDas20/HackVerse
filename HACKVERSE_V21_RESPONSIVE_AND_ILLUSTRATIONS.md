# HackVerse v21 — Responsive header and feature illustrations

## What changed

- Rebuilt the header layout with separate brand, navigation and action columns on wide screens.
- Switches to a compact navigation menu at tablet widths so the HackVerse logo and Home link cannot compete for the same horizontal space.
- Keeps sign-in visible on regular phone widths, hides secondary actions when the viewport is especially narrow, and preserves the existing navigation toggle behavior.
- Added 12 original, local SVG feature thumbnails for Explore, Builds, Tech News, Builders, Posts, Messages, Profile, AI Wish, Activity, Settings, Saved Opportunities and Trust & Safety.
- Added responsive feature-art layouts, reduced-motion handling, lazy loading and asynchronous image decoding.

## Validation

- `npm run check`
- `npm test`
- All feature illustration SVG files parsed as XML.

The changes are front-end only. Existing authentication, database, APIs and feature workflows were not intentionally changed.
