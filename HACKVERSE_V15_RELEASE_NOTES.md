# HackVerse v15 release notes

## Routing and navigation

- Replaced client-side hash navigation with clean path-based routes: `/posts`, `/feed`, `/messages`, `/people`, `/profile`, and the other application sections.
- Browser Back/Forward now follows the path history, and Vercel rewrites serve the app on direct route loads and refreshes.
- Public profiles (`/@username`) and individual posts (`/post/:postId`) continue to use stable shareable paths.

## Progressive profile setup

- Removed the forced profile-completion gate after sign-up. New accounts can enter the workspace immediately.
- Split profile editing into four save-anytime sections: basics, education/location, builder identity, and privacy/contact. Only the basics are expanded initially; all profile fields are optional.
- Profiles remain private drafts unless the user explicitly opts in to community visibility. Public, followers-only and private visibility are synced appropriately.

## Feed performance and reliability

- Added short-lived session caches so recent Posts and Builds can render before the live refresh completes.
- Scoped Builds engagement reads to the post IDs in the current feed page, and scoped saves/follow data to the signed-in user.
- Parallelized related feed reads, sorted comments locally, and deferred painting of off-screen feed cards.
- Added Firestore-style `in` query support to the Supabase compatibility layer for the scoped engagement queries.
- Corrected the transaction adapter so queued writes are awaited and persistence failures propagate to the caller.

## Sharing and contact picker

- Replaced the numeric destination prompt with a searchable recipient picker showing recent HackVerse chats and public builders. Selecting a builder can start a direct chat and send the item.
- WhatsApp now opens its own contact chooser without asking for a phone number. The native device share sheet is also available for installed apps and contacts.
- Kept branded PNG download and copy-link fallbacks for browsers without the Web Share API.

## Verification

- `npm run check` — JavaScript syntax checks passed.
- `npm test` — 52 automated tests passed.
- Direct route refresh, OAuth, Supabase RLS, device share sheets and real-world performance still need verification in the deployed environment with the project's configured credentials.
- No database schema migration is introduced by this release. Deploy the updated files and `vercel.json` together.
