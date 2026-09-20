-- P0-S1 — ownership hardening for Storage bucket `lmnp-documents`.
--
-- Live before (HEAD e74715a, inspected 2026-09-20):
--  * bucket exists, public = false
--  * only bucket in the project
--  * 322/322 objects use path convention `{userUuid}/{timestamp}-{filename}`
--  * TWO permissive policies allow ANY authenticated user to SELECT/INSERT
--    any object in the bucket (bucket_id check only — no folder ownership):
--      - "2 Give users authenticated access to folder vvme7i_0" (SELECT)
--      - "Give users authenticated access to folder vvme7i_0" (INSERT)
--  * no UPDATE / DELETE client policies
--  * no anon policies (anon table grants exist but RLS has no anon policy)
--
-- Permissive policies are OR-ed: leaving the old SELECT/INSERT policies would
-- cancel any owner-folder isolation we add.
--
-- Path convention (unchanged by this migration):
--   {auth.uid()}/{timestamp}-{sanitizedFilename}
-- First folder segment MUST equal auth.uid()::text.
--
-- Final model for bucket lmnp-documents only:
--  * authenticated SELECT / INSERT / UPDATE / DELETE own folder
--  * anon: no policy
--  * service role bypasses RLS (document delete API unchanged)
--
-- Scope: drop ONLY the live policies identified for this bucket (+ our own
-- deterministic names for idempotent re-runs). Do NOT drop every policy on
-- storage.objects (would affect other buckets if any appear later).

-- Ensure private bucket without recreating it.
insert into storage.buckets (id, name, public)
values ('lmnp-documents', 'lmnp-documents', false)
on conflict (id) do update set public = false;

do $$
declare
  -- Live Dashboard policy names identified during P0-S1 inspection.
  -- Plus our deterministic names so re-running converges to the same state.
  doomed text[] := array[
    '2 Give users authenticated access to folder vvme7i_0',
    'Give users authenticated access to folder vvme7i_0',
    'lmnp_documents_owner_select',
    'lmnp_documents_owner_insert',
    'lmnp_documents_owner_update',
    'lmnp_documents_owner_delete'
  ];
  p text;
begin
  foreach p in array doomed
  loop
    execute format('drop policy if exists %I on storage.objects', p);
  end loop;

  create policy lmnp_documents_owner_select
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'lmnp-documents'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy lmnp_documents_owner_insert
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'lmnp-documents'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy lmnp_documents_owner_update
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'lmnp-documents'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'lmnp-documents'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy lmnp_documents_owner_delete
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'lmnp-documents'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
end
$$;
