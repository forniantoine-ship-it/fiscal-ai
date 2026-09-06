/**
 * MICRO-JALON socle patrimonial P0 — continuité N → N+1 (règle pure,
 * démonstration d'architecture — voir limites dans le rapport
 * d'implémentation : aucun câblage dans fiscal-year-cycle.ts à ce stade).
 * Run: npx tsx --test src/runtime/bilan-n-plus-1.test.ts
 * Scénarios R17, R18 (contrat P0 §21).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyAmortissementStocks } from "./capabilities/f006/apply-amortissement-stocks";
import { resolveOuvertureCompteExploitantNPlusUn, reporterRanNPlusUn } from "./capabilities/bilan/resolve-ouverture-n-plus-1";

describe("resolveOuvertureCompteExploitantNPlusUn", () => {
  it("R17 — 120_ouverture(N+1) = 120_clôture(N) + résultat_comptable(N), convention EI (C1)", () => {
    const ouverture = resolveOuvertureCompteExploitantNPlusUn({ cloture120N: 30000, resultatComptableN: 4500 });
    assert.equal(ouverture, 34500);
  });

  it("fonctionne aussi pour un résultat comptable négatif (perte)", () => {
    const ouverture = resolveOuvertureCompteExploitantNPlusUn({ cloture120N: 30000, resultatComptableN: -4500 });
    assert.equal(ouverture, 25500);
  });
});

describe("reporterRanNPlusUn", () => {
  it("134 (RAN) n'est jamais automatiquement mis à jour par le résultat — traverse N → N+1 sans transformation", () => {
    const report = reporterRanNPlusUn({ situationN: "NATIF", valeurN: 0 });
    assert.deepEqual(report, { situationNPlusUn: "NATIF", valeurNPlusUn: 0 });
  });

  it("un RAN historique (C2/C3) traverse également sans transformation, jamais recalculé à partir du résultat", () => {
    const report = reporterRanNPlusUn({ situationN: "IMPORTE", valeurN: 4521.37 });
    assert.deepEqual(report, { situationNPlusUn: "IMPORTE", valeurNPlusUn: 4521.37 });
  });
});

describe("R18 — les stocks fiscaux ne modifient jamais le patrimoine par effet de bord", () => {
  it("un scénario fiscal réel (déficit + ARD) ne produit aucune valeur réutilisable par le socle patrimonial : deficitNouveau/deficitsImputes/amortReporte restent des concepts F-006 purs", () => {
    const application = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 1000,
      amortCalcule: 800,
      stockDeficitsAnterieurs: [{ millesime: 2023, montant: 600 }],
      stockAmortissementsReportes: 500,
    });

    // Les fonctions du socle patrimonial (compte-exploitant, RAN) n'ont
    // structurellement AUCUN paramètre qui pourrait recevoir ces valeurs —
    // preuve par signature, pas seulement par convention.
    const ouverture120 = resolveOuvertureCompteExploitantNPlusUn({ cloture120N: 30000, resultatComptableN: 0 });
    assert.equal(ouverture120, 30000, "resolveOuvertureCompteExploitantNPlusUn n'accepte pas deficitNouveau/deficitsImputes/amortReporte — ils ne peuvent pas s'y infiltrer");

    const report = reporterRanNPlusUn({ situationN: "NATIF", valeurN: 0 });
    assert.equal(report.valeurNPlusUn, 0, "134 reste 0 (C1) indépendamment du résultat de applyAmortissementStocks — aucun effet de bord possible");

    // Les stocks fiscaux eux-mêmes restent inchangés et distincts (non-régression F-006, voir bilan-fiscal-non-regression.test.ts).
    assert.equal(application.deficitsImputes, 600);
    assert.equal(application.amortReporte, 900);
  });
});
