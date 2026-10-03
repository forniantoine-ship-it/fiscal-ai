/**
 * MB-MULTI-V3-READMODEL-1 — shell V3 d'un dossier multi-bien SCOPÉ (A + B, `draft.biens`) : les rubriques de bien (F010–F014)
 * suivent le bien ACTIF explicite, l'activité (F009) reste au niveau activité, aucune rubrique n'est « non prise en charge »
 * globalement, jamais de repli sur le premier bien. Les capacités de production restent TOUTES fermées.
 *
 * Run: npx tsx --test src/lab/v2-dossier/multi-v3-readmodel.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { v3CorrectionActionFor } from "./correction-registry";
import type { V3CorrectionScope } from "./correction-scope";
import { buildV3FinancingDetail } from "./financing-detail-read-model";
import { buildV3DossierDetailReadModel, money, type V3DomainReadModel } from "./read-model";
import { MULTI_PROPERTY_CAPABILITIES } from "@/lib/lmnp/dossier/multi-property-activation";
import { A, B, SPEC_A, SPEC_B, multiWorkspace } from "@/lib/lmnp/services/declaration/multi-property-test-support";

const DOMAIN_KEYS = ["property", "financing", "revenue", "charges", "amortization"] as const;
const model = (workspace = multiWorkspace(), active?: string | null) => buildV3DossierDetailReadModel(workspace, active);
const fact = (domain: V3DomainReadModel, id: string) => domain.facts.find(item => item.id === id)?.value;
const scopeOf = (propertyId: string | null, shell?: "v3"): V3CorrectionScope => ({
  dossierId: "dossier-1", fiscalYearId: "fy-2026", year: 2026,
  property: propertyId ? { kind: "required", propertyId } : { kind: "not_applicable" }, ...(shell ? { shell } : {}),
});

test("MULTI SHELL — A+B scopé avec bien actif : aucune des six rubriques n'est « unsupported » ni « selection_required »", () => {
  for (const active of [A, B]) {
    const detail = model(multiWorkspace(), active);
    for (const domain of [detail.activity, ...DOMAIN_KEYS.map(key => detail[key])]) {
      assert.notEqual(domain.status, "unsupported", `${domain.id}/${active}`);
      assert.notEqual(domain.status, "selection_required", `${domain.id}/${active}`);
      assert.doesNotMatch(domain.summary, /multi-biens non pris en charge/);
    }
  }
});

test("ACTIVITY — F009 reste au niveau activité : identique quel que soit le bien actif (A, B, aucun, inconnu)", () => {
  const reference = model(multiWorkspace(), A).activity;
  assert.equal(fact(reference, "siren"), "123456789");
  for (const active of [B, null, undefined, "", "inconnu"]) assert.deepEqual(model(multiWorkspace(), active).activity, reference, String(active));
});

test("PROPERTY A / B — les rubriques de bien lisent le bien actif et jamais l'autre (valeurs reconnaissables)", () => {
  const a = model(multiWorkspace(), A);
  const b = model(multiWorkspace(), B);
  assert.equal(fact(a.revenue, "totalRecettes"), money(14321));
  assert.equal(fact(b.revenue, "totalRecettes"), money(9000));
  assert.equal(fact(a.amortization, "totalDotations"), money(4544));
  assert.equal(fact(b.amortization, "totalDotations"), money(900));
  assert.equal(fact(a.charges, "totalDeductible"), money(3457));
  assert.equal(fact(b.charges, "totalDeductible"), money(800));
  assert.equal(fact(a.property, "dateMiseEnService"), null, "date MES de F010 = base du bien, non confondue avec celle du draft");
  // Aucune contamination : les valeurs de A n'apparaissent jamais dans les rubriques de B et inversement.
  const json = (value: unknown) => JSON.stringify(value);
  for (const own of [14321, 4544, 3457]) assert.ok(!json(b).includes(money(own)), `B ne contient pas ${own}`);
  for (const other of [9000, 900, 800]) assert.ok(!json(a).includes(money(other)), `A ne contient pas ${other}`);
});

test("SELECTION CHANGE — A → B → A ne mute rien et change les rubriques affichées", () => {
  const workspace = multiWorkspace();
  const before = structuredClone(workspace);
  const first = model(workspace, A);
  const second = model(workspace, B);
  const third = model(workspace, A);
  assert.deepEqual(workspace, before, "lecture pure : aucune donnée mutée");
  assert.notDeepEqual(first.revenue, second.revenue);
  assert.deepEqual(first, third);
});

test("DIFFERENT COMPLETION — le statut d'une rubrique de bien est celui du bien actif, jamais une agrégation A+B", () => {
  const workspace = multiWorkspace({ bienOverrides: { [B]: { logementAmortissement: undefined } } });
  const a = model(workspace, A).property;
  const b = model(workspace, B).property;
  assert.equal(a.status, "complete");
  assert.equal(b.status, "incomplete");
  assert.equal(a.summary, "Logement analysé");
  assert.equal(b.summary, "Logement à compléter");
  assert.equal(model(workspace, A).property.status, "complete", "revenir sur A rend A");
});

test("NO SELECTION — dossier multi sans bien actif : sélection requise, aucune donnée, aucun repli sur le premier bien", () => {
  for (const active of [null, undefined, "", "   "]) {
    const detail = model(multiWorkspace(), active);
    for (const key of DOMAIN_KEYS) {
      assert.equal(detail[key].status, "selection_required", `${key}/${JSON.stringify(active)}`);
      assert.match(detail[key].summary, /Choisissez un bien/);
      assert.ok(detail[key].facts.every(item => item.value === null), key);
    }
    for (const amount of [14321, 4544, 9000, 900]) assert.ok(!JSON.stringify(detail).includes(money(amount)), String(amount));
  }
});

test("UNKNOWN / FOREIGN PROPERTY — fail-closed : « unsupported », aucune donnée, jamais un autre bien", () => {
  for (const active of ["inconnu", "bien-d-un-autre-dossier"]) {
    const detail = model(multiWorkspace(), active);
    for (const key of DOMAIN_KEYS) {
      assert.equal(detail[key].status, "unsupported", `${key}/${active}`);
      assert.ok(detail[key].facts.every(item => item.value === null));
    }
  }
  const outsideYear = multiWorkspace();
  outsideYear.properties.push({ id: "orphan", label: "Hors exercice", address: "", city: "", postalCode: "" });
  assert.equal(model(outsideYear, "orphan").property.status, "unsupported", "bien connu mais hors exercice");
});

test("LINKS — F010–F014 reçoivent le propertyId du bien actif ; F009 reste activity-scoped (aucun propertyId)", () => {
  const owners = { property: "/assistants/logement", financing: "/assistants/financement", revenues: "/assistants/revenus", charges: "/assistants/charges", depreciation: "/assistants/amortissements" } as const;
  for (const active of [A, B]) {
    for (const [domain, route] of Object.entries(owners)) {
      const action = v3CorrectionActionFor(domain as keyof typeof owners, scopeOf(active, "v3"));
      assert.ok(action, domain);
      const url = new URL(action!.href, "http://x");
      assert.equal(url.pathname, route);
      assert.equal(url.searchParams.getAll("propertyId").join(), active, `${domain}/${active}`);
    }
  }
  for (const shell of [undefined, "v3"] as const) {
    const activity = v3CorrectionActionFor("activity", scopeOf(A, shell));
    assert.ok(activity);
    assert.equal(new URL(activity!.href, "http://x").searchParams.has("propertyId"), false, "F009 n'est jamais rattaché à un bien");
  }
  // Sans bien actif : aucune action de bien (fail-closed) ; F009 reste accessible.
  for (const domain of Object.keys(owners)) assert.equal(v3CorrectionActionFor(domain as keyof typeof owners, scopeOf(null)), null, domain);
  assert.ok(v3CorrectionActionFor("activity", scopeOf(null, "v3")));
});

test("FINANCING DETAIL — suit le bien actif ; sans bien actif ou bien inconnu : fail-closed", () => {
  const workspace = multiWorkspace({ specs: [[A, { ...SPEC_A, credit: "unknown" }], [B, { ...SPEC_B, credit: "none" }]] });
  assert.equal(buildV3FinancingDetail(workspace, undefined, A).state, "missing");
  assert.equal(buildV3FinancingDetail(workspace, undefined, B).state, "none");
  assert.equal(buildV3FinancingDetail(workspace).state, "unsupported");
  assert.equal(buildV3FinancingDetail(workspace, undefined, "inconnu").state, "unsupported");
});

test("MONO inchangé — le bien actif est ignoré ; une rubrique n'est jamais « selection_required »", () => {
  const mono = multiWorkspace({ specs: [[A, SPEC_A]] });
  assert.deepEqual(model(mono, null), model(mono, A));
  assert.ok(DOMAIN_KEYS.every(key => model(mono, null)[key].status !== "selection_required"));
});

test("PRODUCTION DORMANCY — les six capacités restent fermées", () => {
  assert.deepEqual(MULTI_PROPERTY_CAPABILITIES, { edition: false, generation: false, delivery: false, payment: false, closing: false, nextYear: false });
});
