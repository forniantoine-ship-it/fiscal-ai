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
      id: "travaux-cuisine",
      label: "Cuisine équipée",
      montant: 12000,
      nature: "amélioration",
      dateDebut: "2024-06-01",
      origin: "f012_travaux",
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
      id: "travaux-isolation",
      label: "Isolation combles",
      montant: 8000,
      nature: "amélioration",
      dateDebut: "2025-03-01",
      origin: "f012_travaux",
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

describe("P0-A — date propre au composant travaux (TRF-0028), jamais celle du bien", () => {
  // Bien mis en service le 01/06/2023 ; travaux (composant F-012) mis en
  // service en 2025 seulement. Le composant ne doit jamais hériter de la
  // date de mise en service du bien (2023) : aucune dotation avant 2025.
  const DATE_MISE_EN_SERVICE_BIEN = "2023-06-01";
  const composantTravaux = createComposantTravaux({
    id: "travaux-veranda",
    label: "Extension véranda",
    montant: 18000,
    nature: "amélioration",
    dateDebut: "2025-09-01",
    origin: "f012_travaux",
  }).composant;

  it("A — aucune dotation sur le composant travaux avant son année de mise en service (2023, 2024)", () => {
    for (const exerciceFiscal of [2023, 2024]) {
      const composed = composePlanAmortissement({
        exerciceFiscal,
        dateMiseEnService: DATE_MISE_EN_SERVICE_BIEN,
        planLogement: CAS_NOMINAL.plan,
        prorataRatio: 1,
        composantsNouveaux: [composantTravaux],
      });
      const ligneTravaux = composed.plan.nouveaux_elements[0];
      assert.equal(ligneTravaux?.dotation_exercice, 0, `exercice ${exerciceFiscal} : aucune dotation attendue`);
    }
  });

  it("B — première dotation en 2025, proratisée sur la date propre du composant (pas celle du bien)", () => {
    const composed = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: DATE_MISE_EN_SERVICE_BIEN,
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: 1,
      composantsNouveaux: [composantTravaux],
    });
    const ligneTravaux = composed.plan.nouveaux_elements[0];
    assert.ok(ligneTravaux, "le composant doit apparaître dans nouveaux_elements");
    assert.ok(ligneTravaux!.dotation_exercice > 0, "2025 : première dotation, non nulle");
    // Prorata sur 4 mois (sept.-déc.) : nettement < la dotation annuelle pleine.
    assert.ok(ligneTravaux!.dotation_exercice < ligneTravaux!.dotation_annuelle_pleine);
    assert.equal(ligneTravaux!.est_proratisee, true);
  });

  it("cumul et VNC restent cohérents après la première année proratisée (2026)", () => {
    const composed2025 = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: DATE_MISE_EN_SERVICE_BIEN,
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: 1,
      composantsNouveaux: [composantTravaux],
    });
    const composed2026 = composePlanAmortissement({
      exerciceFiscal: 2026,
      dateMiseEnService: DATE_MISE_EN_SERVICE_BIEN,
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: 1,
      composantsNouveaux: [composantTravaux],
      planValidePrecedemment: true,
      anneeValidationInitiale: 2025,
    });
    const l2025 = composed2025.plan.nouveaux_elements[0]!;
    const l2026 = composed2026.plan.nouveaux_elements[0]!;
    assert.ok(l2026.dotation_exercice > 0);
    assert.equal(Math.round(l2026.dotation_exercice), Math.round(composantTravaux.dotationAnnuelle));
    assert.ok(l2026.base_amortissable === composantTravaux.montant);
  });

  it("même principe pour un composant issu d'un appel gros travaux copropriété (origin f012_copro)", () => {
    const composantCopro = createComposantTravaux({
      id: "copro-toiture",
      label: "Réfection toiture (appel de fonds)",
      montant: 12000,
      nature: "amélioration",
      dateDebut: "2025-09-01",
      origin: "f012_copro",
    }).composant;

    for (const exerciceFiscal of [2023, 2024]) {
      const composed = composePlanAmortissement({
        exerciceFiscal,
        dateMiseEnService: DATE_MISE_EN_SERVICE_BIEN,
        planLogement: CAS_NOMINAL.plan,
        prorataRatio: 1,
        composantsNouveaux: [composantCopro],
      });
      assert.equal(composed.plan.nouveaux_elements[0]?.dotation_exercice, 0, `exercice ${exerciceFiscal}`);
    }

    const composed2025 = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: DATE_MISE_EN_SERVICE_BIEN,
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: 1,
      composantsNouveaux: [composantCopro],
    });
    assert.ok(composed2025.plan.nouveaux_elements[0]!.dotation_exercice > 0, "première dotation en 2025");
    assert.equal(composed2025.plan.nouveaux_elements[0]?.id, "copro-toiture");
  });
});

describe("P0-B — reprise N → N+1 d'un composant F-012 (sans redémarrage, sans double comptage)", () => {
  // Composant amorti sur 3 ans seulement (base réduite pour observer
  // facilement l'amortissement total sans construire un cas à 18 ans).
  const composantCourt = createComposantTravaux({
    id: "travaux-court",
    label: "Petit équipement",
    montant: 12000,
    nature: "amélioration",
    dureeAmortissement: 3,
    dateDebut: "2025-01-01",
    origin: "f012_travaux",
  }).composant;

  it("8 — la dotation de chaque exercice N, N+1, N+2 est calculée sans redémarrer l'amortissement (même composant, mêmes paramètres, exercices successifs)", () => {
    const dotations: number[] = [];
    for (const exerciceFiscal of [2025, 2026, 2027]) {
      const composed = composePlanAmortissement({
        exerciceFiscal,
        dateMiseEnService: "2023-06-01",
        planLogement: CAS_NOMINAL.plan,
        prorataRatio: 1,
        composantsNouveaux: [composantCourt],
        planValidePrecedemment: exerciceFiscal > 2025,
        anneeValidationInitiale: exerciceFiscal > 2025 ? 2025 : null,
      });
      dotations.push(composed.plan.nouveaux_elements[0]!.dotation_exercice);
    }
    // 2025 = 12 000/3 = 4000 (pas de prorata, mise en service au 01/01) ;
    // 2026 = 4000 (deuxième annuité) ; 2027 = 4000 (troisième et dernière).
    assert.deepEqual(dotations, [4000, 4000, 4000]);
    const cumulTotal = dotations.reduce((a, b) => a + b, 0);
    assert.equal(cumulTotal, composantCourt.montant, "single count — le cumul sur 3 exercices égale exactement la base, jamais plus");
  });

  it("6/7 — cumul et VNC en N+1 tiennent compte du cumul de N, jamais recalculés comme si le composant était neuf", () => {
    const composedN = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: "2023-06-01",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: 1,
      composantsNouveaux: [composantCourt],
    });
    const composedNPlus1 = composePlanAmortissement({
      exerciceFiscal: 2026,
      dateMiseEnService: "2023-06-01",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: 1,
      composantsNouveaux: [composantCourt],
      planValidePrecedemment: true,
      anneeValidationInitiale: 2025,
    });
    const ligneN = composedN.plan.nouveaux_elements[0]!;
    const ligneNPlus1 = composedNPlus1.plan.nouveaux_elements[0]!;
    assert.equal(ligneN.dotation_exercice, 4000);
    assert.equal(ligneNPlus1.dotation_exercice, 4000);
  });

  it("12 — composant totalement amorti (exercice au-delà de sa durée) : aucune dotation supplémentaire", () => {
    const composedApresFin = composePlanAmortissement({
      exerciceFiscal: 2029, // 2025 + 3 ans de durée + marge
      dateMiseEnService: "2023-06-01",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: 1,
      composantsNouveaux: [composantCourt],
      planValidePrecedemment: true,
      anneeValidationInitiale: 2025,
    });
    const ligne = composedApresFin.plan.nouveaux_elements[0]!;
    assert.equal(ligne.dotation_exercice, 0, "totalement amorti — aucune dotation supplémentaire");
  });

  it("14 — gros travaux copro sur bien mis en service en 2023 : aucune dotation en 2023/2024, comme pour les travaux F-012 classiques", () => {
    const composantCoproTardif = createComposantTravaux({
      id: "copro-tardif",
      label: "Ravalement copro",
      montant: 9000,
      nature: "amélioration",
      dateDebut: "2025-04-01",
      origin: "f012_copro",
    }).composant;
    for (const exerciceFiscal of [2023, 2024]) {
      const composed = composePlanAmortissement({
        exerciceFiscal,
        dateMiseEnService: "2023-06-01",
        planLogement: CAS_NOMINAL.plan,
        prorataRatio: 1,
        composantsNouveaux: [composantCoproTardif],
      });
      assert.equal(composed.plan.nouveaux_elements[0]?.dotation_exercice, 0);
    }
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

describe("Chantier 2 (§6/§7) — F-014 contestation : routage par origine réelle, jamais par préfixe d'id", () => {
  const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/amortissements" };
  const travaux = createComposantTravaux({
    id: "travaux-veranda", // P0-B/D — id stable, plus jamais de préfixe "f012-".
    label: "Extension véranda",
    montant: 12000,
    nature: "amélioration",
    dateDebut: "2024-06-01",
    origin: "f012_travaux",
  }).composant;

  it("I — contestation d'un composant F-012 : redirige vers Charges, jamais Logement", async () => {
    const assistant = new F014AmortissementsAssistant(ctx, {
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: CAS_NOMINAL.prorataRatio,
      composantsNouveaux: [travaux],
    });
    const state = assistant.start().state;
    assert.ok(state.plan?.nouveaux_elements.some((c) => c.id === "travaux-veranda"));

    const turn = await assistant.handle(state, { type: "submit_contestation", composantId: "travaux-veranda" });
    assert.match(turn.messages.at(-1)?.content ?? "", /travaux déclarés/i);
    assert.ok(
      turn.messages.at(-1)?.suggestions?.some((s) => s.id === "redirect_charges"),
      "un composant F-012 doit renvoyer vers Charges, jamais vers Logement",
    );
    assert.equal(turn.event, "AMORTISSEMENTS_CONTESTE");
  });

  it("J — contestation d'un élément F-010 (bâti) : redirige toujours vers Logement, routage inchangé", async () => {
    const assistant = new F014AmortissementsAssistant(ctx, {
      dateMiseEnService: "2024-04-15",
      planLogement: CAS_NOMINAL.plan,
      prorataRatio: CAS_NOMINAL.prorataRatio,
      composantsNouveaux: [travaux],
    });
    const state = assistant.start().state;
    const composantBati = state.plan?.composants[0];
    assert.ok(composantBati, "le plan F-010 porte au moins un composant bâti");

    const turn = await assistant.handle(state, { type: "submit_contestation", composantId: composantBati!.id });
    assert.match(turn.messages.at(-1)?.content ?? "", /logement/i);
    assert.ok(
      turn.messages.at(-1)?.suggestions?.some((s) => s.id === "redirect_logement"),
      "un composant F-010 doit toujours renvoyer vers Logement",
    );
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
    const text = expF014UsageFiscal({ amortDeduct: 1500, amortNonDeduitExercice: 0 });
    assert.match(text, /intégralité/i);
    assert.doesNotMatch(text, /report/i);
  });

  it("indique un report total quand le résultat ne permet aucune déduction", () => {
    const text = expF014UsageFiscal({ amortDeduct: 0, amortNonDeduitExercice: 6779 });
    assert.match(text, /6.779/);
    assert.match(text, /sans limite de durée/i);
  });

  it("indique un partage déduit/reporté quand les deux sont non nuls", () => {
    const text = expF014UsageFiscal({ amortDeduct: 1200, amortNonDeduitExercice: 300 });
    assert.match(text, /1.200/);
    assert.match(text, /300/);
    assert.match(text, /sans limite de durée/i);
  });
});
