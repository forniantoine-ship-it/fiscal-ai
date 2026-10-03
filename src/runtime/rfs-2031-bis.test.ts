/**
 * Cycle 44 — projection Cerfa 2031 Bis-SD (Cadre I, BIC non professionnels)
 * depuis la RFS.
 *
 * CORRECTION JALON 1B (audit indépendant, suite JALON 1A) — le Cadre I est
 * toujours égal à `I_7A`/`I_7B` (2031-SD), sans condition sur `deficitsImputes`.
 * MISE À JOUR SAV-032 (MB-2033B-NONPRO-NEUTRALIZATION-IMPL-1) — la grandeur
 * reportée n'est PAS le résultat APRÈS imputation (`resultatFiscal`) : le cadre I
 * de la 2031 Bis demande un « Résultat avant imputation des déficits
 * antérieurs » (formulaire officiel 2031 Bis-SD 2026), soit
 * `resultatFiscalAvantDeficits` (F-006, après plafond 39 C et ARD, avant
 * déficits antérieurs). Le déficit est `deficitNouveau` (inchangé).
 * Voir `map-2031-bis.ts` et SAV-032.
 * Run: npx tsx --test src/runtime/rfs-2031-bis.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { produceFiscalResult } from "./capabilities/f006/produce-fiscal-result";
import { map2031BisFromRfs } from "./capabilities/rfs/projection/map-2031-bis";
import { map2031FromRfs } from "./capabilities/rfs/projection/map-2031-from-rfs";
import { assembleLiasseFromRfs } from "./capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { FiscalEngineInputs, FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  const merged: FiscalResult = {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: {
      totalDeductible: 2000,
      chargesExploitation: 2000,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalNonDeductible: 0,
    },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortNonDeduitExercice: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
  if (overrides.resultatFiscalAvantDeficits === undefined) {
    // Reconstruction manuelle fidèle à F-006 (TRF-0031) : en année déficitaire, avant déficits = −deficitNouveau ;
    // sinon avant déficits = resultatFiscal + déficits imputés (resultatFiscal = avantDeficits − deficitsImputes).
    merged.resultatFiscalAvantDeficits =
      merged.deficitNouveau > 0
        ? -merged.deficitNouveau
        : Math.round((merged.resultatFiscal + merged.deficitsImputes) * 100) / 100;
  }
  if (overrides.amortNonDeduitExercice === undefined) {
    merged.amortNonDeduitExercice = Math.round((merged.amortCalcule - merged.amortDeduct) * 100) / 100;
  }
  return merged;
}

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Elsa Bouvard" };

function rfs(fr: FiscalResult): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

function findCase(form: ReturnType<typeof map2031BisFromRfs>, caseId: string) {
  return form.cases.find((c) => c.caseId === caseId);
}
function findBlocked(form: ReturnType<typeof map2031BisFromRfs>, caseId: string) {
  return form.casesNonAlimentees.find((c) => c.caseId === caseId);
}

// =====================================================================
// TEST 1 — deficitsImputes === 0, bénéfice → colonne Bénéfice = resultatFiscalAvantDeficits (= resultatFiscal ici)
// =====================================================================
describe("Cycle 44 — TEST 1 : deficitsImputes === 0, bénéfice", () => {
  it("colonne Bénéfice alimentée avec resultatFiscalAvantDeficits (identique à resultatFiscal sans déficit antérieur)", () => {
    const form = map2031BisFromRfs(rfs(fiscalResult({ resultatFiscal: 5500, deficitNouveau: 0, deficitsImputes: 0 })));
    assert.equal(findCase(form, "I_AUTRES_LMNP_BENEFICE")?.value, 5500);
    assert.equal(findCase(form, "I_AUTRES_LMNP_DEFICIT"), undefined);
    assert.equal(findBlocked(form, "I_AUTRES_LMNP_BENEFICE"), undefined);
  });
});

// =====================================================================
// TEST 2 — deficitsImputes === 0, déficit → colonne Déficit = deficitNouveau
// =====================================================================
describe("Cycle 44 — TEST 2 : deficitsImputes === 0, déficit", () => {
  it("colonne Déficit alimentée avec deficitNouveau", () => {
    const form = map2031BisFromRfs(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862, deficitsImputes: 0 })));
    assert.equal(findCase(form, "I_AUTRES_LMNP_DEFICIT")?.value, 9862);
    assert.equal(findCase(form, "I_AUTRES_LMNP_BENEFICE"), undefined);
    assert.equal(findBlocked(form, "I_AUTRES_LMNP_DEFICIT"), undefined);
  });
});

// =====================================================================
// TEST 3 — CORRIGÉ (JALON 1B puis SAV-032) : deficitsImputes > 0, bénéfice → le Cadre I
// n'est pas vidé ; il reprend le résultat AVANT imputation des déficits antérieurs (comme I_7A)
// =====================================================================
describe("Cycle 44 / JALON 1B — TEST 3 : deficitsImputes > 0, bénéfice — le Cadre I n'est plus vidé", () => {
  it("I_AUTRES_LMNP_BENEFICE = resultatFiscalAvantDeficits (avant imputation), jamais bloquée, aucune trace de casesNonAlimentees", () => {
    // SAV-032 : le cadre I de la 2031 Bis demande un « Résultat avant imputation des déficits antérieurs ». Avant la
    // correction, le mapper reportait resultatFiscal (APRÈS imputation : 2 000) — divergence prouvée. Ici : résultat
    // avant imputation 6 000 (F-006 : resultatFiscal 2 000 + déficits imputés 4 000, TRF-0031).
    const fr = fiscalResult({ resultatFiscal: 2000, deficitNouveau: 0, deficitsImputes: 4000 });
    const form = map2031BisFromRfs(rfs(fr));
    assert.equal(findCase(form, "I_AUTRES_LMNP_BENEFICE")?.value, 6000, "I_AUTRES_LMNP_BENEFICE = résultat avant imputation (6 000), pas resultatFiscal après imputation (2 000)");
    assert.equal(findBlocked(form, "I_AUTRES_LMNP_BENEFICE"), undefined, "plus aucune case bloquée pour ce motif — la formule est désormais la même que I_7A");
    assert.deepEqual(form.casesNonAlimentees, [], "casesNonAlimentees est désormais toujours vide pour ce mapper");
  });

  it("pass-through pur : la valeur est lue sur resultatFiscalAvantDeficits (F-006), jamais recalculée à partir de resultatFiscal + deficitsImputes", () => {
    // Scalaire volontairement incohérent avec l'identité TRF-0031 (5 000 ≠ 2 000 + 4 000) : seul un pass-through le restitue.
    const fr = fiscalResult({ resultatFiscal: 2000, deficitNouveau: 0, deficitsImputes: 4000, resultatFiscalAvantDeficits: 5000 });
    const form = map2031BisFromRfs(rfs(fr));
    assert.equal(findCase(form, "I_AUTRES_LMNP_BENEFICE")?.value, 5000);
  });

  it("FiscalResult antérieur à P0-39C (sans resultatFiscalAvantDeficits) : bénéfice absent, jamais reconstruit", () => {
    const fr = fiscalResult({ resultatFiscal: 2000, deficitNouveau: 0, deficitsImputes: 4000 });
    delete (fr as { resultatFiscalAvantDeficits?: number }).resultatFiscalAvantDeficits;
    const form = map2031BisFromRfs(rfs(fr));
    assert.equal(findCase(form, "I_AUTRES_LMNP_BENEFICE"), undefined);
  });
});

// =====================================================================
// TEST 4 — CORRIGÉ (JALON 1B) : deficitsImputes > 0 côté déficit également
// =====================================================================
describe("Cycle 44 / JALON 1B — TEST 4 : deficitsImputes > 0 côté déficit également — le Cadre I n'est plus vidé", () => {
  it("si deficitNouveau > 0 avec deficitsImputes > 0 (cas construit pour la preuve), I_AUTRES_LMNP_DEFICIT = deficitNouveau, jamais bloquée", () => {
    // Cas construit pour la preuve — ne prétend pas être fiscalement typique
    // (l'imputation ne s'applique normalement qu'à un résultat positif),
    // seul le comportement du mapper est vérifié ici : deficitsImputes n'est
    // plus lu du tout par ce mapper.
    const form = map2031BisFromRfs(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 500, deficitsImputes: 4000 })));
    assert.equal(findCase(form, "I_AUTRES_LMNP_DEFICIT")?.value, 500);
    assert.equal(findBlocked(form, "I_AUTRES_LMNP_DEFICIT"), undefined);
  });
});

// =====================================================================
// TEST 5 — non-régression 2031-SD (I_7A/I_7B)
// =====================================================================
describe("Cycle 44 — TEST 5 : non-régression du mapper 2031-SD (I_7A/I_7B)", () => {
  it("map2031FromRfs() produit I_7A (avant imputation) / I_7B, indépendamment de 2031 Bis-SD", () => {
    const representation = rfs(fiscalResult({ resultatFiscal: 5500, deficitNouveau: 0, deficitsImputes: 0 }));
    const form2031 = map2031FromRfs(representation);
    const caseI7A = form2031.cases.find((c) => c.caseId === "I_7A");
    assert.ok(caseI7A, "I_7A doit toujours être produite par le mapper 2031-SD existant");
    assert.equal(caseI7A?.value, 5500);

    // Même avec un déficit antérieur imputé (cas où 2031 Bis-SD se bloque),
    // I_7A/I_7B du 2031-SD restent inchangées : ce sont deux mappers
    // indépendants, la garde de l'un n'affecte jamais l'autre.
    const representationAvecImputation = rfs(fiscalResult({ resultatFiscal: 2000, deficitNouveau: 0, deficitsImputes: 4000 }));
    const form2031Bis = map2031FromRfs(representationAvecImputation);
    const caseI7ABis = form2031Bis.cases.find((c) => c.caseId === "I_7A");
    assert.ok(caseI7ABis, "I_7A doit rester alimentée par le mapper 2031-SD même quand 2031 Bis-SD se bloque");
    // SAV-032 : 7a = résultat avant imputation des déficits antérieurs (2 000 + 4 000 imputés), pas resultatFiscal (2 000).
    assert.equal(caseI7ABis?.value, 6000);
  });
});

// =====================================================================
// TEST 6 — non-régression de l'assemblage global de liasse
// =====================================================================
describe("Cycle 44 — TEST 6 : non-régression de assembleLiasseFromRfs()", () => {
  it("form2031Bis est présent, structurellement identique à un appel direct, sans altérer form2031/form2033A/form2033B ni formulairesGeneres/Attendus/Manquants", () => {
    const representation = rfs(fiscalResult({ resultatFiscal: 5500, deficitNouveau: 0, deficitsImputes: 0 }));
    const liasse = assembleLiasseFromRfs(representation);
    const direct = map2031BisFromRfs(representation);

    assert.deepEqual(liasse.form2031Bis, direct);
    assert.equal(liasse.form2031Bis.formId, "2031-Bis-SD");

    // 2031-Bis-SD reste hors du suivi du périmètre LMNP réel simplifié à l'IR —
    // jamais dans ces trois tableaux. (Cycle 55 : 2033-C-SD rejoint
    // formulairesGeneres. P3-LIASSE-1A : 2033-D-SD rejoint à son tour
    // formulairesGeneres (socle minimal) — formulairesManquants est désormais
    // vide — 2031-Bis-SD reste absent des trois.)
    assert.deepEqual(liasse.formulairesGeneres, ["2031-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);
    assert.deepEqual(liasse.formulairesManquants, []);
    assert.equal(liasse.formulairesAttendus.includes("2031-Bis-SD" as never), false);
  });
});

// =====================================================================
// JALON 1B — Scénarios R1 à R5 : Cadre I (2031-Bis) toujours égal à 7A/7B
// (2031-SD), sur le F-006 RÉEL et INCHANGÉ (produceFiscalResult), pas sur des
// FiscalResult reconstruits à la main — preuve de bout en bout.
// =====================================================================
describe("JALON 1B — R1 à R5 : I_AUTRES_LMNP_BENEFICE/DEFICIT === I_7A/I_7B, quel que soit le scénario", () => {
  const IDENTITE_R: IdentiteDeclarante = { siren: "999999999", denomination: "SCENARIO", exerciceDebut: "01/01/2025", exerciceFin: "31/12/2025" };

  function runScenario(exerciceInput: FiscalEngineInputs) {
    const { result } = produceFiscalResult(exerciceInput);
    if (!result) throw new Error("scénario de test invalide : F-006 a bloqué le calcul");
    const representation = rfs2(result);
    return {
      result,
      form2031: map2031FromRfs(representation),
      form2031Bis: map2031BisFromRfs(representation),
    };
  }
  function rfs2(fr: FiscalResult): FiscalRepresentation {
    return {
      exercice: fr.exercice,
      identite: IDENTITE_R,
      fiscalResult: fr,
      trace: { ksArtifacts: fr.trace.ksArtifacts, assembledAt: "x", sourceFiscalResultAt: fr.trace.computedAt, sources: { identite: "x", fiscalResult: "x" } },
    };
  }
  function assertCadreIEqualsCadre7(form2031: ReturnType<typeof map2031FromRfs>, form2031Bis: ReturnType<typeof map2031BisFromRfs>) {
    const i7a = form2031.cases.find((c) => c.caseId === "I_7A")?.value;
    const i7b = form2031.cases.find((c) => c.caseId === "I_7B")?.value;
    const autresBenefice = form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_BENEFICE")?.value;
    const autresDeficit = form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_DEFICIT")?.value;
    assert.equal(autresBenefice, i7a, `I_AUTRES_LMNP_BENEFICE (${autresBenefice}) doit être strictement égal à I_7A (${i7a})`);
    assert.equal(autresDeficit, i7b, `I_AUTRES_LMNP_DEFICIT (${autresDeficit}) doit être strictement égal à I_7B (${i7b})`);
  }

  it("R1 — témoin déficitaire : I_7B = I_AUTRES_LMNP_DEFICIT = deficitNouveau = 9862, Cadre I toujours vide côté bénéfice", () => {
    const { result, form2031, form2031Bis } = runScenario({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-02-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 5100 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 14962, totalPreExploitation: 0, totalNonDeductible: 99 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 3720, status: "validated" },
    });
    assert.equal(result.resultatFiscal, 0);
    assert.equal(result.deficitNouveau, 9862);
    assertCadreIEqualsCadre7(form2031, form2031Bis);
    assert.equal(form2031.cases.find((c) => c.caseId === "I_7B")?.value, 9862);
    assert.equal(form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_DEFICIT")?.value, 9862);
    assert.equal(form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_BENEFICE"), undefined);
  });

  it("R2 — bénéficiaire simple : Cadre I = Cadre 7 côté bénéfice, aucun déficit", () => {
    const { form2031, form2031Bis } = runScenario({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-01-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 12000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 4000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 3000, status: "validated" },
    });
    assertCadreIEqualsCadre7(form2031, form2031Bis);
    assert.equal(form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_BENEFICE")?.value, 5000);
    assert.equal(form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_DEFICIT"), undefined);
  });

  it("R3 — déficit antérieur imputé : résultat avant imputation 5000, déficit antérieur imputé 2000, resultatFiscal=3000, I_7A=I_AUTRES_LMNP_BENEFICE=5000 (avant imputation, SAV-032)", () => {
    const { result, form2031, form2031Bis } = runScenario({
      exerciceFiscal: 2026,
      activite: { dateMiseEnService: "2025-01-01" },
      revenusAssistant: { exerciceFiscal: 2026, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2026, totalDeductible: 4000, totalPreExploitation: 0 },
      // amortCalcule=0 volontairement : ce scénario isole l'imputation d'un
      // déficit antérieur (mission §5), sans composante amortissement qui
      // réduirait resultatFiscal en-deçà des 3 000 € attendus.
      amortissementAssistant: { exerciceFiscal: 2026, totalDotations: 0, status: "validated" },
      stockDeficitsAnterieurs: [{ millesime: 2025, montant: 2000 }],
    });
    assert.equal(result.resultatAvantAmort, 5000, "résultat avant imputation = 5 000 €");
    assert.equal(result.deficitsImputes, 2000, "déficit antérieur imputé = 2 000 €");
    assert.equal(result.resultatFiscal, 3000, "résultat fiscal = 3 000 €");
    // SAV-032 : « Résultat avant imputation des déficits antérieurs » (2031 Bis, cadre I) → 7a. L'imputation de 2 000 € n'est pas
    // dans 7a ; l'ancienne attente (3 000, resultatFiscal après imputation) était la divergence prouvée.
    assert.equal(result.resultatFiscalAvantDeficits, 5000, "précondition F-006 inchangé : résultat avant déficits antérieurs = 5 000 €");
    assert.equal(form2031.cases.find((c) => c.caseId === "I_7A")?.value, 5000, "I_7A = 5 000 € (avant imputation)");
    assert.equal(form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_BENEFICE")?.value, 5000, "I_AUTRES_LMNP_BENEFICE = 5 000 €");
    assertCadreIEqualsCadre7(form2031, form2031Bis);
  });

  it("R4 — ARD utilisé (stock N-1) : Cadre I = Cadre 7 côté bénéfice, deficitsImputes=0", () => {
    const { form2031, form2031Bis } = runScenario({
      exerciceFiscal: 2026,
      activite: { dateMiseEnService: "2025-01-01" },
      revenusAssistant: { exerciceFiscal: 2026, totalRecettes: 12000 },
      chargesAssistant: { exerciceFiscal: 2026, totalDeductible: 4000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2026, totalDotations: 3000, status: "validated" },
      stockAmortissementsReportes: 1500,
    });
    assertCadreIEqualsCadre7(form2031, form2031Bis);
    assert.equal(form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_BENEFICE")?.value, 3500);
  });

  it("R5 — combiné (déficit antérieur + ARD) : Cadre I = Cadre 7 côté bénéfice = résultat avant déficits (4 200), y compris avec deficitsImputes > 0", () => {
    const { result, form2031, form2031Bis } = runScenario({
      exerciceFiscal: 2026,
      activite: { dateMiseEnService: "2025-01-01" },
      revenusAssistant: { exerciceFiscal: 2026, totalRecettes: 12000 },
      chargesAssistant: { exerciceFiscal: 2026, totalDeductible: 4000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2026, totalDotations: 3000, status: "validated" },
      stockDeficitsAnterieurs: [{ millesime: 2025, montant: 1000 }],
      stockAmortissementsReportes: 800,
    });
    assert.ok(result.deficitsImputes > 0, "précondition : ce scénario impute bien un déficit antérieur");
    // AVANT correction (JALON 1B), ce cas précis (deficitsImputes>0, année
    // bénéficiaire) laissait I_AUTRES_LMNP_BENEFICE non alimentée — c'est
    // exactement le gap identifié par l'audit JALON 1A.
    // Calcul à la main : résultat avant amortissement 8 000 − amortissement 3 000 − ARD consommés 800 = 4 200 (avant
    // imputation du déficit antérieur de 1 000 ; resultatFiscal = 3 200 après imputation, non reporté en 7a).
    assert.equal(form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_BENEFICE")?.value, 4200, "7a = résultat avant imputation des déficits antérieurs");
    assertCadreIEqualsCadre7(form2031, form2031Bis);
  });
});

// =====================================================================
// Garde d'architecture
// =====================================================================
describe("Cycle 44 — garde d'architecture (map-2031-bis.ts)", () => {
  it("aucun import de moteur fiscal, assistant, FEC ou lecteur de fichiers", () => {
    const source = readFileSync(path.join(__dirname, "capabilities/rfs/projection/map-2031-bis.ts"), "utf-8");
    const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
    const forbidden = [
      "produceFiscalResult",
      "applyAmortissementStocks",
      "fiscalResultFromDraft",
      "draft-to-liasse-inputs",
      "FEC",
      "fec-reader",
      "fec-parser",
      "readFileSync",
      "capabilities/f010",
      "capabilities/f011",
      "capabilities/f012",
      "capabilities/f013",
      "capabilities/f014",
      "assistants/f010",
      "assistants/f011",
      "assistants/f012",
      "assistants/f013",
      "assistants/f014",
    ];
    for (const token of forbidden) {
      assert.equal(importLines.includes(token), false, `map-2031-bis.ts ne doit pas importer ${token}`);
    }
  });
});

// =====================================================================
// Traçabilité
// =====================================================================
describe("Cycle 44 — traçabilité", () => {
  it("chaque case alimentée a une trace exploitable ; chaque case bloquée a une catégorie et une raison non générique", () => {
    for (const fr of [
      fiscalResult({ resultatFiscal: 5500, deficitNouveau: 0, deficitsImputes: 0 }),
      fiscalResult({ resultatFiscal: 2000, deficitNouveau: 0, deficitsImputes: 4000 }),
    ]) {
      const form = map2031BisFromRfs(rfs(fr));
      for (const c of form.cases) {
        assert.ok(c.trace.source, `case ${c.caseId} sans source de trace`);
        assert.ok(c.trace.path.length > 0, `case ${c.caseId} sans path de trace`);
      }
      const genericWords = ["inconnu", "unknown", "n/a", "todo", "tbd"];
      for (const b of form.casesNonAlimentees) {
        assert.ok(b.categorie, `${b.caseId} sans catégorie`);
        assert.ok(b.raison.length > 20, `${b.caseId} : raison trop courte`);
        for (const word of genericWords) {
          assert.equal(b.raison.toLowerCase().includes(word), false, `${b.caseId} : raison générique détectée ("${word}")`);
        }
      }
    }
  });
});
