/**
 * Cycle 35 — projection Cerfa 2033-A-SD (bilan simplifié) depuis la RFS.
 * Run: npx tsx --test src/runtime/rfs-2033a.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { map2033AFromRfs } from "./capabilities/rfs/projection/map-2033a";
import { map2033BFromRfs } from "./capabilities/rfs/projection/map-2033b";
import { buildFiscalRepresentation } from "./capabilities/rfs/build-fiscal-representation";
import { computeAmortizationPlan } from "./capabilities/f010/compute-amortization-plan";
import { round2 } from "./capabilities/f007/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { ImmobilisationsRfs, FiscalRepresentation } from "./capabilities/rfs/types";
import type { PretFinancementExercice } from "./capabilities/f011/types";

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

function rfs(
  fr: FiscalResult,
  extra: { immobilisations?: ImmobilisationsRfs; emprunts?: PretFinancementExercice[] } = {},
): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    immobilisations: extra.immobilisations,
    emprunts: extra.emprunts,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

function findCase(form: ReturnType<typeof map2033AFromRfs>, caseId: string) {
  return form.cases.find((c) => c.caseId === caseId);
}
function findBlocked(form: ReturnType<typeof map2033AFromRfs>, caseId: string) {
  return form.casesNonAlimentees.find((c) => c.caseId === caseId);
}

// Fixture proche du dossier de référence réel (Elsa Bouvard, audité Cycle 32-35).
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
};

const EMPRUNT_REFERENCE: PretFinancementExercice = {
  pretId: "pret-1",
  typePret: "amortissable",
  interetsEmpruntExercice: 4602,
  interetsPreExploitation: 0,
  assuranceEmpruntExercice: 601,
  capitalRembourseExercice: 496,
  capitalRestantDu31_12: 130256,
  fraisDossierDeductibles: 0,
  garantieDeductible: 1763,
  iraDeductible: 0,
};

// =====================================================================
// TEST 2/3/4 — dossier réel : terrain, brut, net
// =====================================================================
describe("Cycle 35 — TEST 2/3/4 : réconciliation dossier réel (Elsa Bouvard)", () => {
  it("terrain ≈ 17 960,39 € (fixture) ; case 028 (brut) ≈ 125 136 € ; case 030 (net) ≈ 121 416 €", () => {
    const form = map2033AFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), { immobilisations: IMMO_REFERENCE }));
    const case028 = findCase(form, "028")?.value as number;
    const case030 = findCase(form, "030")?.value as number;

    assert.equal(IMMO_REFERENCE.valeurTerrain, 17960.39);
    assert.ok(Math.abs(case028 - 125136) < 1, `028 attendu ≈ 125136, obtenu ${case028}`);
    assert.ok(Math.abs(case030 - 121416) < 1, `030 attendu ≈ 121416, obtenu ${case030}`);
  });

  it("case 028 correspond exactement à totalBrut + valeurTerrain (arrondi)", () => {
    const form = map2033AFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), { immobilisations: IMMO_REFERENCE }));
    const case028 = findCase(form, "028")?.value as number;
    assert.equal(case028, round2(IMMO_REFERENCE.totalBrut + (IMMO_REFERENCE.valeurTerrain as number)));
  });

  it("case 030 correspond exactement à (totalBrut + valeurTerrain) − Σ amortissementsCumules", () => {
    const form = map2033AFromRfs(rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), { immobilisations: IMMO_REFERENCE }));
    const case030 = findCase(form, "030")?.value as number;
    const amortCumulesTotal = round2(IMMO_REFERENCE.lignes.reduce((acc, l) => acc + l.amortissementsCumules, 0));
    const brut = round2(IMMO_REFERENCE.totalBrut + (IMMO_REFERENCE.valeurTerrain as number));
    assert.equal(case030, round2(brut - amortCumulesTotal));
    assert.equal(amortCumulesTotal, 3720, "cohérent avec le dossier réel (première année, cumulé = dotation de l'exercice)");
  });
});

// =====================================================================
// TEST 5 — case 136 = case 310 du 2033-B
// =====================================================================
describe("Cycle 35 — TEST 5 : case 136 (résultat de l'exercice) = case 310 du 2033-B", () => {
  it("même RFS → même valeur, sur un résultat positif et un résultat négatif", () => {
    for (const overrides of [{ resultatAvantAmort: 5000, amortCalcule: 1000 }, { resultatAvantAmort: -5000, amortCalcule: 1000 }]) {
      const representation = rfs(fiscalResult({ ...overrides, charges: { ...fiscalResult().charges, totalNonDeductible: 0 } }));
      const case136 = findCase(map2033AFromRfs(representation), "136")?.value;
      const case310 = findCase(map2033BFromRfs(representation), "310")?.value;
      assert.equal(case136, case310, `écart pour ${JSON.stringify(overrides)}`);
    }
  });
});

// =====================================================================
// TEST 6/7 — case 156, agrégation multi-emprunts
// =====================================================================
describe("Cycle 35 — TEST 6/7 : case 156 = somme des emprunts, plusieurs prêts agrégés correctement", () => {
  it("un seul prêt → case 156 = son capitalRestantDu31_12", () => {
    const form = map2033AFromRfs(rfs(fiscalResult(), { emprunts: [EMPRUNT_REFERENCE] }));
    assert.equal(findCase(form, "156")?.value, 130256);
  });

  it("plusieurs prêts → case 156 = somme exacte, aucun recalcul de solde individuel", () => {
    const pret2: PretFinancementExercice = { ...EMPRUNT_REFERENCE, pretId: "pret-2", capitalRestantDu31_12: 45000 };
    const pret3: PretFinancementExercice = { ...EMPRUNT_REFERENCE, pretId: "pret-3", capitalRestantDu31_12: 12500.5 };
    const form = map2033AFromRfs(rfs(fiscalResult(), { emprunts: [EMPRUNT_REFERENCE, pret2, pret3] }));
    assert.equal(findCase(form, "156")?.value, round2(130256 + 45000 + 12500.5));
  });
});

// =====================================================================
// TEST 8 — rfs.emprunts absent → 156 non alimentée, jamais 0
// =====================================================================
describe("Cycle 35 — TEST 8 : rfs.emprunts absent → 156 non alimentée, jamais 0 par défaut", () => {
  it("156 absente de cases, présente dans casesNonAlimentees avec categorie donnee_absente", () => {
    const form = map2033AFromRfs(rfs(fiscalResult()));
    assert.equal(findCase(form, "156"), undefined);
    const blocked = findBlocked(form, "156");
    assert.ok(blocked);
    assert.equal(blocked?.categorie, "donnee_absente");
    assert.doesNotMatch(blocked!.raison.toLowerCase(), /^0|zéro/);
  });
});

// =====================================================================
// TEST 9 — terrain absent → 028/030 restent bloquées
// =====================================================================
describe("Cycle 35 — TEST 9 : terrain absent → 028/030 bloquées plutôt qu'une valeur partielle", () => {
  it("rfs.immobilisations totalement absent → 028/030 non alimentées", () => {
    const form = map2033AFromRfs(rfs(fiscalResult()));
    assert.equal(findCase(form, "028"), undefined);
    assert.equal(findCase(form, "030"), undefined);
    assert.ok(findBlocked(form, "028"));
    assert.ok(findBlocked(form, "030"));
  });

  it("rfs.immobilisations présent mais SANS valeurTerrain (dossier/fixture antérieur au Cycle 35) → 028/030 non alimentées, jamais une valeur sous-évaluée", () => {
    const immoSansTerrain: ImmobilisationsRfs = {
      lignes: IMMO_REFERENCE.lignes,
      totalAnnuelExercice: IMMO_REFERENCE.totalAnnuelExercice,
      totalBrut: IMMO_REFERENCE.totalBrut,
      // valeurTerrain volontairement absent
    };
    const form = map2033AFromRfs(rfs(fiscalResult(), { immobilisations: immoSansTerrain }));
    assert.equal(findCase(form, "028"), undefined, "totalBrut seul sous-évaluerait le brut réel du montant du terrain");
    assert.equal(findCase(form, "030"), undefined);
    const blocked028 = findBlocked(form, "028");
    assert.ok(blocked028);
    assert.equal(blocked028?.categorie, "donnee_absente");
  });
});

// =====================================================================
// TEST 10 — totaux jamais débloqués tant que leurs composantes ne le sont pas
// =====================================================================
describe("Cycle 35 — TEST 10 : les totaux (044/048/096/098/110/112/142/176/180) restent bloqués même avec immobilisations et emprunts fournis", () => {
  it("aucun total n'apparaît dans cases, même quand 028/030/136/156 sont tous alimentées", () => {
    const form = map2033AFromRfs(
      rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), { immobilisations: IMMO_REFERENCE, emprunts: [EMPRUNT_REFERENCE] }),
    );
    // Les 4 cases fiables sont bien là.
    for (const id of ["028", "030", "136", "156"]) {
      assert.ok(findCase(form, id), `${id} devrait être alimentée`);
    }
    // Aucun total ne l'est — car incorporelles/financières/actif circulant/
    // capital individuel/autres dettes restent non fiables par ailleurs.
    for (const id of ["044", "048", "096", "098", "110", "112", "142", "176", "180"]) {
      assert.equal(findCase(form, id), undefined, `${id} ne doit pas être un total partiel`);
      assert.ok(findBlocked(form, id), `${id} doit rester tracée comme non alimentée`);
      assert.equal(findBlocked(form, id)?.categorie, "incoherence_modele");
    }
  });
});

// =====================================================================
// TEST 11 — garde d'architecture
// =====================================================================
describe("Cycle 35 — TEST 11 : garde d'architecture (map-2033a.ts)", () => {
  it("aucun import de moteur fiscal, assistant, FEC ou lecteur de fichiers", () => {
    const source = readFileSync(path.join(__dirname, "capabilities/rfs/projection/map-2033a.ts"), "utf-8");
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
    ];
    for (const token of forbidden) {
      assert.equal(importLines.includes(token), false, `map-2033a.ts ne doit pas importer ${token}`);
    }
  });
});

// =====================================================================
// TEST 12 — end-to-end réel : F-010 → RFS → map2033AFromRfs
// =====================================================================
describe("Cycle 35 — TEST 12 : bout en bout réel — computeAmortizationPlan() (F-010) → RFS → map2033AFromRfs()", () => {
  it("valeurTerrain calculée par F-010 (jamais recalculée) arrive intacte jusqu'à la case 028", () => {
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
    assert.equal(computed.valeurTerrain, 44925, "vérification intermédiaire — valeur F-010 déjà connue");

    // Reproduit exactement le pattern de run-declaration-generation.ts : fusion
    // additive de .plan et .valeurTerrain, aucune transformation de valeur.
    const immobilisations: ImmobilisationsRfs = { ...computed.plan, valeurTerrain: computed.valeurTerrain };

    const representation = buildFiscalRepresentation({
      fiscalResult: fiscalResult({ exercice: 2024, amortCalcule: computed.plan.totalAnnuelExercice }),
      identite: IDENTITE,
      immobilisations,
    });

    const form = map2033AFromRfs(representation);
    const case028 = findCase(form, "028")?.value as number;
    assert.equal(case028, round2(computed.plan.totalBrut + computed.valeurTerrain), "chemin complet F-010 → RFS → mapper, sans divergence");
  });
});

// =====================================================================
// Traçabilité (complète le STEP 8 du Cycle 33, pour le 2033-A)
// =====================================================================
describe("Cycle 35 — traçabilité de toutes les cases, alimentées et bloquées", () => {
  it("chaque case alimentée a une trace exploitable ; chaque case bloquée a une catégorie et une raison non générique", () => {
    const form = map2033AFromRfs(
      rfs(fiscalResult({ amortCalcule: IMMO_REFERENCE.totalAnnuelExercice }), { immobilisations: IMMO_REFERENCE, emprunts: [EMPRUNT_REFERENCE] }),
    );

    for (const c of form.cases) {
      assert.ok(c.trace.source, `case ${c.caseId} sans source de trace`);
      assert.ok(c.trace.path.length > 0, `case ${c.caseId} sans path de trace`);
    }

    const genericWords = ["inconnu", "unknown", "n/a", "todo", "tbd"];
    for (const b of form.casesNonAlimentees) {
      assert.ok(b.categorie, `${b.caseId} sans catégorie`);
      assert.ok(b.raison.length > 20, `${b.caseId} : raison trop courte pour être exploitable`);
      for (const word of genericWords) {
        assert.equal(b.raison.toLowerCase().includes(word), false, `${b.caseId} : raison générique détectée ("${word}")`);
      }
    }
  });

  it("formId et millésime sont corrects, casesNonAlimentees couvre bien toutes les cases officielles non alimentées attendues", () => {
    const form = map2033AFromRfs(rfs(fiscalResult({ exercice: 2025 })));
    assert.equal(form.formId, "2033-A-SD");
    assert.equal(form.millésime, 2025);
    // Cases officielles listées dans l'audit Cycle 35 restent bloquées par défaut
    // (sans immobilisations ni emprunts) : 010/012/014/016/028/030/040/042/044/048/
    // 050/052/060/062/064/066/068/070/072/074/080/082/084/086/092/094/096/098/110/112/
    // 120/124/126/130/131/132/134/137/140/142/154/156/164/166/172/173/174/175/176/180.
    assert.equal(form.casesNonAlimentees.length, 50);
    assert.equal(form.cases.length, 1, "seule 136 est alimentable sans immobilisations ni emprunts");
  });
});
