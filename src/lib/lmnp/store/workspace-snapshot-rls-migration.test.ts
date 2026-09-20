/**
 * P0 Lot 1 — migration SQL de lmnp_workspace_snapshots.
 * Run: npx tsx --test src/lib/lmnp/store/workspace-snapshot-rls-migration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const sql = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260920120000_lmnp_workspace_snapshots.sql"),
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

describe("migration lmnp_workspace_snapshots", () => {
  it("crée la table minimale (pk dossier+année, pas de user_id dénormalisé)", () => {
    assert.match(rls, /create table if not exists public\.lmnp_workspace_snapshots/);
    assert.match(rls, /primary key \(dossier_id, fiscal_year\)/);
    assert.match(rls, /references public\.lmnp_dossiers\(id\) on delete cascade/);
    assert.match(rls, /check \(fiscal_year between 2000 and 2100\)/);
    assert.match(rls, /schema_version integer not null check \(schema_version >= 1\)/);
    assert.match(rls, /revision integer not null default 1 check \(revision >= 1\)/);
    assert.match(rls, /payload jsonb not null/);
    assert.doesNotMatch(rls, /create table[\s\S]*?user_id[\s\S]*?primary key/);
    assert.doesNotMatch(rls, /create index/);
  });

  it("RLS authenticated SELECT/INSERT/UPDATE propriétaire, aucun DELETE client, anon révoqué", () => {
    assert.match(rls, /alter table public\.lmnp_workspace_snapshots enable row level security/);
    const creates = rls.match(/create policy[\s\S]*?;/g) ?? [];
    assert.equal(creates.length, 3);
    for (const c of creates) assert.match(c, /to authenticated/);
    const cmds = creates.map((c) => c.match(/for (select|insert|update|delete|all)/)?.[1]).sort();
    assert.deepEqual(cmds, ["insert", "select", "update"]);
    assert.doesNotMatch(rls, /to anon/);
    assert.doesNotMatch(rls, /using\s*\(\s*true\s*\)/);
    assert.match(rls, /revoke all on public\.lmnp_workspace_snapshots from anon/);
    assert.match(rls, /revoke delete, truncate on public\.lmnp_workspace_snapshots from authenticated/);
  });

  it("ne touche pas au paiement ni à documents/storage", () => {
    assert.doesNotMatch(rls, /lmnp_declaration_payments/);
    assert.doesNotMatch(rls, /lmnp-documents|storage/);
    assert.doesNotMatch(rls, /delete from|truncate table|drop table/);
  });
});
