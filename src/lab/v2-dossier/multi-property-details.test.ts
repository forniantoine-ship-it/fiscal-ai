/**
 * MB-MULTI-PROPERTY-DETAILS-1 — panneaux de DÉTAIL property-scoped (Logement F010, Financement F011, Charges F012, Revenus F013,
 * Amortissements F014) d'un dossier multi-bien scopé (A + B). Oracle : la lecture multi du bien actif est IDENTIQUE à la lecture
 * mono des mêmes données (assistants RÉELS) ; aucune contamination A/B ; sans bien actif ou bien inconnu : fail-closed ;
 * documents isolés ; liens d'assistant portant le propertyId actif. Aucun calcul fiscal n'est exercé ici hors du moteur F014 déjà
 * appelé par le seam (lecture).
 *
 * Run: npx tsx --test src/lab/v2-dossier/multi-property-details.test.ts
 */
import "./test-public-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { migrateLegacyMonoToBiens, type BienDraft } from "@/lib/lmnp/dossier/bien-draft";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { LmnpDocument } from "@/lib/lmnp/types";
import { buildV3AmortizationDetail } from "./amortization-detail-read-model";
import { resolveF014Plan } from "./amortization-plan-seam";
import { representativeMonoWorkspaces } from "./bien-read-test-support";
import { buildV3ChargesDetail } from "./charges-detail-read-model";
import { v3CorrectionActionFor } from "./correction-registry";
import type { V3CorrectionScope } from "./correction-scope";
import { buildV3FinancingDetail } from "./financing-detail-read-model";
import { buildV3HousingDetail } from "./housing-detail-read-model";
import { buildV3RevenueDetail } from "./revenue-detail-read-model";
import { resolveV3PropertyServiceDate } from "./property-service-date";
import { resolveV3PropertySupport } from "./v3-property-scope";
import { buildAmortizationView } from "@/lab/v3-dossier/amortization-view-model";
import { buildChargesView } from "@/lab/v3-dossier/charges-view-model";
import { buildFinancingView } from "@/lab/v3-dossier/financing-view-model";
import { buildHousingView } from "@/lab/v3-dossier/housing-view-model";
import { buildRevenueView } from "@/lab/v3-dossier/revenue-view-model";

const A = "bien-a";
const B = "bien-b";

/** Le BienDraft d'un dossier mono réel, rattaché à un autre identifiant de bien. */
function bienOf(workspace: PersistedWorkspace, id: string): BienDraft {
  const migrated = migrateLegacyMonoToBiens(workspace);
  assert.ok(migrated.ok);
  return { ...migrated.draft.biens![workspace.properties[0]!.id]!, propertyId: id };
}

const doc = (id: string, propertyId: string | null | undefined): LmnpDocument =>
  ({ ...{ id, fiscalYearId: "fy-2025", fiscalYear: 2025, fileName: id === "doc-1" ? "Tableau réel.pdf" : `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 100, category: "autre", documentType: "unknown", status: "analyzed", uploadedAt: "2026-02-01" }, ...(propertyId === undefined ? {} : { propertyId }) }) as LmnpDocument;

type Fixture = {
  multi: PersistedWorkspace;
  mono: Awaited<ReturnType<typeof representativeMonoWorkspaces>>;
  monoIds: { f010: string; f011: string; f012: string; f013: string; f014: string };
};

/**
 * A = dossier réel F014 (logement + travaux + amortissements) ; B = dossier réel F013 (revenus) + financement réel F011.
 * Les deux biens portent des valeurs DIFFÉRENTES dans chaque domaine ; le financement (et son document) n'appartient qu'à B.
 */
async function fixture(extraDocuments: LmnpDocument[] = []): Promise<Fixture> {
  const mono = await representativeMonoWorkspaces();
  const a = { ...bienOf(mono.f014, A) };
  const b = { ...bienOf(mono.f013, B), ...pickFinancing(bienOf(mono.f011, B)) };
  const root = migrateLegacyMonoToBiens(mono.f014);
  assert.ok(root.ok);
  const multi: PersistedWorkspace = {
    ...mono.f014,
    properties: [
      { ...mono.f014.properties[0]!, id: A, label: "Maison A" },
      { ...mono.f013.properties[0]!, id: B, label: "Appartement B", address: "2 rue B" },
    ],
    fiscalYear: { ...mono.f014.fiscalYear, propertyIds: [A, B] },
    documents: [doc("doc-1", B), ...extraDocuments],
    declarationDraft: { ...root.draft, biens: { [A]: a, [B]: b } },
  };
  const idOf = (key: keyof Fixture["monoIds"]) => mono[key].properties[0]!.id;
  return { multi, mono, monoIds: { f010: idOf("f010"), f011: idOf("f011"), f012: idOf("f012"), f013: idOf("f013"), f014: idOf("f014") } };
}

function pickFinancing(bien: BienDraft): Partial<BienDraft> {
  const { creditFinancing, financementCharges, creditConfirmedAt, creditDeclaredNoneAt, creditDocumentId, creditGptSession, financementAssistantState } = bien;
  return Object.fromEntries(Object.entries({ creditFinancing, financementCharges, creditConfirmedAt, creditDeclaredNoneAt, creditDocumentId, creditGptSession, financementAssistantState })
    .filter(([, value]) => value !== undefined));
}

const scopeOf = (propertyId: string | null): V3CorrectionScope => ({
  dossierId: "dossier-1", fiscalYearId: "fy-2025", year: 2025,
  property: propertyId ? { kind: "required", propertyId } : { kind: "not_applicable" }, shell: "v3",
});
const json = (value: unknown) => JSON.stringify(value);

describe("MULTI DETAILS — support produit d'un bien explicitement scopé", () => {
  it("full pour A et B (BienDraft scopé lisible) ; facts_only pour un bien inconnu ; mono inchangé", async () => {
    const { multi, mono } = await fixture();
    assert.equal(resolveV3PropertySupport(multi, A), "full");
    assert.equal(resolveV3PropertySupport(multi, B), "full");
    assert.equal(resolveV3PropertySupport(multi, "inconnu"), "facts_only");
    for (const ws of Object.values(mono)) assert.equal(resolveV3PropertySupport(ws, ws.properties[0]!.id), "full");
  });
});

describe("LOGEMENT F010 — détail du bien actif", () => {
  it("A et B : support full, données du bien, message « non supporté » absent ; parité mono pour A", async () => {
    const { multi, mono, monoIds } = await fixture();
    for (const id of [A, B]) {
      const detail = buildV3HousingDetail(multi, id);
      assert.equal(detail.state, "known");
      if (detail.state !== "known") return;
      assert.equal(detail.support, "full");
      assert.equal(detail.propertyId, id);
      assert.equal(detail.label, id === A ? "Maison A" : "Appartement B");
      assert.doesNotMatch(json(buildHousingView(detail, null)), /attribuables à ce logement|Non supporté actuellement/);
    }
    const a = buildV3HousingDetail(multi, A);
    const m = buildV3HousingDetail(mono.f014, monoIds.f014);
    assert.ok(a.state === "known" && m.state === "known");
    if (a.state === "known" && m.state === "known") {
      assert.deepEqual({ ...a, propertyId: 0, label: 0, address: 0, entry: 0, serviceDate: 0 }, { ...m, propertyId: 0, label: 0, address: 0, entry: 0, serviceDate: 0 });
    }
  });

  it("sans bien actif / bien inconnu / hors exercice : scope_unresolved, aucune donnée", async () => {
    const { multi } = await fixture();
    for (const id of [null, undefined, "", "inconnu"]) assert.equal(buildV3HousingDetail(multi, id).state, "scope_unresolved", String(id));
    const orphan = { ...multi, properties: [...multi.properties, { ...multi.properties[0]!, id: "orphan" }] };
    assert.equal(buildV3HousingDetail(orphan, "orphan").state, "scope_unresolved");
  });
});

describe("FINANCEMENT F011 — détail du bien actif", () => {
  it("B : lit son financement, identique au mono réel ; A : aucun financement de B", async () => {
    const { multi, mono } = await fixture();
    const b = buildV3FinancingDetail(multi, undefined, B);
    const m = buildV3FinancingDetail(mono.f011);
    // Les faits de contrat et leurs sources documentaires sont ceux du mono réel (l'exercice F011 du fixture mono est 2026 ≠ 2025 :
    // les valeurs d'exercice calculées ne sont pas comparées).
    assert.equal(b.state, m.state);
    assert.ok(b.loans.length > 0);
    assert.deepEqual(b.loans.map(loan => loan.facts), m.loans.map(loan => loan.facts));
    assert.deepEqual(b.documents.map(item => item.id), ["doc-1"]);
    const a = buildV3FinancingDetail(multi, undefined, A);
    assert.notEqual(a.state, "known");
    assert.deepEqual(a.loans, []);
  });

  it("sans bien actif / inconnu : fail-closed", async () => {
    const { multi } = await fixture();
    for (const id of [null, undefined, "", "inconnu"]) assert.equal(buildV3FinancingDetail(multi, undefined, id).state, "unsupported", String(id));
  });
});

describe("REVENUS F013 — détail du bien actif (jamais une somme d'activité)", () => {
  it("B : total du mono réel F013 ; A : aucun revenu de B", async () => {
    const { multi, mono, monoIds } = await fixture();
    const b = buildV3RevenueDetail(multi, B);
    const m = buildV3RevenueDetail(mono.f013, monoIds.f013);
    assert.ok(b.state === "known" && m.state === "known");
    if (b.state === "known" && m.state === "known") {
      assert.equal(b.support, "full");
      assert.deepEqual(b.total, m.total);
      assert.deepEqual(b.components, m.components);
      assert.notEqual(b.total.state, "unknown");
    }
    const a = buildV3RevenueDetail(multi, A);
    assert.ok(a.state === "known");
    if (a.state === "known") assert.equal(a.total.state, "unknown");
  });

  it("sans bien actif / inconnu : scope_unresolved", async () => {
    const { multi } = await fixture();
    for (const id of [null, "", "inconnu"]) assert.equal(buildV3RevenueDetail(multi, id).state, "scope_unresolved");
  });
});

describe("CHARGES F012 — détail du bien actif (aucune allocation commune)", () => {
  it("A : charges du mono réel F014 ; B : aucune charge de A", async () => {
    const { multi, mono, monoIds } = await fixture();
    const a = buildV3ChargesDetail(multi, A);
    const m = buildV3ChargesDetail(mono.f014, monoIds.f014);
    assert.ok(a.state === "known" && m.state === "known");
    if (a.state === "known" && m.state === "known") {
      assert.equal(a.support, "full");
      assert.deepEqual(a.total, m.total);
      assert.deepEqual(a.categories, m.categories);
    }
    const b = buildV3ChargesDetail(multi, B);
    assert.ok(b.state === "known");
    if (b.state === "known") assert.equal(b.total.state, "unknown");
  });

  it("sans bien actif / inconnu : scope_unresolved", async () => {
    const { multi } = await fixture();
    for (const id of [null, "", "inconnu"]) assert.equal(buildV3ChargesDetail(multi, id).state, "scope_unresolved");
  });
});

describe("AMORTISSEMENTS F014 — détail du bien actif et seam", () => {
  it("A : plan et total du mono réel F014 (seam sur le bien A, moteur propriétaire inchangé) ; B : aucun plan de A", async () => {
    const { multi, mono, monoIds } = await fixture();
    const a = buildV3AmortizationDetail(multi, A);
    const m = buildV3AmortizationDetail(mono.f014, monoIds.f014);
    assert.ok(a.state === "known" && m.state === "known");
    if (a.state === "known" && m.state === "known") {
      assert.equal(a.support, "full");
      assert.deepEqual(a.total, m.total);
      assert.deepEqual(a.lines, m.lines);
      assert.equal(a.planFreshness, m.planFreshness);
    }
    const seamA = resolveF014Plan(multi, A);
    const seamMono = resolveF014Plan(mono.f014, monoIds.f014);
    assert.ok(seamA.ok && seamMono.ok);
    if (seamA.ok && seamMono.ok) assert.deepEqual(seamA.plan, seamMono.plan, "même moteur, mêmes dépendances : même plan");
    const b = buildV3AmortizationDetail(multi, B);
    assert.ok(b.state === "known");
    if (b.state === "known") assert.equal(b.total.state, "unknown");
    assert.equal(resolveF014Plan(multi, B).ok, false);
  });

  it("sans bien actif / inconnu : seam et détail fail-closed", async () => {
    const { multi } = await fixture();
    for (const id of [null, "", "inconnu"]) {
      assert.equal(buildV3AmortizationDetail(multi, id).state, "scope_unresolved");
      assert.equal(resolveF014Plan(multi, id).ok, false);
    }
  });
});

describe("ISOLATION A/B — aucune contamination, aucune mutation", () => {
  it("A → B → A : lectures pures et identiques ; aucune valeur de l'autre bien", async () => {
    const { multi } = await fixture();
    const before = structuredClone(multi);
    const read = (id: string) => json([buildV3HousingDetail(multi, id), buildV3FinancingDetail(multi, undefined, id), buildV3RevenueDetail(multi, id), buildV3ChargesDetail(multi, id), buildV3AmortizationDetail(multi, id)]);
    const first = read(A);
    const second = read(B);
    assert.equal(read(A), first);
    assert.notEqual(first, second);
    assert.deepEqual(multi, before);
    assert.doesNotMatch(first, /Appartement B|2 rue B/);
    assert.doesNotMatch(second, /Maison A/);
  });
});

describe("DOCUMENTS — isolation par bien dans les détails", () => {
  it("doc de B visible dans B ; jamais dans A, même si A le référence ; non attribué / commun jamais promus", async () => {
    const { multi } = await fixture();
    const sharedFinancing = pickFinancing(bienOf(multi, B) as BienDraft);
    const withReference: PersistedWorkspace = {
      ...multi,
      documents: [...multi.documents, doc("doc-orphan", undefined), doc("doc-common", null)],
      declarationDraft: { ...multi.declarationDraft!, biens: { ...multi.declarationDraft!.biens!, [A]: { ...multi.declarationDraft!.biens![A]!, ...sharedFinancing } } },
    };
    const docsOf = (id: string) => buildV3FinancingDetail(withReference, { state: "known", documents: [] }, id).documents.map(item => item.id);
    assert.deepEqual(docsOf(B), ["doc-1"]);
    assert.deepEqual(docsOf(A), [], "doc-1 appartient à B : jamais affiché dans le détail de A");
    for (const id of [A, B]) assert.ok(!docsOf(id).some(item => item === "doc-orphan" || item === "doc-common"));
  });
});

describe("LIENS — « Revoir dans l'Assistant … » porte le propertyId du bien actif", () => {
  it("F010–F014 → propertyId A ou B ; jamais l'autre", async () => {
    const { multi } = await fixture();
    for (const active of [A, B]) {
      const hrefOf = (domain: Parameters<typeof v3CorrectionActionFor>[0]) => v3CorrectionActionFor(domain, scopeOf(active))!;
      const views = [
        buildHousingView(buildV3HousingDetail(multi, active), hrefOf("property")),
        buildFinancingView(buildV3FinancingDetail(multi, undefined, active), hrefOf("financing")),
        buildRevenueView(buildV3RevenueDetail(multi, active), hrefOf("revenues")),
        buildChargesView(buildV3ChargesDetail(multi, active), hrefOf("charges")),
        buildAmortizationView(buildV3AmortizationDetail(multi, active), hrefOf("depreciation")),
      ];
      for (const view of views) {
        const href = (view as { action?: { href: string } | null }).action?.href;
        assert.ok(href, `${active}: lien présent`);
        assert.equal(new URL(href!, "http://x").searchParams.getAll("propertyId").join(), active);
      }
    }
  });
});

describe("DATE DE MISE EN SERVICE — attribuée au bien par SON BienDraft en multi scopé", () => {
  it("A lit sa date ; un bien sans date n'hérite jamais de celle de l'autre ; la réponse F009 en cours n'est jamais attribuée", async () => {
    const { multi } = await fixture();
    const a = resolveV3PropertyServiceDate(multi, A);
    assert.equal(a.status, "known");
    const withoutDateB: PersistedWorkspace = {
      ...multi,
      declarationDraft: { ...multi.declarationDraft!, biens: { ...multi.declarationDraft!.biens!, [B]: { ...multi.declarationDraft!.biens![B]!, dateMiseEnService: undefined } } },
    };
    assert.equal(resolveV3PropertyServiceDate(withoutDateB, B).status, "absent");
    assert.equal(resolveV3PropertyServiceDate(withoutDateB, A).status, "known");
    const inProgress: PersistedWorkspace = {
      ...withoutDateB,
      declarationDraft: { ...withoutDateB.declarationDraft!, activiteAssistantState: { ...(withoutDateB.declarationDraft!.activiteAssistantState ?? {}), dateMiseEnService: "2025-09-09" } as never },
    };
    assert.equal(resolveV3PropertyServiceDate(inProgress, B).status, "absent", "réponse F009 (activité) jamais attribuée à un bien en multi");
  });
});
