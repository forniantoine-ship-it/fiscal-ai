-- Payment V1 — ownership hardening for `lmnp_dossiers`.
--
-- The paid-entitlement boundary trusts `lmnp_dossiers.user_id` as the owner of a
-- dossier (assertDossierOwnership). This table has no tracked CREATE/RLS in the
-- repository, so its live policies cannot be proven from source. Without RLS, any
-- authenticated user holding the public anon key could re-assign `user_id` of
-- someone else's dossier and inherit that dossier's paid entitlement.
--
-- This migration is idempotent and only adds owner-scoped policies:
--  * a user can read / insert / update / delete only rows where user_id = auth.uid();
--  * an update cannot move a row to another user (WITH CHECK).
-- Server routes that use the service role bypass RLS and are unaffected.
-- NOTE: server routes that fall back to the anon key (no SUPABASE_SERVICE_ROLE_KEY)
-- would stop seeing dossiers once RLS is enforced — set the service role key
-- before applying (the payment endpoints require it anyway).
--
-- Existing permissive policies (if any) are not touched and would still apply;
-- review them in the Supabase dashboard.

alter table public.lmnp_dossiers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lmnp_dossiers'
                 and policyname = 'lmnp_dossiers_owner_select') then
    create policy lmnp_dossiers_owner_select on public.lmnp_dossiers
      for select using (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lmnp_dossiers'
                 and policyname = 'lmnp_dossiers_owner_insert') then
    create policy lmnp_dossiers_owner_insert on public.lmnp_dossiers
      for insert with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lmnp_dossiers'
                 and policyname = 'lmnp_dossiers_owner_update') then
    create policy lmnp_dossiers_owner_update on public.lmnp_dossiers
      for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lmnp_dossiers'
                 and policyname = 'lmnp_dossiers_owner_delete') then
    create policy lmnp_dossiers_owner_delete on public.lmnp_dossiers
      for delete using (user_id = auth.uid());
  end if;
end
$$;
