/**
 * Chantier 2D-E2 — câblage moteur des totaux généraux 110 (Brut) et 180
 * (NET Passif) dans map2033AFromRfs(), via les gates créées au chantier
 * 2D-E1 (gateTotal110, gateTotal180). Aucune règle fiscale nouvelle : ce
 * fichier teste uniquement le câblage bout-en-bout du mapper — les gates
 * elles-mêmes sont déjà couvertes par bilan-lignes-simples.test.ts.
 * Run: npx tsx --test src/runtime/bilan-map-2033a-2d-totaux-generaux.test.ts
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
  amortNonDeduitExercice: 0,
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

// Même fixture immobilisations que 2D-B/SYNTHETIC_P0 (028=60000, netTotal
// patrimonial=58500) — déjà démontrée EQUILIBRE avec cet emprunt (156=20000).
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

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Chantier 2D-E2 totaux généraux" };

/**
 * BilanInputs permettant simultanément :
 * - 044/096 (composantes 014/040/028 et 064/068/072/080/084/092) ;
 * - 176 (composantes 156/164/166/172/174/175) ;
 * - 142 (capitaux propres, EQUILIBRE réel).
 *
 * Point d'attention : `checkBilanEquilibre()` reconstruit localement
 * `creances`/`dettes` à partir de `contributionTiers` (contribution tiers
 * ventilée), DISTINCT de 096/176 eux-mêmes (qui incluent aussi 080/084/092
 * et 156, hors du périmètre de cette reconstruction — voir chantier 2D-D).
 * Pour préserver un EQUILIBRE réel tout en peuplant 068/072/164/166/172
 * (nécessaires à 096/176, sans équivalent lignesSimples), les buckets
 * `tiers.creances`/`tiers.dettes` sont déclarés à EXACTEMENT la somme de
 * leur propre ventilation (300 de chaque côté) : la contribution s'annule
 * symétriquement dans l'égalité actif net = passif, sans qu'aucune valeur
 * ne soit inventée — c'est la même égalité que celle déjà démontrée par la
 * fixture SYNTHETIC_P0 (bilan-map-2033a-integration.test.ts / 142=41500)
 * lorsque creances=dettes=0, ici simplement décalée symétriquement.
 */
const BILAN_INPUTS: BilanInputs = {
  tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
  compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
  ran: { situation: "NATIF" },
  subventionsInvestissement: { status: "NUL_CONFIRME" },
  tiers: {
    creances: { status: "DECLARE", montant: 300 },
    dettes: { status: "DECLARE", montant: 300 },
    // Emprunt canonique (156, F-011) et tiers.dettes DECLARE coexistent :
    // réconciliation explicite obligatoire (jamais déduite des montants).
    // Le bucket dettes (300 €) ne modélise ici que les tiers ventilés
    // (164/166/172), l'emprunt (156) en est structurellement exclu.
    reconciliationEmprunts: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
  },
  lignesSimples: {
    autresImmobilisationsIncorporellesBrut: { status: "DECLARE", montant: 500 }, // 014
    immobilisationsFinancieresBrut: { status: "DECLARE", montant: 600 }, // 040
    valeursMobilieresPlacementBrut: { status: "DECLARE", montant: 400 }, // 080
    avancesAcomptesVerses: { status: "NUL_CONFIRME" }, // 064 (repli lignesSimples, aucune ventilation pour cette nature)
    chargesConstateesAvance: { status: "NUL_CONFIRME" }, // 092 (idem)
    produitsConstatesAvance: { status: "NUL_CONFIRME" }, // 174 (idem)
    autresDettes: { status: "NUL_CONFIRME" }, // 175 (idem)
  },
  ventilationTiers: {
    postes: [
      { nature: "LOYER_DU_PAR_LOCATAIRE", montant: 100 }, // 068
      { nature: "AUTRE_CREANCE_ACTIVITE", montant: 200 }, // 072 — creances : 100+200=300
      { nature: "ACOMPTE_RECU_SUR_COMMANDE", montant: 100 }, // 164
      { nature: "FOURNISSEUR_NON_PAYE", montant: 100 }, // 166
      { nature: "DETTE_FISCALE_OU_SOCIALE", montant: 100 }, // 172 — dettes : 100+100+100=300
    ],
  },
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

function mapWithPatrimoine(inputs: BilanInputs, rfsOverride?: Partial<FiscalRepresentation>) {
  const rfs = { ...buildRfs(), ...rfsOverride };
  const patrimoine = assemblePatrimoine(rfs, inputs);
  return map2033AFromRfs({ ...rfs, patrimoine });
}

function findCase(form: ReturnType<typeof map2033AFromRfs>, caseId: string) {
  return form.cases.find((c) => c.caseId === caseId);
}
function findBlocked(form: ReturnType<typeof map2033AFromRfs>, caseId: string) {
  return form.casesNonAlimentees.find((c) => c.caseId === caseId);
}

describe("Chantier 2D-E2 — préalable : la fixture atteint bien EQUILIBRE réel", () => {
  it("checkBilanEquilibre() sur cette fixture retourne EQUILIBRE (142 doit pouvoir se publier)", () => {
    const rfs = buildRfs();
    const patrimoine = assemblePatrimoine(rfs, BILAN_INPUTS);
    const equilibre = checkBilanEquilibre({ patrimoine });
    assert.equal(equilibre.status, "EQUILIBRE", JSON.stringify(equilibre.reasons));
  });
});

describe("Chantier 2D-E2 — 110 = 044 + 096 (colonne Brut)", () => {
  it("1. Nominal — 044 et 096 publiées → 110 = 61100 + 3700 = 64800, trace explicite", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(findCase(form, "044")?.value, 61100);
    assert.equal(findCase(form, "096")?.value, 3700);
    const case110 = findCase(form, "110");
    assert.ok(case110, "110 doit être publiée");
    assert.equal(case110!.value, 64800);
    assert.match(case110!.trace.path, /110 = 044 \+ 096/);
  });

  it("2. 044 bloquée (014 jamais saisi) → 110 bloqué", () => {
    const inputs: BilanInputs = {
      ...BILAN_INPUTS,
      lignesSimples: { ...BILAN_INPUTS.lignesSimples, autresImmobilisationsIncorporellesBrut: undefined },
    };
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "044"), undefined);
    assert.equal(findCase(form, "110"), undefined);
    assert.match(findBlocked(form, "110")!.raison, /composante 044 non publiable/i);
  });

  it("3. 096 bloquée (084 trésorerie inconnue) → 110 bloqué", () => {
    const form = mapWithPatrimoine({ ...BILAN_INPUTS, tresorerie: { bankMode: "INCONNU" } });
    assert.equal(findCase(form, "096"), undefined);
    assert.equal(findCase(form, "110"), undefined);
    assert.match(findBlocked(form, "110")!.raison, /composante 096 non publiable/i);
  });

  it("4. 044 et 096 toutes deux bloquées → 110 bloqué avec raison mentionnant les deux", () => {
    const inputs: BilanInputs = {
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "INCONNU" },
      lignesSimples: { ...BILAN_INPUTS.lignesSimples, autresImmobilisationsIncorporellesBrut: undefined },
    };
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "110"), undefined);
    assert.match(findBlocked(form, "110")!.raison, /composantes 044 et 096 non publiables/i);
  });

  it("5. La valeur de 110 provient bien des cases 044/096 réellement publiées, pas d'un recalcul indépendant", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    const v044 = findCase(form, "044")!.value as number;
    const v096 = findCase(form, "096")!.value as number;
    assert.equal(findCase(form, "110")!.value, v044 + v096);
  });
});

describe("Chantier 2D-E2 — 180 = 142 + 176 (colonne NET Passif)", () => {
  it("6. Nominal — 142 et 176 publiées → 180 = 41500 + 20300 = 61800, trace explicite", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(findCase(form, "142")?.value, 41500);
    assert.equal(findCase(form, "176")?.value, 20300);
    const case180 = findCase(form, "180");
    assert.ok(case180, "180 doit être publiée");
    assert.equal(case180!.value, 61800);
    assert.match(case180!.trace.path, /180 = 142 \+ 176/);
  });

  it("7. 142 bloquée (subventions INCONNU → bilan non EQUILIBRE) → 180 bloqué", () => {
    const { subventionsInvestissement: _ignored, ...sansSubventions } = BILAN_INPUTS;
    const form = mapWithPatrimoine(sansSubventions);
    assert.equal(findCase(form, "142"), undefined);
    assert.equal(findCase(form, "180"), undefined);
    assert.match(findBlocked(form, "180")!.raison, /composante 142 non publiable/i);
  });

  it("8. 176 bloquée seule (174 jamais saisi) → 180 bloqué, 142 reste publiée (équilibre non affecté)", () => {
    const inputs: BilanInputs = {
      ...BILAN_INPUTS,
      lignesSimples: { ...BILAN_INPUTS.lignesSimples, produitsConstatesAvance: undefined },
    };
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "142")?.value, 41500, "142 ne doit pas être affectée par le blocage de 176");
    assert.equal(findCase(form, "176"), undefined);
    assert.equal(findCase(form, "180"), undefined);
    assert.match(findBlocked(form, "180")!.raison, /composante 176 non publiable/i);
  });

  it("9. Divergence gate/publication — impossible de publier 180 sans que 142 ET 176 soient RÉELLEMENT dans cases[] (pas seulement leur gate satisfaite)", () => {
    // 156 DIVERGENT (F-011 ≠ déclaré) : gate176 elle-même resterait BLOQUE en amont,
    // donc 176 n'est jamais publiée — la même garde protège 180 par transitivité.
    const form = mapWithPatrimoine({ ...BILAN_INPUTS, financements: { clotureCRD: 999999 } });
    assert.equal(findCase(form, "156"), undefined, "156 doit être bloquée par la réconciliation F-011/déclaré");
    assert.equal(findCase(form, "176"), undefined);
    assert.equal(findCase(form, "180"), undefined);
  });

  it("10. 154 n'est jamais une dépendance de 180 — aucune mention de 154 dans la formule ni dans une raison de blocage", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    const case180 = findCase(form, "180")!;
    assert.doesNotMatch(case180.trace.path, /154/);
    // Cas bloqué : la raison ne doit pas non plus référencer 154 comme composante manquante.
    const { subventionsInvestissement: _ignored, ...sansSubventions } = BILAN_INPUTS;
    const formBloque = mapWithPatrimoine(sansSubventions);
    assert.doesNotMatch(findBlocked(formBloque, "180")!.raison, /154/);
  });
});

describe("Chantier 2D-E2 — non-régression", () => {
  it("11. 044/096/176 restent correctement calculées (non affectées par le câblage de 110/180)", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(findCase(form, "044")?.value, 61100);
    assert.equal(findCase(form, "096")?.value, 3700);
    assert.equal(findCase(form, "176")?.value, 20300);
  });

  it("12. 048/098/112 restent correctement bloquées (016/042/066/070/074/082/094 jamais saisies dans cette fixture) — aucune régression, aucun crash", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    for (const id of ["048", "098", "112"] as const) {
      assert.equal(findCase(form, id), undefined);
      assert.ok(findBlocked(form, id));
    }
  });

  it("13. patrimoine === undefined (legacy) → 110/180 restent bloquées comme avant", () => {
    const form = map2033AFromRfs(buildRfs());
    for (const id of ["110", "180"] as const) {
      assert.equal(findCase(form, id), undefined);
      assert.ok(findBlocked(form, id));
    }
  });
});
