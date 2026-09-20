-- P0-S0 — ownership hardening for `documents`.
--
-- Live (HEAD 95d5ae0): anon SELECT returns every row (322), exposing user_id,
-- dossier_id and file_path. RLS is already ON (anon INSERT is denied by policy),
-- so the hole is a permissive SELECT policy, not RLS being disabled. Permissive
-- policies are OR-ed: adding owner policies without dropping the existing ones
-- would NOT close the leak.
--
-- Client usage (browser anon key + user JWT):
--  * SELECT own rows — fetchDocumentsForDossier
--  * INSERT own rows with the caller's dossier_id — uploadDocument
--    (F009 / F011 / F012 and the shared upload pipeline)
-- UPDATE (extraction_status) and DELETE go through getServerSupabaseUnscoped()
-- (service role) and must keep bypassing RLS. No client UPDATE/DELETE policy.
--
-- Ownership:
--  * user_id = auth.uid()
--  * if dossier_id is present, that dossier's user_id must also be auth.uid()
--  * 8 legacy rows with dossier_id IS NULL stay readable by their user_id only
--    (no data backfill; new inserts still require a dossier the caller owns)
--
-- Final model:
--  * authenticated SELECT own rows (including legacy null dossier_id)
--  * authenticated INSERT own rows whose dossier_id belongs to auth.uid()
--  * anon: no policy, table grants revoked
--  * no UPDATE / DELETE policy for clients
--  * service role bypasses RLS and is unaffected
--
-- Idempotent and drift-proof: EVERY existing policy on the table is dropped,
-- then the two owner policies are (re)created with a deterministic definition,
-- all in a single DO block. Re-running it converges to the same state.

alter table public.documents enable row level security;

do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'documents'
  loop
    execute format('drop policy %I on public.documents', p.policyname);
  end loop;

  create policy documents_owner_select on public.documents
    for select to authenticated
    using (
      user_id = auth.uid()
      and (
        dossier_id is null
        or dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
      )
    );

  create policy documents_owner_insert on public.documents
    for insert to authenticated
    with check (
      user_id = auth.uid()
      and dossier_id is not null
      and dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
    );
end
$$;

-- Defense in depth on grants (RLS already denies these; TRUNCATE is not subject to RLS).
revoke select, insert, update, delete, truncate on public.documents from anon;
revoke update, delete, truncate on public.documents from authenticated;
