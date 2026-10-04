-- MB-DEV-SCHEMA-BASELINE-IMPLEMENT-3A — runtime proof script for the canonical baseline.
--
-- STATUS: WRITTEN BUT NOT YET EXECUTED. No Docker / Supabase CLI / psql was available when this was
-- authored, so this script has never run against a database. Treat the first run as part of the
-- replay proof and fix any script error before trusting a green result.
--
-- HOW TO RUN (local, throwaway database ONLY — never the DEV/STAGING or a production project):
--   1. supabase start && supabase db reset        -- replays every migration from zero
--   2. psql "<LOCAL db url>" -v ON_ERROR_STOP=1 -f supabase/tests/canonical_baseline_replay.sql
--   3. supabase db reset again, rerun, and compare: a clean replay must give the same result twice.
-- Everything runs in one transaction that is rolled back; any failed expectation raises an exception.

begin;

create function pg_temp.expect_fail(p_role text, p_sql text, p_sqlstate text) returns void
language plpgsql as $f$
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    reset role;
    if sqlstate <> p_sqlstate then
      raise exception 'expected SQLSTATE % but got % (%) for: %', p_sqlstate, sqlstate, sqlerrm, p_sql;
    end if;
    return;
  end;
  reset role;
  raise exception 'expected failure (%) but statement succeeded as %: %', p_sqlstate, p_role, p_sql;
end
$f$;

create function pg_temp.expect_ok(p_role text, p_sql text) returns void
language plpgsql as $f$
begin
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
end
$f$;

-- ---- catalogue ---------------------------------------------------------------------------
do $$
begin
  assert (select count(*) from pg_tables where schemaname = 'public'
          and tablename in ('lmnp_dossiers','documents','extracted_document_data',
                            'lmnp_workspace_snapshots','lmnp_declaration_payments')) = 5, 'five application tables';
  assert to_regclass('public.work_groups') is null, 'work_groups must be absent';
  assert to_regclass('public.business_assets') is null, 'business_assets must be absent';
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0, 'RLS on every public table';
  -- D1: no accidental text defaults
  assert (select count(*) from information_schema.columns where table_schema = 'public'
          and table_name = 'lmnp_dossiers' and column_name in ('status','city','lmnp_type')
          and column_default is not null) = 0, 'no default on status/city/lmnp_type';
  assert (select is_nullable from information_schema.columns where table_schema='public'
          and table_name='lmnp_dossiers' and column_name='user_id') = 'NO', 'dossiers.user_id NOT NULL';
  assert not exists (select 1 from pg_constraint where conrelid = 'public.lmnp_dossiers'::regclass and contype = 'f'),
    'no FK on lmnp_dossiers (no auth.users FK)';
  -- D3: documents FK NO ACTION, NOT NULL columns, no property_id FK
  assert (select confdeltype from pg_constraint where conrelid = 'public.documents'::regclass
          and contype = 'f' and confrelid = 'public.lmnp_dossiers'::regclass) = 'a', 'documents FK is NO ACTION';
  assert (select count(*) from pg_constraint where conrelid = 'public.documents'::regclass and contype = 'f') = 1,
    'documents has exactly one FK (no property_id FK)';
  assert (select count(*) from information_schema.columns where table_schema='public' and table_name='documents'
          and column_name in ('dossier_id','user_id','file_name','file_path') and is_nullable = 'NO') = 4, 'documents NOT NULL columns';
  assert exists (select 1 from pg_indexes where schemaname='public' and tablename='documents'
                 and indexname='documents_dossier_id_idx'), 'documents(dossier_id) index';
  -- storage (D5)
  assert (select public from storage.buckets where id = 'lmnp-documents') = false, 'bucket private';
  assert (select file_size_limit is null and allowed_mime_types is null from storage.buckets where id = 'lmnp-documents'),
    'no bucket limits';
end
$$;

-- ---- privileges --------------------------------------------------------------------------
do $$
declare
  t text; r text; p text;
begin
  foreach t in array array['lmnp_dossiers','documents','extracted_document_data','lmnp_workspace_snapshots','lmnp_declaration_payments'] loop
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      assert not has_table_privilege('anon', 'public.'||t, p), format('anon must not hold %s on %s', p, t);
      assert has_table_privilege('service_role', 'public.'||t, p), format('service_role must hold %s on %s', p, t);
    end loop;
    foreach p in array array['DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      assert not has_table_privilege('authenticated', 'public.'||t, p), format('authenticated must not hold %s on %s', p, t);
    end loop;
  end loop;
  assert has_table_privilege('authenticated','public.lmnp_dossiers','SELECT');
  assert not has_table_privilege('authenticated','public.lmnp_dossiers','INSERT'), 'no table-level INSERT on dossiers';
  assert not has_table_privilege('authenticated','public.lmnp_dossiers','UPDATE');
  assert has_column_privilege('authenticated','public.lmnp_dossiers','user_id','INSERT');
  assert has_column_privilege('authenticated','public.lmnp_dossiers','status','INSERT');
  assert has_column_privilege('authenticated','public.lmnp_dossiers','city','INSERT');
  assert has_column_privilege('authenticated','public.lmnp_dossiers','lmnp_type','INSERT');
  assert not has_column_privilege('authenticated','public.lmnp_dossiers','active_fiscal_year','INSERT'), 'active_fiscal_year not client-insertable';
  assert has_table_privilege('authenticated','public.documents','SELECT') and has_table_privilege('authenticated','public.documents','INSERT');
  assert not has_table_privilege('authenticated','public.documents','UPDATE');
  assert not has_table_privilege('authenticated','public.extracted_document_data','SELECT'), 'no client access to extracted_document_data';
  assert not has_table_privilege('authenticated','public.extracted_document_data','INSERT');
  assert not has_table_privilege('authenticated','public.extracted_document_data','UPDATE');
  assert has_table_privilege('authenticated','public.lmnp_workspace_snapshots','SELECT')
     and has_table_privilege('authenticated','public.lmnp_workspace_snapshots','INSERT')
     and has_table_privilege('authenticated','public.lmnp_workspace_snapshots','UPDATE');
  assert has_table_privilege('authenticated','public.lmnp_declaration_payments','SELECT');
  assert not has_table_privilege('authenticated','public.lmnp_declaration_payments','INSERT');
  assert not has_table_privilege('authenticated','public.lmnp_declaration_payments','UPDATE');
  assert (select count(*) from pg_policies where schemaname='public' and tablename='extracted_document_data') = 0, 'no policy on extracted_document_data';
  assert (select roles from pg_policies where schemaname='public' and tablename='lmnp_declaration_payments'
          and policyname='lmnp_declaration_payments_owner_select') = '{authenticated}', 'payments policy authenticated-only';

  -- functions
  for r in select unnest(array['anon','authenticated']) loop
    assert not has_function_privilege(r, 'public.lmnp_commit_fiscal_year_transition(uuid,uuid,integer,integer,jsonb,integer,integer,jsonb,integer,timestamptz)', 'EXECUTE');
    assert not has_function_privilege(r, 'public.lmnp_prevent_reopen_closed_snapshot()', 'EXECUTE');
    assert not has_function_privilege(r, 'public.lmnp_prevent_snapshot_schema_downgrade()', 'EXECUTE');
  end loop;
  assert has_function_privilege('service_role', 'public.lmnp_commit_fiscal_year_transition(uuid,uuid,integer,integer,jsonb,integer,integer,jsonb,integer,timestamptz)', 'EXECUTE');
  -- catalogue guard: no other public function executable by a client role
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prokind = 'f'
            and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))) = 0,
    'no public function executable by anon/authenticated';

  -- default privileges (postgres, schema public) hold nothing for anon/authenticated
  assert not exists (
    select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace,
         lateral aclexplode(d.defaclacl) a
    where n.nspname = 'public' and d.defaclrole = 'postgres'::regrole
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
  ), 'no default privilege for anon/authenticated (postgres, public)';
end
$$;

-- ---- behaviour ---------------------------------------------------------------------------
do $$
declare
  ua uuid := '11111111-1111-4111-8111-111111111111';
  ub uuid := '22222222-2222-4222-8222-222222222222';
  da uuid; db uuid;
begin
  insert into auth.users (id, email) values (ua, 'a@example.invalid'), (ub, 'b@example.invalid');

  -- authenticated user A creates its own dossier through the approved columns
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.lmnp_dossiers (user_id, status, city, lmnp_type) values (ua, 'draft', 'X', 'réel') returning id into da;
  reset role;

  -- ... cannot set a server-authoritative column, cannot create for another user, cannot truncate/delete
  perform pg_temp.expect_fail('authenticated', format('insert into public.lmnp_dossiers (user_id,status,city,lmnp_type,active_fiscal_year) values (%L,''draft'',''X'',''réel'',2099)', ua), '42501');
  perform pg_temp.expect_fail('authenticated', format('insert into public.lmnp_dossiers (user_id,status,city,lmnp_type) values (%L,''draft'',''X'',''réel'')', ub), '42501');
  perform pg_temp.expect_fail('authenticated', 'truncate public.lmnp_dossiers', '42501');
  perform pg_temp.expect_fail('authenticated', 'truncate public.extracted_document_data', '42501');
  perform pg_temp.expect_fail('authenticated', 'select * from public.extracted_document_data', '42501');
  perform pg_temp.expect_fail('anon', 'select * from public.lmnp_dossiers', '42501');
  perform pg_temp.expect_fail('anon', 'truncate public.documents', '42501');
  perform pg_temp.expect_fail('authenticated', 'delete from public.documents', '42501');
  perform pg_temp.expect_fail('authenticated', 'insert into public.lmnp_declaration_payments (dossier_id, fiscal_year, amount_cents) values (gen_random_uuid(), 2025, 14900)', '42501');

  -- user B cannot read user A's dossier
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  assert (select count(*) from public.lmnp_dossiers where id = da) = 0, 'cross-user dossier leak';
  reset role;

  -- documents: dossier_id NOT NULL, FK NO ACTION
  insert into public.documents (dossier_id, user_id, file_name, file_path) values (da, ua, 'a.pdf', ua || '/a.pdf');
  perform pg_temp.expect_fail('postgres', format('insert into public.documents (user_id,file_name,file_path) values (%L,''n'',''p'')', ua), '23502');
  perform pg_temp.expect_fail('postgres', format('delete from public.lmnp_dossiers where id = %L', da), '23503');

  -- snapshots: v1 -> v2 ok, v2 -> v1 rejected (open); close; reopen / mutate rejected; identical no-op allowed
  insert into public.lmnp_workspace_snapshots (dossier_id, fiscal_year, schema_version, payload) values (da, 2025, 1, '{}');
  update public.lmnp_workspace_snapshots set schema_version = 2, revision = 2 where dossier_id = da and fiscal_year = 2025;
  perform pg_temp.expect_fail('postgres', format('update public.lmnp_workspace_snapshots set schema_version = 1 where dossier_id = %L', da), 'P0001');
  update public.lmnp_workspace_snapshots set closed_at = now(), successor_fiscal_year = 2026 where dossier_id = da and fiscal_year = 2025;
  perform pg_temp.expect_fail('postgres', format('update public.lmnp_workspace_snapshots set closed_at = null where dossier_id = %L and fiscal_year = 2025', da), 'P0001');
  perform pg_temp.expect_fail('postgres', format('update public.lmnp_workspace_snapshots set payload = ''{"x":1}'' where dossier_id = %L and fiscal_year = 2025', da), 'P0001');
  perform pg_temp.expect_fail('postgres', format('update public.lmnp_workspace_snapshots set schema_version = 1 where dossier_id = %L and fiscal_year = 2025', da), 'P0001');
  update public.lmnp_workspace_snapshots set payload = payload where dossier_id = da and fiscal_year = 2025; -- identical no-op
  -- unique successor
  insert into public.lmnp_workspace_snapshots (dossier_id, fiscal_year, schema_version, payload) values (da, 2027, 1, '{}');
  perform pg_temp.expect_fail('postgres', format('update public.lmnp_workspace_snapshots set successor_fiscal_year = 2026 where dossier_id = %L and fiscal_year = 2027', da), '23505');
  -- both triggers coexist
  assert (select count(*) from pg_trigger where tgrelid = 'public.lmnp_workspace_snapshots'::regclass and not tgisinternal
          and tgname in ('trg_lmnp_prevent_reopen_closed_snapshot','trg_lmnp_prevent_snapshot_schema_downgrade')) = 2;
  -- RPC: not executable by clients, executable by service_role
  perform pg_temp.expect_fail('authenticated', format('select public.lmnp_commit_fiscal_year_transition(%L,%L,2027,1,''{}'',1,2028,''{}'',1)', da, ua), '42501');
  perform pg_temp.expect_fail('anon', format('select public.lmnp_commit_fiscal_year_transition(%L,%L,2027,1,''{}'',1,2028,''{}'',1)', da, ua), '42501');
  perform pg_temp.expect_ok('service_role', format('select public.lmnp_commit_fiscal_year_transition(%L,%L,2027,1,''{}'',1,2028,''{}'',1)', da, ua));
  -- idempotent retry, monotonic active year
  perform pg_temp.expect_ok('service_role', format('select public.lmnp_commit_fiscal_year_transition(%L,%L,2027,1,''{}'',1,2028,''{}'',1)', da, ua));
  assert (select active_fiscal_year from public.lmnp_dossiers where id = da) = 2028, 'active_fiscal_year monotonic';
end
$$;

rollback;
