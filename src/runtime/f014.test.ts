import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeAmortizationPlan } from "./capabilities/f010/compute-amortization-plan";
import { createComposantTravaux } from "./capabilities/f012/create-composant-travaux";
import { composePlanAmortissement } from "./capabilities/f014/compose-plan-amortissement";
import { determineAmortissementProfil } from "./capabilities/f014/determine-profil";
import { validateAmortissements } from "./capabilities/f014/validate-amortissements";
import { toNomCourant } from "./capabilities/f014/nom-courant";
import {
  EXP_F014_TERRAIN_BATI,
  explainAmortissements,
  expF014ImpactFiscal,
} from "./presentation/explain-amortissements";
import { F014AmortissementsAssistant } from "./assistants/f014-amortissements/assistant";

const CAS_NOMINAL = computeAmortizationPlan({
  prixAcquisition: 280000,
  mobilierInclus: false,
  fraisNotaire: 19500,
  choixTraitementFrais: "integration",
  typeBien: "appartement",
  ratioTerrain: 0.15,
  dateMiseEnService: "2024-04-15",
  exerciceFiscal: 2024,
});

describe("F-014 — composition plan (intégration F-010 + F-012)", () => {
  it("consomme le plan F-010 sans le recalculer", () => {
    const travaux = createComposantTravaux({
      label: "Cuisine équipée",
      montant: 12000,
      nature: "amélioration",
      dateDebut: "2024-06-01",
    });

    const composed = composePlanAmortissement({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: CAS_NOMINAL.prorataRatio,
      composantsNouveaux: [travaux.composant],
    });

    const plan = composed.plan;
    assert.equal(plan.composants.length, CAS_NOMINAL.plan.lignes.length);
    assert.equal(plan.nouveaux_elements.length, 1);
    assert.equal(plan.premiere_annee, true);
    assert.ok(plan.mois_exploitation !== null && plan.mois_exploitation < 12);

    const sommeF010 = plan.composants.reduce((acc, c) => acc + c.dotation_exercice, 0);
    const sommePlanF010 = CAS_NOMINAL.plan.totalAnnuelExercice;
    assert.equal(Math.round(sommeF010), Math.round(sommePlanF010));

    assert.ok(plan.total_dotations_exercice > sommePlanF010);
  });

  it("détermine PROF-001 en première année", () => {
    const composed = composePlanAmortissement({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: CAS_NOMINAL.prorataRatio,
    });
    assert.equal(determineAmortissementProfil(composed.plan), "PROF-001");
  });

  it("détermine PROF-002 si plan validé sans nouveaux éléments", () => {
    const composed = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: 1,
      planValidePrecedemment: true,
      anneeValidationInitiale: 2024,
    });
    assert.equal(determineAmortissementProfil(composed.plan), "PROF-002");
    assert.equal(composed.plan.mois_exploitation, null);
  });

  it("détermine PROF-003 si nouveaux travaux F-012", () => {
    const travaux = createComposantTravaux({
      label: "Isolation combles",
      montant: 8000,
      nature: "amélioration",
      dateDebut: "2025-03-01",
    });
    const composed = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: 1,
      composantsNouveaux: [travaux.composant],
      planValidePrecedemment: true,
      anneeValidationInitiale: 2024,
    });
    assert.equal(determineAmortissementProfil(composed.plan), "PROF-003");
    assert.equal(composed.plan.nouveaux_elements.length, 1);
  });
});

describe("F-014 — nom courant", () => {
  it("traduit Gros œuvre en langage courant", () => {
    assert.equal(toNomCourant("Gros œuvre"), "Structure du bâtiment");
  });
});

describe("F-014 — Validation Engine", () => {
  it("bloque si plan absent (CL-001)", () => {
    const result = validateAmortissements({ status: "validated" });
    assert.equal(result.validation, undefined);
    assert.ok(result.anomalies.some((a) => a.severity === "fatal"));
  });

  it("produit ValidationAmortissements pour F-006", () => {
    const composed = composePlanAmortissement({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: CAS_NOMINAL.prorataRatio,
    });
    const result = validateAmortissements({ plan: composed.plan, status: "validated" });
    assert.equal(result.validation?.status, "validated");
    assert.equal(result.validation?.exercice, 2024);
    assert.ok(result.validation!.total_dotations > 0);
    assert.ok(result.validation!.plan_version.startsWith("f014-"));
  });
});

describe("F-014 — Explanation Engine", () => {
  it("n'impose pas le jargon fiscal en premier plan", () => {
    const composed = composePlanAmortissement({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: CAS_NOMINAL.prorataRatio,
    });
    const explain = explainAmortissements({
      plan: composed.plan,
      profil: "PROF-001",
    });
    assert.match(explain.headline, /amortissements/i);
    assert.doesNotMatch(explain.explanation, /VNC|prorata temporis/i);
    assert.match(EXP_F014_TERRAIN_BATI, /terrain/i);
    assert.match(expF014ImpactFiscal(composed.plan.total_dotations_exercice), /résultat imposable/i);
  });
});

describe("F-014 — Assistant Amortissements", () => {
  const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/amortissements" };

  it("bloque sans plan F-010", () => {
    const assistant = new F014AmortissementsAssistant(ctx, {
      dateMiseEnService: "2024-04-15",
    });
    const start = assistant.start();
    assert.equal(start.state.step, "blocked");
    assert.equal(start.event, "REDIRECT_F010");
  });

  it("présente le plan immédiatement sans question préalable", async () => {
    const assistant = new F014AmortissementsAssistant(ctx, {
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: CAS_NOMINAL.prorataRatio,
    });
    const start = assistant.start();
    assert.equal(start.state.step, "present");
    assert.ok(start.state.plan);
    assert.match(start.messages[0]?.content ?? "", /Dotations de l'exercice/i);
    assert.ok(start.messages[0]?.suggestions?.some((s) => s.id === "confirm"));
  });

  it("valide et produit AMORTISSEMENTS_TERMINE", async () => {
    const assistant = new F014AmortissementsAssistant(ctx, {
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: CAS_NOMINAL.prorataRatio,
    });
    const state = assistant.start().state;
    const turn = await assistant.handle(state, { type: "confirm" });
    assert.equal(turn.completed, true);
    assert.equal(turn.event, "AMORTISSEMENTS_TERMINE");
    assert.equal(turn.state.result?.validation.status, "validated");
  });
});
