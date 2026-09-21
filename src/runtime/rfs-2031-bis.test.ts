/**
 * Cycle 44 — projection Cerfa 2031 Bis-SD (Cadre I, BIC non professionnels)
 * depuis la RFS.
 *
 * CORRECTION JALON 1B (audit indépendant, suite JALON 1A) — l'ancien
 * périmètre restreint (Cycles 41-43 : alimentée uniquement si
 * `deficitsImputes === 0`) reposait sur une fausse ambiguïté. `I_7A`/`I_7B`
 * (2031-SD) sont déjà, par construction F-006 (TRF-0031, INCHANGÉ), le
 * résultat/déficit APRÈS imputation — la ligne "Autres locations meublées
 * non professionnelles" du Cadre I documente exactement la même grandeur, et
 * doit donc TOUJOURS lui être égale, sans condition sur `deficitsImputes`.
 * Voir `map-2031-bis.ts` pour le raisonnement complet.
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
// TEST 1 — deficitsImputes === 0, bénéfice → colonne Bénéfice = resultatFiscal
// =====================================================================
describe("Cycle 44 — TEST 1 : deficitsImputes === 0, bénéfice", () => {
  it("colonne Bénéfice alimentée avec resultatFiscal", () => {
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
// TEST 3 — CORRIGÉ (JALON 1B) : deficitsImputes > 0, bénéfice → le Cadre I
// n'est plus vidé, il reprend resultatFiscal comme I_7A
// =====================================================================
describe("Cycle 44 / JALON 1B — TEST 3 : deficitsImputes > 0, bénéfice — le Cadre I n'est plus vidé", () => {
  it("I_AUTRES_LMNP_BENEFICE = resultatFiscal, plus jamais bloquée, aucune trace de casesNonAlimentees", () => {
    // AVANT correction (Cycles 42-44), ce cas produisait une case bloquée
    // ("incoherence_modele"). C'était une fausse ambiguïté : resultatFiscal
    // est déjà le résultat APRÈS imputation (TRF-0031) — voir map-2031-bis.ts.
    const fr = fiscalResult({ resultatFiscal: 2000, deficitNouveau: 0, deficitsImputes: 4000 });
    const form = map2031BisFromRfs(rfs(fr));
    assert.equal(findCase(form, "I_AUTRES_LMNP_BENEFICE")?.value, 2000, "I_AUTRES_LMNP_BENEFICE doit reprendre resultatFiscal, jamais resultatFiscal + deficitsImputes (2000, pas 6000)");
    assert.equal(findBlocked(form, "I_AUTRES_LMNP_BENEFICE"), undefined, "plus aucune case bloquée pour ce motif — la formule est désormais la même que I_7A");
    assert.deepEqual(form.casesNonAlimentees, [], "casesNonAlimentees est désormais toujours vide pour ce mapper");
  });

  it("la formule non prouvée resultatFiscal + deficitsImputes n'a jamais été et n'est toujours pas produite comme valeur", () => {
    const fr = fiscalResult({ resultatFiscal: 2000, deficitNouveau: 0, deficitsImputes: 4000 });
    const form = map2031BisFromRfs(rfs(fr));
    const wouldBeWrongFormula = fr.resultatFiscal + fr.deficitsImputes;
    for (const c of form.cases) {
      assert.notEqual(c.value, wouldBeWrongFormula, "resultatFiscal + deficitsImputes ne doit jamais être calculé ni produit comme valeur de case");
    }
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
  it("map2031FromRfs() continue de produire I_7A/I_7B exactement comme avant, indépendamment de 2031 Bis-SD", () => {
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
    assert.equal(caseI7ABis?.value, 2000);
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

  it("R3 — déficit antérieur imputé : résultat avant imputation 5000, déficit antérieur imputé 2000, resultatFiscal=3000, I_7A=I_AUTRES_LMNP_BENEFICE=3000 (chiffres exacts demandés par la mission)", () => {
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
    assert.equal(form2031.cases.find((c) => c.caseId === "I_7A")?.value, 3000, "I_7A = 3 000 €");
    assert.equal(form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_BENEFICE")?.value, 3000, "I_AUTRES_LMNP_BENEFICE = 3 000 € — le Cadre I n'est plus vidé");
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

  it("R5 — combiné (déficit antérieur + ARD) : Cadre I = Cadre 7 côté bénéfice, y compris avec deficitsImputes > 0 (c'est exactement le gap corrigé)", () => {
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
    assert.equal(form2031Bis.cases.find((c) => c.caseId === "I_AUTRES_LMNP_BENEFICE")?.value, 3200, "le Cadre I n'est plus vidé quand deficitsImputes > 0");
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
