/**
 * Lot 3 — migration SQL : active year, closed marker, successor uniqueness, RPC.
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-transition/lot3-migration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const sql = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260921120000_lmnp_fiscal_year_transition.sql"),
  "utf8",
);

function code(source: string): string {
  return source
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

const rls = code(sql);

describe("Lot 3 migration — schema + RLS + RPC", () => {
  it("ajoute active_fiscal_year sur lmnp_dossiers", () => {
    assert.match(rls, /alter table public\.lmnp_dossiers/);
    assert.match(rls, /add column if not exists active_fiscal_year integer/);
  });

  it("ajoute closed_at + successor_fiscal_year + unique successor", () => {
    assert.match(rls, /add column if not exists closed_at timestamptz/);
    assert.match(rls, /add column if not exists successor_fiscal_year integer/);
    assert.match(rls, /lmnp_workspace_snapshots_one_successor_idx/);
    assert.match(rls, /unique index[\s\S]*dossier_id, successor_fiscal_year/);
  });

  it("RLS UPDATE uniquement si closed_at is null (pas de réouverture client)", () => {
    assert.match(rls, /for update to authenticated/);
    assert.match(rls, /closed_at is null/);
    assert.match(rls, /successor_fiscal_year is null/);
    assert.match(rls, /lmnp_prevent_reopen_closed_snapshot/);
    assert.match(rls, /cannot reopen closed snapshot/);
  });

  it("RPC atomique SECURITY DEFINER, execute service_role seulement", () => {
    assert.match(rls, /create or replace function public\.lmnp_commit_fiscal_year_transition/);
    assert.match(rls, /security definer/);
    assert.match(rls, /for update/);
    assert.match(rls, /grant execute[\s\S]*to service_role/);
    assert.match(rls, /revoke all on function[\s\S]*from authenticated/);
    assert.match(rls, /revoke all on function[\s\S]*from anon/);
  });

  it("idempotence : closed + successor retourne existant sans reseed", () => {
    assert.match(rls, /idempotent/);
    assert.match(rls, /never reseed|successor_fiscal_year/i);
    // Payload N+1 existant renvoyé (nextpayload), pas écrasé dans la branche idempotent.
    assert.match(sql.toLowerCase(), /'status', 'idempotent'/);
    assert.match(sql.toLowerCase(), /nextpayload.*v_next\.payload|v_next\.payload/);
  });

  it("N2 — active_fiscal_year monotone (greatest) sur branche idempotente et committed", () => {
    assert.match(rls, /greatest\s*\(\s*coalesce\s*\(\s*active_fiscal_year/);
    const idempotentBlock = sql
      .toLowerCase()
      .slice(sql.toLowerCase().indexOf("'status', 'idempotent'"));
    // La valeur retournée est v_active (après greatest), pas un overwrite aveugle.
    assert.match(sql.toLowerCase(), /returning active_fiscal_year into v_active/);
    assert.match(idempotentBlock, /'activefiscalyear', v_active/);
  });

  it("ne touche pas documents / storage / payment", () => {
    assert.doesNotMatch(rls, /alter table public\.documents/);
    assert.doesNotMatch(rls, /lmnp_declaration_payments/);
    assert.doesNotMatch(rls, /storage\.|lmnp-documents/);
    assert.doesNotMatch(rls, /drop table|delete from|truncate table/);
  });
});
