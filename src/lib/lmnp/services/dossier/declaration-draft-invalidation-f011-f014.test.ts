/**
 * Règle « C' » de `buildDownstreamInvalidationPatch` — un nouvel output F011 (`financementCharges`) :
 *  - NE touche PAS F014 : le plan d'amortissements (`composePlanAmortissement`) dépend de la date de mise en service, du plan
 *    et du prorata logement (F010) et des composants F012 — jamais d'intérêts, d'assurance, de capital ni de CRD ;
 *  - INVALIDE F012 (`chargesConfirmedAt`) quand un recouvrement F011/F012 (assurance, frais de dossier) le justifie.
 *
 * Run: npx tsx --test src/lib/lmnp/services/dossier/declaration-draft-invalidation-f011-f014.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { AmortissementAssistantOutput, DeclarationDraft, FinancementChargesOutput } from "@/lib/lmnp/types/domain";
import { buildDownstreamInvalidationPatch } from "./declaration-draft-invalidation";

function financement(overrides: Partial<FinancementChargesOutput> = {}): FinancementChargesOutput {
  return {
    exerciceFiscal: 2025, totalInteretsEmprunt: 406.54, totalInteretsPreExploitation: 4524.85, totalAssurance: 55.06,
    totalCapitalRembourse: 2997.25, totalChargesFinancementExercice: 1361.6, prets: [], fieldSources: {},
    computedAt: "2026-09-29T16:55:11.617Z", ...overrides,
  } as FinancementChargesOutput;
}
const RECALCULATED = {
  totalInteretsEmprunt: 0, totalInteretsPreExploitation: 840.71, totalAssurance: 0, totalCapitalRembourse: 486.18,
  totalChargesFinancementExercice: 900,
} satisfies Partial<FinancementChargesOutput>;

const amortissement = (): AmortissementAssistantOutput => ({
  exerciceFiscal: 2025, totalDotations: 223.87, status: "validated", profil: "PROF-001", validatedAt: "2026-09-30T13:20:27.041Z",
  anneeValidationInitiale: 2025,
} as unknown as AmortissementAssistantOutput);

function draft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: ["credit", "charges", "amortissement"],
    dateMiseEnService: "2025-12-10",
    financementCharges: financement(),
    creditConfirmedAt: "2026-09-29T16:55:11.627Z",
    chargesConfirmedAt: "2026-09-30T10:00:00.000Z",
    amortissementAssistant: amortissement(),
    amortissementConfirmedAt: "2026-09-30T13:20:27.041Z",
    ...overrides,
  } as DeclarationDraft;
}

const withRecouvrement = (): Partial<DeclarationDraft> => ({
  chargesAssistant: { exerciceFiscal: 2025, recouvrementAssuranceF011: { montant: 55.06 } } as unknown as DeclarationDraft["chargesAssistant"],
});

describe("règle C' — F011 ne remet pas en cause F014", () => {
  it("un changement réel de financementCharges ne touche ni amortissementAssistant ni amortissementConfirmedAt", () => {
    const patch = buildDownstreamInvalidationPatch(draft(), { financementCharges: financement(RECALCULATED) });
    assert.equal("amortissementAssistant" in patch, false, "amortissementAssistant n'est pas effacé");
    assert.equal("amortissementConfirmedAt" in patch, false, "amortissementConfirmedAt n'est pas effacé");
  });

  it("patch complet d'une reconfirmation F011 (état assistant + output) : F014 reste confirmé", () => {
    const patch = buildDownstreamInvalidationPatch(draft(), {
      financementCharges: financement(RECALCULATED),
      financementAssistantState: { step: "complete" } as never,
    });
    assert.equal("amortissementAssistant" in patch, false);
    assert.equal("amortissementConfirmedAt" in patch, false);
    assert.equal((patch.completedSteps ?? []).includes("amortissement") || patch.completedSteps === undefined, true,
      "l'étape amortissement n'est pas retirée des étapes complétées");
  });
});

describe("règle C' — F011 → F012 conservé", () => {
  it("avec un recouvrement F011/F012 (assurance) : chargesConfirmedAt est invalidé, F014 reste intact", () => {
    const patch = buildDownstreamInvalidationPatch(draft(withRecouvrement()), { financementCharges: financement(RECALCULATED) });
    assert.equal("chargesConfirmedAt" in patch && patch.chargesConfirmedAt === undefined, true, "F012 redevient à confirmer");
    assert.equal("amortissementAssistant" in patch, false);
    assert.equal("amortissementConfirmedAt" in patch, false);
  });

  it("recouvrement sur les frais de dossier : même invalidation F012", () => {
    const patch = buildDownstreamInvalidationPatch(
      draft({ chargesAssistant: { exerciceFiscal: 2025, recouvrementFraisDossierF011: { montant: 900 } } as never }),
      { financementCharges: financement(RECALCULATED) },
    );
    assert.equal("chargesConfirmedAt" in patch && patch.chargesConfirmedAt === undefined, true);
  });

  it("sans recouvrement : F012 n'est pas invalidé non plus (comportement inchangé)", () => {
    const patch = buildDownstreamInvalidationPatch(draft(), { financementCharges: financement(RECALCULATED) });
    assert.equal("chargesConfirmedAt" in patch, false);
  });

  it("même valeur (seul computedAt change) : aucune invalidation", () => {
    const patch = buildDownstreamInvalidationPatch(draft(withRecouvrement()), { financementCharges: financement({ computedAt: "2026-10-01T00:00:00Z" }) });
    assert.deepEqual(patch, {});
  });
});

describe("règle C' — les vraies dépendances de F014 restent invalidantes (inchangées)", () => {
  it("date de mise en service modifiée → F014 invalidé", () => {
    const patch = buildDownstreamInvalidationPatch(draft(), { dateMiseEnService: "2025-12-11" });
    assert.equal("amortissementAssistant" in patch && patch.amortissementAssistant === undefined, true);
    assert.equal("amortissementConfirmedAt" in patch && patch.amortissementConfirmedAt === undefined, true);
  });

  it("output logement F010 modifié → F014 invalidé", () => {
    const patch = buildDownstreamInvalidationPatch(
      draft({ logementAmortissement: { exerciceFiscal: 2025, prorataRatio: 0.0575 } as never }),
      { logementAmortissement: { exerciceFiscal: 2025, prorataRatio: 0.1 } as never },
    );
    assert.equal("amortissementAssistant" in patch && patch.amortissementAssistant === undefined, true);
  });

  it("composants F012 modifiés → F014 invalidé", () => {
    const patch = buildDownstreamInvalidationPatch(
      draft({ chargesAssistant: { exerciceFiscal: 2025, composantsNouveaux: [{ id: "a" }] } as never }),
      { chargesAssistant: { exerciceFiscal: 2025, composantsNouveaux: [{ id: "a" }, { id: "b" }] } as never },
    );
    assert.equal("amortissementAssistant" in patch && patch.amortissementAssistant === undefined, true);
  });
});

describe("règle C' — au niveau du reducer : F014 reste confirmé après une reconfirmation F011", () => {
  it("DECLARATION_PATCH_DRAFT { financementCharges } conserve amortissementAssistant, amortissementConfirmedAt et la génération n'est pas rouverte par F014", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
    const { lmnpReducer } = await import("@/lib/lmnp/store/reducer");
    const state = {
      fiscalYear: { id: "fy", year: 2025, status: "draft", regime: "reel", propertyIds: ["p"], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      properties: [{ id: "p", label: "", address: "", city: "", postalCode: "" }],
      documents: [], extractions: [], validationItems: [], ledgerEntries: [],
      declarationDraft: draft(withRecouvrement()), fileRegistry: new Map(),
    } as never;
    const next = lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch: { financementCharges: financement(RECALCULATED) } });
    const result = next.declarationDraft!;
    assert.equal(result.financementCharges?.totalChargesFinancementExercice, 900, "le nouvel output F011 est posé");
    assert.equal(result.amortissementAssistant?.totalDotations, 223.87, "F014 conserve son output");
    assert.equal(result.amortissementAssistant?.status, "validated");
    assert.equal(result.amortissementConfirmedAt, "2026-09-30T13:20:27.041Z", "F014 reste confirmé");
    assert.equal(result.chargesConfirmedAt, undefined, "F012 est bien invalidé (recouvrement F011/F012)");
  });
});
