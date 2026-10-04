-- MB-DEV-SCHEMA-BASELINE-IMPLEMENT-3A — forward cleanup of obsolete tables.
--
-- 20260531100000_business_assets.sql (immutable history) creates `work_groups` and
-- `business_assets`. They are NOT part of the canonical product: no runtime code, test or other
-- migration references them, and their `property_id` (a foreign key to documents) contradicts the
-- current property model. A clean replay therefore creates them temporarily, then this migration
-- removes them.
--
-- Safety:
--   * plain DROP TABLE IF EXISTS, with no dependent-object cascade: if anything ever came to depend
--     on these tables the drop fails loudly instead of silently removing it;
--   * fail closed on data: if either table holds a single row the migration aborts and nothing is
--     dropped. Rows are never destroyed silently;
--   * a no-op where the tables are already absent (the original project).

do $$
declare
  v_work_groups bigint := 0;
  v_business_assets bigint := 0;
begin
  if to_regclass('public.work_groups') is not null then
    execute 'select count(*) from public.work_groups' into v_work_groups;
  end if;
  if to_regclass('public.business_assets') is not null then
    execute 'select count(*) from public.business_assets' into v_business_assets;
  end if;

  if v_work_groups > 0 or v_business_assets > 0 then
    raise exception 'obsolete_tables_not_empty: work_groups=% business_assets=% — refusing to drop rows',
      v_work_groups, v_business_assets;
  end if;
end
$$;

drop table if exists public.work_groups;
drop table if exists public.business_assets;
