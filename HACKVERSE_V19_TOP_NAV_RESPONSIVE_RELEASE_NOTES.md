# HackVerse v19 — Top Navigation & Career Match Clarity

## Navigation
- Restored the primary navigation to the top header instead of a persistent left sidebar.
- Kept the most-used destinations visible on larger screens: Home, Posts, Builds, Explore, Career Match and Messages.
- Moved Builders, AI Wish, Profile, Saved Opportunities, Safety & Reports, Activity, Settings, website tour, notifications, appearance and sign-in/sign-out into the **More** dropdown.
- On tablet and mobile widths, the navbar menu button opens a scrollable menu directly below the top header.
- Added Escape/outside-click/route-change closing and consistent `aria-expanded` state handling.
- Removed the v18 page-width offset caused by the sidebar shell.

## Responsive layout
- Added layout rules to prevent common header, form, toolbar and action-button groups from forcing horizontal overflow.
- Reflowed Career Match cards, tool summaries, result actions, timers and application cards at narrower widths.
- Added a compact layout for screens as narrow as 320 CSS pixels.
- Respects reduced-motion preferences.

## Career Match explanations
- Added a three-step plain-language introduction to using Career Match.
- Added an explanation of PDF text extraction, page layout handling, OCR, skill aliases, matched/missing skills and job-description evidence.
- Added feature guides for Resume Intelligence, the 14-day Skill Sprint, Interview Lab, Career Studio, Portfolio Audit and Application Tracker.
- Explained that heuristic scores are guidance only, not a real employer ATS score or hiring prediction.
- Clarified that learning progress, interview notes, portfolio checks and application-tracker entries are browser-local and do not sync between devices.

## Validation
- `npm run check`
- `npm test`

No database migration or new environment variable is introduced by this update.
