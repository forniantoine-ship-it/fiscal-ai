-- Payment V1 — ownership hardening for `lmnp_dossiers`.
--
-- The paid-entitlement boundary trusts `lmnp_dossiers.user_id` as the owner of a
-- dossier (assertDossierOwnership). This table has no tracked CREATE/RLS in the
-- repository. The live database was found with two PERMISSIVE policies on role
-- `public` ("Enable read access for all users": SELECT using (true) and
-- "Allow insert": INSERT with check (true)), which let anyone holding the public
-- anon key read every dossier and create dossiers for any user_id. Permissive
-- policies are OR-ed, so merely adding owner policies would NOT close that hole.
--
-- Final model (least privilege, matches the real client usage: the browser client
-- only SELECTs the caller's dossier and INSERTs a dossier for itself; nothing
-- updates or deletes a dossier from the client):
--  * authenticated: SELECT rows where user_id = auth.uid();
--  * authenticated: INSERT rows where user_id = auth.uid();
--  * anon: no policy at all (reads nothing, writes nothing);
--  * no UPDATE / DELETE policy for clients (user_id can never be re-assigned);
--  * service role bypasses RLS (server routes, Stripe webhook) and is unaffected.
--
-- Idempotent and drift-proof: EVERY existing policy on the table is dropped, then
-- the two owner policies are (re)created with a deterministic definition, all in
-- a single DO block (atomic). Re-running it converges to the same state.
-- Legacy rows with user_id IS NULL become invisible to clients (service role only).
--
-- PREREQUISITE: SUPABASE_SERVICE_ROLE_KEY must be set on the server before this
-- runs — server routes that fall back to the anon key would stop seeing dossiers.

alter table public.lmnp_dossiers enable row level security;

do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'lmnp_dossiers'
  loop
    execute format('drop policy %I on public.lmnp_dossiers', p.policyname);
  end loop;

  create policy lmnp_dossiers_owner_select on public.lmnp_dossiers
    for select to authenticated
    using (user_id = auth.uid());

  create policy lmnp_dossiers_owner_insert on public.lmnp_dossiers
    for insert to authenticated
    with check (user_id = auth.uid());
end
$$;

-- Defense in depth on grants (RLS already denies these; TRUNCATE is not subject to RLS).
revoke insert, update, delete, truncate on public.lmnp_dossiers from anon;
revoke update, delete, truncate on public.lmnp_dossiers from authenticated;
