-- P0 Lot 1 — server snapshot of the LMNP workspace for (dossier, fiscal year).
--
-- IndexedDB remains a cache. This table is the durable source for the métier
-- workspace JSON. Payment entitlement stays on lmnp_declaration_payments.
-- Binary files stay in Storage / IndexedDB blobs (Lot 3).
--
-- Client usage:
--  * authenticated SELECT own rows (login / Browser B hydrate)
--  * authenticated INSERT own rows (first upload, including legacy IDB)
--  * authenticated UPDATE own rows (debounced autosave upsert)
--  * anon: no access
--  * no DELETE / TRUNCATE for clients
--  * service role bypasses RLS

create table if not exists public.lmnp_workspace_snapshots (
  dossier_id uuid not null references public.lmnp_dossiers(id) on delete cascade,
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  schema_version integer not null check (schema_version >= 1),
  revision integer not null default 1 check (revision >= 1),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (dossier_id, fiscal_year)
);

alter table public.lmnp_workspace_snapshots enable row level security;

do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'lmnp_workspace_snapshots'
  loop
    execute format('drop policy %I on public.lmnp_workspace_snapshots', p.policyname);
  end loop;

  create policy lmnp_workspace_snapshots_owner_select
    on public.lmnp_workspace_snapshots
    for select to authenticated
    using (
      dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
    );

  create policy lmnp_workspace_snapshots_owner_insert
    on public.lmnp_workspace_snapshots
    for insert to authenticated
    with check (
      dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
    );

  create policy lmnp_workspace_snapshots_owner_update
    on public.lmnp_workspace_snapshots
    for update to authenticated
    using (
      dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
    )
    with check (
      dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
    );
end
$$;

revoke all on public.lmnp_workspace_snapshots from anon;
revoke delete, truncate on public.lmnp_workspace_snapshots from authenticated;
