import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deriveExpenseIdFromDocument,
  expenseToCharge,
  expenseToComposantNouveau,
  isExpenseRecordable,
  proposeExpenseQualification,
  resolveNatureIntervention,
  splitExpenseMontant,
  type Expense,
} from "./expense";
import { computeChargesExercice } from "./compute-charges-exercice";
import { collectedToChargeRegistry } from "../../assistants/f012-charges/collected-to-registry";
import { chargeRegistryToComputeInput } from "../../assistants/f012-charges/registry-to-compute-input";

function baseExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    exerciceFiscal: 2024,
    montant: 1200,
    description: "Taxe foncière",
    category: "taxe_fonciere",
    origin: "manual",
    fieldSources: {},
    decision: "confirmed",
    ...overrides,
  };
}

describe("Expense — F012 V2 Phase 1, modèle canonique", () => {
  it("A — dépense manuelle simple : projection Charge correcte", () => {
    const expense = baseExpense();
    const { charge, anomalies } = expenseToCharge(expense);
    assert.equal(charge.amount, 1200);
    assert.equal(charge.category, "taxe_fonciere");
    assert.equal(charge.source, "manual");
    assert.equal(anomalies.length, 0);
  });

  it("B — dépense issue d'un document : référence stable conservée, jamais le contenu du document", () => {
    const expense = baseExpense({
      id: deriveExpenseIdFromDocument("doc-abc-123", "0"),
      origin: "document",
      documentId: "doc-abc-123",
      fieldSources: { montant: "extracted" },
    });
    const { charge } = expenseToCharge(expense);
    assert.equal(charge.source, "document");
    assert.deepEqual(charge.documentIds, ["doc-abc-123"]);
  });

  it("C — valeur extraite ≠ valeur validée : les deux restent représentées distinctement", () => {
    const expense = baseExpense({
      montant: 1350,
      montantExtrait: 1200,
      fieldSources: { montant: "user_correction" },
      decision: "modified",
    });
    assert.equal(expense.montantExtrait, 1200, "la valeur extraite d'origine n'est jamais effacée");
    assert.equal(expense.montant, 1350, "la valeur validée (corrigée) est celle qui compte fiscalement");
    assert.equal(expense.fieldSources.montant, "user_correction");

    const { charge } = expenseToCharge(expense);
    assert.equal(charge.amount, 1350, "la projection Charge utilise la valeur validée, jamais l'extraction brute");
  });

  it("D — correction utilisateur conservée à travers l'adaptateur (montant ET qualification)", () => {
    const expense = baseExpense({
      category: "travaux",
      description: "Rénovation cuisine",
      montant: 8000,
      montantExtrait: 7500,
      natureIntervention: "amélioration",
      qualificationRetenue: "immobilisation",
      fieldSources: { montant: "user_correction" },
      decision: "modified",
      dateDebut: "2024-06-01",
    });
    const { charge } = expenseToCharge(expense);
    assert.equal(charge.amount, 8000);
    assert.equal(charge.qualification, "amélioration");
    assert.equal(charge.travaux?.dateDebut, "2024-06-01");
  });

  it("E — id stable : jamais un index de tableau, jamais un id recalculé au montant/libellé", () => {
    const e1 = baseExpense({ id: "expense-1", montant: 100 });
    const e2 = { ...e1, montant: 999, description: "Autre libellé" };
    assert.equal(e1.id, e2.id, "l'id reste identique même si montant/libellé changent — jamais dérivé d'eux");
  });

  it("F — référence document stable : même document + même item stable → même id ; item différent → id différent", () => {
    assert.equal(
      deriveExpenseIdFromDocument("doc-1", "ligne-1"),
      deriveExpenseIdFromDocument("doc-1", "ligne-1"),
      "4 — même document + même clé d'item stable → même id de dépense candidate",
    );
    assert.notEqual(
      deriveExpenseIdFromDocument("doc-1", "ligne-1"),
      deriveExpenseIdFromDocument("doc-1", "ligne-2"),
      "5 — même document + item différent → id distinct",
    );
    assert.notEqual(
      deriveExpenseIdFromDocument("doc-1", "ligne-1"),
      deriveExpenseIdFromDocument("doc-2", "ligne-1"),
    );
  });

  it("3 — un document à plusieurs lignes produit plusieurs Expense avec des ids distincts et stables", () => {
    const ids = ["provisions", "regularisation", "appel-gros-travaux"].map((itemKey) =>
      deriveExpenseIdFromDocument("doc-syndic-42", itemKey),
    );
    assert.equal(new Set(ids).size, 3, "3 lignes du même document → 3 ids distincts, jamais une collision");
    // Ré-extraction du même document, mêmes clés d'item → mêmes ids (idempotence).
    const idsAgain = ["provisions", "regularisation", "appel-gros-travaux"].map((itemKey) =>
      deriveExpenseIdFromDocument("doc-syndic-42", itemKey),
    );
    assert.deepEqual(ids, idsAgain);
  });

  it("G — charge pure → pipeline F012 existant (ChargeRegistry → computeChargesExercice)", () => {
    const expense = baseExpense({ montant: 1200 });
    const { charge } = expenseToCharge(expense);

    const registry = { exercise: 2024, charges: [charge], familyCoverage: [] };
    const input = chargeRegistryToComputeInput(registry, { dateMiseEnService: "2023-01-01" });
    const result = computeChargesExercice(input);

    assert.equal(result.charges.totalDeductible, 1200);
    assert.equal(result.anomalies.length, 0);
  });

  it("H — immobilisation → ComposantNouveau/F014, sans double montant (le composant est l'unique source de sa base)", () => {
    const expense = baseExpense({
      id: "expense-travaux-1",
      category: "travaux",
      description: "Extension véranda",
      montant: 12000,
      natureIntervention: "amélioration",
      qualificationRetenue: "immobilisation",
      dateDebut: "2024-06-01",
    });
    const composant = expenseToComposantNouveau(expense);
    assert.ok(composant);
    assert.equal(composant!.montant, 12000);
    assert.equal(composant!.id, expense.id, "traçabilité dépense → composant, même identité");
    assert.equal(composant!.dateDebut, "2024-06-01");

    const { charge } = expenseToCharge(expense);
    assert.equal(charge.travaux?.natureIntervention, "amélioration");
  });

  it("I — mixte : montant charge + montant immobilisation = montant total de la dépense", () => {
    const expense = baseExpense({
      category: "travaux",
      description: "Rénovation salle de bain",
      montant: 12000,
      montantReparation: 4000,
      qualificationRetenue: "mixte",
      dateDebut: "2024-06-01",
    });
    const split = splitExpenseMontant(expense);
    assert.equal(split.charge + split.immobilisation, expense.montant);
    assert.equal(split.charge, 4000);
    assert.equal(split.immobilisation, 8000);

    const composant = expenseToComposantNouveau(expense);
    assert.equal(composant?.montant, 8000, "seule la part immobilisation devient un composant, jamais le montant total");
  });

  it("J — ambiguïté : une dépense non validée (pending/ignored) ne peut jamais devenir silencieusement une qualification validée", () => {
    const pending = baseExpense({ decision: "pending", qualificationRetenue: undefined });
    assert.equal(isExpenseRecordable(pending), false);
    const { anomalies: pendingAnomalies } = expenseToCharge(pending);
    assert.ok(pendingAnomalies.some((a) => a.severity === "error"));

    const ignored = baseExpense({ decision: "ignored" });
    assert.equal(isExpenseRecordable(ignored), false);

    const unresolvedQualification = baseExpense({
      category: "travaux",
      montant: 9000,
      natureIntervention: undefined,
      qualificationRetenue: undefined,
      decision: "confirmed",
    });
    const { charge } = expenseToCharge(unresolvedQualification);
    assert.equal(charge.reviewNeeded, true, "l'absence de qualification retenue reste visible, jamais masquée");

    const noDate = baseExpense({
      category: "travaux",
      montant: 9000,
      natureIntervention: "amélioration",
      qualificationRetenue: "immobilisation",
      dateDebut: undefined,
    });
    assert.equal(expenseToComposantNouveau(noDate), undefined, "jamais un composant sans date propre (TRF-0028)");
  });

  it("qualification proposée (JUG-008/SAV-015) n'est jamais promue automatiquement en qualification retenue", () => {
    const expense = baseExpense({
      category: "travaux",
      description: "Cas ambigu",
      montant: 9000,
      natureIntervention: undefined,
    });
    const proposed = proposeExpenseQualification(expense);
    assert.equal(proposed, "immobilisation", "SAV-015 : au-dessus du seuil, immobilisation par prudence (JUG-008)");
    assert.equal(expense.qualificationRetenue, undefined, "jamais assignée automatiquement — reste à arbitrer par l'utilisateur");
  });

  it("K — reload / sérialisation : round-trip JSON fidèle (aucune classe, aucune référence non sérialisable)", () => {
    const expense = baseExpense({
      category: "travaux",
      montant: 8000,
      montantExtrait: 7500,
      natureIntervention: "amélioration",
      qualificationRetenue: "immobilisation",
      dateDebut: "2024-06-01",
      documentId: "doc-42",
      fieldSources: { montant: "user_correction" },
      decision: "modified",
    });
    const roundTripped = JSON.parse(JSON.stringify(expense)) as Expense;
    assert.deepEqual(roundTripped, expense);
    const { charge: chargeFromOriginal } = expenseToCharge(expense);
    const { charge: chargeFromRoundTripped } = expenseToCharge(roundTripped);
    assert.deepEqual(chargeFromRoundTripped, chargeFromOriginal);
  });
});

describe("Post-audit P0 — qualificationRetenue est la SEULE autorité, jamais une natureIntervention périmée", () => {
  it("1 — qualificationRetenue='charge' + natureIntervention périmée='amélioration' : jamais une immobilisation silencieuse", () => {
    const expense = baseExpense({
      category: "travaux",
      description: "Peinture",
      montant: 3000,
      natureIntervention: "amélioration", // périmé : proposition initiale jamais mise à jour
      qualificationRetenue: "charge", // décision retenue par l'utilisateur : simple charge
      decision: "confirmed",
    });

    assert.equal(resolveNatureIntervention(expense), "entretien", "qualificationRetenue prime toujours sur natureIntervention périmée");

    const { charge } = expenseToCharge(expense);
    assert.equal(charge.qualification, "entretien", "jamais 'amélioration' — la charge retenue n'est jamais requalifiée en immobilisation");
    assert.equal(charge.travaux?.natureIntervention, "entretien");

    // Aucune immobilisation ne peut être créée pour une charge retenue,
    // quelle que soit la nature périmée.
    assert.equal(expenseToComposantNouveau(expense), undefined);
  });

  it("2 — qualificationRetenue='immobilisation' + natureIntervention périmée='entretien' : représentation cohérente avec l'immobilisation", () => {
    const expense = baseExpense({
      category: "travaux",
      description: "Remplacement toiture",
      montant: 15000,
      natureIntervention: "entretien", // périmé : proposition initiale jamais mise à jour
      qualificationRetenue: "immobilisation", // décision retenue : immobilisation
      dateDebut: "2024-06-01",
      decision: "confirmed",
    });

    assert.equal(
      resolveNatureIntervention(expense),
      "amélioration",
      "qualificationRetenue prime : jamais 'entretien' pour une immobilisation retenue",
    );

    const { charge } = expenseToCharge(expense);
    assert.notEqual(charge.qualification, "entretien", "la Charge ne doit jamais ressembler à une simple charge");
    assert.equal(charge.qualification, "amélioration");

    const composant = expenseToComposantNouveau(expense);
    assert.ok(composant, "un composant doit bien être créé — cohérent avec la Charge");
    assert.equal(composant!.nature, "amélioration");
  });

  it("3 — même Expense : jamais Charge 'entretien' (charge pure) en même temps qu'un ComposantNouveau existe", () => {
    function assertNeverContradictory(expense: Expense) {
      const { charge } = expenseToCharge(expense);
      const composant = expenseToComposantNouveau(expense);
      if (composant !== undefined) {
        assert.notEqual(
          charge.qualification,
          "entretien",
          `contradiction : composant créé (${JSON.stringify(composant)}) mais Charge classée entretien (charge pure)`,
        );
      }
    }

    // Toutes les combinaisons qualificationRetenue × natureIntervention périmée.
    const qualifications: Array<Expense["qualificationRetenue"]> = ["charge", "immobilisation", "mixte", undefined];
    const natures: Array<Expense["natureIntervention"]> = ["entretien", "amélioration", "construction", "renouvellement", undefined];
    for (const qualificationRetenue of qualifications) {
      for (const natureIntervention of natures) {
        assertNeverContradictory(
          baseExpense({
            category: "travaux",
            montant: 9000,
            montantReparation: qualificationRetenue === "mixte" ? 3000 : undefined,
            natureIntervention,
            qualificationRetenue,
            dateDebut: "2024-06-01",
            decision: "confirmed",
          }),
        );
      }
    }
  });

  it("4 — mixte reste inchangé : Charge porte 'mixte' + natureIntervention='entretien' (part réparation), composant porte 'amélioration' (part immobilisation) — pas une contradiction, une convention déjà existante", () => {
    const expense = baseExpense({
      category: "travaux",
      description: "Facture mixte",
      montant: 10000,
      montantReparation: 4000,
      natureIntervention: "entretien", // ignoré : mixte a sa propre résolution
      qualificationRetenue: "mixte",
      dateDebut: "2024-06-01",
      decision: "confirmed",
    });
    const { charge } = expenseToCharge(expense);
    assert.equal(charge.qualification, "mixte");
    assert.equal(charge.travaux?.natureIntervention, "entretien");

    const composant = expenseToComposantNouveau(expense);
    assert.equal(composant?.nature, "amélioration");
    assert.equal(composant?.montant, 6000);
  });
});

describe("L — ancien parcours F012 sans nouveau modèle : comportement inchangé", () => {
  it("collectedToChargeRegistry / computeChargesExercice fonctionnent sans jamais référencer Expense", () => {
    const registry = collectedToChargeRegistry({
      collected: { taxeFonciere: 1200, coproLignes: [], travaux: [], divers: [], skippedCategories: [] },
      categoryInventory: ["taxe_fonciere"],
      fieldSources: {},
      exercise: 2024,
    });
    const input = chargeRegistryToComputeInput(registry, { dateMiseEnService: "2023-01-01" });
    const result = computeChargesExercice(input);
    assert.equal(result.charges.totalDeductible, 1200);
  });
});
