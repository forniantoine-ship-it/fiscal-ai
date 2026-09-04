/**
 * P3-LIASSE-1A — projection Cerfa 2033-D-SD (Relevé des provisions,
 * amortissements dérogatoires, déficits reportables) depuis la RFS — socle
 * minimal honnête : formulaire présent, aucune case alimentée, trois cadres
 * tracés `casesNonAlimentees`.
 * Run: npx tsx --test src/runtime/rfs-2033d.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { map2033DFromRfs } from "./capabilities/rfs/projection/map-2033d";
import { map2033AFromRfs } from "./capabilities/rfs/projection/map-2033a";
import { map2033BFromRfs } from "./capabilities/rfs/projection/map-2033b";
import { map2033CFromRfs } from "./capabilities/rfs/projection/map-2033c";
import { assembleLiasseFromRfs } from "./capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { FiscalResult, StockDeficit } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation, ImmobilisationsRfs } from "./capabilities/rfs/types";

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

function rfs(fr: FiscalResult, immobilisations?: ImmobilisationsRfs): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    immobilisations,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

// =====================================================================
// Test 1 — présence du formulaire
// =====================================================================
describe("P3-LIASSE-1A — Test 1 : présence du formulaire", () => {
  it("map2033DFromRfs() retourne un formulaire valide", () => {
    const form = map2033DFromRfs(rfs(fiscalResult()));
    assert.equal(form.formId, "2033-D-SD");
    assert.equal(form.millésime, 2025);
  });

  it("le millésime suit rfs.exercice, jamais une valeur fixe", () => {
    const form = map2033DFromRfs(rfs(fiscalResult({ exercice: 2031 })));
    assert.equal(form.millésime, 2031);
  });
});

// =====================================================================
// Test 2 — aucune donnée fabriquée
// =====================================================================
describe("P3-LIASSE-1A — Test 2 : aucune donnée fabriquée", () => {
  it("cases est toujours vide, quel que soit le contenu de la RFS", () => {
    const form = map2033DFromRfs(rfs(fiscalResult()));
    assert.deepEqual(form.cases, []);
  });

  it("cases reste vide même avec un résultat fiscal riche (déficits, amortissements reportés, immobilisations)", () => {
    const stocksRiches: StockDeficit[] = [
      { millesime: 2023, montant: 1200 },
      { millesime: 2024, montant: 800 },
    ];
    const immobilisations: ImmobilisationsRfs = {
      lignes: [{ label: "Gros œuvre", montant: 37186.1, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814.1 }],
      totalAnnuelExercice: 372,
      totalBrut: 37186.1,
      valeurTerrain: 5000,
    };
    const fr = fiscalResult({
      deficitNouveau: 500,
      deficitsImputes: 300,
      amortReporte: 900,
      stocks: { deficits: stocksRiches, amortissementsReportes: 900, deficitsExpires: [] },
    });
    const form = map2033DFromRfs(rfs(fr, immobilisations));
    assert.deepEqual(form.cases, [], "aucune valeur ne doit être produite même quand FiscalResult/RFS contiennent des données riches");
  });
});

// =====================================================================
// Test 3 — cases non alimentées tracées
// =====================================================================
describe("P3-LIASSE-1A — Test 3 : cadres non alimentés tracés", () => {
  it("les trois cadres (provisions, amortissements dérogatoires, déficits reportables) sont tracés avec catégorie et raison", () => {
    const form = map2033DFromRfs(rfs(fiscalResult()));
    const ids = form.casesNonAlimentees.map((c) => c.caseId).sort();
    assert.deepEqual(ids, [
      "2033D_CADRE_AMORTISSEMENTS_DEROGATOIRES",
      "2033D_CADRE_DEFICITS_REPORTABLES",
      "2033D_CADRE_PROVISIONS",
    ]);
  });

  it("chaque cadre a une catégorie parmi les catégories existantes, jamais une nouvelle", () => {
    const form = map2033DFromRfs(rfs(fiscalResult()));
    const categoriesConnues = ["donnee_absente", "incoherence_modele", "hors_perimetre", "non_applicable"];
    for (const c of form.casesNonAlimentees) {
      assert.ok(categoriesConnues.includes(c.categorie), `catégorie inconnue : ${c.categorie}`);
    }
  });

  it("le cadre déficits reportables est catégorisé non_applicable (régime IR, cohérent avec map-2033b.ts case 350)", () => {
    const form = map2033DFromRfs(rfs(fiscalResult()));
    const deficits = form.casesNonAlimentees.find((c) => c.caseId === "2033D_CADRE_DEFICITS_REPORTABLES");
    assert.equal(deficits?.categorie, "non_applicable");
    assert.match(deficits!.raison, /imp[oô]t sur les soci[ée]t[ée]s|IS\b/i);
  });

  it("le cadre provisions est catégorisé non_applicable, cohérent avec les cases 140/154 du 2033-A-SD", () => {
    const form = map2033DFromRfs(rfs(fiscalResult()));
    const provisions = form.casesNonAlimentees.find((c) => c.caseId === "2033D_CADRE_PROVISIONS");
    assert.equal(provisions?.categorie, "non_applicable");
    assert.match(provisions!.raison, /provision/i);
  });

  it("le cadre amortissements dérogatoires est catégorisé hors_perimetre (mécanisme non implémenté par F-006)", () => {
    const form = map2033DFromRfs(rfs(fiscalResult()));
    const amortDerog = form.casesNonAlimentees.find((c) => c.caseId === "2033D_CADRE_AMORTISSEMENTS_DEROGATOIRES");
    assert.equal(amortDerog?.categorie, "hors_perimetre");
  });

  it("aucune raison générique (pattern déjà appliqué aux autres mappers)", () => {
    const form = map2033DFromRfs(rfs(fiscalResult()));
    const genericWords = ["inconnu", "unknown", "n/a", "todo", "tbd"];
    for (const c of form.casesNonAlimentees) {
      assert.ok(c.raison.length > 20, `${c.caseId} : raison trop courte`);
      for (const word of genericWords) {
        assert.equal(c.raison.toLowerCase().includes(word), false, `${c.caseId} : raison générique détectée ("${word}")`);
      }
    }
  });
});

// =====================================================================
// Test 4 — pas de N-1 fictif
// =====================================================================
describe("P3-LIASSE-1A — Test 4 : pas de N-1 fictif", () => {
  it("un RFS mono-exercice (stocks vides, aucune donnée N-1) ne produit aucun cadre alimenté à partir d'un stock reconstruit", () => {
    const fr = fiscalResult({ stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] } });
    const form = map2033DFromRfs(rfs(fr));
    assert.deepEqual(form.cases, []);
    // Aucune raison ne doit prétendre disposer d'un exercice antérieur reconstruit.
    for (const c of form.casesNonAlimentees) {
      assert.doesNotMatch(c.raison, /exercice ant[ée]rieur reconstruit|N-1 (calcul|fabriqu)/i);
    }
  });

  it("aucune référence à fiscalResult.stocks/deficits dans les raisons du cadre déficits reportables (non applicable par régime, jamais par absence de N-1)", () => {
    const form = map2033DFromRfs(rfs(fiscalResult()));
    const deficits = form.casesNonAlimentees.find((c) => c.caseId === "2033D_CADRE_DEFICITS_REPORTABLES");
    // La raison doit invoquer le régime IR (SAV-029/notice), jamais une absence de stock d'ouverture.
    assert.doesNotMatch(deficits!.raison, /stock d.ouverture|exercice N-1 (absent|manquant)/i);
  });
});

// =====================================================================
// Test 5 — assemblage
// =====================================================================
describe("P3-LIASSE-1A — Test 5 : assembleLiasseFromRfs() contient 2033-D-SD", () => {
  it("liasse.form2033D est structurellement identique à un appel direct de map2033DFromRfs()", () => {
    const representation = rfs(fiscalResult());
    const liasse = assembleLiasseFromRfs(representation);
    const direct = map2033DFromRfs(representation);
    assert.deepEqual(liasse.form2033D, direct);
  });

  it("2033-D-SD rejoint formulairesGeneres ; formulairesManquants est vide", () => {
    const representation = rfs(fiscalResult());
    const liasse = assembleLiasseFromRfs(representation);
    assert.ok(liasse.formulairesGeneres.includes("2033-D-SD"));
    assert.deepEqual(liasse.formulairesManquants, []);
  });
});

// =====================================================================
// Test 6 — régression : les autres formulaires restent inchangés
// =====================================================================
describe("P3-LIASSE-1A — Test 6 : régression, formulaires déjà générés inchangés", () => {
  it("form2031/form2033A/form2033B/form2033C restent identiques à un appel direct des mappers existants", () => {
    const immobilisations: ImmobilisationsRfs = {
      lignes: [{ label: "Gros œuvre", montant: 37186.1, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814.1 }],
      totalAnnuelExercice: 372,
      totalBrut: 37186.1,
      valeurTerrain: 5000,
    };
    const representation = rfs(fiscalResult({ amortCalcule: 372 }), immobilisations);
    const liasse = assembleLiasseFromRfs(representation);

    assert.deepEqual(liasse.form2033A, map2033AFromRfs(representation));
    assert.deepEqual(liasse.form2033B, map2033BFromRfs(representation));
    assert.deepEqual(liasse.form2033C, map2033CFromRfs(representation));
    assert.equal(liasse.form2031.formId, "2031-SD");
  });
});

// =====================================================================
// Garde d'architecture
// =====================================================================
describe("P3-LIASSE-1A — garde d'architecture (map-2033d.ts)", () => {
  it("aucun import de moteur fiscal, assistant, FEC ou lecteur de fichiers", () => {
    const source = readFileSync(path.join(__dirname, "capabilities/rfs/projection/map-2033d.ts"), "utf-8");
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
      "computeAmortizationPlan",
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
      "map-2033a",
      "map-2033b",
      "map-2033c",
    ];
    for (const token of forbidden) {
      assert.equal(importLines.includes(token), false, `map-2033d.ts ne doit pas importer ${token}`);
    }
  });
});

// =====================================================================
// Traçabilité
// =====================================================================
describe("P3-LIASSE-1A — traçabilité", () => {
  it("chaque cadre bloqué a une catégorie et une raison non générique (aucune case alimentée à tracer ce cycle)", () => {
    for (const representation of [rfs(fiscalResult()), rfs(fiscalResult({ deficitNouveau: 500 }))]) {
      const form = map2033DFromRfs(representation);
      assert.equal(form.cases.length, 0);
      for (const b of form.casesNonAlimentees) {
        assert.ok(b.categorie, `${b.caseId} sans catégorie`);
        assert.ok(b.raison.length > 20, `${b.caseId} : raison trop courte`);
      }
    }
  });
});
