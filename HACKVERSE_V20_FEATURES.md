# HackVerse v20 — Tech News, Sharing Cards and Profile Setup

## What's new

### Tech News
- Added a dedicated **Tech News** destination in the main navigation.
- Live technology stories are fetched from the public Hacker News API.
- Topic filters include AI & ML, Developer, Security, Startups, Open source and Hardware.
- Added headline/domain/author search, newest/top sorting, refresh and load-more controls.
- Saved stories are retained in the browser, including a small story snapshot so they remain available after leaving the live feed.

### Share anything from HackVerse
- News stories and opportunities now use the same share hub.
- Destinations include WhatsApp, Telegram, X, LinkedIn, email, the device's native share sheet, HackVerse chat and copy-link.
- Opportunities and news can also be shared as a **HackVerse-branded PNG card**. Supported browsers can share the image directly; other browsers download the card and copy its source link.
- Opportunity cards display HackVerse branding, the opportunity title, summary, useful details and source link.

### Builder profile
- Removed the old discovery wording and the separate directory checkbox / followers-only profile choice.
- Profile visibility now has exactly two choices: **Public** or **Private**.
- Public is the single opt-in that publishes the profile in Builders; Private removes the public directory profile.
- Email and phone remain private unless the member separately chooses to share them in Step 04.
- Added a live profile-completion meter, clearer section headers, highlighted visibility cards, focus states and motion-aware animations.
- Updated the profile-directory recovery helper to treat explicit Public visibility as the single publishing choice while continuing to exclude private/followers-only profiles and private contact fields.

## Setup and deployment

- No new API keys or database migration are required for these features.
- Tech News requires an internet connection to read the public Hacker News API.
- Public profile publishing still requires the existing profile database permissions and a valid display name and username.
- Browser/device sharing depends on platform support. The branded PNG download is the fallback when direct image sharing is unavailable.
- Deploy the updated project files to the existing hosting setup and verify public/private visibility with two test accounts.

## Validation performed

- `npm run check` — passed.
- `npm test` — all automated tests passed.
- External OAuth, database permissions, device share sheets and the live deployed feed still need verification in the actual hosted environment.
