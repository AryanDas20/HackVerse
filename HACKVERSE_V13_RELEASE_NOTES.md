# HackVerse v13 release notes

## Product changes

- Separated social Posts from project showcase Builds.
- Added a dedicated individual profile route (`/@username`) and direct post route (`/post/:postId`).
- Added user profile details and tabs for posts, replies, media, likes, followers and following.
- Added upvote/downvote toggle semantics, comments, reposts, share links, soft delete and edited timestamps.
- Added directional follows and pending/accepted/rejected follow requests for private and followers-only accounts.
- Added configurable landing feed preferences for overview, public posts, following posts, Builds and opportunities.
- Added report intake for users, posts, comments, messages, technical issues and other concerns, private report history and admin-only review queue.
- Added account block/unblock backend actions and profile block control; blocks remove both follow directions and hide community content.
- Added social profile fields for website, GitHub, LinkedIn and portfolio URLs.

## Stability and responsive changes

- Normalized profile-to-chat target IDs so both `uid` and `id` profile objects open the correct conversation.
- Prevented duplicate rapid direct-chat creation attempts.
- Reused deterministic direct conversation IDs without replacing message previews.
- Paused inbox/message/typing polling when those views are inactive.
- Reduced mobile chat minimum height to fit shorter viewports and enabled momentum scrolling inside the message list.
- Added Vercel SPA rewrites for direct profile and post URL reloads.
- Corrected invalid CSS font shorthand declarations.

## Database and API

- Added normalized social tables, indexes, RLS policies, rate limiting and trigger-maintained counters.
- Added keyset cursor pagination for feed and profile post lists.
- Added input validation, URL allow-listing, rate limiting, bearer-token verification and server-side service-role access.
- Kept Supabase Auth as the credential identity store; no raw password hashes are added to public application tables.

## Verification

- JavaScript syntax checks passed.
- 50 automated tests passed.
- HTML/CSS static checks and archive integrity are run during packaging.

Live OAuth, production SQL migration, Storage access, Supabase RLS and real-device performance still require staging validation.
