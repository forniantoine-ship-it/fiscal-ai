/**
 * P0-S0 — la migration RLS de `documents` doit fermer la fuite anon SELECT
 * constatée en live (322 lignes, user_id / dossier_id / file_path) et ne laisser
 * qu'un modèle propriétaire. Test STATIQUE du SQL : la preuve live se fait à
 * l'application de la migration (anon SELECT + isolation authenticated).
 * Run: npx tsx --test src/lib/lmnp/dossier/documents-rls-migration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const rlsSql = readFileSync(path.join(MIGRATIONS, "20260920100000_documents_owner_rls.sql"), "utf8");

/** SQL exécutable : commentaires `--` retirés. */
function code(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

const rls = code(rlsSql);

describe("migration RLS documents — fermeture de la fuite anon SELECT", () => {
  it("active la RLS", () => {
    assert.match(rls, /alter table public\.documents enable row level security/);
  });

  it("supprime TOUTES les policies existantes avant d'en recréer", () => {
    assert.match(rls, /from pg_policies/i);
    assert.match(rls, /tablename = 'documents'/);
    assert.match(rls, /drop policy %i on public\.documents/);
  });

  it("le drop précède toute création (sinon une policy permissive survivrait)", () => {
    assert.ok(rls.indexOf("drop policy") < rls.indexOf("create policy"));
  });

  it("ne crée aucune policy permissive (using/with check true, rôle public, sans TO)", () => {
    assert.doesNotMatch(rls, /using\s*\(\s*true\s*\)/);
    assert.doesNotMatch(rls, /with check\s*\(\s*true\s*\)/);
    assert.doesNotMatch(rls, /to public/);
    assert.doesNotMatch(rls, /to anon/);
    const creates = rls.match(/create policy[\s\S]*?;/g) ?? [];
    assert.equal(creates.length, 2);
    for (const c of creates) assert.match(c, /to authenticated/);
  });

  it("modèle final : exactement SELECT + INSERT propriétaire, aucun UPDATE/DELETE client", () => {
    const creates = rls.match(/create policy[\s\S]*?;/g) ?? [];
    const cmds = creates.map((c) => c.match(/for (select|insert|update|delete|all)/)?.[1]).sort();
    assert.deepEqual(cmds, ["insert", "select"]);
  });

  it("SELECT est borné au propriétaire, y compris les lignes legacy dossier_id NULL", () => {
    assert.match(
      rls,
      /for select to authenticated\s+using \(\s*user_id = auth\.uid\(\)\s+and \(\s*dossier_id is null\s+or dossier_id in \(select id from public\.lmnp_dossiers where user_id = auth\.uid\(\)\)\s*\)\s*\)/,
    );
  });

  it("INSERT est borné au propriétaire ET à un dossier que le caller possède (pas de NULL)", () => {
    assert.match(
      rls,
      /for insert to authenticated\s+with check \(\s*user_id = auth\.uid\(\)\s+and dossier_id is not null\s+and dossier_id in \(select id from public\.lmnp_dossiers where user_id = auth\.uid\(\)\)\s*\)/,
    );
  });

  it("révoque l'accès anon et les écritures client inutiles (TRUNCATE échappe à la RLS)", () => {
    assert.match(
      rls,
      /revoke select, insert, update, delete, truncate on public\.documents from anon/,
    );
    assert.match(rls, /revoke update, delete, truncate on public\.documents from authenticated/);
  });

  it("ne révoque pas SELECT/INSERT authenticated (uploads F009/F011/F012 + fetchDocumentsForDossier)", () => {
    assert.doesNotMatch(rls, /revoke[^;]*select[^;]*from authenticated/);
    assert.doesNotMatch(rls, /revoke[^;]*insert[^;]*from authenticated/);
  });

  it("aucune opération destructrice sur les données", () => {
    assert.doesNotMatch(rls, /drop table|delete from|truncate table|alter table[^;]*drop column|update public\.documents/);
  });

  it("ne touche pas au bucket Storage ni aux autres tables", () => {
    assert.doesNotMatch(rls, /storage|lmnp-documents|lmnp_dossiers_owner|extracted_document_data/);
  });
});
