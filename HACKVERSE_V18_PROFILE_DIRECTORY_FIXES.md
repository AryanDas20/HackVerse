# HackVerse profile directory fixes

## Fixed

- The profile editor previously displayed `Public` as the default visibility but silently saved the profile as private when the separate directory-consent checkbox was not checked. The privacy section is now opened when the editor launches, the opt-in is labelled in plain language, and a public save now explains exactly what is missing instead of silently hiding the member.
- Public directory publication now requires a valid display name, a valid 3–24 character username, and explicit directory consent. Private and followers-only profiles remain private.
- The save flow verifies that the `publicProfiles` directory record exists and has public visibility before reporting that publishing succeeded.
- Existing accounts with an explicit prior public opt-in but a missing `publicProfiles` projection attempt a safe self-repair on sign-in.
- The shared Supabase data adapter previously translated every `array-contains` query into a filter on the `participants` SQL column. Profile skill and interest searches therefore queried the wrong data. These now use JSONB containment on the document payload; chat participant queries continue using their indexed column.
- The owner's own private profile remains visible in their account profile panel even when it is intentionally absent from the public Builders directory.

## Database / deployment

No SQL migration or new environment variable is required. The existing `publicProfiles` document policies already support owner-created public directory entries. Deploy the updated application files together so the profile writer and directory query adapter stay in sync.

## Validation

- `npm test`: 54 tests passed.
- `npm run check`: passed.
- JavaScript syntax checks passed for the application, data adapter, publication helper and social API.

A live Supabase/Vercel smoke test is still needed to confirm the project's deployed RLS policies and credentials.
