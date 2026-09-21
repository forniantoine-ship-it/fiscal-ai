/**
 * Lot 2 — static validation of documents fiscal_year migration.
 * Does NOT apply the migration remotely.
 * Run: npx tsx --test src/lib/lmnp/dossier/documents-fiscal-year-migration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const sqlRaw = readFileSync(
  path.join(MIGRATIONS, "20260921100000_documents_fiscal_year.sql"),
  "utf8",
);

function code(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

const sql = code(sqlRaw);

describe("migration documents fiscal_year — Lot 2 contract", () => {
  it("adds fiscal_year as nullable integer with year bounds", () => {
    assert.match(sql, /add column if not exists fiscal_year integer/);
    assert.match(sql, /fiscal_year between 2000 and 2100/);
  });

  it("adds document_role constrained to annual_evidence | durable_reference", () => {
    assert.match(sql, /add column if not exists document_role text/);
    assert.match(sql, /annual_evidence/);
    assert.match(sql, /durable_reference/);
  });

  it("adds nullable property_id for multi-bien-ready durable refs", () => {
    assert.match(sql, /add column if not exists property_id uuid/);
  });

  it("indexes dossier_id + fiscal_year for year-scoped fetches", () => {
    assert.match(sql, /documents_dossier_fiscal_year_idx/);
    assert.match(sql, /\(dossier_id, fiscal_year\)/);
  });

  it("does not weaken RLS, grants, or mutate live rows", () => {
    assert.doesNotMatch(sql, /create policy|drop policy|alter policy/);
    assert.doesNotMatch(sql, /grant |revoke /);
    assert.doesNotMatch(sql, /update public\.documents|delete from|truncate/);
    assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/);
  });

  it("never backfills null fiscal_year to an active year", () => {
    assert.doesNotMatch(sql, /set fiscal_year\s*=/);
    assert.doesNotMatch(sql, /coalesce\s*\(\s*fiscal_year/);
  });
});
