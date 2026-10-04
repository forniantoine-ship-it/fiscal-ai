-- MB-DEV-SCHEMA-BASELINE-IMPLEMENT-3A — canonical base tables `lmnp_dossiers` and `documents`.
--
-- These two tables were created by hand on the original project and never versioned, yet
-- 20260527120000_extracted_document_data.sql (and every later migration) depends on them. This
-- migration is ordered BEFORE that one so a brand-new database can be rebuilt from zero.
--
-- It defines the state these tables had BEFORE the historical migrations that extend them:
--   * `active_fiscal_year`                          is added by 20260921120000 (not here);
--   * `fiscal_year`, `document_role`, `property_id` are added by 20260921100000 (not here).
--
-- Canonical decisions (PO, missions 2B/2C):
--   * status / city / lmnp_type: TEXT NOT NULL, NO database default (the runtime always supplies
--     them; the `DEFAULT now()` seen on the original project is an accidental anomaly, never copied);
--   * lmnp_dossiers.user_id: NOT NULL, deliberately NO foreign key to auth.users (account deletion
--     and payment-retention semantics are not designed yet; RLS is the ownership authority);
--   * documents.dossier_id: NOT NULL, FK -> lmnp_dossiers(id) ON DELETE NO ACTION (a dossier cannot
--     be deleted while documents exist; Storage objects must never be orphaned by a cascade);
--   * documents.property_id (added later) deliberately gets NO relational foreign key: property
--     identity lives inside the workspace snapshot payload, there is no property table;
--   * documents.extraction_status: nullable, NO default, NO check (not established by the runtime).
--
-- Idempotent: `create table if not exists` is a no-op on a project where the tables already exist
-- (the original project). It never alters an existing table, so legacy rows are never touched.
-- Row level security is enabled at creation time (fail closed); the owner policies come from
-- 20260919100100 and 20260920100000, the privilege model from the hardening migration.

create table if not exists public.lmnp_dossiers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null,
  city text not null,
  lmnp_type text not null,
  user_id uuid not null
);

alter table public.lmnp_dossiers enable row level security;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid not null references public.lmnp_dossiers(id) on delete no action,
  user_id uuid not null,
  file_name text not null,
  file_path text not null,
  document_type text,
  extraction_status text
);

alter table public.documents enable row level security;

-- Supports the dossier foreign key and `fetchDocumentsForDossier` (`dossier_id = $1 and
-- (fiscal_year = $2 or fiscal_year is null)`), which the partial fiscal-year index cannot serve.
create index if not exists documents_dossier_id_idx
  on public.documents (dossier_id);
