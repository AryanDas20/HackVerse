# HackVerse v18 — Global Sidebar & Responsive Shell

## What changed
- Moved the primary navigation out of the header into a persistent desktop sidebar used across all routes.
- Kept the header compact with brand, notifications, theme, account actions and mobile menu control.
- Added a mobile slide-in navigation drawer with backdrop, close-on-route-change, close-on-outside-click and Escape support.
- Added active-route styling and a collapsible More group within the sidebar.
- Updated main content and footer offsets for desktop and reset them for mobile.
- Added responsive sizing for tablet, small mobile and narrow 320px screens.
- Added reduced-motion handling and restrained transitions; no new continuous animation loops.

## Files changed
- `public/index.html`
- `public/app.js`
- `public/global-sidebar-v18.css` (new)

## Validation
- `npm run check` passed.
- `npm test` passed: 61 tests.
- Manual browser/device verification is still required for real viewport behavior, accessibility, and performance measurements.

## Deploy
Copy the contents of this folder into the root of the existing repository, preserving `.env`/Vercel settings outside the repository. Commit and push to the production branch, then verify the deployment commit in Vercel.
