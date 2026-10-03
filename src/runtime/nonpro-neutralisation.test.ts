/**
 * SAV-032 — neutralisation du résultat LMNP non professionnel dans la 2033-B / 2031 (MB-2033B-NONPRO-NEUTRALIZATION-IMPL-1).
 * Run: npx tsx --test src/runtime/nonpro-neutralisation.test.ts
 *
 * Oracles posés À LA MAIN avant code (mission PO) : aucune valeur n'est tirée du code testé.
 *   E = resultatFiscalAvantDeficits + amortReportesUtilises
 *   E < 0  : 330 = −E + ND ; 350 vide ; 7b = deficitNouveau
 *   E ≥ 0  : 330 = ND (si > 0) ; 350 = E (si > 0) ; 7a = resultatFiscalAvantDeficits
 *   352 = 370 = 0 imprimés ; 354 et 372 vides ; (312 − 314) + 318 + 330 − 350 = 0.
 * Les chemins de calcul passent par `produceFiscalResult` (F-006, INCHANGÉ) : F-006 n'est jamais adapté au Cerfa.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { produceFiscalResult } from "./capabilities/f006/produce-fiscal-result";
import type { FiscalEngineInputs, FiscalResult } from "./capabilities/f006/types";
import { assembleForm2031SD } from "./capabilities/f007/assemble-form-2031";
import { resolveNonProNeutralisation } from "./capabilities/f007/nonpro-neutralisation";
import { buildFiscalRepresentation } from "./capabilities/rfs/build-fiscal-representation";
import { assembleLiasseFromRfs } from "./capabilities/rfs/projection/assemble-liasse-from-rfs";
import { map2033BFromRfs } from "./capabilities/rfs/projection/map-2033b";
import { map2031BisFromRfs } from "./capabilities/rfs/projection/map-2031-bis";
import { resolveFinalDeclarabilityState } from "@/lib/lmnp/services/declaration/final-declarability";

const IDENTITE = { siren: "999999999", denomination: "ORACLE SAV-032" };

function inputs(overrides: Partial<FiscalEngineInputs> & { recettes: number; charges: number; dotations: number; nonDeductible?: number }): FiscalEngineInputs {
  const { recettes, charges, dotations, nonDeductible, ...rest } = overrides;
  return {
    exerciceFiscal: 2026,
    activite: { dateMiseEnService: "2025-01-01", siret: "12345678901234" },
    revenusAssistant: { exerciceFiscal: 2026, totalRecettes: recettes },
    chargesAssistant: { exerciceFiscal: 2026, totalDeductible: charges, totalPreExploitation: 0, ...(nonDeductible !== undefined ? { totalNonDeductible: nonDeductible } : {}) },
    financementCharges: { exerciceFiscal: 2026, totalChargesFinancementExercice: 0, totalInteretsPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2026, totalDotations: dotations, status: "validated" },
    logementAmortissement: { computedAt: "2026-01-01T00:00:00.000Z" },
    ...rest,
  };
}

function pipeline(input: FiscalEngineInputs) {
  const { result } = produceFiscalResult(input);
  assert.ok(result, "F-006 doit produire un résultat");
  const rfs = buildFiscalRepresentation({ fiscalResult: result, identite: IDENTITE });
  return { result, rfs, form2033B: map2033BFromRfs(rfs), form2031: assembleForm2031SD(result, IDENTITE).form, form2031Bis: map2031BisFromRfs(rfs) };
}
const val = (cases: ReadonlyArray<{ caseId: string; value: unknown }>, id: string) => cases.find((c) => c.caseId === id)?.value;

describe("SAV-032 — résolveur de neutralisation (unitaire)", () => {
  const base = { amortReportesUtilises: 0, deficitNouveau: 0, charges: { totalNonDeductible: 0 } } as never;

  it("sans resultatFiscalAvantDeficits : UNAVAILABLE (jamais reconstruit)", () => {
    const out = resolveNonProNeutralisation({ ...(base as object), resultatFiscalAvantDeficits: undefined } as never);
    assert.equal(out.status, "UNAVAILABLE");
  });

  it("E < 0 : 330 = −E + ND, 350 = 0, 7b = deficitNouveau, 7a = 0", () => {
    const out = resolveNonProNeutralisation({ ...(base as object), resultatFiscalAvantDeficits: -7306.98, deficitNouveau: 7306.98, charges: { totalNonDeductible: 12.5 } } as never);
    assert.deepEqual(out, { status: "AVAILABLE", e: -7306.98, ligne330: 7319.48, ligne350: 0, case7a: 0, case7b: 7306.98 });
  });

  it("E ≥ 0 : 330 = ND, 350 = E (ARD inclus), 7a = avant déficits", () => {
    const out = resolveNonProNeutralisation({ ...(base as object), resultatFiscalAvantDeficits: 649.18, amortReportesUtilises: 2500, charges: { totalNonDeductible: 12.5 } } as never);
    assert.deepEqual(out, { status: "AVAILABLE", e: 3149.18, ligne330: 12.5, ligne350: 3149.18, case7a: 649.18, case7b: 0 });
  });
});

describe("SAV-032 — ORACLE BÉNÉFICIAIRE SIMPLE SANS ARD (chemin F-006 réel, indépendant de rich-takeover)", () => {
  // Calcul à la main : recettes 20 000 − charges 12 000 = 8 000 avant amortissement ; dotation 3 000 intégralement déductible.
  // Aucun stock d'ARD, aucun déficit antérieur, aucune reprise, aucune charge non déductible.
  // E = 8 000 − 3 000 = 5 000 = résultat fiscal = avant déficits ; 312 = 5 000 ; 318 = 0.
  const { result, form2033B, form2031, form2031Bis } = pipeline(inputs({ recettes: 20000, charges: 12000, dotations: 3000 }));

  it("préconditions F-006 (inchangé)", () => {
    assert.equal(result.resultatAvantAmort, 8000);
    assert.equal(result.amortDeduct, 3000);
    assert.equal(result.resultatFiscalAvantDeficits, 5000);
    assert.equal(result.resultatFiscal, 5000);
    assert.equal(result.deficitsImputes, 0);
    assert.equal(result.amortReportesUtilises, 0);
  });

  it("2033-B : 312 = 5 000 ; 318 = 0 ; 330 absente ; 350 = 5 000 ; 352 = 370 = 0 ; 354/372 vides ; bouclage 5 000 + 0 + 0 − 5 000 = 0", () => {
    assert.equal(val(form2033B.cases, "312"), 5000);
    assert.equal(val(form2033B.cases, "318"), 0);
    assert.equal(val(form2033B.cases, "330"), undefined);
    assert.equal(val(form2033B.cases, "350"), 5000);
    assert.equal(val(form2033B.cases, "352"), 0);
    assert.equal(val(form2033B.cases, "370"), 0);
    assert.equal(val(form2033B.cases, "354"), undefined);
    assert.equal(val(form2033B.cases, "372"), undefined);
    assert.equal(form2033B.balancing.status, "BALANCED");
    assert.equal(form2033B.balancing.resultatCalcule, 0);
  });

  it("2031 : 7a = 5 000 ; 7b absente ; ligne 1 = 0 ; cadre I 2031 Bis = 5 000", () => {
    assert.equal(val(form2031.cases, "I_7A"), 5000);
    assert.equal(val(form2031.cases, "I_7B"), undefined);
    assert.equal(val(form2031.cases, "C_L1_COL1"), 0);
    assert.equal(val(form2031Bis.cases, "I_AUTRES_LMNP_BENEFICE"), 5000);
  });
});

describe("SAV-032 — ORACLE déficit avec charges non déductibles (chemin F-006 réel)", () => {
  // Calcul à la main : recettes 5 100 − charges 14 962 = −9 862 avant amortissement ; dotation 3 720 ; non déductible 99.
  // Plafond 39 C = 0 → amortDeduct 0, 318 = 3 720 ; comptable = −9 862 − 3 720 − 99 = −13 681 ; 330 = 9 862 + 99 = 9 961.
  const { result, form2033B, form2031 } = pipeline(inputs({ recettes: 5100, charges: 14962, dotations: 3720, nonDeductible: 99 }));

  it("préconditions F-006 (inchangé)", () => {
    assert.equal(result.resultatAvantAmort, -9862);
    assert.equal(result.amortDeduct, 0);
    assert.equal(result.deficitNouveau, 9862);
    assert.equal(result.resultatFiscalAvantDeficits, -9862);
  });

  it("2033-B = dossier témoin EDI : 310 = (13 681) ; 314 = 13 681 ; 318 = 3 720 ; 330 = 9 961 ; 352 = 370 = 0 ; 350/354/372 vides ; 2031 7b = 9 862", () => {
    assert.equal(val(form2033B.cases, "310"), -13681);
    assert.equal(val(form2033B.cases, "314"), 13681);
    assert.equal(val(form2033B.cases, "318"), 3720);
    assert.equal(val(form2033B.cases, "330"), 9961);
    assert.equal(val(form2033B.cases, "352"), 0);
    assert.equal(val(form2033B.cases, "370"), 0);
    for (const vide of ["350", "354", "372"]) assert.equal(val(form2033B.cases, vide), undefined, vide);
    assert.equal(val(form2031.cases, "I_7B"), 9862);
    assert.equal(form2033B.balancing.status, "BALANCED");
  });
});

describe("SAV-032 — invariant de bouclage : fail-closed", () => {
  const { result } = pipeline(inputs({ recettes: 20000, charges: 12000, dotations: 3000 }));
  const rfsWith = (fr: FiscalResult) => buildFiscalRepresentation({ fiscalResult: fr, identite: IDENTITE });

  it("un FiscalResult incohérent (déduction ARD non reflétée dans E) ne boucle pas : UNBALANCED", () => {
    // 3 000 de dotation affichée mais amortDeduct falsifié → 318 ≠ 0 alors que E suppose la dotation déduite : le bloc ne boucle pas.
    const broken: FiscalResult = { ...result, amortDeduct: 1000, amortNonDeduitExercice: 2000 };
    const form = map2033BFromRfs(rfsWith(broken));
    assert.equal(form.balancing.status, "UNBALANCED");
    assert.notEqual(form.balancing.ecart, 0);
    assert.ok(form.balancing.raisons.length > 0);
  });

  it("sans resultatFiscalAvantDeficits : UNAVAILABLE", () => {
    const legacy: FiscalResult = { ...result };
    delete (legacy as { resultatFiscalAvantDeficits?: number }).resultatFiscalAvantDeficits;
    assert.equal(map2033BFromRfs(rfsWith(legacy)).balancing.status, "UNAVAILABLE");
  });

  it("la déclarabilité finale refuse un bloc non bouclé ; accepte un bloc bouclé ; fail-open si le champ est absent (archives)", () => {
    const ok = assembleLiasseFromRfs(rfsWith(result));
    assert.equal(resolveFinalDeclarabilityState(ok).deliverable, true);

    const broken = assembleLiasseFromRfs(rfsWith({ ...result, amortDeduct: 1000, amortNonDeduitExercice: 2000 }));
    const state = resolveFinalDeclarabilityState(broken);
    assert.equal(state.deliverable, false);
    assert.ok(state.internalProjectionIssues.some((issue) => issue.formId === "2033-B-SD"));

    const archive = { ...ok, form2033B: { ...ok.form2033B, balancing: undefined } } as never;
    assert.equal(resolveFinalDeclarabilityState(archive).deliverable, true, "liasseRfs persisté avant SAV-032 : aucune invalidation rétroactive");
  });
});
