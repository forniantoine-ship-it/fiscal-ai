import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { amortizeMobilier } from "./capabilities/f010/amortize-mobilier";
import { assemblePlan } from "./capabilities/f010/assemble-plan";
import { computeAmortizationPlan } from "./capabilities/f010/compute-amortization-plan";
import { computePrixRevient } from "./capabilities/f010/compute-prix-revient";
import { decomposeBati } from "./capabilities/f010/decompose-bati";
import { estimateMobilier } from "./capabilities/f010/estimate-mobilier";
import { prorataPremiereAnnee } from "./capabilities/f010/prorata-premiere-annee";
import {
  suggestRatioTerrain,
  validateRatioTerrain,
} from "./capabilities/f010/ratio-terrain";
import { suggestFrais } from "./capabilities/f010/suggest-frais";
import { validatePlan } from "./capabilities/f010/validate-plan";
import { ventilationTerrainBati } from "./capabilities/f010/ventilation-terrain-bati";

describe("F-010 — chaîne de calcul (cas nominal KS, acte 280 000 €)", () => {
  it("produit un plan cohérent via computeAmortizationPlan", () => {
    const result = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2024,
    });

    assert.equal(result.prixRevient, 299500);
    assert.equal(result.montantMobilierIsole, 0);
    assert.equal(result.valeurTerrain, 44925);
    assert.equal(result.valeurBati, 254575);
    assert.equal(result.baseAmortissableBati, 254575);
    assert.equal(result.plan.lignes.length, 6);
    assert.equal(result.planValide, true);
    assert.equal(result.anomalies.filter((a) => a.severity === "fatal").length, 0);
    for (const ligne of result.plan.lignes) {
      assert.ok(ligne.vnc >= 0);
    }
  });

  it("produit un plan cohérent étape par étape", () => {
    const prix = computePrixRevient({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    assert.equal(prix.prixRevient, 299500);
    assert.equal(prix.montantMobilierIsole, 0);
    assert.equal(prix.anomalies.filter((a) => a.severity === "fatal").length, 0);

    const ventilation = ventilationTerrainBati({
      prixRevient: prix.prixRevient,
      montantMobilierIsole: 0,
      ratioTerrain: 0.15,
    });
    assert.equal(ventilation.valeurTerrain, 44925);
    assert.equal(ventilation.valeurBati, 254575);
    assert.equal(ventilation.baseAmortissableBati, 254575);
    assert.equal(ventilation.anomalies.filter((a) => a.severity === "fatal").length, 0);

    const decompose = decomposeBati({
      baseAmortissableBati: ventilation.baseAmortissableBati,
      typeBien: "appartement",
    });
    assert.equal(decompose.composants.length, 6);
    const sommeComposants = decompose.composants.reduce((acc, c) => acc + c.montant, 0);
    assert.ok(Math.abs(sommeComposants - 254575) < 0.01);
    assert.equal(decompose.anomalies.filter((a) => a.severity === "fatal").length, 0);

    const mobilier = amortizeMobilier({ montantMobilierTotal: 0, mode: "lot" });
    assert.equal(mobilier.composants.length, 0);

    const prorata = prorataPremiereAnnee({
      composantsBati: decompose.composants,
      composantsMobilier: mobilier.composants,
      dateDebutAmortissement: "2024-04-15",
      methodeProrata: "jours",
      exerciceFiscal: 2024,
    });
    assert.ok(prorata.ratio > 0 && prorata.ratio < 1);
    for (const d of prorata.dotationsAnnee1) {
      const composant = decompose.composants.find((c) => c.label === d.label);
      assert.ok(composant);
      assert.ok(d.dotationProratisee <= composant!.dotationAnnuelle + 0.01);
    }

    const assemble = assemblePlan({
      composantsBati: decompose.composants,
      composantsMobilier: mobilier.composants,
      dotationsAnnee1: prorata.dotationsAnnee1,
      premiereAnnee: 2024,
      exerciceFiscal: 2024,
    });
    assert.equal(assemble.plan.lignes.length, 6);
    assert.ok(Math.abs(assemble.plan.totalBrut - 254575) < 0.01);
    for (const ligne of assemble.plan.lignes) {
      assert.ok(ligne.vnc >= 0);
    }

    const validate = validatePlan({
      plan: assemble.plan,
      baseAmortissableBati: ventilation.baseAmortissableBati,
      montantMobilierTotal: 0,
    });
    assert.equal(validate.planValide, true);
    assert.equal(validate.anomalies.filter((a) => a.severity === "fatal").length, 0);
  });
});

describe("F-010 — gardes du Knowledge System", () => {
  it("TRF-0001 : frais déduits sortent le montant du prix de revient", () => {
    const prix = computePrixRevient({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "deduction",
    });
    assert.equal(prix.prixRevient, 280000);
    assert.equal(prix.fraisEnCharges, 19500);
  });

  it("TRF-0001 : isole le mobilier inclus dans le prix", () => {
    const prix = computePrixRevient({
      prixAcquisition: 280000,
      mobilierInclus: true,
      montantMobilier: 15000,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    assert.equal(prix.montantMobilierIsole, 15000);
    assert.equal(prix.prixRevient, 284500);
  });

  it("TRF-0009 : une grille dont la somme ≠ 100 % est fatale", () => {
    const decompose = decomposeBati({
      baseAmortissableBati: 200000,
      typeBien: "appartement",
      grilleOverride: [
        { label: "A", pourcentage: 50, dureeAnnees: 50 },
        { label: "B", pourcentage: 40, dureeAnnees: 25 },
      ],
    });
    assert.ok(decompose.anomalies.some((a) => a.severity === "fatal"));
  });

  it("TRF-0014 : total brut incohérent avec la base est fatal", () => {
    const validate = validatePlan({
      plan: {
        lignes: [
          {
            label: "Gros œuvre",
            montant: 100000,
            dureeAnnees: 50,
            dotationExercice: 2000,
            amortissementsCumules: 2000,
            vnc: 98000,
          },
        ],
        totalAnnuelExercice: 2000,
        totalBrut: 100000,
      },
      baseAmortissableBati: 254575,
      montantMobilierTotal: 0,
    });
    assert.equal(validate.planValide, false);
    assert.ok(validate.anomalies.some((a) => a.severity === "fatal"));
  });

  it("TRF-0002 : la maison utilise la Grille B (8 composants)", () => {
    const decompose = decomposeBati({
      baseAmortissableBati: 200000,
      typeBien: "maison",
    });
    assert.equal(decompose.composants.length, 8);
    const somme = decompose.composants.reduce((acc, c) => acc + c.montant, 0);
    assert.ok(Math.abs(somme - 200000) < 0.01);
  });
});

describe("F-010 — estimations et suggestions (SAV / JUG)", () => {
  it("SAV-002 : suggère ~7,5 % de frais pour un bien ancien", () => {
    const frais = suggestFrais({ prixAcquisition: 280000, natureBien: "ancien" });
    assert.equal(frais.tauxSuggere, 0.075);
    assert.equal(frais.montantSuggere, 21000);
  });

  it("SAV-003 + JUG-002 : suggère le ratio terrain selon type + localisation", () => {
    const ratio = suggestRatioTerrain({
      typeBien: "appartement",
      localisation: "grande_metropole",
    });
    assert.equal(ratio.ratioSuggere, 0.25);
    assert.equal(ratio.min, 0.15);
    assert.equal(ratio.max, 0.35);
  });

  it("JUG-002 : ratio hors fourchette produit un avertissement non bloquant", () => {
    const validation = validateRatioTerrain({
      typeBien: "appartement",
      localisation: "zone_rurale",
      ratioTerrain: 0.45,
    });
    assert.equal(validation.inFourchette, false);
    assert.ok(validation.anomalies.every((a) => a.severity === "warning"));
  });

  it("JUG-003 : mobilier > 30 % du prix est bloquant", () => {
    const mobilier = estimateMobilier({
      montantMobilier: 100000,
      prixAcquisition: 280000,
    });
    assert.equal(mobilier.credible, false);
    assert.ok(mobilier.anomalies.some((a) => a.severity === "fatal"));
  });
});

describe("F-010 — P0 : le prorata première année est ancré sur l'année de mise en service, jamais sur l'exercice interrogé", () => {
  const NOMINAL = {
    prixAcquisition: 280000,
    mobilierInclus: false,
    fraisNotaire: 19500,
    choixTraitementFrais: "integration" as const,
    typeBien: "appartement" as const,
    ratioTerrain: 0.15,
    dateMiseEnService: "2024-04-15",
  };

  it("mise en service = exercice (2024) : le prorata (< 1) est appliqué", () => {
    const r = computeAmortizationPlan({ ...NOMINAL, exerciceFiscal: 2024 });
    assert.equal(r.prorataRatio, 0.7104);
    const grosOeuvre = r.plan.lignes.find((l) => l.label === "Gros œuvre")!;
    assert.equal(grosOeuvre.dotationExercice, 1808.5);
    assert.equal(grosOeuvre.amortissementsCumules, 1808.5);
  });

  it("régression HEAD d600d40 : N+1/N+2 sont des années pleines, le ratio de première année ne varie jamais avec l'exercice interrogé", () => {
    const y2024 = computeAmortizationPlan({ ...NOMINAL, exerciceFiscal: 2024 });
    const y2025 = computeAmortizationPlan({ ...NOMINAL, exerciceFiscal: 2025 });
    const y2026 = computeAmortizationPlan({ ...NOMINAL, exerciceFiscal: 2026 });

    // Avant correction, prorataRatio retombait à 1 dès que exerciceFiscal != 2024.
    assert.equal(y2025.prorataRatio, y2024.prorataRatio);
    assert.equal(y2026.prorataRatio, y2024.prorataRatio);

    const g2025 = y2025.plan.lignes.find((l) => l.label === "Gros œuvre")!;
    const g2026 = y2026.plan.lignes.find((l) => l.label === "Gros œuvre")!;

    // Année pleine sur l'exercice courant...
    assert.equal(g2025.dotationExercice, 2545.75);
    assert.equal(g2026.dotationExercice, 2545.75);

    // ...mais le cumul intègre le VRAI prorata 2024 (1808.5), jamais une
    // année 2024 recalculée à tort comme pleine (le HEAD d600d40 produisait
    // 5091.5 en 2025 et 7637.25 en 2026 — un historique réécrit).
    assert.equal(g2025.amortissementsCumules, 4354.25);
    assert.equal(g2026.amortissementsCumules, 6900);
  });

  it("mise en service postérieure à l'exercice interrogé : dotation et cumul nuls (comportement assemblePlan existant, non affecté)", () => {
    const r = computeAmortizationPlan({ ...NOMINAL, exerciceFiscal: 2023 });
    const grosOeuvre = r.plan.lignes.find((l) => l.label === "Gros œuvre")!;
    assert.equal(grosOeuvre.dotationExercice, 0);
    assert.equal(grosOeuvre.amortissementsCumules, 0);
  });

  it("dernière année de durée : complément exact (VNC = 0) ; exercice suivant : dotation nulle, composant terminé", () => {
    const base = { ...NOMINAL, mobilierInclus: true, montantMobilier: 8000, mobilierMode: "lot" as const };
    const derniereAnnee = computeAmortizationPlan({ ...base, exerciceFiscal: 2031 });
    const apresDuree = computeAmortizationPlan({ ...base, exerciceFiscal: 2032 });
    const mobilierDerniereAnnee = derniereAnnee.plan.lignes.find((l) => l.label === "Mobilier (lot)")!;
    const mobilierApresDuree = apresDuree.plan.lignes.find((l) => l.label === "Mobilier (lot)")!;

    assert.equal(mobilierDerniereAnnee.amortissementsCumules, 8000);
    assert.equal(mobilierDerniereAnnee.vnc, 0);
    assert.equal(mobilierApresDuree.dotationExercice, 0);
    assert.equal(mobilierApresDuree.amortissementsCumules, 8000);
  });

  it("date de mise en service absente/invalide : comportement existant conservé (anomalie fatale, ratio 0)", () => {
    const composant = { label: "X", montant: 10000, dureeAnnees: 10, dotationAnnuelle: 1000 };
    const prorata = prorataPremiereAnnee({
      composantsBati: [composant],
      composantsMobilier: [],
      dateDebutAmortissement: "invalide",
      methodeProrata: "jours",
      exerciceFiscal: 2024,
    });
    assert.equal(prorata.ratio, 0);
    assert.deepEqual(prorata.dotationsAnnee1, []);
    assert.ok(prorata.anomalies.some((a) => a.severity === "fatal"));
  });

  it("année bissextile : le ratio de première année reste cohérent et invariant quel que soit l'exercice interrogé", () => {
    const composant = { label: "X", montant: 10000, dureeAnnees: 10, dotationAnnuelle: 1000 };
    // 2024 est bissextile ; mise en service le 1er mars 2024.
    const vueDepuis2024 = prorataPremiereAnnee({
      composantsBati: [composant],
      composantsMobilier: [],
      dateDebutAmortissement: "2024-03-01",
      methodeProrata: "jours",
      exerciceFiscal: 2024,
    });
    const vueDepuis2026 = prorataPremiereAnnee({
      composantsBati: [composant],
      composantsMobilier: [],
      dateDebutAmortissement: "2024-03-01",
      methodeProrata: "jours",
      exerciceFiscal: 2026,
    });
    assert.equal(vueDepuis2024.ratio, vueDepuis2026.ratio);
    assert.equal(vueDepuis2024.ratio, 0.8333);
  });

  it("F-014 (composantsNouveaux) : le call site partagé bénéficie de la même correction", () => {
    const composant = { label: "X", montant: 10000, dureeAnnees: 10, dotationAnnuelle: 1000 };
    const y2024 = prorataPremiereAnnee({
      composantsBati: [composant],
      composantsMobilier: [],
      dateDebutAmortissement: "2024-06-01",
      methodeProrata: "mois",
      exerciceFiscal: 2024,
    });
    const y2025 = prorataPremiereAnnee({
      composantsBati: [composant],
      composantsMobilier: [],
      dateDebutAmortissement: "2024-06-01",
      methodeProrata: "mois",
      exerciceFiscal: 2025,
    });
    assert.equal(y2025.ratio, y2024.ratio);
  });
});
