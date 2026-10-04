/**
 * R2B.2b — raccord des chemins de production au moteur scopé (lecture ET écriture ensemble).
 *
 * Legacy mono : strictement inchangé. Scopé : F010 → F014 lisent et écrivent le BienDraft du bien actif ; F009 reste
 * global et ne possède plus la date de mise en service ; le Tunnel A est inaccessible ; N+1 préserve le modèle par bien.
 * Aucun bouton « Ajouter un bien », aucun sélecteur : ADD_PROPERTY reste dormant.
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/r2b2b-production-cutover.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { representativeMonoWorkspaces } from "@/lab/v2-dossier/bien-read-test-support";
import * as bienScopeModule from "@/lib/lmnp/dossier/bien-scope";
import { BIEN_DRAFT_FIELDS } from "@/lib/lmnp/dossier/bien-draft";
import { resolveDocumentScope } from "@/lib/lmnp/dossier/property-scope";
import { createNextDeclarationDraft } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { lmnpReducer, type LmnpAction, type LmnpState } from "@/lib/lmnp/store/reducer";
import { serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { DeclarationDraft, LmnpDocument, Property } from "@/lib/lmnp/types";
import { F009ActiviteAssistant, f009DraftPatch, remainingQuestions } from "@/runtime/assistants/f009-activite/assistant";
import { F010LogementAssistant } from "@/runtime/assistants/f010-logement/assistant";

const NOW = "2026-03-01T10:00:00.000Z";
const A = "home-1";
const B = "bien-b";
const PROPERTY_B: Property = { id: B, label: "Studio Nantes", address: "3 rue Y", city: "Nantes", postalCode: "44000" };
const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");

type BienScope = { status: string; mode?: string; propertyId?: string; draft?: DeclarationDraft };
type ScopeModule = {
  resolveActivePropertyId: (scope: unknown, workspace: unknown) => string | undefined;
  bienScopeFor: (workspace: unknown, activePropertyId: string | undefined) => BienScope;
  withActivePropertyId: (action: LmnpAction, propertyId: string | undefined) => LmnpAction;
  isTunnelAAvailable: (workspace: unknown) => boolean;
};
const scopeApi = () => {
  const api = bienScopeModule as unknown as Partial<ScopeModule>;
  assert.ok(api.resolveActivePropertyId && api.bienScopeFor && api.withActivePropertyId && api.isTunnelAAvailable, "module bien-scope");
  return api as ScopeModule;
};

function doc(id: string, propertyId: string | undefined, category: LmnpDocument["category"]): LmnpDocument {
  return {
    id, fiscalYearId: "fy-2025", fileName: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 1, category,
    documentType: "unknown", status: "analyzed", uploadedAt: NOW, ...(propertyId ? { propertyId } : {}),
  } as LmnpDocument;
}

async function legacyRich(): Promise<LmnpState> {
  const ws = await representativeMonoWorkspaces();
  const base = ws.f014;
  const draft = base.declarationDraft!;
  const credit = ws.f011.declarationDraft!;
  const revenus = ws.f013.declarationDraft!;
  return {
    ...base,
    fileRegistry: new Map(),
    documents: [...base.documents, doc("doc-pret", A, "emprunt"), doc("doc-inpi", undefined, "autre")],
    declarationDraft: {
      ...draft,
      creditFinancing: credit.creditFinancing,
      financementCharges: credit.financementCharges,
      creditConfirmedAt: credit.creditConfirmedAt,
      creditDocumentId: "doc-pret",
      revenusAssistant: revenus.revenusAssistant,
      revenusConfirmedAt: revenus.revenusConfirmedAt,
      inpiDocumentId: "doc-inpi",
      activityStartDate: "2025-01-01",
      governedFields: { propertyCity: { value: "Lyon" } } as never,
      documentStepsCompleted: ["logement"],
    },
  };
}

async function scopedAB(): Promise<{ legacy: LmnpState; scoped: LmnpState }> {
  const legacy = await legacyRich();
  const scoped = lmnpReducer(legacy, { type: "ADD_PROPERTY", property: PROPERTY_B });
  assert.ok(scoped.declarationDraft?.biens, "précondition : dossier scopé");
  return { legacy, scoped };
}

const bienOf = (state: LmnpState, id: string) => state.declarationDraft?.biens?.[id];
const noFlat = (state: LmnpState) => {
  for (const field of BIEN_DRAFT_FIELDS) assert.equal(state.declarationDraft?.[field], undefined, `${field} absent à plat`);
};

describe("R2B.2b — A : bien actif", () => {
  it("scope V3 explicite, sinon bien unique, sinon aucun — jamais le premier bien", async () => {
    const { legacy, scoped } = await scopedAB();
    const { resolveActivePropertyId } = scopeApi();
    const required = (propertyId: string) => ({ property: { kind: "required", propertyId } });
    assert.equal(resolveActivePropertyId(required(B), scoped), B);
    assert.equal(resolveActivePropertyId(null, scoped), undefined, "multi sans scope : aucun bien");
    assert.equal(resolveActivePropertyId(required("fantome"), scoped), undefined, "scope inconnu : aucun bien");
    assert.equal(resolveActivePropertyId(null, legacy), A, "legacy mono cohérent : bien unique");
    assert.equal(resolveActivePropertyId({ property: { kind: "not_applicable" } }, legacy), A);
  });

  it("le provider expose activePropertyId, résolu par le module central", () => {
    const provider = source("src/lib/lmnp/store/provider.tsx");
    assert.match(provider, /activePropertyId/);
    assert.match(provider, /resolveActivePropertyId\(/);
    assert.doesNotMatch(provider, /properties\[0\]|propertyIds\[0\]/);
  });
});

describe("R2B.2b — B → F, G, H : panels F010 → F014", () => {
  const PANELS = ["F010LogementAssistantPanel", "F011FinancementAssistantPanel", "F012ChargesAssistantPanel", "F013RevenusAssistantPanel", "F014AmortissementsAssistantPanel"];
  for (const panel of PANELS) {
    it(`${panel} lit et écrit via le scope du bien actif, derrière le garde`, () => {
      const code = source(`src/components/lmnp/assistants/${panel}.tsx`);
      assert.match(code, /useBienScope\(\)/);
      assert.match(code, /<BienScopeGate>/);
      assert.doesNotMatch(code, /workspace\.declarationDraft/, "aucune lecture à plat directe");
      assert.doesNotMatch(code, /resolveMonoPropertyId\(|resolveMonoProperty\(/, "le bien vient du scope actif");
    });
  }

  it("lecture scopée : le brouillon d'un panel est la vue du bien actif, jamais un autre bien", async () => {
    const { scoped } = await scopedAB();
    const { bienScopeFor } = scopeApi();
    const a = bienScopeFor(scoped, A);
    assert.equal(a.status, "ready");
    assert.equal(a.mode, "scoped");
    assert.deepEqual(a.draft?.logementAmortissement, bienOf(scoped, A)?.logementAmortissement);
    assert.deepEqual(a.draft?.creditFinancing, bienOf(scoped, A)?.creditFinancing);
    const b = bienScopeFor(scoped, B);
    assert.equal(b.draft?.logementAmortissement, undefined, "B ne voit rien de A");
    assert.equal(b.draft?.revenusAssistant, undefined);
  });

  const writes: Array<[string, (state: LmnpState) => LmnpAction[]]> = [
    ["F010", (state) => [
      { type: "DECLARATION_PATCH_DRAFT", patch: { logementAssistantState: { ...bienOf(state, A)!.logementAssistantState!, surface: 41 } } },
      { type: "CONFIRM_LOGEMENT_PROFILE", profile: { label: "Studio B" } },
      { type: "DECLARATION_COMPLETE_STEP", stepId: "logement-assistant" },
      { type: "DECLARATION_PATCH_DRAFT", patch: { governedFields: { propertyCity: { value: "Nantes" } } as never } },
    ]],
    ["F011", (state) => [
      { type: "DECLARATION_PATCH_DRAFT", patch: { financementCharges: bienOf(state, A)!.financementCharges } },
      { type: "CONFIRM_CREDIT_FINANCING", financing: bienOf(state, A)!.creditFinancing! },
      { type: "DECLARATION_COMPLETE_STEP", stepId: "financement-assistant" },
    ]],
    ["F012", (state) => [
      { type: "DECLARATION_PATCH_DRAFT", patch: { chargesAssistant: bienOf(state, A)!.chargesAssistant, chargesConfirmedAt: NOW } },
      { type: "DECLARATION_COMPLETE_STEP", stepId: "charges-assistant" },
    ]],
    ["F013", (state) => [
      { type: "DECLARATION_PATCH_DRAFT", patch: { revenusAssistant: bienOf(state, A)!.revenusAssistant, revenusConfirmedAt: NOW } },
      { type: "DECLARATION_COMPLETE_STEP", stepId: "revenus-assistant" },
    ]],
    ["F014", (state) => [
      { type: "DECLARATION_PATCH_DRAFT", patch: { amortissementAssistant: bienOf(state, A)!.amortissementAssistant, amortissementConfirmedAt: NOW } },
      { type: "DECLARATION_COMPLETE_STEP", stepId: "amortissement-assistant" },
    ]],
  ];
  for (const [label, actionsOf] of writes) {
    it(`${label} scopé : les écritures du panel pour B vont dans biens[B], A inchangé, rien à plat`, async () => {
      const { scoped } = await scopedAB();
      const { withActivePropertyId } = scopeApi();
      let state = scoped;
      for (const action of actionsOf(scoped)) {
        const next = lmnpReducer(state, withActivePropertyId(action, B));
        assert.notEqual(next, state, `${action.type} accepté pour B`);
        state = next;
      }
      assert.equal(bienOf(state, A), bienOf(scoped, A), "A intact (même référence)");
      noFlat(state);
    });
  }

  it("G — scopé sans bien actif : panel bloqué, aucune écriture possible", async () => {
    const { scoped } = await scopedAB();
    const { bienScopeFor, withActivePropertyId } = scopeApi();
    assert.equal(bienScopeFor(scoped, undefined).status, "blocked");
    assert.equal(bienScopeFor(scoped, undefined).draft, undefined, "aucune vue à plat de repli");
    const action = withActivePropertyId({ type: "DECLARATION_PATCH_DRAFT", patch: { revenusConfirmedAt: NOW } }, undefined);
    assert.equal(lmnpReducer(scoped, action), scoped);
  });

  it("H — legacy mono : vue = brouillon lui-même, écritures identiques avec ou sans propertyId", async () => {
    const legacy = await legacyRich();
    const { bienScopeFor, withActivePropertyId } = scopeApi();
    const scope = bienScopeFor(legacy, A);
    assert.equal(scope.status, "ready");
    assert.equal(scope.mode, "legacy");
    assert.equal(scope.draft, legacy.declarationDraft);
    const patch: LmnpAction = { type: "DECLARATION_PATCH_DRAFT", patch: { revenusConfirmedAt: NOW, exploitantEmail: "a@b.fr" } };
    assert.deepEqual(lmnpReducer(legacy, withActivePropertyId(patch, A)), lmnpReducer(legacy, patch));
  });
});

describe("R2B.2b — I, J : F009 et la date de mise en service", () => {
  const ctx = { dossierId: "fy", fiscalYear: 2025, route: "/assistants/activite" };

  it("I — legacy : F009 demande et écrit la date de mise en service (inchangé)", () => {
    const state = new F009ActiviteAssistant(ctx).start({ completedSteps: [], activityStartDate: "2025-01-01" }).state;
    assert.ok(remainingQuestions(state).includes("service_date"));
    const patch = f009DraftPatch({ ...state, dateMiseEnService: "2025-03-01" }, NOW, true);
    assert.equal(patch.dateMiseEnService, "2025-03-01");
  });

  it("J — scopé : F009 ne demande pas, n'exige pas et n'écrit pas la date de mise en service", async () => {
    const { scoped } = await scopedAB();
    const assistant = new F009ActiviteAssistant(ctx);
    const state = assistant.start(scoped.declarationDraft).state;
    assert.equal(remainingQuestions(state).includes("service_date"), false);
    assert.equal(f009DraftPatch({ ...state, dateMiseEnService: "2025-03-01" }, NOW, true).dateMiseEnService, undefined);
    const answered = await assistant.handle({ ...state, step: "service_date" }, { type: "answer", step: "service_date", values: { date: "2025-03-01" } } as never);
    assert.equal(answered.state.dateMiseEnService, undefined, "aucune saisie de la date dans F009 en scopé");
  });

  it("J — scopé : une date d'activité postérieure à la mise en service d'un bien est signalée, jamais réparée", async () => {
    const { scoped } = await scopedAB();
    const late = "2099-01-01";
    const assistant = new F009ActiviteAssistant(ctx);
    const state = {
      ...assistant.start(scoped.declarationDraft).state,
      lastName: "Dupont", firstName: "Marie", establishmentAddress: "1 rue X 69001 Lyon", deferred: true,
      dateDebutActivite: late, step: "review" as const,
    };
    const result = await assistant.handle(state, { type: "confirm" } as never);
    assert.equal(result.completed, false);
    assert.ok(result.state.error);
    assert.equal(bienOf(scoped, A)?.dateMiseEnService !== undefined, true, "la date du bien n'est pas touchée");
  });
});

describe("R2B.2b — K, L, M : F010, date du bien et option frais", () => {
  it("K — B porte sa propre date ; sans elle F010 reste bloqué (aucune date inventée)", async () => {
    const { scoped } = await scopedAB();
    const { bienScopeFor, withActivePropertyId } = scopeApi();
    const dated = lmnpReducer(scoped, withActivePropertyId({ type: "DECLARATION_PATCH_DRAFT", patch: { dateMiseEnService: "2025-09-01" } }, B));
    assert.equal(bienScopeFor(dated, B).draft?.dateMiseEnService, "2025-09-01");
    assert.equal(bienScopeFor(dated, A).draft?.dateMiseEnService, bienOf(scoped, A)?.dateMiseEnService);
  });

  it("L — option globale définie : F010 refuse un choix contraire", async () => {
    const ctx = { dossierId: "fy", fiscalYear: 2025, route: "/assistants/logement" };
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2025-06-01", optionFraisAcquisition: "integration" } as never);
    const start = { ...assistant.start().state, step: "collect_frais" as const };
    const result = await assistant.handle(start, { type: "submit_frais", fraisNotaire: 10_000, choixTraitementFrais: "deduction" } as never);
    assert.notEqual(result.state.choixTraitementFrais, "deduction");
  });

  it("M — un bien confirmé ne peut pas porter un choix contraire à l'option globale", async () => {
    const { scoped } = await scopedAB();
    const option = scoped.declarationDraft!.optionFraisAcquisition!;
    const other = option.choix === "deduction" ? "integration" : "deduction";
    const f010 = bienOf(scoped, A)!.logementAssistantState!;
    const action: LmnpAction = { type: "DECLARATION_PATCH_DRAFT", propertyId: A, patch: { logementAssistantState: { ...f010, choixTraitementFrais: other } } } as LmnpAction;
    assert.equal(lmnpReducer(scoped, action), scoped);
  });

  it("option absente : le premier F010 confirmé l'établit pour l'activité", async () => {
    const legacy = await legacyRich();
    const f010 = legacy.declarationDraft!.logementAssistantState!;
    const noChoice: LmnpState = {
      ...legacy,
      declarationDraft: { ...legacy.declarationDraft!, logementAssistantState: { ...f010, choixTraitementFrais: undefined, fraisAcquisitionHistoriques: undefined } as never },
    };
    const scoped = lmnpReducer(noChoice, { type: "ADD_PROPERTY", property: PROPERTY_B });
    assert.equal(scoped.declarationDraft?.optionFraisAcquisition, undefined);
    const next = lmnpReducer(scoped, {
      type: "DECLARATION_PATCH_DRAFT", propertyId: B,
      patch: { logementAssistantState: { ...f010, choixTraitementFrais: "deduction" }, logementAmortissement: legacy.declarationDraft!.logementAmortissement },
    } as LmnpAction);
    assert.deepEqual(next.declarationDraft?.optionFraisAcquisition, { choix: "deduction", sourcePropertyId: B });
  });
});

describe("R2B.2b — champs mixtes, revenus, documents", () => {
  it("governedFields appartient au bien : migré vers A, écrit pour B seulement", async () => {
    const { legacy, scoped } = await scopedAB();
    assert.deepEqual(bienOf(scoped, A)?.governedFields, legacy.declarationDraft?.governedFields);
    assert.equal(scoped.declarationDraft?.governedFields, undefined);
  });

  it("documentStepsCompleted (parcours Tunnel A) : gelé en scopé, effets de bord ignorés", async () => {
    const { scoped } = await scopedAB();
    const next = lmnpReducer(scoped, { type: "CONFIRM_CREDIT_FINANCING", financing: bienOf(scoped, A)!.creditFinancing!, propertyId: B } as LmnpAction);
    assert.ok(bienOf(next, B)?.creditFinancing, "confirmation acceptée");
    assert.deepEqual(next.declarationDraft?.documentStepsCompleted, scoped.declarationDraft?.documentStepsCompleted);
    assert.equal(lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", patch: { documentStepsCompleted: [] } }), scoped);
  });

  it("la session de revenus d'un bien ne contient jamais un autre bien", async () => {
    const { scoped } = await scopedAB();
    const session = { properties: [{ id: A, propertyId: A, label: "A", rows: [] }] } as never;
    assert.equal(lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", propertyId: B, patch: { revenueGptSession: session } } as LmnpAction), scoped);
  });

  it("document d'activité (INPI) : commun, jamais rattaché à A par ADD_PROPERTY", async () => {
    const { scoped } = await scopedAB();
    const inpi = scoped.documents.find((item) => item.id === "doc-inpi")!;
    assert.equal(inpi.propertyId, undefined);
    assert.deepEqual(resolveDocumentScope(scoped, inpi), { kind: "common" });
  });
});

describe("R2B.2b — N → P : Tunnel A", () => {
  it("N / O — écritures du Tunnel A disponibles en legacy, gelées en scopé", async () => {
    const { legacy, scoped } = await scopedAB();
    const { isTunnelAAvailable } = scopeApi();
    assert.equal(isTunnelAAvailable(legacy), true);
    assert.equal(isTunnelAAvailable(scoped), false);
    // Documents entry is governed by domain readiness (MB-MULTI-E2E-DEFECT-FIX-1).
    // Behavioral rendering coverage lives in mb-multi-e2e-defects.test.tsx.
  });

  it("P — actions Tunnel A toujours refusées par le reducer en scopé", async () => {
    const { scoped } = await scopedAB();
    assert.equal(lmnpReducer(scoped, { type: "CONFIRM_REVENUS" } as LmnpAction), scoped);
  });
});

describe("R2B.2b — Q, R : exercice suivant", () => {
  it("Q — N+1 scopé : reste scopé (v2), A reste A, B reste B, rien à plat", async () => {
    const { scoped } = await scopedAB();
    const dated = lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", propertyId: B, patch: { dateMiseEnService: "2025-09-01" } } as LmnpAction);
    const next = createNextDeclarationDraft(dated.declarationDraft);
    assert.deepEqual(Object.keys(next.biens ?? {}).sort(), [A, B].sort());
    assert.equal(next.biens?.[A]?.dateMiseEnService, bienOf(dated, A)?.dateMiseEnService);
    assert.equal(next.biens?.[B]?.dateMiseEnService, "2025-09-01");
    assert.equal(next.biens?.[B]?.logementAssistantState, undefined, "B n'hérite d'aucun état de A");
    assert.deepEqual(next.optionFraisAcquisition, dated.declarationDraft?.optionFraisAcquisition);
    for (const field of BIEN_DRAFT_FIELDS) assert.equal(next[field], undefined, `${field} absent à plat en N+1`);
    const serialized = serializeWorkspaceSnapshot({ ...dated, declarationDraft: next });
    assert.ok(serialized.ok);
    assert.equal(serialized.envelope.schemaVersion, 2);
  });

  it("R — N+1 legacy : aucun bien créé", async () => {
    const legacy = await legacyRich();
    const next = createNextDeclarationDraft(legacy.declarationDraft);
    assert.equal(next.biens, undefined);
    assert.equal(next.dateMiseEnService, legacy.declarationDraft?.dateMiseEnService);
  });
});

describe("R2B.2b — S : lecture pure", () => {
  it("la résolution du scope ne mute rien", async () => {
    const { scoped } = await scopedAB();
    const { bienScopeFor, resolveActivePropertyId } = scopeApi();
    const before = JSON.stringify(scoped.declarationDraft);
    resolveActivePropertyId(null, scoped);
    bienScopeFor(scoped, A);
    bienScopeFor(scoped, undefined);
    assert.equal(JSON.stringify(scoped.declarationDraft), before);
  });
});
