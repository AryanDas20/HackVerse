# HackVerse v13 — Deployment checklist

Use this checklist for an **existing v12.0.1 project**.

1. Back up the Supabase project and keep a copy of the current v12.0.1 deployment.
2. Replace project files with this v13 release and push to the connected Git repository.
3. In Supabase SQL Editor, run `supabase-community-v13.sql` after v11 and v12 migrations. Do not run the full fresh-install `supabase-schema.sql` over existing data.
4. Confirm Storage buckets: `community-media` public 8 MB, `profile-avatars` public 5 MB, and `chat-media` private 15 MB.
5. In Vercel server environment variables, configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep the service key out of all browser files. Preserve the AI variables required by the existing site.
6. Verify `public/supabase-config.js` has the project's public URL and publishable/anon key.
7. Verify Supabase Auth → URL Configuration contains the exact deployed Site URL and redirect URLs. Google Cloud OAuth must use `https://YOUR_PROJECT.supabase.co/auth/v1/callback` as its authorized redirect URI. Enable Google provider with the matching client ID/secret.
8. Deploy from Vercel and verify direct reload of `/@username` and `/post/:postId`.
9. Test with two separate accounts. Test direct chat from a profile, follow requests, privacy, posts/votes/comments/reposts, uploads, and reports.
10. Grant the moderator claim only to trusted staff using the Supabase Admin API; never from the client.

## Storage buckets

| Name | Public | Max size | MIME types |
| --- | --- | ---: | --- |
| `community-media` | Yes | 8 MB | `image/jpeg`, `image/png`, `image/webp` |
| `profile-avatars` | Yes | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| `chat-media` | No | 15 MB | Existing supported chat file types |

For each profile, sign in and save the builder profile at least once after migration to synchronise username, visibility and links into `public.profiles`.

## Local checks

```bash
npm install
npm run check
npm test
```

Run seed data only in a disposable development project. See README for the required 10 test-user IDs and environment variables.

## Important limitations

Successful SQL execution, OAuth, storage permissions, AI provider calls, chat delivery and mobile device behavior must be confirmed on the actual Supabase/Vercel deployment. This release is not represented as production-live tested.

## Chat inbox: “Could not load conversations”

If the Messages page displays “Could not load conversations. Check Supabase database rules.”, run `HackVerse-v13-chat-conversations-fix.sql` in the Supabase SQL Editor. It backfills the indexed `participants` metadata from existing conversation documents and adds a narrow authenticated SELECT policy that allows a user to read only conversations containing their own UID. It does not make chat data public. Then sign out/in and reload Messages. If it still fails, inspect the browser console for the underlying PostgREST error and verify that the signed-in user's UID is present in `documents.data->'participants'` for the affected conversation.

## v14 deployment
Replace the deployed project with the v14 ZIP and redeploy. No new database migration is required for the v14 frontend performance/home changes. If the conversation inbox still fails, run `HackVerse-v13-chat-conversations-fix.sql` once after the v13 schema migration. Do not rerun earlier migrations blindly; follow `SQL_MIGRATIONS_README.md` in the SQL bundle.
