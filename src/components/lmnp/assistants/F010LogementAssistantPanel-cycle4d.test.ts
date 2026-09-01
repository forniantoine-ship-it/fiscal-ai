/**
 * Cycle 4D (F010) — récapitulatif enrichi sur review_plan. Runtime inchangé :
 * buildF010ReviewPlanSummaryItems est une pure mise en forme de F010State,
 * testée directement (convention du projet, pas de RTL), combinée au runtime
 * réel pour vérifier que le calcul reste produit par le moteur existant.
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4d.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "@/runtime";
import type { F010State } from "@/runtime";
import { buildF010ReviewPlanSummaryItems } from "./F010LogementAssistantPanel";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

function fullReviewPlanState(overrides: Partial<F010State> = {}): F010State {
  return {
    step: "review_plan",
    prixAcquisition: 280000,
    dateAcquisition: "2024-03-01",
    typeBien: "appartement",
    adresse: "12 rue des Lilas, 75011 Paris",
    fraisNotaire: 21000,
    choixTraitementFrais: "integration",
    natureBien: "ancien",
    montantMobilier: 5000,
    ratioTerrain: 0.15,
    localisation: "paris",
    fieldSources: { fraisNotaire: "estimated" },
    ...overrides,
  };
}

function labelsOf(items: ReturnType<typeof buildF010ReviewPlanSummaryItems>): string[] {
  return items.map((item) => item.label);
}

describe("Cycle 4D — A. chaque entrée affichée", () => {
  it("les 6 catégories demandées sont présentes quand toutes les données sont connues et pertinentes", () => {
    const items = buildF010ReviewPlanSummaryItems(fullReviewPlanState());
    assert.deepEqual(labelsOf(items), [
      "Prix d'achat",
      "Date d'acquisition",
      "Type de bien",
      "Frais de notaire",
      "Bien", // natureBien : pertinent ici, fraisNotaire vient d'une estimation
      "Mobilier inclus",
      "Part du terrain",
    ]);
    const byLabel = Object.fromEntries(items.map((item) => [item.label, item.value]));
    assert.match(byLabel["Prix d'achat"], /^280.000.€$/);
    assert.equal(byLabel["Date d'acquisition"], "2024-03-01");
    assert.equal(byLabel["Type de bien"], "Appartement");
    assert.match(byLabel["Frais de notaire"], /^21.000.€ \(intégrés à la valeur du bien\)$/);
    assert.equal(byLabel["Bien"], "Ancien");
    assert.match(byLabel["Mobilier inclus"], /^5.000.€$/);
    assert.equal(byLabel["Part du terrain"], "15 %");
  });
});

describe("Cycle 4D — B. aucune donnée secondaire affichée", () => {
  it("adresse, localisation et mobilierMode ne sont jamais affichés", () => {
    const items = buildF010ReviewPlanSummaryItems(fullReviewPlanState());
    const labels = labelsOf(items);
    assert.ok(!labels.includes("Adresse"));
    assert.ok(!labels.some((l) => /localisation/i.test(l)));
    assert.ok(!items.some((item) => item.value.includes("paris") || item.value.includes("Paris")));
    assert.ok(!items.some((item) => item.value === "12 rue des Lilas, 75011 Paris"));
  });

  it("natureBien n'apparaît pas quand elle n'a pas servi à une estimation des frais", () => {
    const items = buildF010ReviewPlanSummaryItems(
      fullReviewPlanState({ fieldSources: { fraisNotaire: "manual" } }),
    );
    assert.ok(!labelsOf(items).includes("Bien"));
  });

  it("natureBien n'apparaît pas quand elle est absente, même si les frais sont estimés", () => {
    const items = buildF010ReviewPlanSummaryItems(
      fullReviewPlanState({ natureBien: undefined, fieldSources: { fraisNotaire: "estimated" } }),
    );
    assert.ok(!labelsOf(items).includes("Bien"));
  });
});

describe("Cycle 4D — C. valeur modifiée reflétée dans le récapitulatif", () => {
  it("un changement de prixAcquisition ou de choixTraitementFrais se répercute immédiatement", () => {
    const items1 = buildF010ReviewPlanSummaryItems(fullReviewPlanState({ prixAcquisition: 300000 }));
    const prix1 = items1.find((item) => item.label === "Prix d'achat")!.value;
    assert.match(prix1, /^300.000.€$/);

    const items2 = buildF010ReviewPlanSummaryItems(fullReviewPlanState({ choixTraitementFrais: "deduction" }));
    const frais2 = items2.find((item) => item.label === "Frais de notaire")!.value;
    assert.match(frais2, /déduits immédiatement/);
  });

  it("mobilier absent affiche 'Aucun', mobilier présent affiche le montant", () => {
    const withMobilier = buildF010ReviewPlanSummaryItems(fullReviewPlanState({ montantMobilier: 8000 }));
    assert.match(withMobilier.find((item) => item.label === "Mobilier inclus")!.value, /^8.000.€$/);

    const withoutMobilier = buildF010ReviewPlanSummaryItems(fullReviewPlanState({ montantMobilier: 0 }));
    assert.equal(withoutMobilier.find((item) => item.label === "Mobilier inclus")!.value, "Aucun");
  });
});

describe("Cycle 4D — D. recalcul toujours effectué par le moteur existant", () => {
  it("le passage par review_plan via le runtime produit toujours state.result via computePlan, inchangé par ce cycle", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 21000,
      choixTraitementFrais: "integration",
    });
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });

    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result, "le résultat vient du moteur (computePlan), pas de ce cycle");
    assert.ok(turn.state.result!.dotationAnnuelle > 0);

    // Le récapitulatif se contente de lire l'état déjà produit par le runtime,
    // sans jamais recalculer ni modifier turn.state.result.
    const items = buildF010ReviewPlanSummaryItems(turn.state);
    assert.ok(items.length > 0);
    assert.ok(turn.state.result, "toujours présent après lecture du récapitulatif");
  });
});

describe("Cycle 4D — E. non-régression Cycle 4C2", () => {
  it("les helpers de l'écran de review (Cycle 4C2) restent inchangés par cet ajout", async () => {
    const { computeF010ReviewVisibleEntries } = await import("./F010LogementAssistantPanel");
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(
      { step: "collect_bien", acquisitionSource: "acte", fieldSources: {} },
      { type: "analysis_success", documentId: "doc-1", proposal: { prixAcquisition: 280000 } },
    );
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.deepEqual(
      visible.map(([field]) => field),
      ["prixAcquisition"],
    );
  });
});
