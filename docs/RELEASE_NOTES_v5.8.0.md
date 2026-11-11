# HackVerse v5.8.0 — AI history, chat motion and opportunity discovery

## Included
- Per-conversation AI history deletion and a mode-specific Clear history action for AI Chatbot and AI Wish. Deletion removes child messages before the owner conversation document.
- New-message arrival animation, reaction pop, typing pulse/dots and delivery-state micro-interactions; existing initial message loads do not reanimate the full chat. All new motion respects `prefers-reduced-motion`.
- Expanded Explore catalogues for hackathons, case competitions, coding contests, online courses, bootcamps and certifications. Provider directory cards open official provider pages.
- Expanded Brabble public RSS ingestion across category and Indian city facets, an optional paginated Brabble aggregate API adapter covering its documented upstream platform index, plus an official Codeforces public contest API adapter.

## Important limitations
- There is no single complete public feed for every opportunity on the internet. Some directories need authenticated APIs or prohibit scraping/republication. HackVerse combines available public feeds/APIs and provides official catalogue links where automated ingestion is unavailable.
- AI history deletion uses the signed-in owner's Firestore permissions. Publish the current Firestore rules if your deployment has older rules.
- To enable broad Brabble aggregator imports, add `HACKVERSE_BRABBLE_API_KEY` as a GitHub Actions repository secret using a free key from https://brabble.ai/dashboard. Without it, the RSS feeds and direct API sources remain active.
- Run the GitHub Actions workflow manually after deployment to confirm provider feeds and APIs can be reached from the runner.
