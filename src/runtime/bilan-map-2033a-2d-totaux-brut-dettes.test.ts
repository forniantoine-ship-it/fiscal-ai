/**
 * Chantier 2D-B — câblage moteur des totaux 044 (Brut), 096 (Brut) et 176
 * (Dettes) dans map2033AFromRfs(), via les gates corrigées au chantier 2C
 * (gateTotal044ActifImmobiliseBrut, gateTotal096AvecVentilation,
 * gateTotal176AvecVentilation). Aucune règle fiscale nouvelle : ce fichier
 * teste uniquement le câblage bout-en-bout du mapper, les gates elles-mêmes
 * étant déjà couvertes par bilan-lignes-simples.test.ts et
 * bilan-ventilation-tiers.test.ts.
 * Run: npx tsx --test src/runtime/bilan-map-2033a-2d-totaux-brut-dettes.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
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

// Même fixture que F4-C — 028 = 60000, 030 = 1500, déjà démontré correct.
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

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Chantier 2D-B totaux Brut/Dettes" };

const BILAN_INPUTS_BASE: BilanInputs = {
  tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
  compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
  ran: { situation: "NATIF" },
  tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
  subventionsInvestissement: { status: "NUL_CONFIRME" },
};

/** lignesSimples/ventilationTiers permettant 044, 096 ET 176 — valeurs toutes distinctes. */
function inputsToutesComposantesConnues(overrides: Partial<BilanInputs> = {}): BilanInputs {
  return {
    ...BILAN_INPUTS_BASE,
    lignesSimples: {
      autresImmobilisationsIncorporellesBrut: { status: "DECLARE", montant: 100 }, // 014
      immobilisationsFinancieresBrut: { status: "DECLARE", montant: 200 }, // 040
      valeursMobilieresPlacementBrut: { status: "DECLARE", montant: 55 }, // 080
    },
    ventilationTiers: {
      postes: [
        { nature: "ACOMPTE_VERSE_A_FOURNISSEUR", montant: 11 }, // 064
        { nature: "LOYER_DU_PAR_LOCATAIRE", montant: 22 }, // 068
        { nature: "AUTRE_CREANCE_ACTIVITE", montant: 33 }, // 072
        { nature: "CHARGE_CONSTATEE_AVANCE", montant: 44 }, // 092
        { nature: "ACOMPTE_RECU_SUR_COMMANDE", montant: 66 }, // 164
        { nature: "FOURNISSEUR_NON_PAYE", montant: 77 }, // 166
        { nature: "DETTE_FISCALE_OU_SOCIALE", montant: 88 }, // 172
        { nature: "LOYER_ENCAISSE_D_AVANCE", montant: 99 }, // 174
        { nature: "DEPOT_GARANTIE_LOCATAIRE", montant: 111 }, // 175
      ],
    },
    ...overrides,
  };
}

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

describe("Chantier 2D-B — 044 = 014 + 028 + 040", () => {
  it("A — toutes composantes publiables → 044 = 60000 + 100 + 200 = 60300, trace explicite", () => {
    const form = mapWithPatrimoine(inputsToutesComposantesConnues());
    assert.equal(findCase(form, "028")?.value, 60000);
    const case044 = findCase(form, "044");
    assert.ok(case044, "044 doit être publiée");
    assert.equal(case044!.value, 60300);
    assert.match(case044!.trace.path, /044 = 014 \+ 028 \+ 040/);
  });

  it("B — 014 INCONNU (jamais saisi) → 044 bloqué, jamais une somme partielle", () => {
    const inputs = inputsToutesComposantesConnues();
    delete (inputs.lignesSimples as Record<string, unknown>).autresImmobilisationsIncorporellesBrut;
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "044"), undefined);
    assert.match(findBlocked(form, "044")!.raison, /014/i);
  });

  it("C — 028 non publiable (immobilisations sans valeurTerrain) → 044 bloqué en mentionnant 028", () => {
    const form = mapWithPatrimoine(inputsToutesComposantesConnues(), {
      immobilisations: { ...IMMOBILISATIONS, valeurTerrain: undefined },
    });
    assert.equal(findCase(form, "028"), undefined);
    assert.equal(findCase(form, "044"), undefined);
    assert.match(findBlocked(form, "044")!.raison, /028 non publiable/i);
  });

  it("D — 014 = 0 explicite (NUL_CONFIRME) ≠ 014 absent : 044 publiable à 60200, jamais confondu avec un blocage", () => {
    const inputs = inputsToutesComposantesConnues({
      lignesSimples: {
        ...inputsToutesComposantesConnues().lignesSimples,
        autresImmobilisationsIncorporellesBrut: { status: "NUL_CONFIRME" },
      },
    });
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "014")?.value, 0);
    assert.equal(findCase(form, "044")?.value, 60200);
  });
});

describe("Chantier 2D-B — 096 = 064 + 068 + 072 + 080 + 084 + 092", () => {
  it("A — toutes composantes publiables → 096 = 11+22+33+55+3000+44 = 3165, trace explicite", () => {
    const form = mapWithPatrimoine(inputsToutesComposantesConnues());
    assert.equal(findCase(form, "084")?.value, 3000);
    const case096 = findCase(form, "096");
    assert.ok(case096, "096 doit être publiée");
    assert.equal(case096!.value, 3165);
    assert.match(case096!.trace.path, /096 = 064 \+ 068 \+ 072 \+ 080 \+ 084 \+ 092/);
  });

  it("B — 068 INCONNU (aucun poste LOYER_DU_PAR_LOCATAIRE) → 096 bloqué en mentionnant 068", () => {
    const inputs = inputsToutesComposantesConnues({
      ventilationTiers: {
        postes: inputsToutesComposantesConnues().ventilationTiers!.postes.filter((p) => p.nature !== "LOYER_DU_PAR_LOCATAIRE"),
      },
    });
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "096"), undefined);
    assert.match(findBlocked(form, "096")!.raison, /068/i);
  });

  it("C — 084 non publiable (trésorerie INCONNUE) → 096 bloqué en mentionnant 084", () => {
    const form = mapWithPatrimoine(inputsToutesComposantesConnues({ tresorerie: { bankMode: "INCONNU" } }));
    assert.equal(findCase(form, "084"), undefined);
    assert.equal(findCase(form, "096"), undefined);
    assert.match(findBlocked(form, "096")!.raison, /084 non publiable/i);
  });

  it("D — 080 = 0 explicite (NUL_CONFIRME) ≠ 080 absent : 096 publiable à 3110, jamais confondu", () => {
    const inputs = inputsToutesComposantesConnues({
      lignesSimples: { ...inputsToutesComposantesConnues().lignesSimples, valeursMobilieresPlacementBrut: { status: "NUL_CONFIRME" } },
    });
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "080")?.value, 0);
    assert.equal(findCase(form, "096")?.value, 3110);
  });

  it("Divergence — 064 lignesSimples DECLARE ≠ ventilation DECLARE au-delà de la tolérance → 096 bloqué, jamais une valeur arbitraire", () => {
    const inputs = inputsToutesComposantesConnues({
      lignesSimples: { ...inputsToutesComposantesConnues().lignesSimples, avancesAcomptesVerses: { status: "DECLARE", montant: 500 } },
      // ventilation garde ACOMPTE_VERSE_A_FOURNISSEUR = 11, très éloigné de 500.
    });
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "064"), undefined, "064 elle-même doit être bloquée par la réconciliation");
    assert.equal(findCase(form, "096"), undefined);
    assert.match(findBlocked(form, "096")!.raison, /064/i);
  });
});

describe("Chantier 2D-B — 176 = 156 + 164 + 166 + 172 + 174 + 175", () => {
  it("A — toutes composantes publiables → 176 = 20000+66+77+88+99+111 = 20441, trace explicite", () => {
    const form = mapWithPatrimoine(inputsToutesComposantesConnues());
    assert.equal(findCase(form, "156")?.value, 20000);
    const case176 = findCase(form, "176");
    assert.ok(case176, "176 doit être publiée");
    assert.equal(case176!.value, 20441);
    assert.match(case176!.trace.path, /176 = 156 \+ 164 \+ 166 \+ 172 \+ 174 \+ 175/);
  });

  it("B — 166 INCONNU (aucun poste FOURNISSEUR_NON_PAYE) → 176 bloqué en mentionnant 166", () => {
    const inputs = inputsToutesComposantesConnues({
      ventilationTiers: {
        postes: inputsToutesComposantesConnues().ventilationTiers!.postes.filter((p) => p.nature !== "FOURNISSEUR_NON_PAYE"),
      },
    });
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "176"), undefined);
    assert.match(findBlocked(form, "176")!.raison, /166/i);
  });

  it("C — 156 non publiable (aucun emprunt, ni F-011 ni déclaré) → 176 bloqué en mentionnant 156", () => {
    const form = mapWithPatrimoine(inputsToutesComposantesConnues(), { emprunts: undefined });
    assert.equal(findCase(form, "156"), undefined);
    assert.equal(findCase(form, "176"), undefined);
    assert.match(findBlocked(form, "176")!.raison, /156 non publiable/i);
  });

  it("D — 174 = 0 explicite (NUL_CONFIRME, aucun poste LOYER_ENCAISSE_D_AVANCE) ≠ absent : 176 publiable à 20342", () => {
    const inputs = inputsToutesComposantesConnues({
      lignesSimples: { ...inputsToutesComposantesConnues().lignesSimples, produitsConstatesAvance: { status: "NUL_CONFIRME" } },
      ventilationTiers: {
        postes: inputsToutesComposantesConnues().ventilationTiers!.postes.filter((p) => p.nature !== "LOYER_ENCAISSE_D_AVANCE"),
      },
    });
    const form = mapWithPatrimoine(inputs);
    assert.equal(findCase(form, "174")?.value, 0);
    assert.equal(findCase(form, "176")?.value, 20342);
  });

  it("Divergence — 156 DIVERGENT (F-011 ≠ BilanInputs.financements.clotureCRD) → 176 bloqué, jamais une valeur choisie arbitrairement", () => {
    const form = mapWithPatrimoine(
      inputsToutesComposantesConnues({ financements: { clotureCRD: 999999 } }),
    );
    assert.equal(findCase(form, "156"), undefined, "156 elle-même doit être bloquée par la réconciliation F-011/déclaré");
    assert.equal(findCase(form, "176"), undefined);
    assert.match(findBlocked(form, "176")!.raison, /156 non publiable/i);
  });
});

describe("Chantier 2D-B — non-régression 048/098/112/110/180", () => {
  it("048/098/112 restent bloquées dans ce scénario (016/042/066/070/074/082/094 jamais saisies) ; 180 reste bloqué (142 non résolu, bilan non EQUILIBRE)", () => {
    const form = mapWithPatrimoine(inputsToutesComposantesConnues());
    for (const id of ["048", "098", "112"] as const) {
      assert.equal(findCase(form, id), undefined, `${id} ne doit pas être inventée par ce chantier`);
    }
    // Chantier 2D-E2 — 110 = 044 + 096 est désormais câblée : cette fixture
    // publie 044/096, donc 110 doit l'être aussi (63465), plus "toujours
    // interdite" comme avant le chantier E2. 180, en revanche, reste
    // bloquée ici : tiers.dettes NUL_CONFIRME + ventilation dettes non nulle
    // (postes de cette fixture) rend la contribution tiers INCOHERENTE,
    // donc checkBilanEquilibre() ne peut jamais atteindre EQUILIBRE — 142
    // reste bloquée, donc 180 aussi (voir bilan-map-2033a-2d-totaux-generaux.test.ts
    // pour un scénario où 142 est réellement résolu et 180 se publie).
    const case110 = findCase(form, "110");
    assert.ok(case110, "110 doit désormais être publiée (044 et 096 sont toutes deux publiables ici)");
    assert.equal(case110!.value, 63465, "110 = 044 (60300) + 096 (3165)");
    assert.equal(findCase(form, "180"), undefined, "180 reste bloquée : 142 non résolu dans cette fixture");
    assert.ok(findBlocked(form, "180"));
  });

  it("patrimoine === undefined (legacy) → 044/096/176 restent bloquées comme avant", () => {
    const form = map2033AFromRfs(buildRfs());
    for (const id of ["044", "096", "176"] as const) {
      assert.equal(findCase(form, id), undefined);
      assert.ok(findBlocked(form, id));
    }
  });
});
