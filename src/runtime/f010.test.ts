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
