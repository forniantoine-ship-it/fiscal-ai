/**
 * Correctif Blocker #1 (re-audit taxe foncière) — chemin `ChargeProposal`
 * historique (`f012-document-analysis.ts` → `proposalsFromExistingParsers`,
 * mort en production pour la famille "impots" depuis la migration vers
 * `Expense`, mais compilé/exporté/testé). Non-régression sur les cas déjà
 * couverts + nouveaux cas de divergence (mission §7).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { proposalsFromTaxeFonciereCorpus, resolveTaxeFonciereAnnualAmount, sumPrelevements } from "./proposals-from-taxe-fonciere";
import { hasMissingRecordableAmount, canConfirmAll } from "./document-review-decisions";

const AVIS_SIMPLE = `
Avis de taxe foncière — Année 2024
Net à payer : 1 100,00 EUR
Payé le 12/03/2024
`;

const AVIS_SANS_MONTANT = `
Avis de taxe foncière — Année 2024
Commune : Lyon
`;

const AVIS_10_PRELEVEMENTS = `
Avis de taxe foncière — Année 2024
${Array.from({ length: 10 }, (_, i) => `Prélèvement ${i + 1} : 150,00`).join("\n")}
Payé le 12/03/2024
`;

const AVIS_1500_ET_10_PRELEVEMENTS = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
${Array.from({ length: 10 }, (_, i) => `Prélèvement ${i + 1} : 150,00`).join("\n")}
Payé le 12/03/2024
`;

const AVIS_1500_ET_2_PRELEVEMENTS = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Prélèvement 1 : 150,00
Prélèvement 2 : 150,00
Payé le 12/03/2024
`;

const AVIS_1500_ET_1_PRELEVEMENT = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Prélèvement 1 : 150,00
Payé le 12/03/2024
`;

const AVIS_2_PRELEVEMENTS_SEULS = `
Avis de taxe foncière — Année 2024
Prélèvement 1 : 150,00
Prélèvement 2 : 150,00
Payé le 12/03/2024
`;

describe("proposalsFromTaxeFonciereCorpus — non-régression (chemin ChargeProposal historique)", () => {
  it("montant annuel seul, pas de prélèvements → une proposition, amount=1100", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_SIMPLE, documentId: "doc-1", fiscalYear: 2024 });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0]!.amount, 1100);
    assert.equal(proposals[0]!.missingFields.includes("amount"), false);
  });

  it("aucun montant lisible → une proposition, amount absent, missingFields inclut 'amount'", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_SANS_MONTANT, documentId: "doc-2", fiscalYear: 2024 });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0]!.amount, undefined);
    assert.ok(proposals[0]!.missingFields.includes("amount"));
  });

  it("10 prélèvements sans montant annuel (non-régression) → une ChargeProposal par prélèvement, groupId partagé, somme reconstituée = 1500", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_10_PRELEVEMENTS,
      documentId: "doc-10x150",
      fiscalYear: 2024,
    });
    assert.equal(proposals.length, 10);
    assert.ok(proposals.every((p) => p.groupId === "doc-10x150:taxe-annuelle"));
    const total = proposals.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    assert.equal(total, 1500);
  });

  it("montant annuel 1500 ET 10×150 CONCORDANTS (non-régression comportementale) → toujours le découpage par prélèvement, somme = 1500", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_1500_ET_10_PRELEVEMENTS,
      documentId: "doc-concordant",
      fiscalYear: 2024,
    });
    assert.equal(proposals.length, 10);
    const total = proposals.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    assert.equal(total, 1500);
  });

  it("un seul prélèvement + montant annuel 1500 → une seule proposition, amount=1500 (le prélèvement isolé n'est jamais retenu seul)", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_1500_ET_1_PRELEVEMENT,
      documentId: "doc-1-prelevement",
      fiscalYear: 2024,
    });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0]!.amount, 1500);
  });
});

describe("proposalsFromTaxeFonciereCorpus — Blocker #1 : divergence entre montant annuel et prélèvements", () => {
  it("montant annuel 1500 vs 2×150 (300) — DIVERGENT : jamais un découpage qui jetterait le montant explicite, une seule proposition avec amount absent", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_1500_ET_2_PRELEVEMENTS,
      documentId: "doc-divergent",
      fiscalYear: 2024,
    });
    assert.equal(proposals.length, 1, "jamais N propositions par prélèvement quand les sources divergent — le montant explicite serait perdu");
    assert.equal(proposals[0]!.amount, undefined, "aucune valeur choisie silencieusement entre 1500 et 300");
    assert.ok(proposals[0]!.missingFields.includes("amount"));
    assert.match(proposals[0]!.description, /1\s?500/);
    assert.match(proposals[0]!.description, /300/);
  });

  it("la divergence bloque la confirmation globale via le mécanisme existant (hasMissingRecordableAmount / canConfirmAll)", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_1500_ET_2_PRELEVEMENTS,
      documentId: "doc-divergent-2",
      fiscalYear: 2024,
    });
    assert.equal(hasMissingRecordableAmount(proposals), true);
    assert.equal(canConfirmAll(proposals), false, "réutilise la garde déjà existante — aucune nouvelle architecture de blocage");
  });

  it("prélèvements seuls (2×150, sans montant annuel) — aucune source concurrente : agrégation légitime par prélèvement, non-régression", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_2_PRELEVEMENTS_SEULS,
      documentId: "doc-2-seuls",
      fiscalYear: 2024,
    });
    assert.equal(proposals.length, 2);
    const total = proposals.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    assert.equal(total, 300);
  });
});

describe("resolveTaxeFonciereAnnualAmount — règle unique partagée (Expense + ChargeProposal)", () => {
  it("montant explicite seul", () => {
    assert.deepEqual(resolveTaxeFonciereAnnualAmount({ montantPayable: 1500, prelevements: [] }), {
      status: "explicit_only",
      amount: 1500,
    });
  });

  it("prélèvements seuls (≥2)", () => {
    const result = resolveTaxeFonciereAnnualAmount({ montantPayable: undefined, prelevements: [150, 150] });
    assert.equal(result.status, "prelevements_only");
    assert.equal((result as { amount: number }).amount, 300);
  });

  it("un seul prélèvement, pas de montant explicite → insuffisant", () => {
    assert.deepEqual(resolveTaxeFonciereAnnualAmount({ montantPayable: undefined, prelevements: [150] }), {
      status: "insufficient",
    });
  });

  it("aucune donnée → insuffisant", () => {
    assert.deepEqual(resolveTaxeFonciereAnnualAmount({ montantPayable: undefined, prelevements: [] }), {
      status: "insufficient",
    });
  });

  it("concordance exacte", () => {
    const result = resolveTaxeFonciereAnnualAmount({ montantPayable: 1500, prelevements: [750, 750] });
    assert.equal(result.status, "concordant");
    assert.equal((result as { amount: number }).amount, 1500);
  });

  it("quasi-concordance à la tolérance (±1€) reste concordante", () => {
    const under = resolveTaxeFonciereAnnualAmount({ montantPayable: 1500, prelevements: [749.5, 749.5] });
    const over = resolveTaxeFonciereAnnualAmount({ montantPayable: 1500, prelevements: [750.5, 750.5] });
    assert.equal(under.status, "concordant");
    assert.equal(over.status, "concordant");
  });

  it("écart de 2€ dépasse la tolérance → divergent", () => {
    const result = resolveTaxeFonciereAnnualAmount({ montantPayable: 1500, prelevements: [749, 749] });
    assert.equal(result.status, "divergent");
  });

  it("divergence forte (1500 vs 300)", () => {
    const result = resolveTaxeFonciereAnnualAmount({ montantPayable: 1500, prelevements: [150, 150] });
    assert.deepEqual(result, {
      status: "divergent",
      montantIndique: 1500,
      sommePrelevements: 300,
      prelevementsCount: 2,
    });
  });

  it("sumPrelevements — reorder ne change jamais la somme", () => {
    assert.equal(sumPrelevements([150, 150, 150]), sumPrelevements([150, 150, 150].reverse()));
  });
});
