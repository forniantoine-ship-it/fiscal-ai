/**
 * Payment V1 — la migration RLS de `lmnp_dossiers` doit fermer les policies
 * permissives constatées en base (SELECT/INSERT `public` avec `true`) et ne laisser
 * qu'un modèle propriétaire. Test STATIQUE du SQL : la preuve live se fait à
 * l'application de la migration (pg_policies + requêtes anon/authenticated).
 * Run: npx tsx --test src/lib/lmnp/services/payment/lmnp-dossiers-rls-migration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const rlsSql = readFileSync(path.join(MIGRATIONS, "20260919100100_lmnp_dossiers_owner_rls.sql"), "utf8");
const paymentsSql = readFileSync(path.join(MIGRATIONS, "20260919100000_lmnp_declaration_payments.sql"), "utf8");

/** SQL exécutable : commentaires `--` retirés. */
function code(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

const rls = code(rlsSql);

describe("migration RLS lmnp_dossiers — fermeture des policies permissives", () => {
  it("active la RLS", () => {
    assert.match(rls, /alter table public\.lmnp_dossiers enable row level security/);
  });

  it("supprime TOUTES les policies existantes (dont 'Enable read access for all users' et 'Allow insert')", () => {
    assert.match(rls, /from pg_policies/i);
    assert.match(rls, /tablename = 'lmnp_dossiers'/);
    assert.match(rls, /drop policy %i on public\.lmnp_dossiers/);
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

  it("SELECT et INSERT sont bornés au propriétaire (auth.uid())", () => {
    assert.match(rls, /for select to authenticated\s+using \(user_id = auth\.uid\(\)\)/);
    assert.match(rls, /for insert to authenticated\s+with check \(user_id = auth\.uid\(\)\)/);
  });

  it("révoque les écritures inutiles (anon: insert/update/delete/truncate ; authenticated: update/delete/truncate)", () => {
    assert.match(rls, /revoke insert, update, delete, truncate on public\.lmnp_dossiers from anon/);
    assert.match(rls, /revoke update, delete, truncate on public\.lmnp_dossiers from authenticated/);
    assert.doesNotMatch(rls, /revoke[^;]*select[^;]*on public\.lmnp_dossiers/);
  });

  it("aucune opération destructrice sur les données", () => {
    assert.doesNotMatch(rls, /drop table|delete from|truncate table|alter table[^;]*drop column/);
  });
});

describe("migration paiements — l'entitlement n'est jamais écrivable par un client", () => {
  const pay = code(paymentsSql);

  it("unicité (dossier, année) + RLS activée", () => {
    assert.match(pay, /unique \(dossier_id, fiscal_year\)/);
    assert.match(pay, /alter table public\.lmnp_declaration_payments enable row level security/);
  });

  it("une seule policy : SELECT propriétaire ; aucune policy d'écriture", () => {
    const creates = pay.match(/create policy[\s\S]*?\);/g) ?? [];
    assert.equal(creates.length, 1);
    assert.match(creates[0], /for select/);
    assert.doesNotMatch(pay, /for (insert|update|delete|all)/);
  });

  it("révoque insert/update/delete/truncate pour anon et authenticated (TRUNCATE échappe à la RLS)", () => {
    assert.match(
      pay,
      /revoke insert, update, delete, truncate on public\.lmnp_declaration_payments from anon, authenticated/,
    );
  });

  it("aucun grant ne réaccorde de privilège d'écriture aux rôles clients", () => {
    assert.doesNotMatch(pay, /grant\s+[^;]*\bon public\.lmnp_declaration_payments\b/);
  });
});
