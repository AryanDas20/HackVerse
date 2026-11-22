-- AI Pitch Arena private project storage.
-- Apply this additive migration in Supabase SQL Editor before using uploads.
-- Project and interview records are written server-side through the existing
-- service-role-backed /api/pitch-arena route and remain owner-scoped there.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pitch-arena-private',
  'pitch-arena-private',
  false,
  12582912,
  array[
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/html',
    'text/css',
    'text/x-python',
    'text/x-java-source',
    'text/x-c',
    'text/x-c++',
    'text/x-shellscript',
    'text/javascript',
    'application/javascript',
    'application/json',
    'application/xml',
    'text/xml',
    'application/sql',
    'text/x-sql',
    'application/x-sql',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 12582912,
    allowed_mime_types = excluded.allowed_mime_types;

-- Every object path must begin with the authenticated user's UUID:
-- <auth.uid()>/<project-id>/<file-name>
drop policy if exists "Pitch Arena users read their own files" on storage.objects;
create policy "Pitch Arena users read their own files"
on storage.objects for select to authenticated
using (
  bucket_id = 'pitch-arena-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Pitch Arena users upload their own files" on storage.objects;
create policy "Pitch Arena users upload their own files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pitch-arena-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Pitch Arena users update their own files" on storage.objects;
create policy "Pitch Arena users update their own files"
on storage.objects for update to authenticated
using (
  bucket_id = 'pitch-arena-private'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'pitch-arena-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Pitch Arena users delete their own files" on storage.objects;
create policy "Pitch Arena users delete their own files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'pitch-arena-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);
