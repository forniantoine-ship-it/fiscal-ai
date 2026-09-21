-- Lot 2 — isolation documentaire N / N+1.
--
-- Adds an explicit fiscal origin on durable document metadata so reconcile
-- can never attach year-N annual evidence to workspace N+1.
--
-- Rules:
--  * New annual uploads MUST write fiscal_year (and document_role).
--  * Legacy rows stay NULL — never backfilled to the active year.
--  * document_role distinguishes annual evidence from durable historical refs
--    that reuse the same Storage object (no blob duplication).
--  * property_id is optional and nullable for future multi-bien attachment;
--    V1 does not require it and does not build multi-bien UX.
--  * RLS policies are intentionally untouched (owner SELECT/INSERT only).
--
-- Do NOT apply this migration to a remote/live project from this chantier
-- without an explicit instruction. Tests validate the SQL contract statically.

alter table public.documents
  add column if not exists fiscal_year integer
    check (fiscal_year is null or (fiscal_year between 2000 and 2100));

alter table public.documents
  add column if not exists document_role text
    check (
      document_role is null
      or document_role in ('annual_evidence', 'durable_reference')
    );

alter table public.documents
  add column if not exists property_id uuid;

comment on column public.documents.fiscal_year is
  'Calendar fiscal year of origin for the document. NULL = legacy/unresolved; never invent from the currently open workspace.';

comment on column public.documents.document_role is
  'annual_evidence = exercice-scoped justificatif; durable_reference = historical reuse of the same Storage object without duplicating the blob.';

comment on column public.documents.property_id is
  'Optional property attachment for durable references (multi-bien-ready). Nullable in V1.';

create index if not exists documents_dossier_fiscal_year_idx
  on public.documents (dossier_id, fiscal_year)
  where fiscal_year is not null;
