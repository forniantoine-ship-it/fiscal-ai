-- MB-DEV-SCHEMA-BASELINE-IMPLEMENT-3A — default privileges for FUTURE objects in schema public.
--
-- Supabase configures default privileges so that objects created by `postgres` in `public` are
-- granted to anon / authenticated / service_role. A new application table would therefore be
-- exposed to the Data API with ALL privileges (including TRUNCATE, which RLS never covers) until
-- somebody remembers to revoke them. Future tables, sequences and functions must opt IN explicitly.
--
-- Scope, deliberately narrow:
--   * only the role `postgres` (the role that runs migrations) and only schema `public`;
--   * only anon / authenticated are revoked: service_role keeps its defaults, the server needs them;
--   * Supabase-managed schemas (auth, storage, extensions, realtime, vault, ...) and roles other
--     than `postgres` (for example supabase_admin) are NOT touched.
--
-- Functions: a schema-scoped revoke removes the anon / authenticated entries, but the implicit
-- EXECUTE granted to PUBLIC on every new function is a GLOBAL default that no schema-scoped
-- statement can remove. Removing it globally (ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE
-- EXECUTE ON FUNCTIONS FROM PUBLIC, without IN SCHEMA) would also affect functions postgres creates
-- in Supabase-managed schemas, so it is intentionally NOT done here. Every application function
-- must instead carry its own explicit `revoke all on function ... from public` (as
-- lmnp_commit_fiscal_year_transition does), and the catalogue guard test lists any public.* function
-- still executable by a client role.
--
-- DEPLOYMENT PRECONDITION: before applying this migration to a NEW Supabase project, inspect that
-- project's own pg_default_acl (it is not assumed identical to the original project's) and confirm
-- the entries this migration revokes are the expected ones.
--
-- Existing objects are unaffected: their privileges are fixed by 20261002110000.
-- Idempotent: revoking a default privilege that is already absent is a no-op.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
