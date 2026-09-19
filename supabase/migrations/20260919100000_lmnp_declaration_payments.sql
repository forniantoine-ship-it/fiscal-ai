-- Payment V1 — one paid entitlement per (dossier, fiscal year).
--
-- The customer buys the right to FINALIZE one fiscal exercise, not a single PDF:
-- once `status = 'paid'` the year may be regenerated and re-downloaded without
-- limit. There is deliberately no counter, no "consumed" state and no expiry.
--
-- Authority: `status = 'paid'` is written ONLY by the Stripe webhook, through the
-- service role. Clients can read their own rows (RLS) and can never write.

create table if not exists public.lmnp_declaration_payments (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.lmnp_dossiers(id) on delete cascade,
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'eur',
  -- Customer statement about prior LMNP réel history (P0 safeguard), recorded
  -- server-side so a client cannot change it by editing a checkout payload.
  prior_history_status text
    check (prior_history_status in ('FIRST_REAL_YEAR', 'FISCAL_AI_PREVIOUS', 'EXTERNAL_HISTORY')),
  prior_history_declared_at timestamptz,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint lmnp_declaration_payments_one_per_year unique (dossier_id, fiscal_year),
  constraint lmnp_declaration_payments_paid_has_date check ((status = 'paid') = (paid_at is not null))
);

alter table public.lmnp_declaration_payments enable row level security;

-- Owners can read their own entitlement (post-checkout reconciliation, reload,
-- another device). No insert/update/delete policy exists on purpose: every
-- mutation goes through the service role.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lmnp_declaration_payments'
      and policyname = 'lmnp_declaration_payments_owner_select'
  ) then
    create policy lmnp_declaration_payments_owner_select
      on public.lmnp_declaration_payments
      for select
      using (
        dossier_id in (select id from public.lmnp_dossiers where user_id = auth.uid())
      );
  end if;
end
$$;

-- TRUNCATE is not subject to RLS: it must be revoked explicitly, otherwise the
-- default grants let a client role wipe every entitlement.
revoke insert, update, delete, truncate on public.lmnp_declaration_payments from anon, authenticated;
