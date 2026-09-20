/**
 * P0-S1 — la migration Storage RLS de `lmnp-documents` doit fermer les
 * policies permissives live (toute auth SELECT/INSERT sur le bucket) et
 * imposer l'isolation owner-folder `{auth.uid()}/…`.
 * Test STATIQUE du SQL : la preuve live se fait à l'application.
 * Run: npx tsx --test src/lib/lmnp/dossier/lmnp-documents-storage-rls-migration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const MIGRATION_FILE = "20260920140000_lmnp_documents_storage_owner_rls.sql";
const rlsSql = readFileSync(path.join(MIGRATIONS, MIGRATION_FILE), "utf8");

/** SQL exécutable : commentaires `--` retirés. */
function code(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

const rls = code(rlsSql);

describe("migration Storage RLS lmnp-documents — owner-folder isolation", () => {
  it("cible le bucket lmnp-documents et le force privé", () => {
    assert.match(rls, /lmnp-documents/);
    assert.match(
      rls,
      /insert into storage\.buckets[\s\S]*'lmnp-documents'[\s\S]*false[\s\S]*on conflict \(id\) do update set public = false/,
    );
  });

  it("supprime les policies permissives live identifiées (pas un drop-all storage.objects)", () => {
    assert.match(rls, /2 give users authenticated access to folder vvme7i_0/);
    assert.match(rls, /give users authenticated access to folder vvme7i_0/);
    assert.match(rls, /drop policy if exists %i on storage\.objects/);
    // Must NOT wipe every storage.objects policy via unrestricted pg_policies loop.
    assert.doesNotMatch(
      rls,
      /for p in\s+select policyname\s+from pg_policies\s+where schemaname = 'storage' and tablename = 'objects'/,
    );
  });

  it("le drop des anciennes policies précède la création", () => {
    assert.ok(rls.indexOf("drop policy") < rls.indexOf("create policy"));
  });

  it("crée exactement SELECT/INSERT/UPDATE/DELETE owner-folder pour authenticated", () => {
    const creates = rls.match(/create policy[\s\S]*?;/g) ?? [];
    assert.equal(creates.length, 4);
    for (const c of creates) {
      assert.match(c, /to authenticated/);
      assert.match(c, /bucket_id = 'lmnp-documents'/);
      assert.match(c, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
      assert.doesNotMatch(c, /to anon/);
      assert.doesNotMatch(c, /using\s*\(\s*true\s*\)/);
      assert.doesNotMatch(c, /with check\s*\(\s*true\s*\)/);
    }
    const cmds = creates.map((c) => c.match(/for (select|insert|update|delete|all)/)?.[1]).sort();
    assert.deepEqual(cmds, ["delete", "insert", "select", "update"]);
  });

  it("UPDATE exige USING + WITH CHECK owner-folder", () => {
    const update = (rls.match(/create policy lmnp_documents_owner_update[\s\S]*?;/) ?? [])[0] ?? "";
    assert.match(update, /for update/);
    assert.match(update, /using \([\s\S]*foldername[\s\S]*\)/);
    assert.match(update, /with check \([\s\S]*foldername[\s\S]*\)/);
  });

  it("INSERT est borné par WITH CHECK owner-folder", () => {
    const insert = (rls.match(/create policy lmnp_documents_owner_insert[\s\S]*?;/) ?? [])[0] ?? "";
    assert.match(insert, /for insert[\s\S]*with check/);
  });

  it("SELECT et DELETE sont bornés par USING owner-folder", () => {
    const select = (rls.match(/create policy lmnp_documents_owner_select[\s\S]*?;/) ?? [])[0] ?? "";
    const del = (rls.match(/create policy lmnp_documents_owner_delete[\s\S]*?;/) ?? [])[0] ?? "";
    assert.match(select, /for select[\s\S]*using/);
    assert.match(del, /for delete[\s\S]*using/);
  });

  it("ne crée aucune policy anon et ne touche pas aux autres buckets via drop-all", () => {
    assert.doesNotMatch(rls, /to anon/);
    assert.doesNotMatch(rls, /to public/);
    // No CREATE POLICY for a different bucket id.
    const creates = rls.match(/create policy[\s\S]*?;/g) ?? [];
    for (const c of creates) {
      assert.match(c, /bucket_id = 'lmnp-documents'/);
      assert.doesNotMatch(c, /bucket_id = '(?!lmnp-documents)[^']+'/);
    }
  });

  it("aucune opération destructrice sur les données / objets", () => {
    assert.doesNotMatch(rls, /delete from storage\.objects|truncate table|drop table|drop bucket/);
  });
});
