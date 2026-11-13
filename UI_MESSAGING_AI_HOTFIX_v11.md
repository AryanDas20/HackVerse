# HackVerse UI and messaging hotfix v11

## Chat attachments
- Selecting a file now stages it in the message composer without uploading or sending it.
- The staged attachment card shows the file name, type, size, and a clear not-yet-uploaded state.
- The Send button performs the upload and then saves the message. Failed sends preserve the selected file and text draft for retry.
- Switching conversations clears a staged file so it cannot accidentally be sent into another room.

## AI conversation history
- Conversation history is hidden by default in both the floating assistant and AI Wish page.
- A history icon in the header opens and closes the history drawer on demand.
- History queries run only while the drawer is open, rather than during initial sign-in or page navigation.

## Visual system and responsive behavior
- Added the warm neutral palette from the supplied reference: white background, #F5F5F3 panels, #FBEDE6 highlight, #222222 text, #666666 secondary text, and #B4451F accent.
- Dark mode uses coordinated dark neutrals and the same rust accent, with readable text and surfaces.
- Theme preference is synchronized between Settings and the header toggle.
- Removed unused font families, reduced visual blur effects, and adjusted mobile chat panel heights and touch targets.

## Startup and data loading
- The startup splash has a shorter minimum display and a 1.1-second fallback instead of 2.2 seconds.
- Authenticated workspace data now hydrates without blocking route rendering; private/public profile reads run in parallel.
- Saved opportunities and projects load independently from the initial profile render.
- Opportunity reads are capped at three pages per refresh to avoid unbounded sequential requests.
- Added a preconnect for the Supabase ESM host.

## Validation
- `node --check` passed for the updated browser app, data layer, and chat media API.
- All 44 existing automated tests passed.
- Every public CSS file parsed successfully with PostCSS.
- Live authenticated uploads, AI inference, and device-specific performance still require a deployment connected to the project's Supabase services for end-to-end verification.
