# HackVerse v14 — Home and performance pass

## Changes
- Removed the “Your HackVerse Home / Save home feed” preference section and its local/server preference handlers. Home now consistently opens the overview.
- Removed saved-feed preference routing; Posts opens the public/explore feed by default.
- Hid the “Your next build starts with a connection / Create your free account” promotional CTA while signed in; it remains available to visitors and returns after sign-out.
- Reduced sign-in startup work: inbox listeners, saved items, projects and hackathon history are loaded only when their respective workspace routes need them, rather than all during initial account hydration.
- Opportunity directory reads now start when the member opens Home's opportunity panel or the Opportunities route, rather than unconditionally on every sign-in.
- Deferred external font stylesheet application so text and layout can render using fallback fonts while Google Fonts loads.
- Added off-screen section rendering hints on larger screens and honors reduced-motion settings.

## Important
These changes reduce unnecessary browser work and network reads. Real-world speed still depends on Supabase response times, network conditions, Vercel deployment and the size of each member's feed. Live production performance must be measured after deployment.
