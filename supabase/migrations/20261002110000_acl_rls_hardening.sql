-- MB-DEV-SCHEMA-BASELINE-IMPLEMENT-3A — canonical ACL / RLS / function hardening.
--
-- Two different layers, never to be confused:
--   * GRANT / REVOKE = which SQL operations a role may attempt at all. RLS does NOT protect TRUNCATE,
--     REFERENCES or TRIGGER, and a broad default grant exposes them to the Data API roles.
--   * RLS policies  = which ROWS an allowed operation may touch.
--
-- The historical migrations only ever REVOKE; they never GRANT. On a brand-new project the client
-- grants therefore came from the platform default privileges. This migration states the whole
-- privilege model explicitly (revoke everything, then grant exactly what the runtime uses), so the
-- final state no longer depends on the platform defaults.
--
-- Final model (runtime evidence: missions 2B/2C):
--   lmnp_dossiers              anon -    | authenticated SELECT + INSERT(user_id,status,city,lmnp_type)
--   documents                  anon -    | authenticated SELECT, INSERT
--   extracted_document_data    anon -    | authenticated -    (server / service role only)
--   lmnp_workspace_snapshots   anon -    | authenticated SELECT, INSERT, UPDATE
--   lmnp_declaration_payments  anon -    | authenticated SELECT
--   service_role: full access on all five tables. It bypasses RLS but still needs table grants.
-- No client role keeps DELETE, TRUNCATE, REFERENCES or TRIGGER on any table.
--
-- Idempotent: every statement converges to the same state when re-run. Safe on the original project
-- (it removes anon access, extracted_document_data client access and the accidental text defaults).

-- ---------------------------------------------------------------------------
-- A. lmnp_dossiers — drop the accidental `DEFAULT now()` seen on the original project
--    (dropping a default is idempotent and never rewrites rows; absent on a canonical base).
-- ---------------------------------------------------------------------------
alter table public.lmnp_dossiers alter column status drop default;
alter table public.lmnp_dossiers alter column city drop default;
alter table public.lmnp_dossiers alter column lmnp_type drop default;

-- ---------------------------------------------------------------------------
-- B. Policies
-- ---------------------------------------------------------------------------

-- extracted_document_data: every legitimate access is server-side with the service role
-- (extract-document, classification-review, document deletion, ownership lookups). The PUBLIC
-- policies created by 20260527120000 are not part of the canonical model. RLS stays ON with zero
-- policy: clients are denied, the service role bypasses RLS.
alter table public.extracted_document_data enable row level security;

do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'extracted_document_data'
  loop
    execute format('drop policy %I on public.extracted_document_data', p.policyname);
  end loop;
end
$$;

-- lmnp_declaration_payments: the owner SELECT policy was created for role PUBLIC. Same ownership
-- predicate, restricted to `authenticated`. Still no INSERT/UPDATE/DELETE policy: every mutation
-- goes through the service role.
do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'lmnp_declaration_payments'
  loop
    execute format('drop policy %I on public.lmnp_declaration_payments', p.policyname);
  end loop;

  create policy lmnp_declaration_payments_owner_select
    on public.lmnp_declaration_payments
    for select to authenticated
    using (
      dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
    );
end
$$;

-- lmnp_dossiers, documents, lmnp_workspace_snapshots and storage.objects keep their owner policies
-- (20260919100100, 20260920100000, 20260921120000, 20260920140000): unchanged.

-- ---------------------------------------------------------------------------
-- C. Table privileges
-- ---------------------------------------------------------------------------

-- lmnp_dossiers: a client may create ITS OWN dossier (RLS: user_id = auth.uid()) but must never set
-- server-authoritative columns such as `active_fiscal_year`. Column-level INSERT only; there must be
-- no table-level INSERT grant left, otherwise the column list would be meaningless. `id` and
-- `created_at` come from their defaults, which need no INSERT privilege.
revoke all on table public.lmnp_dossiers from public, anon, authenticated;
grant select on table public.lmnp_dossiers to authenticated;
grant insert (user_id, status, city, lmnp_type) on table public.lmnp_dossiers to authenticated;
grant all on table public.lmnp_dossiers to service_role;

-- documents: clients read and insert their own metadata; update (extraction status) and delete go
-- through the service role.
revoke all on table public.documents from public, anon, authenticated;
grant select, insert on table public.documents to authenticated;
grant all on table public.documents to service_role;

-- extracted_document_data: no client access of any kind.
revoke all on table public.extracted_document_data from public, anon, authenticated;
grant all on table public.extracted_document_data to service_role;

-- lmnp_workspace_snapshots: the client autosave uses an upsert (INSERT .. ON CONFLICT DO UPDATE)
-- plus conditional UPDATE; no delete.
revoke all on table public.lmnp_workspace_snapshots from public, anon, authenticated;
grant select, insert, update on table public.lmnp_workspace_snapshots to authenticated;
grant all on table public.lmnp_workspace_snapshots to service_role;

-- lmnp_declaration_payments: owners read their entitlement; every write is the service role's.
revoke all on table public.lmnp_declaration_payments from public, anon, authenticated;
grant select on table public.lmnp_declaration_payments to authenticated;
grant all on table public.lmnp_declaration_payments to service_role;

-- ---------------------------------------------------------------------------
-- D. Function privileges
-- ---------------------------------------------------------------------------

-- Atomic N -> N+1 transition: callable only by the service role, after the API checked ownership.
revoke all on function public.lmnp_commit_fiscal_year_transition(
  uuid, uuid, integer, integer, jsonb, integer, integer, jsonb, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.lmnp_commit_fiscal_year_transition(
  uuid, uuid, integer, integer, jsonb, integer, integer, jsonb, integer, timestamptz
) to service_role;

-- Trigger functions are never meant to be called directly. PostgreSQL checks EXECUTE only when a
-- trigger is CREATED, not when it fires, so revoking client access cannot break the triggers.
revoke all on function public.lmnp_prevent_reopen_closed_snapshot() from public, anon, authenticated;
revoke all on function public.lmnp_prevent_snapshot_schema_downgrade() from public, anon, authenticated;
