# v15.1 — performance, interaction and routing fixes

## Routing
- URLs are clean paths only (`/posts`, `/post/:id`, `/@username`). No hash routing anywhere.
- Old hash links (`/#/posts`, `#post/<id>`) are rewritten to path URLs on load. Auth callback fragments are left untouched.
- `vercel.json` now uses one catch-all rewrite (API routes and real files still win); `firebase.json` adds the same SPA fallback for Firebase Hosting.
- Unknown paths fall back to `/`. The Back buttons on post and profile pages now work.

## Speed
- `handleRoute` ran 3x per page load (auth events), triggering duplicate API calls. It now loads data once per page/user.
- Post detail: ~10 sequential DB queries reduced to 2 phases (5 queries); opens instantly from cached feed data and refreshes in the background.
- Vote / comment / repost / edit / delete update the UI instantly (optimistic) instead of reloading the whole feed, and roll back with a message on failure.
- API: reused Supabase client, 30s verified-token cache, rate-limit check runs alongside reads, feed lookups parallelised.
- `modulepreload` hints for app.js, data-layer.js and supabase-js.

## Deploy notes
No SQL changes. Redeploy and hard-refresh once. Make sure your Supabase Auth "Site URL / Redirect URLs" use the plain domain (no `/#`).
