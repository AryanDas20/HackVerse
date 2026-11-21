# HackVerse v20.1.0 — Performance and Resume Smoothness Update

## Summary

This release builds on v20.0.0 (Career Match, global sage theme, voter transparency and settings improvements) and focuses on reducing lag during tab switching and returning to HackVerse after visiting another website.

## Performance changes

- **No route rerender on browser resume:** `pageshow` and visible-tab resume now dismiss the boot splash only. They no longer call the route lifecycle again; real navigation continues through the existing router.
- **Cooldown and deferred opportunity feed refresh:** visibility resume and the 30-minute refresh timer share a 30-minute cooldown. When refresh is due, it waits 1.2 seconds after resume so the page can paint and become interactive first.
- **Bounded opportunity feed:** initial/refresh reads are limited to 200 records, down from as many as 1,500. Additional pages load on demand as the member reaches the end of loaded results, so older listings are not dropped. Cached data is displayed immediately while the refresh runs.
- **Single feed render per page:** each requested page is rendered once; pagination preserves the user's current visible count and filters.
- **Request deduplication:** simultaneous auth, route-resume and manual feed calls share one in-flight opportunity load.
- **Staggered listener resume:** live collection listeners enqueue refreshes after a hidden tab becomes visible. Active messages and conversations are prioritised; listeners no longer all issue requests in the same instant.
- **Reduced polling load:** active messages poll every 3.5 seconds, typing every 2.5 seconds, conversations every 10 seconds and normal collections every 20 seconds. Polling pauses while the tab is hidden and still cleans up on unsubscribe.
- **CSS request consolidation:** 17 local stylesheets are bundled into one ordered stylesheet request, retaining the existing styles and their cascade order.
- **Background animation pause:** decorative CSS animations pause while the tab is hidden; reduced-motion preferences remain respected.
- **Career Match remains lazy-loaded:** the career module is not imported until the signed-in user opens that route.

## Existing v20 features retained

Career Match, Resume Studio, skill gap analysis, learning roadmaps, Skill Sprint, Interview Lab, Career Studio, Portfolio Audit, Application Tracker, Agent37 Career Copilot, the sage global theme, separate peach/taupe Career Match theme, Settings updates and privacy-aware voter lists are retained from v20.0.0.

## Files changed in v20.1.0

- `public/app.js` — on-demand opportunity pagination, render-once page updates, shared in-flight request, refresh cooldown, no route lifecycle on resume and background animation state.
- `public/data-layer.js` — staggered visibility-resume refresh queue and lower polling frequency.
- `public/index.html` — local stylesheet links consolidated to the CSS bundle.
- `public/hackverse-v20.css` — ordered bundle of the existing stylesheets plus performance/accessibility rules.
- `functions/test/performance-resume.test.cjs` — regression checks for resume, feed bounds, CSS bundling and listener staggering.
- `VERSION.txt` — set to `20.1.0`.
- `HACKVERSE_V20_1_PERFORMANCE_NOTES.md` — release notes.

## Database and environment

No new database migration or environment variable is required. Existing Supabase, Agent37 and Vercel configuration is retained.

## Verification performed

- `npm test`: **69 passed, 0 failed**.
- `npm run check`: passed (JavaScript syntax checks).
- ZIP archive integrity and local stylesheet references: verified.

## Important limitation

These are code-level performance fixes and regression checks. A real Lighthouse run, throttled-network profiling, live Supabase/Agent37 test, and device-by-device testing were not performed in this environment. Performance can still depend on database indexes, network latency, image sizes, browser memory and the user's device. Use Chrome DevTools Performance/Lighthouse after deployment to measure actual field performance.
