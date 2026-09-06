/**
 * MICRO-JALON socle patrimonial P0 — registre patrimonial d'immobilisations
 * unifié (F-010 + F-012, jamais F-014 recalculé).
 * Run: npx tsx --test src/runtime/bilan-immobilisations.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assembleRegistreImmobilisationsPatrimoniales } from "./capabilities/bilan/assemble-immobilisations-patrimoniales";
import type { ImmobilisationsRfs } from "./capabilities/rfs/types";

const IMMO_REFERENCE: ImmobilisationsRfs = {
  lignes: [
    { label: "Gros œuvre", montant: 37186.1, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814.1 },
    { label: "Mobilier - Pack meubles", montant: 5400.1, dureeAnnees: 7, dotationExercice: 491, amortissementsCumules: 491, vnc: 4909.1 },
  ],
  totalAnnuelExercice: 863,
  totalBrut: 42586.2,
  valeurTerrain: 17960.39,
};

describe("assembleRegistreImmobilisationsPatrimoniales", () => {
  it("rfs.immobilisations absent → brut/net non fiables, aucune donnée inventée", () => {
    const registre = assembleRegistreImmobilisationsPatrimoniales({ immobilisations: undefined, amortCalcule: 0 });
    assert.equal(registre.brutFiable, false);
    assert.equal(registre.netFiable, false);
    assert.equal(registre.brutTotal, undefined);
    assert.equal(registre.netTotal, undefined);
  });

  it("F-010 seul, sans composant nouveau, aucune divergence : brut et net fiables, valeurs identiques au calcul existant de map-2033a.ts", () => {
    const registre = assembleRegistreImmobilisationsPatrimoniales({ immobilisations: IMMO_REFERENCE, amortCalcule: IMMO_REFERENCE.totalAnnuelExercice });
    assert.equal(registre.brutFiable, true);
    assert.equal(registre.netFiable, true);
    assert.equal(registre.brutTotal, 60546.59); // 42586.2 + 17960.39
    const cumule = 372 + 491;
    assert.equal(registre.netTotal, registre.brutTotal! - cumule);
  });

  it("valeurTerrain absent → brut et net non fiables (comme le mapper existant)", () => {
    const sansTerrain: ImmobilisationsRfs = { lignes: IMMO_REFERENCE.lignes, totalAnnuelExercice: IMMO_REFERENCE.totalAnnuelExercice, totalBrut: IMMO_REFERENCE.totalBrut };
    const registre = assembleRegistreImmobilisationsPatrimoniales({ immobilisations: sansTerrain, amortCalcule: IMMO_REFERENCE.totalAnnuelExercice });
    assert.equal(registre.brutFiable, false);
    assert.equal(registre.netFiable, false);
  });

  it("divergence F-010/F-014 inexpliquée (aucun composant nouveau connu) → brut ET net non fiables, comportement conservateur inchangé", () => {
    const registre = assembleRegistreImmobilisationsPatrimoniales({ immobilisations: IMMO_REFERENCE, amortCalcule: IMMO_REFERENCE.totalAnnuelExercice + 500 });
    assert.equal(registre.brutFiable, false);
    assert.equal(registre.netFiable, false);
  });

  it("composant nouveau F-012 présent : BRUT devient fiable (somme de montants déjà connus), NET reste non fiable (cumulé individuel non exposé)", () => {
    const immoAvecTravaux: ImmobilisationsRfs = {
      ...IMMO_REFERENCE,
      composantsNouveaux: [{ label: "Réfection toiture", montant: 8000, dureeAnnees: 18, dotationAnnuelle: 444.44, nature: "amélioration", dateDebut: "2015-01-01" }],
    };
    // amortCalcule = F-010 seul + dotation du composant nouveau (première année pleine, exemple simplifié)
    const registre = assembleRegistreImmobilisationsPatrimoniales({
      immobilisations: immoAvecTravaux,
      amortCalcule: IMMO_REFERENCE.totalAnnuelExercice + 444.44,
    });
    assert.equal(registre.brutFiable, true, "le brut d'un composant nouveau est toujours connu (ComposantNouveau.montant) — jamais bloqué pour cette seule raison");
    assert.equal(registre.brutTotal, round2(IMMO_REFERENCE.totalBrut + IMMO_REFERENCE.valeurTerrain! + 8000));
    assert.equal(registre.netFiable, false, "le cumulé individuel d'un composant nouveau n'est pas exposé à la RFS aujourd'hui — net non fiable, jamais approximé");
    assert.equal(registre.netTotal, undefined);
    assert.ok(registre.raisons.some((r) => r.includes("composant nouveau")));
    const actifTravaux = registre.actifs.find((a) => a.label === "Réfection toiture");
    assert.ok(actifTravaux, "le composant nouveau doit apparaître dans le registre unifié");
    assert.equal(actifTravaux?.coutBrut, 8000);
    assert.equal(actifTravaux?.amortissementCumule, undefined);
  });

  it("le mobilier n'est jamais compté deux fois : montantMobilier n'existe pas dans cette fixture, mais si présent, ne doit jamais s'ajouter au brut (déjà inclus dans totalBrut via les lignes)", () => {
    const immoAvecMobilierIsole: ImmobilisationsRfs = { ...IMMO_REFERENCE, montantMobilier: 5400.1 };
    const registre = assembleRegistreImmobilisationsPatrimoniales({ immobilisations: immoAvecMobilierIsole, amortCalcule: IMMO_REFERENCE.totalAnnuelExercice });
    // Le brut doit rester IDENTIQUE à la fixture sans montantMobilier — la
    // ligne "Mobilier - Pack meubles" (5400.1) est déjà dans totalBrut ;
    // ajouter montantMobilier une seconde fois doublerait sa valeur.
    assert.equal(registre.brutTotal, 60546.59, "montantMobilier ne doit jamais être additionné séparément : déjà inclus dans totalBrut via les lignes F-010");
  });
});

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
