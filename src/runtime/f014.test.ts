import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeAmortizationPlan } from "./capabilities/f010/compute-amortization-plan";
import { createComposantTravaux } from "./capabilities/f012/create-composant-travaux";
import { composePlanAmortissement } from "./capabilities/f014/compose-plan-amortissement";
import { determineAmortissementProfil } from "./capabilities/f014/determine-profil";
import { validateAmortissements } from "./capabilities/f014/validate-amortissements";
import { toNomCourant } from "./capabilities/f014/nom-courant";
import {
  fiscalResultMatchesAmortissementTotal,
  hasAmortissementDrifted,
} from "./capabilities/f014/plan-consistency";
import { produceFiscalResult } from "./capabilities/f006/produce-fiscal-result";
import {
  EXP_F014_TERRAIN_BATI,
  explainAmortissements,
  expF014ImpactFiscal,
  expF014UsageFiscal,
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

describe("F-014 — Cohérence avec la valeur stockée (amortissementAssistant)", () => {
  it("ne détecte pas de dérive quand le total validé et le total recalculé sont identiques", () => {
    assert.equal(hasAmortissementDrifted(6779, 6779), false);
    assert.equal(hasAmortissementDrifted(6779.001, 6779.004), false);
  });

  it("détecte une dérive quand le logement/travaux ont changé depuis la validation", () => {
    assert.equal(hasAmortissementDrifted(6779, 7200), true);
  });
});

describe("F-014 — Cohérence avec le FiscalResult (F-006)", () => {
  const FISCAL_BASE_INPUT = {
    exerciceFiscal: 2024,
    activite: { dateMiseEnService: "2024-04-15", siret: "12345678901234" },
    revenusAssistant: { exerciceFiscal: 2024, totalRecettes: 9000 },
    chargesAssistant: {
      exerciceFiscal: 2024,
      totalDeductible: 7000,
      totalPreExploitation: 0,
      parCategorie: {},
    },
    logementAmortissement: { computedAt: "2024-01-01T00:00:00.000Z" },
  };

  it("reconnaît un FiscalResult calculé à partir du total F-014 actuellement affiché", () => {
    const { result } = produceFiscalResult({
      ...FISCAL_BASE_INPUT,
      amortissementAssistant: { exerciceFiscal: 2024, totalDotations: 1500, status: "validated" },
    });
    assert.ok(result);
    assert.equal(fiscalResultMatchesAmortissementTotal(result!.trace.journal, 1500), true);
  });

  it("rejette un FiscalResult obsolète (calculé avant une modification du logement)", () => {
    const { result } = produceFiscalResult({
      ...FISCAL_BASE_INPUT,
      amortissementAssistant: { exerciceFiscal: 2024, totalDotations: 1500, status: "validated" },
    });
    assert.ok(result);
    // Le logement a été modifié après ce calcul : F-014 affiche désormais un total différent.
    assert.equal(fiscalResultMatchesAmortissementTotal(result!.trace.journal, 6779), false);
  });

  it("intègre AX-015/AX-016 : l'amortissement ne crée pas de déficit, le surplus est reporté", () => {
    const { result } = produceFiscalResult({
      ...FISCAL_BASE_INPUT,
      chargesAssistant: {
        exerciceFiscal: 2024,
        totalDeductible: 9000,
        totalPreExploitation: 0,
        parCategorie: {},
      },
      amortissementAssistant: { exerciceFiscal: 2024, totalDotations: 6779, status: "validated" },
    });
    assert.ok(result);
    assert.equal(result!.resultatAvantAmort, 0);
    assert.equal(result!.amortDeduct, 0);
    assert.equal(result!.amortReporte, 6779);
    assert.equal(result!.resultatFiscal, 0);
  });
});

describe("F-014 — Explication déduit / reporté (AX-015, AX-017)", () => {
  it("indique une déduction totale sans jargon quand rien n'est reporté", () => {
    const text = expF014UsageFiscal({ amortDeduct: 1500, amortReporte: 0 });
    assert.match(text, /intégralité/i);
    assert.doesNotMatch(text, /report/i);
  });

  it("indique un report total quand le résultat ne permet aucune déduction", () => {
    const text = expF014UsageFiscal({ amortDeduct: 0, amortReporte: 6779 });
    assert.match(text, /6.779/);
    assert.match(text, /sans limite de durée/i);
  });

  it("indique un partage déduit/reporté quand les deux sont non nuls", () => {
    const text = expF014UsageFiscal({ amortDeduct: 1200, amortReporte: 300 });
    assert.match(text, /1.200/);
    assert.match(text, /300/);
    assert.match(text, /sans limite de durée/i);
  });
});
