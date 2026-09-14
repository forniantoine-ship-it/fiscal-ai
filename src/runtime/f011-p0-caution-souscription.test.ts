/**
 * F-011-1 (P0) — commission de caution / frais de dossier ne sont déductibles
 * que l'année de souscription du prêt (KS "F-011 — Assistant Financement",
 * tableau "Modèle prêt" : `commission_caution` "Déductible l'année de
 * souscription" ; `frais_dossier` idem).
 *
 * Bug corrigé : `computePret` (compute-financement-exercice.ts) traitait
 * `anneeSouscription === undefined` comme "souscrit cette année" (vrai) au
 * lieu de "année de souscription inconnue/différente" (faux) — un prêt
 * ancien (`souscritCetExercice: false` côté assistant, qui produit
 * `anneeSouscription: undefined`) voyait sa commission de caution déduite à
 * chaque exercice où il apparaît, pas seulement l'année de sa souscription.
 *
 * Run: npx tsx --test src/runtime/f011-p0-caution-souscription.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeFinancementExercice, type PretInput } from "./capabilities/f011/compute-financement-exercice";

function basePret(overrides: Partial<PretInput> = {}): PretInput {
  return {
    pretId: "p1",
    typePret: "amortissable",
    capitalInitial: 150_000,
    tauxNominal: 0.02,
    dureeMois: 240,
    datePremiereMensualite: "2020-02-01",
    ...overrides,
  };
}

describe("F-011-1 — A : caution + prêt non souscrit cet exercice → garantieDeductible = 0", () => {
  it("anneeSouscription undefined (souscritCetExercice=false) ne déduit jamais la commission de caution", () => {
    const out = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2020-01-01",
      prets: [basePret({ garantieDeductible: 1500, anneeSouscription: undefined })],
    });
    assert.equal(out.charges.prets[0]!.garantieDeductible, 0);
  });

  it("anneeSouscription connue mais différente de l'exercice courant ne déduit pas non plus", () => {
    const out = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2020-01-01",
      prets: [basePret({ garantieDeductible: 1500, anneeSouscription: 2020 })],
    });
    assert.equal(out.charges.prets[0]!.garantieDeductible, 0);
  });
});

describe("F-011-1 — B : totalChargesFinancementExercice n'inclut pas une caution hors exercice de souscription", () => {
  it("le total exclut les 1500 € de commission quand le prêt n'a pas été souscrit cet exercice", () => {
    const withCaution = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2020-01-01",
      prets: [basePret({ garantieDeductible: 1500, anneeSouscription: undefined })],
    });
    const withoutCaution = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2020-01-01",
      prets: [basePret({ garantieDeductible: undefined, anneeSouscription: undefined })],
    });
    assert.equal(
      withCaution.charges.totalChargesFinancementExercice,
      withoutCaution.charges.totalChargesFinancementExercice,
      "la présence d'une caution hors exercice de souscription ne doit strictement rien changer au total",
    );
  });
});

describe("F-011-1 — C : caution + prêt souscrit cet exercice → garantieDeductible = montant, comportement inchangé", () => {
  it("anneeSouscription === exerciceFiscal (souscritCetExercice=true) déduit intégralement la commission", () => {
    const out = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-01-01",
      prets: [basePret({ datePremiereMensualite: "2024-02-01", garantieDeductible: 1500, anneeSouscription: 2024 })],
    });
    assert.equal(out.charges.prets[0]!.garantieDeductible, 1500);
    assert.ok(
      out.charges.totalChargesFinancementExercice >= 1500,
      "le total inclut bien la commission de caution l'année de souscription",
    );
  });
});

describe("F-011-1 — D : frais de dossier — même contrat que la caution, comportement existant préservé", () => {
  it("frais de dossier non déduits quand le prêt n'est pas souscrit cet exercice", () => {
    const out = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2020-01-01",
      prets: [basePret({ fraisDossier: 800, anneeSouscription: undefined })],
    });
    assert.equal(out.charges.prets[0]!.fraisDossierDeductibles, 0);
  });

  it("frais de dossier déduits l'année de souscription (comportement déjà correct, non régressé)", () => {
    const out = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-01-01",
      prets: [basePret({ datePremiereMensualite: "2024-02-01", fraisDossier: 800, anneeSouscription: 2024 })],
    });
    assert.equal(out.charges.prets[0]!.fraisDossierDeductibles, 800);
  });
});

describe("F-011-1 — E : aucune garantie → aucune régression", () => {
  it("un prêt sans garantie ni frais de dossier produit garantieDeductible=0/fraisDossierDeductibles=0, quel que soit anneeSouscription", () => {
    const withYear = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2020-01-01",
      prets: [basePret({ anneeSouscription: 2024 })],
    });
    const withoutYear = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2020-01-01",
      prets: [basePret({ anneeSouscription: undefined })],
    });
    assert.equal(withYear.charges.prets[0]!.garantieDeductible, 0);
    assert.equal(withYear.charges.prets[0]!.fraisDossierDeductibles, 0);
    assert.equal(withoutYear.charges.prets[0]!.garantieDeductible, 0);
    assert.equal(withoutYear.charges.prets[0]!.fraisDossierDeductibles, 0);
    assert.equal(withYear.charges.totalChargesFinancementExercice, withoutYear.charges.totalChargesFinancementExercice);
  });
});

describe("F-011-1 — F : multi-prêts — seule la caution du prêt souscrit cet exercice est déductible", () => {
  it("un prêt N (souscrit cette année) + un prêt ancien (souscrit une année passée) : seule la caution du prêt N est déduite", () => {
    const out = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2020-01-01",
      prets: [
        basePret({
          pretId: "pret-ancien",
          datePremiereMensualite: "2018-03-01",
          garantieDeductible: 900,
          anneeSouscription: undefined, // souscritCetExercice=false
        }),
        basePret({
          pretId: "pret-nouveau",
          capitalInitial: 80_000,
          datePremiereMensualite: "2024-05-01",
          garantieDeductible: 1500,
          anneeSouscription: 2024, // souscritCetExercice=true
        }),
      ],
    });

    const ancien = out.charges.prets.find((p) => p.pretId === "pret-ancien")!;
    const nouveau = out.charges.prets.find((p) => p.pretId === "pret-nouveau")!;

    assert.equal(ancien.garantieDeductible, 0, "la caution du prêt ancien n'est jamais redéduite hors de son exercice de souscription");
    assert.equal(nouveau.garantieDeductible, 1500, "la caution du prêt souscrit cette année reste déductible");
    assert.equal(
      out.charges.totalChargesFinancementExercice,
      out.charges.prets.reduce(
        (acc, p) => acc + p.interetsEmpruntExercice + p.assuranceEmpruntExercice + p.fraisDossierDeductibles + p.garantieDeductible + p.iraDeductible,
        0,
      ),
    );
  });
});
