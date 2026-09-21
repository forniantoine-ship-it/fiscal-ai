-- Lot 3 — transition serveur atomique N→N+1 + exercice actif + clôture serveur.
--
-- Complements P0 snapshots and Lot 1 builder (TS remains SoT for fiscal content).
-- This migration owns DB invariants only:
--  * active fiscal year pointer on lmnp_dossiers
--  * closed marker + single successor link on lmnp_workspace_snapshots
--  * closed rows immutable for authenticated client UPDATE
--  * SECURITY DEFINER RPC for atomic commit (service role / API after owner check)
--
-- Do NOT apply this migration to a remote/live project from this chantier
-- without an explicit instruction (same gate as Lot 2).

-- ---------------------------------------------------------------------------
-- A. Active fiscal year on dossier (server-authoritative for cold restore)
-- ---------------------------------------------------------------------------
alter table public.lmnp_dossiers
  add column if not exists active_fiscal_year integer
    check (
      active_fiscal_year is null
      or (active_fiscal_year between 2000 and 2100)
    );

comment on column public.lmnp_dossiers.active_fiscal_year is
  'Server-authoritative open fiscal year for the dossier. Updated only by lmnp_commit_fiscal_year_transition. NULL = legacy (fallback to client pickTargetYear).';

-- Authenticated clients still have no UPDATE on lmnp_dossiers (owner RLS migration).
-- Service role / SECURITY DEFINER may set active_fiscal_year.

-- ---------------------------------------------------------------------------
-- B. Closed marker + successor uniqueness on snapshots
-- ---------------------------------------------------------------------------
alter table public.lmnp_workspace_snapshots
  add column if not exists closed_at timestamptz;

alter table public.lmnp_workspace_snapshots
  add column if not exists successor_fiscal_year integer
    check (
      successor_fiscal_year is null
      or (successor_fiscal_year between 2000 and 2100)
    );

comment on column public.lmnp_workspace_snapshots.closed_at is
  'When set, the annual snapshot is closed. Authenticated clients cannot UPDATE it; autosave must fail.';

comment on column public.lmnp_workspace_snapshots.successor_fiscal_year is
  'Calendar year of the unique N+1 created from this closed N. Partial unique index guarantees one successor per dossier link.';

-- One closed year may claim a given successor year at most once per dossier.
create unique index if not exists lmnp_workspace_snapshots_one_successor_idx
  on public.lmnp_workspace_snapshots (dossier_id, successor_fiscal_year)
  where successor_fiscal_year is not null;

-- ---------------------------------------------------------------------------
-- C. RLS — authenticated UPDATE only while open (closed_at IS NULL)
-- ---------------------------------------------------------------------------
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
      and closed_at is null
      and successor_fiscal_year is null
    );

  -- Client autosave: open rows only. Cannot set closed_at / successor (with check).
  create policy lmnp_workspace_snapshots_owner_update_open
    on public.lmnp_workspace_snapshots
    for update to authenticated
    using (
      dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
      and closed_at is null
    )
    with check (
      dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
      and closed_at is null
      and successor_fiscal_year is null
    );
end
$$;

revoke all on public.lmnp_workspace_snapshots from anon;
revoke delete, truncate on public.lmnp_workspace_snapshots from authenticated;

-- ---------------------------------------------------------------------------
-- D. Trigger — never reopen a closed snapshot (even service role accidental)
-- ---------------------------------------------------------------------------
create or replace function public.lmnp_prevent_reopen_closed_snapshot()
returns trigger
language plpgsql
as $$
begin
  if old.closed_at is not null then
    if new.closed_at is null then
      raise exception 'lmnp_snapshot_closed: cannot reopen closed snapshot';
    end if;
    -- Closed rows are immutable except no-op identical writes.
    if new.payload is distinct from old.payload
       or new.revision is distinct from old.revision
       or new.schema_version is distinct from old.schema_version
       or new.successor_fiscal_year is distinct from old.successor_fiscal_year
       or new.closed_at is distinct from old.closed_at then
      raise exception 'lmnp_snapshot_closed: closed snapshot is immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lmnp_prevent_reopen_closed_snapshot on public.lmnp_workspace_snapshots;
create trigger trg_lmnp_prevent_reopen_closed_snapshot
  before update on public.lmnp_workspace_snapshots
  for each row
  execute function public.lmnp_prevent_reopen_closed_snapshot();

-- ---------------------------------------------------------------------------
-- E. Atomic transition RPC (fiscal payloads prepared in TS; DB owns atomicity)
-- ---------------------------------------------------------------------------
create or replace function public.lmnp_commit_fiscal_year_transition(
  p_dossier_id uuid,
  p_user_id uuid,
  p_from_year integer,
  p_expected_revision integer,
  p_closed_n_payload jsonb,
  p_closed_n_schema_version integer,
  p_next_year integer,
  p_next_payload jsonb,
  p_next_schema_version integer,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_n public.lmnp_workspace_snapshots%rowtype;
  v_next public.lmnp_workspace_snapshots%rowtype;
  v_closed_revision integer;
  v_active integer;
begin
  if p_from_year is null or p_next_year is null
     or p_from_year < 2000 or p_from_year > 2100
     or p_next_year < 2000 or p_next_year > 2100
     or p_next_year <> p_from_year + 1 then
    raise exception 'lmnp_transition_invalid_years';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'lmnp_transition_invalid_revision';
  end if;
  if p_closed_n_payload is null or p_next_payload is null then
    raise exception 'lmnp_transition_invalid_payload';
  end if;
  if p_closed_n_schema_version is null or p_closed_n_schema_version < 1
     or p_next_schema_version is null or p_next_schema_version < 1 then
    raise exception 'lmnp_transition_invalid_schema';
  end if;

  select user_id into v_owner
  from public.lmnp_dossiers
  where id = p_dossier_id
  for update;

  if v_owner is null then
    raise exception 'lmnp_transition_dossier_not_found';
  end if;
  if v_owner <> p_user_id then
    raise exception 'lmnp_transition_not_owner';
  end if;

  select * into v_n
  from public.lmnp_workspace_snapshots
  where dossier_id = p_dossier_id and fiscal_year = p_from_year
  for update;

  if not found then
    raise exception 'lmnp_transition_source_missing';
  end if;

  -- Idempotent: N already closed with successor → return existing N+1, never reseed.
  -- N2 — never regress active_fiscal_year (e.g. stale retry N→N+1 after N+2 exists).
  if v_n.closed_at is not null then
    if v_n.successor_fiscal_year is null or v_n.successor_fiscal_year <> p_next_year then
      raise exception 'lmnp_transition_closed_without_successor';
    end if;
    select * into v_next
    from public.lmnp_workspace_snapshots
    where dossier_id = p_dossier_id and fiscal_year = v_n.successor_fiscal_year;
    if not found then
      raise exception 'lmnp_transition_successor_missing';
    end if;
    update public.lmnp_dossiers
      set active_fiscal_year = greatest(
        coalesce(active_fiscal_year, v_n.successor_fiscal_year),
        v_n.successor_fiscal_year
      )
      where id = p_dossier_id
      returning active_fiscal_year into v_active;
    return jsonb_build_object(
      'status', 'idempotent',
      'fromYear', p_from_year,
      'nextYear', v_n.successor_fiscal_year,
      'closedRevision', v_n.revision,
      'nextRevision', v_next.revision,
      'closedAt', v_n.closed_at,
      'activeFiscalYear', v_active,
      'nextPayload', v_next.payload,
      'nextSchemaVersion', v_next.schema_version
    );
  end if;

  if v_n.revision <> p_expected_revision then
    raise exception 'lmnp_transition_revision_conflict';
  end if;

  v_closed_revision := v_n.revision + 1;

  update public.lmnp_workspace_snapshots
    set payload = p_closed_n_payload,
        schema_version = p_closed_n_schema_version,
        revision = v_closed_revision,
        closed_at = p_now,
        successor_fiscal_year = p_next_year,
        updated_at = p_now
    where dossier_id = p_dossier_id and fiscal_year = p_from_year;

  begin
    insert into public.lmnp_workspace_snapshots (
      dossier_id,
      fiscal_year,
      schema_version,
      revision,
      payload,
      created_at,
      updated_at,
      closed_at,
      successor_fiscal_year
    ) values (
      p_dossier_id,
      p_next_year,
      p_next_schema_version,
      1,
      p_next_payload,
      p_now,
      p_now,
      null,
      null
    );
  exception
    when unique_violation then
      -- Concurrent insert of N+1: take existing, never overwrite/reseed.
      null;
  end;

  select * into v_next
  from public.lmnp_workspace_snapshots
  where dossier_id = p_dossier_id and fiscal_year = p_next_year;

  if not found then
    raise exception 'lmnp_transition_successor_insert_failed';
  end if;

  -- N2 — monotonic active year (same rule as idempotent branch).
  update public.lmnp_dossiers
    set active_fiscal_year = greatest(
      coalesce(active_fiscal_year, p_next_year),
      p_next_year
    )
    where id = p_dossier_id
    returning active_fiscal_year into v_active;

  return jsonb_build_object(
    'status', 'committed',
    'fromYear', p_from_year,
    'nextYear', p_next_year,
    'closedRevision', v_closed_revision,
    'nextRevision', v_next.revision,
    'closedAt', p_now,
    'activeFiscalYear', v_active,
    'nextPayload', v_next.payload,
    'nextSchemaVersion', v_next.schema_version
  );
end;
$$;

revoke all on function public.lmnp_commit_fiscal_year_transition(
  uuid, uuid, integer, integer, jsonb, integer, integer, jsonb, integer, timestamptz
) from public;
revoke all on function public.lmnp_commit_fiscal_year_transition(
  uuid, uuid, integer, integer, jsonb, integer, integer, jsonb, integer, timestamptz
) from anon;
revoke all on function public.lmnp_commit_fiscal_year_transition(
  uuid, uuid, integer, integer, jsonb, integer, integer, jsonb, integer, timestamptz
) from authenticated;
-- Callable only via service role from the API after explicit owner auth.
grant execute on function public.lmnp_commit_fiscal_year_transition(
  uuid, uuid, integer, integer, jsonb, integer, integer, jsonb, integer, timestamptz
) to service_role;
