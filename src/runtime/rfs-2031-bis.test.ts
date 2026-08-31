/**
 * Cycle 44 — projection Cerfa 2031 Bis-SD (Cadre I, BIC non professionnels)
 * depuis la RFS. Périmètre volontairement restreint (Cycles 41-43) : seule la
 * ligne « Autres locations meublées non professionnelles » est alimentée, et
 * uniquement lorsque fiscalResult.deficitsImputes === 0.
 * Run: npx tsx --test src/runtime/rfs-2031-bis.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { map2031BisFromRfs } from "./capabilities/rfs/projection/map-2031-bis";
import { map2031FromRfs } from "./capabilities/rfs/projection/map-2031-from-rfs";
import { assembleLiasseFromRfs } from "./capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
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
// TEST 3 — deficitsImputes > 0, bénéfice → bloquée, incoherence_modele
// =====================================================================
describe("Cycle 44 — TEST 3 : deficitsImputes > 0, bénéfice", () => {
  it("case bloquée, incoherence_modele, aucune valeur produite", () => {
    const form = map2031BisFromRfs(rfs(fiscalResult({ resultatFiscal: 2000, deficitNouveau: 0, deficitsImputes: 4000 })));
    assert.equal(findCase(form, "I_AUTRES_LMNP_BENEFICE"), undefined, "aucune valeur ne doit être produite, ni resultatFiscal seul ni resultatFiscal + deficitsImputes");
    const blocked = findBlocked(form, "I_AUTRES_LMNP_BENEFICE");
    assert.ok(blocked);
    assert.equal(blocked?.categorie, "incoherence_modele");
    assert.match(blocked!.raison, /formule officielle/, "la raison doit expliquer précisément l'ambiguïté, pas un texte générique");
  });
});

// =====================================================================
// TEST 4 — aucune valeur inventée pour le cas ambigu (déficit également)
// =====================================================================
describe("Cycle 44 — TEST 4 : deficitsImputes > 0 côté déficit également — aucune valeur inventée", () => {
  it("si deficitNouveau > 0 avec deficitsImputes > 0, la case Déficit reste elle aussi bloquée", () => {
    // Cas construit pour la preuve — ne prétend pas être fiscalement typique
    // (l'imputation ne s'applique normalement qu'à un résultat positif),
    // seul le comportement défensif du mapper est vérifié ici.
    const form = map2031BisFromRfs(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 500, deficitsImputes: 4000 })));
    assert.equal(findCase(form, "I_AUTRES_LMNP_DEFICIT"), undefined);
    const blocked = findBlocked(form, "I_AUTRES_LMNP_DEFICIT");
    assert.ok(blocked);
    assert.equal(blocked?.categorie, "incoherence_modele");
  });

  it("la formule non prouvée resultatFiscal + deficitsImputes n'apparaît jamais comme valeur produite", () => {
    const fr = fiscalResult({ resultatFiscal: 2000, deficitNouveau: 0, deficitsImputes: 4000 });
    const form = map2031BisFromRfs(rfs(fr));
    const wouldBeHypothesis = fr.resultatFiscal + fr.deficitsImputes;
    for (const c of form.cases) {
      assert.notEqual(c.value, wouldBeHypothesis, "la formule non prouvée ne doit jamais être produite comme valeur de case");
    }
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

    // 2031-Bis-SD reste hors du suivi ADR-004 (Cycle 41) — jamais dans ces
    // trois tableaux, qui restent strictement les 5 formulaires ADR-004.
    // (Cycle 55 : 2033-C-SD rejoint formulairesGeneres, formulairesManquants
    // ne liste plus que 2033-D-SD — 2031-Bis-SD reste absent des trois.)
    assert.deepEqual(liasse.formulairesGeneres, ["2031-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD"]);
    assert.deepEqual(liasse.formulairesManquants, ["2033-D-SD"]);
    assert.equal(liasse.formulairesAttendus.includes("2031-Bis-SD" as never), false);
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
