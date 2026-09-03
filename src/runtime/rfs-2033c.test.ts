/**
 * Cycle 55 — projection Cerfa 2033-C-SD (Immobilisations — Amortissements)
 * depuis la RFS. Périmètre strictement limité aux 3 cases validées au
 * Cycle 54 : 572 (dotations de l'exercice), 496 (valeur brute fin
 * d'exercice), 576 (amortissements cumulés fin d'exercice).
 * Run: npx tsx --test src/runtime/rfs-2033c.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { map2033CFromRfs } from "./capabilities/rfs/projection/map-2033c";
import { map2033AFromRfs } from "./capabilities/rfs/projection/map-2033a";
import { assembleLiasseFromRfs } from "./capabilities/rfs/projection/assemble-liasse-from-rfs";
import { buildFiscalRepresentation } from "./capabilities/rfs/build-fiscal-representation";
import { computeAmortizationPlan } from "./capabilities/f010/compute-amortization-plan";
import { round2 } from "./capabilities/f007/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { ImmobilisationsRfs, FiscalRepresentation } from "./capabilities/rfs/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: {
      totalDeductible: 2000,
      chargesExploitation: 2000,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalNonDeductible: 0,
    },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
}

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Elsa Bouvard" };

function rfs(fr: FiscalResult, immobilisations?: ImmobilisationsRfs): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    immobilisations,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

function findCase(form: ReturnType<typeof map2033CFromRfs>, caseId: string) {
  return form.cases.find((c) => c.caseId === caseId);
}
function findBlocked(form: ReturnType<typeof map2033CFromRfs>, caseId: string) {
  return form.casesNonAlimentees.find((c) => c.caseId === caseId);
}

// Fixture reproduisant le dossier de référence (Elsa Bouvard, déjà validée Cycle 35/47).
const IMMO_REFERENCE: ImmobilisationsRfs = {
  lignes: [
    { label: "Gros œuvre", montant: 37186.1, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814.1 },
    { label: "Toiture", montant: 6610.86, dureeAnnees: 30, dotationExercice: 165, amortissementsCumules: 165, vnc: 6445.86 },
    { label: "Étanchéité", montant: 5784.5, dureeAnnees: 20, dotationExercice: 217, amortissementsCumules: 217, vnc: 5567.5 },
    { label: "Installation électrique", montant: 4958.15, dureeAnnees: 25, dotationExercice: 148, amortissementsCumules: 148, vnc: 4810.15 },
    { label: "Installation et agencement", montant: 47235.9, dureeAnnees: 15, dotationExercice: 2327, amortissementsCumules: 2327, vnc: 44908.9 },
    { label: "Mobilier - Pack meubles", montant: 5400.1, dureeAnnees: 7, dotationExercice: 491, amortissementsCumules: 491, vnc: 4909.1 },
  ],
  totalAnnuelExercice: 3720,
  totalBrut: 107175.61,
  valeurTerrain: 17960.39,
  montantMobilier: 5400.1,
};

// =====================================================================
// Case 572 — Dotations de l'exercice
// =====================================================================
describe("Cycle 55 — case 572 : Dotations de l'exercice", () => {
  it("572 = fiscalResult.amortCalcule exactement, sur une valeur positive", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: 3720 })));
    assert.equal(findCase(form, "572")?.value, 3720);
  });

  it("amortCalcule = 0 → 572 alimentée à 0, jamais bloquée", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: 0 })));
    assert.equal(findCase(form, "572")?.value, 0);
    assert.equal(findBlocked(form, "572"), undefined);
  });

  it("572 ne dépend jamais de rfs.immobilisations (alimentée même quand immo est absent)", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: 1234 })));
    assert.equal(findCase(form, "572")?.value, 1234);
  });

  it("572 n'est jamais confondue avec amortDeduct ou amortReporte", () => {
    const fr = fiscalResult({ amortCalcule: 3720, amortDeduct: 1000, amortReporte: 2720 });
    const form = map2033CFromRfs(rfs(fr));
    assert.equal(findCase(form, "572")?.value, 3720);
    assert.doesNotMatch(findCase(form, "572")!.trace.path, /amortDeduct|amortReporte/);
  });
});

// =====================================================================
// Case 426 — Terrains, fin d'exercice (Cycle 57)
// =====================================================================
describe("Cycle 57 — case 426 : Terrains — valeur brute fin d'exercice", () => {
  it("426 = rfs.immobilisations.valeurTerrain exactement, sur une valeur positive", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    assert.equal(findCase(form, "426")?.value, 17960.39);
  });

  it("valeurTerrain = 0 → 426 alimentée à 0, jamais bloquée (0 est une vraie valeur, pas une absence)", () => {
    const immoTerrainNul: ImmobilisationsRfs = { ...IMMO_REFERENCE, valeurTerrain: 0 };
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), immoTerrainNul));
    assert.equal(findCase(form, "426")?.value, 0);
    assert.equal(findBlocked(form, "426"), undefined);
  });

  it("valeurTerrain absente (rfs.immobilisations présent sans le champ) → 426 non alimentée", () => {
    const immoSansTerrain: ImmobilisationsRfs = {
      lignes: IMMO_REFERENCE.lignes,
      totalAnnuelExercice: IMMO_REFERENCE.totalAnnuelExercice,
      totalBrut: IMMO_REFERENCE.totalBrut,
      // valeurTerrain volontairement absent
    };
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), immoSansTerrain));
    assert.equal(findCase(form, "426"), undefined);
    assert.equal(findBlocked(form, "426")?.categorie, "donnee_absente");
  });

  it("rfs.immobilisations totalement absent → 426 non alimentée", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: 1500 })));
    assert.equal(findCase(form, "426"), undefined);
    assert.equal(findBlocked(form, "426")?.categorie, "donnee_absente");
  });

  it("cohérence avec 496 : 426 (terrain seul) est inférieure ou égale à 496 (brut total), et 496 − 426 = totalBrut (invariant de cohérence, pas une nouvelle formule)", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    const case426 = findCase(form, "426")?.value as number;
    const case496 = findCase(form, "496")?.value as number;
    assert.ok(case426 <= case496);
    assert.equal(round2(case496 - case426), round2(IMMO_REFERENCE.totalBrut));
  });

  it("non-dépendance F-010/F-014 : 426 reste alimentée même quand amortCalcule diverge de totalAnnuelExercice (496/576 se bloquent, 426 non)", () => {
    const representation = rfs(fiscalResult({ amortCalcule: 999999 }), IMMO_REFERENCE);
    const form = map2033CFromRfs(representation);
    // La garde bloque bien 496/576 (déjà prouvé Cycle 55) :
    assert.equal(findCase(form, "496"), undefined);
    assert.equal(findCase(form, "576"), undefined);
    // Mais 426 reste alimentée avec la valeur exacte du terrain, inchangée :
    assert.equal(findCase(form, "426")?.value, 17960.39);
    assert.equal(findBlocked(form, "426"), undefined);
  });
});

// =====================================================================
// Case 476 — Mobilier, fin d'exercice (Cycle 58)
// =====================================================================
describe("Cycle 58 — case 476 : Autres immobilisations corporelles (Mobilier) — valeur brute fin d'exercice", () => {
  it("476 = rfs.immobilisations.montantMobilier exactement, sur une valeur positive", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    assert.equal(findCase(form, "476")?.value, 5400.1);
  });

  it("montantMobilier = 0 → 476 alimentée à 0, jamais bloquée (0 est une vraie valeur, pas une absence)", () => {
    const immoMobilierNul: ImmobilisationsRfs = { ...IMMO_REFERENCE, montantMobilier: 0 };
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), immoMobilierNul));
    assert.equal(findCase(form, "476")?.value, 0);
    assert.equal(findBlocked(form, "476"), undefined);
  });

  it("montantMobilier absent (rfs.immobilisations présent sans le champ) → 476 non alimentée", () => {
    const immoSansMobilier: ImmobilisationsRfs = {
      lignes: IMMO_REFERENCE.lignes,
      totalAnnuelExercice: IMMO_REFERENCE.totalAnnuelExercice,
      totalBrut: IMMO_REFERENCE.totalBrut,
      valeurTerrain: IMMO_REFERENCE.valeurTerrain,
      // montantMobilier volontairement absent
    };
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), immoSansMobilier));
    assert.equal(findCase(form, "476"), undefined);
    assert.equal(findBlocked(form, "476")?.categorie, "donnee_absente");
  });

  it("rfs.immobilisations totalement absent → 476 non alimentée", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: 1500 })));
    assert.equal(findCase(form, "476"), undefined);
    assert.equal(findBlocked(form, "476")?.categorie, "donnee_absente");
  });

  it("non-dépendance F-010/F-014 : 476 reste alimentée même quand amortCalcule diverge de totalAnnuelExercice (496/576 se bloquent, 476 non)", () => {
    const representation = rfs(fiscalResult({ amortCalcule: 999999 }), IMMO_REFERENCE);
    const form = map2033CFromRfs(representation);
    // La garde bloque bien 496/576 (déjà prouvé Cycle 55) :
    assert.equal(findCase(form, "496"), undefined);
    assert.equal(findCase(form, "576"), undefined);
    // Mais 476 reste alimentée avec la valeur exacte du mobilier, inchangée :
    assert.equal(findCase(form, "476")?.value, 5400.1);
    assert.equal(findBlocked(form, "476"), undefined);
  });

  it("non-heuristique : 476 n'utilise jamais totalBrut ni une ventilation des lignes par libellé (« Mobilier »)", () => {
    // Un dossier où le libellé « Mobilier » existe dans `lignes` mais où
    // `montantMobilier` n'a pas été transmis ne doit produire AUCUNE
    // valeur 476 déduite du libellé — la seule source valide est le champ
    // explicite `montantMobilier`.
    const immoSansMobilierExplicite: ImmobilisationsRfs = {
      lignes: IMMO_REFERENCE.lignes, // contient toujours la ligne "Mobilier - Pack meubles"
      totalAnnuelExercice: IMMO_REFERENCE.totalAnnuelExercice,
      totalBrut: IMMO_REFERENCE.totalBrut,
      valeurTerrain: IMMO_REFERENCE.valeurTerrain,
    };
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), immoSansMobilierExplicite));
    assert.equal(findCase(form, "476"), undefined, "476 ne doit jamais être déduite du libellé d'une ligne");
  });

  it("non-duplication : la présence de 476 ne modifie ni fiscalResult, ni les cases 572/496/576/426", () => {
    const fr = fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice });
    const representation = rfs(fr, IMMO_REFERENCE);
    const form = map2033CFromRfs(representation);
    assert.equal(findCase(form, "572")?.value, fr.amortCalcule);
    assert.equal(findCase(form, "426")?.value, IMMO_REFERENCE.valeurTerrain);
    assert.equal(findCase(form, "496")?.value, round2(IMMO_REFERENCE.totalBrut + (IMMO_REFERENCE.valeurTerrain as number)));
    // fiscalResult n'est référencé nulle part par la trace de la case 476 :
    assert.doesNotMatch(findCase(form, "476")!.trace.path, /fiscalResult|amortCalcule|charges/);
  });
});

// =====================================================================
// Cases 496/576 — Valeur brute et amortissements cumulés, fin d'exercice
// =====================================================================
describe("Cycle 55 — cases 496/576 : dossier réel, garde F-010/F-014 satisfaite", () => {
  it("496 ≈ 125 136 € (dossier de référence)", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    const case496 = findCase(form, "496")?.value as number;
    assert.ok(Math.abs(case496 - 125136) < 1, `496 attendu ≈ 125136, obtenu ${case496}`);
    assert.equal(case496, round2(IMMO_REFERENCE.totalBrut + (IMMO_REFERENCE.valeurTerrain as number)));
  });

  it("576 ≈ 3 720 € (dossier de référence)", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    const case576 = findCase(form, "576")?.value as number;
    assert.ok(Math.abs(case576 - 3720) < 1, `576 attendu ≈ 3720, obtenu ${case576}`);
  });

  it("576 est cohérente avec la composante amortissement déjà validée pour 2033-A/030", () => {
    const representation = rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE);
    const form2033C = map2033CFromRfs(representation);
    const form2033A = map2033AFromRfs(representation);
    const case028 = findCase2033A(form2033A, "028");
    const case030 = findCase2033A(form2033A, "030");
    const amortCumulesAttendu = round2((case028 as number) - (case030 as number));
    assert.equal(findCase(form2033C, "576")?.value, amortCumulesAttendu);
  });
});

function findCase2033A(form: ReturnType<typeof map2033AFromRfs>, caseId: string) {
  return form.cases.find((c) => c.caseId === caseId)?.value;
}

describe("Cycle 55 — cases 496/576 : valeurTerrain absente → bloquées", () => {
  it("rfs.immobilisations présent mais sans valeurTerrain → 496/576 non alimentées", () => {
    const immoSansTerrain: ImmobilisationsRfs = {
      lignes: IMMO_REFERENCE.lignes,
      totalAnnuelExercice: IMMO_REFERENCE.totalAnnuelExercice,
      totalBrut: IMMO_REFERENCE.totalBrut,
      // valeurTerrain volontairement absent
    };
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), immoSansTerrain));
    assert.equal(findCase(form, "496"), undefined);
    assert.equal(findCase(form, "576"), undefined);
    assert.equal(findBlocked(form, "496")?.categorie, "donnee_absente");
    assert.equal(findBlocked(form, "576")?.categorie, "donnee_absente");
    // 572 reste alimentée : elle ne dépend jamais de rfs.immobilisations.
    assert.ok(findCase(form, "572"));
  });

  it("rfs.immobilisations totalement absent → 496/576 non alimentées, 572 reste alimentée", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: 1500 })));
    assert.equal(findCase(form, "496"), undefined);
    assert.equal(findCase(form, "576"), undefined);
    assert.ok(findCase(form, "572"));
  });
});

describe("Cycle 55 — cases 496/576 : divergence F-010/F-014 → bloquées, aucune projection incohérente", () => {
  it("amortCalcule ≠ immobilisations.totalAnnuelExercice → 496/576 bloquées avec incoherence_modele", () => {
    const representation = rfs(fiscalResult({ amortCalcule: 999999 }), IMMO_REFERENCE);
    const form = map2033CFromRfs(representation);
    assert.equal(findCase(form, "496"), undefined, "aucune valeur sous-évaluée ne doit être produite");
    assert.equal(findCase(form, "576"), undefined);
    assert.equal(findBlocked(form, "496")?.categorie, "incoherence_modele");
    assert.equal(findBlocked(form, "576")?.categorie, "incoherence_modele");
    assert.match(findBlocked(form, "496")!.raison, /amortCalcule/);
    // 572 reste alimentée avec la valeur fiscale autoritaire, elle n'est jamais affectée par cette garde.
    assert.equal(findCase(form, "572")?.value, 999999);
  });

  it("sans divergence, 496/576 restent alimentées (contrôle négatif)", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    assert.ok(findCase(form, "496"));
    assert.ok(findCase(form, "576"));
  });
});

// =====================================================================
// Cases explicitement non alimentées — périmètre strict
// =====================================================================
describe("Cycle 55 — cases explicitement laissées absentes (périmètre strict 572/496/576)", () => {
  it("490/492/494/570/574 (colonnes de mouvement) ne sont jamais alimentées", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    for (const caseId of ["490", "492", "494", "570", "574"]) {
      assert.equal(findCase(form, caseId), undefined, `${caseId} ne doit jamais être alimentée ce cycle`);
      assert.ok(findBlocked(form, caseId), `${caseId} doit être tracée comme non alimentée`);
      assert.equal(findBlocked(form, caseId)?.categorie, "donnee_absente");
    }
  });

  it("les cases par catégorie (400-486, 500-566) ne sont jamais alimentées", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    const categorieCases = ["400", "402", "420", "422", "430", "432", "450", "452", "460", "470", "480", "510", "520", "530", "540", "550", "560"];
    for (const caseId of categorieCases) {
      assert.equal(findCase(form, caseId), undefined, `${caseId} (détail par catégorie) ne doit jamais être alimentée — aucune ventilation PCG`);
    }
  });

  it("le Cadre III (plus-values/moins-values, cessions) n'est jamais alimenté", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    for (const caseId of ["578", "580", "582", "584", "586", "596"]) {
      assert.equal(findCase(form, caseId), undefined, `${caseId} (Cadre III, cession) ne doit jamais être alimentée — aucune notion de cession modélisée`);
    }
  });

  it("aucune case n'est ajoutée au-delà de 426/476/572/496/576 quand tout est disponible", () => {
    const form = map2033CFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE));
    const caseIds = form.cases.map((c) => c.caseId).sort();
    assert.deepEqual(caseIds, ["426", "476", "496", "572", "576"]);
  });
});

// =====================================================================
// End-to-end réel : F-010 → RFS → map2033CFromRfs
// =====================================================================
describe("Cycle 55 — bout en bout réel : computeAmortizationPlan() (F-010) → RFS → map2033CFromRfs()", () => {
  it("valeurTerrain calculée par F-010 arrive intacte jusqu'à la case 496, cohérente avec amortCalcule", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2024,
    });
    const immobilisations: ImmobilisationsRfs = { ...computed.plan, valeurTerrain: computed.valeurTerrain };

    const representation = buildFiscalRepresentation({
      fiscalResult: fiscalResult({ exercice: 2024, amortCalcule: computed.plan.totalAnnuelExercice }),
      identite: IDENTITE,
      immobilisations,
    });

    const form = map2033CFromRfs(representation);
    assert.equal(findCase(form, "496")?.value, round2(computed.plan.totalBrut + computed.valeurTerrain));
    assert.equal(findCase(form, "572")?.value, computed.plan.totalAnnuelExercice);
    assert.equal(findCase(form, "426")?.value, computed.valeurTerrain);
  });

  it("montantMobilier calculé par F-010 (mobilierInclus) arrive intact jusqu'à la case 476", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: true,
      montantMobilier: 8000,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2024,
    });
    assert.ok(computed.montantMobilierIsole > 0, "précondition : F-010 doit isoler un montant de mobilier positif pour ce test");

    const immobilisations: ImmobilisationsRfs = {
      ...computed.plan,
      valeurTerrain: computed.valeurTerrain,
      montantMobilier: computed.montantMobilierIsole,
    };

    const representation = buildFiscalRepresentation({
      fiscalResult: fiscalResult({ exercice: 2024, amortCalcule: computed.plan.totalAnnuelExercice }),
      identite: IDENTITE,
      immobilisations,
    });

    const form = map2033CFromRfs(representation);
    assert.equal(findCase(form, "476")?.value, round2(computed.montantMobilierIsole));
  });
});

// =====================================================================
// Garde d'architecture
// =====================================================================
describe("Cycle 55 — garde d'architecture (map-2033c.ts)", () => {
  it("aucun import de moteur fiscal, assistant, FEC ou lecteur de fichiers", () => {
    const source = readFileSync(path.join(__dirname, "capabilities/rfs/projection/map-2033c.ts"), "utf-8");
    const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
    const forbidden = [
      "produceFiscalResult",
      "applyAmortissementStocks",
      "fiscalResultFromDraft",
      "draft-to-liasse-inputs",
      "FEC",
      "fec-reader",
      "fec-parser",
      "readFileSync",
      "computeAmortizationPlan",
      "capabilities/f010",
      "capabilities/f011",
      "capabilities/f012",
      "capabilities/f013",
      "capabilities/f014",
      "assistants/f010",
      "assistants/f011",
      "assistants/f012",
      "assistants/f013",
      "assistants/f014",
      "map-2033a",
      "map-2033b",
    ];
    for (const token of forbidden) {
      assert.equal(importLines.includes(token), false, `map-2033c.ts ne doit pas importer ${token}`);
    }
  });
});

// =====================================================================
// Traçabilité
// =====================================================================
describe("Cycle 55 — traçabilité", () => {
  it("chaque case alimentée a une trace exploitable ; chaque case bloquée a une catégorie et une raison non générique", () => {
    for (const representation of [
      rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE),
      rfs(fiscalResult({ amortCalcule: 1500 })),
    ]) {
      const form = map2033CFromRfs(representation);
      for (const c of form.cases) {
        assert.ok(c.trace.source, `case ${c.caseId} sans source de trace`);
        assert.ok(c.trace.path.length > 0, `case ${c.caseId} sans path de trace`);
      }
      const genericWords = ["inconnu", "unknown", "n/a", "todo", "tbd"];
      for (const b of form.casesNonAlimentees) {
        assert.ok(b.categorie, `${b.caseId} sans catégorie`);
        assert.ok(b.raison.length > 20, `${b.caseId} : raison trop courte`);
        for (const word of genericWords) {
          assert.equal(b.raison.toLowerCase().includes(word), false, `${b.caseId} : raison générique détectée ("${word}")`);
        }
      }
    }
  });
});

// =====================================================================
// Non-régression assembleLiasseFromRfs / formulairesGeneres
// =====================================================================
describe("Cycle 55 — non-régression assembleLiasseFromRfs()", () => {
  it("form2033C assemblé reste structurellement identique à un appel direct de map2033CFromRfs()", () => {
    const representation = rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE);
    const liasse = assembleLiasseFromRfs(representation);
    const direct = map2033CFromRfs(representation);
    assert.deepEqual(liasse.form2033C, direct);
  });

  it("2033-C-SD rejoint formulairesGeneres ; formulairesManquants contient 2033-D-SD (P0-2b : réintégré au périmètre attendu, non encore généré)", () => {
    const representation = rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE);
    const liasse = assembleLiasseFromRfs(representation);
    assert.deepEqual(liasse.formulairesGeneres, ["2031-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD"]);
    assert.deepEqual(liasse.formulairesManquants, ["2033-D-SD"]);
  });

  it("2031-Bis-SD reste hors formulairesGeneres/Attendus/Manquants", () => {
    const representation = rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), IMMO_REFERENCE);
    const liasse = assembleLiasseFromRfs(representation);
    assert.equal(liasse.formulairesGeneres.includes("2031-Bis-SD"), false);
    assert.equal((liasse.formulairesAttendus as readonly string[]).includes("2031-Bis-SD"), false);
  });
});
