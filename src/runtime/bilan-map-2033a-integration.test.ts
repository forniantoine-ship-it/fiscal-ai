/**
 * MICRO-JALON socle patrimonial P0 — test d'intégration bout en bout :
 * FiscalResult + Immobilisations + Emprunts + BilanInputs → assemblePatrimoine()
 * → map2033AFromRfs() → 9 cases publiables, bilan équilibré (110−112 = 180
 * au sens du sous-modèle suivi ; voir correction P0-4 pour les totaux
 * Cerfa officiels, qui restent bloqués).
 * Run: npx tsx --test src/runtime/bilan-map-2033a-integration.test.ts
 *
 * Corrections P0-1/P0-2/P0-3 (audit indépendant) : "faux équilibre" par
 * tiers non renseignés, découvert bancaire orphelin, et divergence de
 * source du capital restant dû — voir la dernière section de ce fichier.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
import { checkBilanEquilibre } from "./capabilities/bilan/check-bilan-equilibre";
import { map2033AFromRfs } from "./capabilities/rfs/projection/map-2033a";
import type { BilanInputs } from "./capabilities/bilan/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation, ImmobilisationsRfs } from "./capabilities/rfs/types";
import type { PretFinancementExercice } from "./capabilities/f011/types";

const FISCAL_RESULT: FiscalResult = {
  exercice: 2025,
  recettes: { total: 12000 },
  charges: { totalDeductible: 4000, chargesExploitation: 4000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
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
};

const IMMOBILISATIONS: ImmobilisationsRfs = {
  lignes: [{ label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 43500 }],
  totalAnnuelExercice: 1500,
  totalBrut: 45000,
  valeurTerrain: 15000,
};

const EMPRUNT: PretFinancementExercice = {
  pretId: "pret-1",
  typePret: "amortissable",
  interetsEmpruntExercice: 800,
  interetsPreExploitation: 0,
  assuranceEmpruntExercice: 100,
  assurancePreExploitation: 0,
  capitalRembourseExercice: 2000,
  capitalRestantDu31_12: 20000,
  fraisDossierDeductibles: 0,
  garantieDeductible: 0,
  iraDeductible: 0,
};

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Test intégration P0" };

const BILAN_INPUTS: BilanInputs = {
  tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
  compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
  ran: { situation: "NATIF" },
  tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
  // Correction P1-A : avant cette correction, l'absence de ce champ était
  // silencieusement traitée comme "137 = 0" par 142 dès que le reste du
  // sous-modèle était équilibré (asymétrie identifiée en réception P0, §10).
  // Le champ est désormais résolu explicitement (INCONNU par défaut, voir
  // `resolveSubventionsInvestissement`) — ce fixture, qui documente un
  // dossier nominal où TOUT est publiable, doit donc confirmer 137 tout
  // comme il confirme déjà tiers.creances/dettes ci-dessus. Ce n'est pas un
  // affaiblissement d'assertion : 142 exige désormais une confirmation qui
  // n'existait pas avant.
  subventionsInvestissement: { status: "NUL_CONFIRME" },
};

function buildRfs(): FiscalRepresentation {
  return {
    exercice: FISCAL_RESULT.exercice,
    identite: IDENTITE,
    fiscalResult: FISCAL_RESULT,
    immobilisations: IMMOBILISATIONS,
    emprunts: [EMPRUNT],
    trace: {
      ksArtifacts: FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: FISCAL_RESULT.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

describe("Intégration socle patrimonial P0 — map2033AFromRfs() avec rfs.patrimoine complet", () => {
  it("bilan intégralement équilibré : 8 cases patrimoniales publiables (086 bloquée tant que provision inconnue)", () => {
    const rfsSansPatrimoine = buildRfs();
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, BILAN_INPUTS);
    const rfsAvecPatrimoine: FiscalRepresentation = { ...rfsSansPatrimoine, patrimoine };

    const form = map2033AFromRfs(rfsAvecPatrimoine);
    const find = (id: string) => form.cases.find((c) => c.caseId === id)?.value;

    assert.equal(find("136"), 5400, "136 = résultat comptable = resultatAvantAmort − amortCalcule − totalNonDeductible");
    assert.equal(find("156"), 20000);
    assert.equal(find("028"), 60000, "028 = totalBrut(45000) + valeurTerrain(15000)");
    assert.equal(find("030"), 1500, "030 = Σ amortissementsCumules (1500), pas la VNC (58500)");
    assert.equal(find("084"), 3000);
    assert.equal(find("086"), undefined, "086 bloquée : trésorerie brute connue sans provision explicite");
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "086"), "086 doit être explicitement bloquée");
    assert.equal(find("120"), 36100, "120 = 37100 (ouverture) + 0 (apports) − 1000 (prélèvements)");
    assert.equal(find("134"), 0, "134 = 0, dossier natif (C1)");
    assert.equal(find("142"), 41500, "142 = 120(36100) + 134(0) + 136(5400) — seul total publiable, voir correction P0-4");

    const patrimoineNetTotal = patrimoine.immobilisations.netTotal;
    assert.equal(patrimoineNetTotal, 58500, "netTotal reste disponible pour les calculs internes d'équilibre");
    assert.notEqual(find("030"), patrimoineNetTotal, "030 ≠ netTotal/VNC publiée");

    // Aucune de ces 8 cases publiées ne doit apparaître dans casesNonAlimentees.
    for (const caseId of ["136", "156", "028", "030", "084", "120", "134", "142"]) {
      assert.equal(form.casesNonAlimentees.find((c) => c.caseId === caseId), undefined, `${caseId} ne doit pas être dans casesNonAlimentees : elle a été produite`);
    }
  });

  it("correction P0-4 — même bilan intégralement équilibré : 044/048/096/098/110/112/176/180 restent TOUJOURS bloqués (catégories officielles jamais confirmées : incorporelles, financières, autres tiers)", () => {
    const rfsSansPatrimoine = buildRfs();
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, BILAN_INPUTS);
    const rfsAvecPatrimoine: FiscalRepresentation = { ...rfsSansPatrimoine, patrimoine };
    const form = map2033AFromRfs(rfsAvecPatrimoine);

    for (const totalId of ["044", "048", "096", "098", "110", "112", "176", "180"]) {
      assert.equal(form.cases.find((c) => c.caseId === totalId), undefined, `${totalId} ne doit jamais être publié : des catégories officielles constitutives restent donnee_absente (jamais confirmées nulles/non_applicable)`);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === totalId), `${totalId} doit être explicitement bloqué`);
    }
  });

  it("sans BilanInputs (rfs.patrimoine absent) : comportement rigoureusement inchangé — seules 136/156/028/030 produites, non-régression totale", () => {
    const rfsSansPatrimoine = buildRfs();
    const form = map2033AFromRfs(rfsSansPatrimoine);
    const caseIds = form.cases.map((c) => c.caseId).sort();
    assert.deepEqual(caseIds, ["028", "030", "136", "156"]);
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "084"));
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "120"));
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "134"));
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "180"));
  });

  it("R16 — trésorerie inconnue au sein d'un dossier par ailleurs complet : AUCUN total n'est produit, même 028/030 restent inchangées par cette absence (084/086/totaux bloqués uniquement)", () => {
    const rfsSansPatrimoine = buildRfs();
    const inputsIncomplets: BilanInputs = { ...BILAN_INPUTS, tresorerie: { bankMode: "INCONNU" } };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsIncomplets);
    const rfsAvecPatrimoine: FiscalRepresentation = { ...rfsSansPatrimoine, patrimoine };
    const form = map2033AFromRfs(rfsAvecPatrimoine);

    assert.equal(form.cases.find((c) => c.caseId === "028")?.value, 60000, "028 reste produite : indépendante de la trésorerie");
    assert.equal(form.cases.find((c) => c.caseId === "084"), undefined);
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "084"));
    for (const totalId of ["044", "048", "096", "098", "110", "112", "142", "176", "180"]) {
      assert.equal(form.cases.find((c) => c.caseId === totalId), undefined, `${totalId} ne doit jamais être produit partiellement`);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === totalId), `${totalId} doit être explicitement bloqué`);
    }
  });
});

describe("F2 — case 086 séparée de 084 (Disponibilités)", () => {
  it("Cas C — trésorerie brute connue (084=3000), provision inconnue : 086 absente, jamais recopiée", () => {
    const rfsSansPatrimoine = buildRfs();
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, BILAN_INPUTS);
    const form = map2033AFromRfs({ ...rfsSansPatrimoine, patrimoine });
    const case084 = form.cases.find((c) => c.caseId === "084")?.value;
    const case086 = form.cases.find((c) => c.caseId === "086");
    assert.equal(case084, 3000);
    assert.equal(case086, undefined);
    const blocked086 = form.casesNonAlimentees.find((c) => c.caseId === "086");
    assert.ok(blocked086);
    assert.match(blocked086!.raison, /provision|amortissement/i);
  });

  it("Cas A — trésorerie explicitement nulle : 084=0 et 086=0, cases distinctes", () => {
    const rfsSansPatrimoine = buildRfs();
    const inputsNulles: BilanInputs = {
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "MIXTE", declaredProfessionalCash: 0 },
    };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsNulles);
    const form = map2033AFromRfs({ ...rfsSansPatrimoine, patrimoine });
    assert.equal(form.cases.find((c) => c.caseId === "084")?.value, 0);
    assert.equal(form.cases.find((c) => c.caseId === "086")?.value, 0);
    assert.notEqual(
      form.cases.find((c) => c.caseId === "084")?.trace.path,
      form.cases.find((c) => c.caseId === "086")?.trace.path,
      "084 et 086 ont des traces distinctes malgré la même valeur numérique",
    );
  });

  it("Cas B — provisionsAmortissements DECLARE : 086 publiée distinctement de 084", () => {
    const rfsSansPatrimoine = buildRfs();
    const inputsAvecProvision: BilanInputs = {
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 3000, provisionsAmortissements: { status: "DECLARE", montant: 250 } },
    };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsAvecProvision);
    const form = map2033AFromRfs({ ...rfsSansPatrimoine, patrimoine });
    assert.equal(form.cases.find((c) => c.caseId === "084")?.value, 3000);
    assert.equal(form.cases.find((c) => c.caseId === "086")?.value, 250);
    assert.notEqual(form.cases.find((c) => c.caseId === "086")?.value, 3000);
  });
});

describe("Correction P0 — « faux équilibre » : un dossier volontairement incomplet ne doit jamais devenir EQUILIBRE", () => {
  it("§21 — tiers non renseignés (ni déclarés, ni confirmés nuls) sur un dossier par ailleurs numériquement équilibrable : DONNEE_MANQUANTE, jamais EQUILIBRE", () => {
    const rfsSansPatrimoine = buildRfs();
    // Strictement identique à BILAN_INPUTS (dossier qui s'équilibre), sauf
    // que tiers n'est jamais renseigné — absence totale de saisie.
    const inputsSansTiers: BilanInputs = {
      tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
      compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
      ran: { situation: "NATIF" },
    };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsSansTiers);
    const rfsAvecPatrimoine: FiscalRepresentation = { ...rfsSansPatrimoine, patrimoine };
    const form = map2033AFromRfs(rfsAvecPatrimoine);

    assert.equal(form.cases.find((c) => c.caseId === "142"), undefined, "142 ne doit jamais être publiée : les tiers sont inconnus, pas confirmés nuls");
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "142"), "142 doit être explicitement bloquée");
  });

  it("§22 — dossier témoin Elsa Bouvard, patrimoine non fourni : aucune trésorerie/120/134/tiers n'est inventée, seules 136/156/028/030 sortent", () => {
    // Valeurs reprises du dossier de référence réel (voir rfs-2033a.test.ts,
    // Cycle 35) : immo brut ≈ 125136, emprunt CRD 130256, résultat comptable
    // -13681. `rfs.patrimoine` n'est PAS fourni ici (aucun BilanInputs saisi
    // pour ce dossier) — le système ne doit rien compléter à sa place.
    const elsa: FiscalRepresentation = {
      exercice: 2025,
      identite: IDENTITE,
      fiscalResult: {
        ...FISCAL_RESULT,
        resultatAvantAmort: -9862,
        amortCalcule: 3720,
        charges: { totalDeductible: 14963, chargesExploitation: 10361, chargesFinancement: 4602, chargesPreExploitation: 0, totalNonDeductible: 99 },
        resultatFiscal: 0,
        deficitNouveau: 9862,
      },
      immobilisations: {
        lignes: [{ label: "Composants", montant: 107175.61, dureeAnnees: 20, dotationExercice: 3720, amortissementsCumules: 3720, vnc: 103455.61 }],
        totalAnnuelExercice: 3720,
        totalBrut: 107175.61,
        valeurTerrain: 17960.39,
      },
      emprunts: [{ ...EMPRUNT, capitalRestantDu31_12: 130256 }],
      trace: {
        ksArtifacts: FISCAL_RESULT.trace.ksArtifacts,
        assembledAt: "2026-08-31T00:00:00.000Z",
        sourceFiscalResultAt: FISCAL_RESULT.trace.computedAt,
        sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
      },
      // patrimoine délibérément absent.
    };

    const form = map2033AFromRfs(elsa);
    assert.equal(form.cases.find((c) => c.caseId === "136")?.value, -13681);
    assert.equal(form.cases.find((c) => c.caseId === "156")?.value, 130256);
    assert.ok(Math.abs((form.cases.find((c) => c.caseId === "028")?.value as number) - 125136.0) < 1);

    // Absence de données ≠ zéro : rien n'est inventé pour 084/120/134/142/180.
    for (const caseId of ["084", "086", "120", "134", "142", "176", "180"]) {
      assert.equal(form.cases.find((c) => c.caseId === caseId), undefined, `${caseId} ne doit jamais apparaître avec une valeur inventée`);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === caseId), `${caseId} doit être explicitement non-alimentée`);
    }
  });

  it("découvert bancaire orphelin sur un dossier par ailleurs équilibrable : DONNEE_MANQUANTE, jamais EQUILIBRE (correction P0-2)", () => {
    const rfsSansPatrimoine = buildRfs();
    const inputsDecouvertOrphelin: BilanInputs = {
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: -350 }, // découvert, aucune dette reconnue
    };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsDecouvertOrphelin);
    const rfsAvecPatrimoine: FiscalRepresentation = { ...rfsSansPatrimoine, patrimoine };
    const form = map2033AFromRfs(rfsAvecPatrimoine);

    assert.equal(form.cases.find((c) => c.caseId === "084")?.value, 0, "084 ne doit jamais recevoir une valeur négative");
    assert.equal(form.cases.find((c) => c.caseId === "142"), undefined, "142 bloquée : le découvert de 350 € n'a aucune contrepartie de passif reconnue");
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "142"));
  });

  it("découvert bancaire avec dette reconnue explicitement : passif augmenté, bilan à nouveau cohérent (correction P0-2)", () => {
    const rfsSansPatrimoine = buildRfs();
    const inputsDecouvertReconnu: BilanInputs = {
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: -350, decouvertDetteReconnue: 350 },
    };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsDecouvertReconnu);
    assert.equal(patrimoine.tresorerie.decouvertDettePassif, 350);
  });

  it("CRD divergent entre F-011 et BilanInputs.financements : 156 et 176/142 ne sont jamais publiés (correction P0-3)", () => {
    const rfsSansPatrimoine = buildRfs(); // rfs.emprunts → CRD F-011 = 20000
    const inputsCrdDivergent: BilanInputs = { ...BILAN_INPUTS, financements: { clotureCRD: 25000 } };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsCrdDivergent);
    const rfsAvecPatrimoine: FiscalRepresentation = { ...rfsSansPatrimoine, patrimoine };
    const form = map2033AFromRfs(rfsAvecPatrimoine);

    assert.equal(patrimoine.emprunts.etat, "DIVERGENT");
    assert.equal(form.cases.find((c) => c.caseId === "156"), undefined, "156 ne doit jamais être publiée en cas de divergence de source du CRD");
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "156"));
    assert.equal(form.cases.find((c) => c.caseId === "142"), undefined, "142 bloquée : le bilan dépend d'un emprunt dont la source diverge");
  });
});

describe("Correction P1-A — asymétrie 142/137, bout en bout", () => {
  it("D — 137 non renseigné sur un dossier par ailleurs intégralement équilibré : 137 non publiée, 142 bloquée", () => {
    const rfsSansPatrimoine = buildRfs();
    const inputsSansSubventions: BilanInputs = { ...BILAN_INPUTS, subventionsInvestissement: undefined };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsSansSubventions);
    const rfsAvecPatrimoine: FiscalRepresentation = { ...rfsSansPatrimoine, patrimoine };
    const form = map2033AFromRfs(rfsAvecPatrimoine);

    assert.equal(form.cases.find((c) => c.caseId === "137"), undefined, "137 ne doit jamais être publiée sans statut explicite");
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "137"));
    assert.equal(form.cases.find((c) => c.caseId === "142"), undefined, "142 doit rester bloquée tant que 137 est inconnue, même si le reste du sous-modèle est équilibré");
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "142"));
  });

  it("E — 137 explicitement confirmée nulle : 137 = 0 publiée, 142 redevient calculable", () => {
    const rfsSansPatrimoine = buildRfs();
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, BILAN_INPUTS); // BILAN_INPUTS confirme déjà 137 en NUL_CONFIRME
    const rfsAvecPatrimoine: FiscalRepresentation = { ...rfsSansPatrimoine, patrimoine };
    const form = map2033AFromRfs(rfsAvecPatrimoine);

    assert.equal(form.cases.find((c) => c.caseId === "137")?.value, 0);
    assert.equal(form.cases.find((c) => c.caseId === "142")?.value, 41500, "142 = 120(36100) + 134(0) + 136(5400) + 137(0)");
  });

  it("F — R-01 : 137=2500 SANS actif correspondant → DESEQUILIBRE_REEL, 142 bloquée (ancien bug fermé : plus d'EQUILIBRE avec passif vérifié sans 137)", () => {
    const rfsSansPatrimoine = buildRfs();
    // Ancien scénario incohérent : 137 déclaré mais cash inchangé (3000).
    // Avant R-01 : check ignorait 137 → EQUILIBRE + 142=44000 ≠ passif vérifié 41500.
    const inputsAvecSubvention: BilanInputs = { ...BILAN_INPUTS, subventionsInvestissement: { status: "DECLARE", montant: 2500 } };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsAvecSubvention);
    const equilibre = checkBilanEquilibre({ patrimoine });
    assert.equal(equilibre.status, "DESEQUILIBRE_REEL", "137 intégré au passif vérifié doit créer un écart si l'actif n'a pas bougé");
    assert.equal(equilibre.totalPassif, 41500 + 2500 + 20000, "passif vérifié = (120+134+136+137) + emprunts");
    assert.equal(equilibre.totalActifNet, 61500);

    const form = map2033AFromRfs({ ...rfsSansPatrimoine, patrimoine });
    assert.equal(form.cases.find((c) => c.caseId === "137")?.value, 2500, "137 reste publiable case par case");
    assert.equal(form.cases.find((c) => c.caseId === "142"), undefined, "142 ne peut plus être publié sur un équilibre qui ignore 137");
  });

  it("F2 — R-01 : 137=2500 AVEC trésorerie +2500 → EQUILIBRE, 142=44000 = capitaux du passif vérifié", () => {
    const rfsSansPatrimoine = buildRfs();
    const inputsEquilibres: BilanInputs = {
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 5500 }, // 3000 + 2500
      subventionsInvestissement: { status: "DECLARE", montant: 2500 },
    };
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputsEquilibres);
    const equilibre = checkBilanEquilibre({ patrimoine });
    assert.equal(equilibre.status, "EQUILIBRE");
    assert.equal(equilibre.totalActifNet, 64000);
    assert.equal(equilibre.totalPassif, 64000, "passif = 44000 (142) + 20000 (emprunts)");

    const form = map2033AFromRfs({ ...rfsSansPatrimoine, patrimoine });
    assert.equal(form.cases.find((c) => c.caseId === "137")?.value, 2500);
    assert.equal(form.cases.find((c) => c.caseId === "142")?.value, 44000, "142 publié = exactement les capitaux propres du check");
  });

  it("H — non-régression : sans BilanInputs (rfs.patrimoine absent), 137/142 restent bloquées comme avant ce jalon, rien n'est inventé", () => {
    const rfsSansPatrimoine = buildRfs();
    const form = map2033AFromRfs(rfsSansPatrimoine);
    assert.equal(form.cases.find((c) => c.caseId === "137"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "142"), undefined);
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "137"));
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "142"));
  });

  it("I — non-régression fiscale : 136 = 310 inchangé par cette correction (137/142 sont des cases patrimoniales pures, jamais lues par 136)", () => {
    const rfsSansPatrimoine = buildRfs();
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, BILAN_INPUTS);
    const rfsAvecPatrimoine: FiscalRepresentation = { ...rfsSansPatrimoine, patrimoine };
    const form = map2033AFromRfs(rfsAvecPatrimoine);
    assert.equal(form.cases.find((c) => c.caseId === "136")?.value, 5400, "136 inchangé par la correction P1-A");
  });
});
