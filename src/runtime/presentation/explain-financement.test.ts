import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { explainFinancement } from "./explain-financement";
import type { ChargesFinancementExercice } from "../capabilities/f011/types";

/**
 * F011-3 (arbitrage KS AX-011/JUG-011) — les intérêts ET l'assurance
 * emprunteur pré-exploitation sont déductibles dès l'exercice où ils sont
 * engagés (JUG-011, choix A : déduction immédiate — jamais une
 * immobilisation au prix de revient). F-006 les déduit déjà (via
 * `chargesPreExploitation`, `compute-resultat-avant-amort.ts`) : ce message
 * ne doit donc jamais dire "non déductible(s)", ni suggérer de les intégrer
 * aux frais d'acquisition (F-010), sous peine de double comptage si
 * l'utilisateur suivait ce conseil erroné.
 */

function baseCharges(overrides: Partial<ChargesFinancementExercice> = {}): ChargesFinancementExercice {
  return {
    exerciceFiscal: 2026,
    prets: [],
    totalInteretsEmprunt: 1000,
    totalInteretsPreExploitation: 0,
    totalAssurance: 200,
    totalCapitalRembourse: 5000,
    totalChargesFinancementExercice: 1200,
    ...overrides,
  };
}

describe("F011-3 — explainFinancement : intérêts/assurance pré-exploitation (contrat AX-011/JUG-011)", () => {
  it("F — intérêts pré-exploitation : le message affirme la déductibilité, jamais 'non déductible'", () => {
    const { explanation } = explainFinancement({
      charges: baseCharges({ totalInteretsPreExploitation: 800 }),
    });
    assert.ok(explanation.includes("800"), "le montant doit apparaître");
    assert.ok(
      !/non[- ]déductible/i.test(explanation),
      "aucune formulation 'non déductible' ne doit subsister pour la pré-exploitation",
    );
    assert.ok(
      explanation.includes("déductibles dès cet exercice") || explanation.includes("réduisent bien votre résultat"),
      "le message doit affirmer positivement la déductibilité immédiate (JUG-011 choix A)",
    );
  });

  it("G — assurance pré-exploitation : même traitement que les intérêts, montant inclus et déductible", () => {
    const { explanation } = explainFinancement({
      charges: baseCharges({ totalInteretsPreExploitation: 300, totalAssurancePreExploitation: 150 }),
    });
    assert.ok(explanation.includes("450"), "le total combiné (300 + 150) doit être affiché");
    assert.ok(explanation.includes("150"), "le détail de l'assurance pré-exploitation doit apparaître");
    assert.ok(!/non[- ]déductible/i.test(explanation), "jamais 'non déductible' pour l'assurance pré-exploitation non plus");
  });

  it("H — aucune formulation ne recommande d'intégrer ces montants aux frais d'acquisition", () => {
    const { explanation } = explainFinancement({
      charges: baseCharges({ totalInteretsPreExploitation: 800 }),
    });
    assert.ok(
      !explanation.includes("Vous pouvez les intégrer"),
      "l'ancienne formulation qui recommandait l'intégration aux frais d'acquisition ne doit plus apparaître",
    );
    assert.ok(
      explanation.includes("Ne les intégrez pas") || !explanation.toLowerCase().includes("frais d'acquisition"),
      "le message doit soit avertir explicitement contre le double comptage, soit ne jamais mentionner les frais d'acquisition",
    );
  });

  it("aucune charge pré-exploitation (cas courant) : aucune ligne ajoutée, comportement existant préservé", () => {
    const { explanation } = explainFinancement({ charges: baseCharges() });
    assert.ok(!explanation.toLowerCase().includes("pré-exploitation"), "rien à signaler quand le montant est nul");
  });

  it("non-régression : la ligne 'Total déductible'/charges de l'exercice reste inchangée", () => {
    const { explanation } = explainFinancement({ charges: baseCharges() });
    assert.ok(explanation.includes("1200") || explanation.includes("1 200"), "le total de charges de financement déductibles reste affiché tel quel");
    assert.ok(
      (explanation.includes("5000") || explanation.includes("5 000")) && explanation.includes("ne sont pas déductibles"),
      "le remboursement de capital reste correctement présenté comme non déductible (aucun lien avec la pré-exploitation)",
    );
  });
});
