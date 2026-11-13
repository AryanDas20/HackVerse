# HackVerse SQL command pack

**Important: do not run every file blindly.** Choose the path that matches the database you already have. Back up your Supabase project first.

## Existing HackVerse v13 database (most likely for the current deployment)
1. Open Supabase Dashboard → SQL Editor → New query.
2. Paste and run `HackVerse-v13-chat-conversations-fix.sql` only if the inbox still displays “Could not load conversations” or if you have not already successfully applied this repair.
3. Do not rerun v12 or v13 schema migrations if they already completed successfully.

## Existing v11 database upgrading to v13
1. Run `supabase-community-v12.sql` first.
2. Run `supabase-community-v13.sql` second.
3. If inbox reads still fail, run `HackVerse-v13-chat-conversations-fix.sql` last.

## Fresh database
Use the complete `supabase-schema.sql` from the website project as the fresh-install schema. Do not run the incremental v12/v13 migrations on top of a fresh schema unless the project instructions explicitly call for it.

## After SQL
- Confirm the SQL Editor reports Success for each selected script.
- Deploy the matching website ZIP to the Vercel project and redeploy.
- Sign out and sign back in, then test Messages and opening a chat from a public profile.

The SQL scripts are idempotent where practical, but schema versions and policy state differ between deployments. Keep a backup and do not paste all files as one combined query.
