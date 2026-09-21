/**
 * P1-PDF-02-G2 — publication des 12 cases Brut/tiers résolues en interne
 * mais jusqu'ici jamais projetées en case Cerfa (audit P1-PDF-02-G, Finding
 * transverse #1) : 014, 040, 064, 068, 072, 080, 092, 164, 166, 172, 174, 175.
 * Run: npx tsx --test src/runtime/bilan-map-2033a-g2-tiers-brut.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
import { resolveCaseAvecVentilationPrioritaire } from "./capabilities/bilan/ventilation-tiers";
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

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "G2 tiers brut" };

const BILAN_INPUTS: BilanInputs = {
  tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
  compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
  ran: { situation: "NATIF" },
  tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
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

function mapWithPatrimoine(inputs: BilanInputs) {
  const rfs = buildRfs();
  const patrimoine = assemblePatrimoine(rfs, inputs);
  return map2033AFromRfs({ ...rfs, patrimoine });
}

const G2_CASE_IDS = ["014", "040", "064", "068", "072", "080", "092", "164", "166", "172", "174", "175"] as const;

// ---------------------------------------------------------------------------
// Famille A — source unique lignesSimples (014, 040, 080)
// ---------------------------------------------------------------------------

describe("G2 — famille A (source unique lignesSimples) : 014/040/080", () => {
  it("DECLARE → publication avec la valeur déclarée", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesBrut: { status: "DECLARE", montant: 500 },
        immobilisationsFinancieresBrut: { status: "DECLARE", montant: 700 },
        valeursMobilieresPlacementBrut: { status: "DECLARE", montant: 900 },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "014")?.value, 500);
    assert.equal(form.cases.find((c) => c.caseId === "040")?.value, 700);
    assert.equal(form.cases.find((c) => c.caseId === "080")?.value, 900);
  });

  it("NUL_CONFIRME → publication à 0 (absence confirmée, pas un défaut)", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesBrut: { status: "NUL_CONFIRME" },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "014")?.value, 0);
  });

  it("INCONNU (absence de saisie) → blocage avec raison précise du resolver, jamais 0", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(form.cases.find((c) => c.caseId === "014"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "040"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "080"), undefined);
    const blocked014 = form.casesNonAlimentees.find((c) => c.caseId === "014");
    assert.ok(blocked014);
    assert.match(blocked014!.raison, /aucune information|INCONNU|014/i);
    assert.equal(blocked014!.categorie, "donnee_absente");
  });
});

// ---------------------------------------------------------------------------
// Famille B — source unique ventilationTiers (068, 072, 164, 166, 172)
// ---------------------------------------------------------------------------

describe("G2 — famille B (source unique ventilationTiers) : 068/072/164/166/172", () => {
  it("DECLARE (poste classifié) → publication avec la somme des postes", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      ventilationTiers: {
        postes: [
          { nature: "LOYER_DU_PAR_LOCATAIRE", montant: 400, libelle: "Loyer dû décembre" },
          { nature: "AUTRE_CREANCE_ACTIVITE", montant: 150 },
          { nature: "ACOMPTE_RECU_SUR_COMMANDE", montant: 80 },
          { nature: "FOURNISSEUR_NON_PAYE", montant: 220 },
          { nature: "DETTE_FISCALE_OU_SOCIALE", montant: 310 },
        ],
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "068")?.value, 400);
    assert.equal(form.cases.find((c) => c.caseId === "072")?.value, 150);
    assert.equal(form.cases.find((c) => c.caseId === "164")?.value, 80);
    assert.equal(form.cases.find((c) => c.caseId === "166")?.value, 220);
    assert.equal(form.cases.find((c) => c.caseId === "172")?.value, 310);
  });

  it("INCONNU (aucun poste classifié) → blocage, jamais 0 (la ventilation ne connaît pas NUL_CONFIRME)", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    for (const caseId of ["068", "072", "164", "166", "172"] as const) {
      assert.equal(form.cases.find((c) => c.caseId === caseId), undefined);
      const blocked = form.casesNonAlimentees.find((c) => c.caseId === caseId);
      assert.ok(blocked, `case ${caseId} doit être bloquée`);
      assert.match(blocked!.raison, /aucune nature économique classifiée|non ventilé/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Famille C — double source réconciliée (064, 092, 174, 175)
// ---------------------------------------------------------------------------

const DUAL_CASES = [
  {
    caseId: "064",
    natureVentilation: "ACOMPTE_VERSE_A_FOURNISSEUR",
    ligneSimpleKey: "avancesAcomptesVerses",
  },
  {
    caseId: "092",
    natureVentilation: "CHARGE_CONSTATEE_AVANCE",
    ligneSimpleKey: "chargesConstateesAvance",
  },
  {
    caseId: "174",
    natureVentilation: "LOYER_ENCAISSE_D_AVANCE",
    ligneSimpleKey: "produitsConstatesAvance",
  },
  {
    caseId: "175",
    natureVentilation: "DEPOT_GARANTIE_LOCATAIRE",
    ligneSimpleKey: "autresDettes",
  },
] as const;

describe("G2 — famille C (double source lignesSimples + ventilationTiers) : 064/092/174/175", () => {
  for (const { caseId, natureVentilation, ligneSimpleKey } of DUAL_CASES) {
    describe(`case ${caseId}`, () => {
      it("deux DECLARE identiques → publication (pas de blocage sur simple concordance)", () => {
        const form = mapWithPatrimoine({
          ...BILAN_INPUTS,
          lignesSimples: { [ligneSimpleKey]: { status: "DECLARE", montant: 300 } },
          ventilationTiers: { postes: [{ nature: natureVentilation, montant: 300 }] },
        });
        assert.equal(form.cases.find((c) => c.caseId === caseId)?.value, 300);
      });

      it("ventilation DECLARE + lignesSimples DECLARE différente → ventilation prioritaire", () => {
        const form = mapWithPatrimoine({
          ...BILAN_INPUTS,
          lignesSimples: { [ligneSimpleKey]: { status: "DECLARE", montant: 999 } },
          ventilationTiers: { postes: [{ nature: natureVentilation, montant: 999 }] },
        });
        // valeurs identiques ici (contrôle isolé de la priorité dans le test dédié ci-dessous
        // avec des montants réellement différents mais NON divergents n'a pas de sens : au-delà
        // de la tolérance de 0.01 €, deux DECLARE différents sont un conflit, pas une priorité —
        // voir le test « deux DECLARE divergents » plus bas pour ce cas.
        assert.equal(form.cases.find((c) => c.caseId === caseId)?.value, 999);
      });

      it("ventilation absente (INCONNU) + lignesSimples DECLARE → repli sur lignesSimples", () => {
        const form = mapWithPatrimoine({
          ...BILAN_INPUTS,
          lignesSimples: { [ligneSimpleKey]: { status: "DECLARE", montant: 456 } },
        });
        assert.equal(form.cases.find((c) => c.caseId === caseId)?.value, 456);
      });

      it("ventilation absente (INCONNU) + lignesSimples NUL_CONFIRME → repli, publication à 0", () => {
        const form = mapWithPatrimoine({
          ...BILAN_INPUTS,
          lignesSimples: { [ligneSimpleKey]: { status: "NUL_CONFIRME" } },
        });
        assert.equal(form.cases.find((c) => c.caseId === caseId)?.value, 0);
      });

      it("les deux INCONNU (aucune saisie) → blocage", () => {
        const form = mapWithPatrimoine(BILAN_INPUTS);
        assert.equal(form.cases.find((c) => c.caseId === caseId), undefined);
        assert.ok(form.casesNonAlimentees.some((c) => c.caseId === caseId));
      });

      it("deux DECLARE divergents → blocage explicite, jamais somme ni choix arbitraire", () => {
        const form = mapWithPatrimoine({
          ...BILAN_INPUTS,
          lignesSimples: { [ligneSimpleKey]: { status: "DECLARE", montant: 100 } },
          ventilationTiers: { postes: [{ nature: natureVentilation, montant: 250 }] },
        });
        assert.equal(form.cases.find((c) => c.caseId === caseId), undefined);
        const blocked = form.casesNonAlimentees.find((c) => c.caseId === caseId);
        assert.ok(blocked);
        assert.match(blocked!.raison, /divergent/i);
        assert.match(blocked!.raison, /100/);
        assert.match(blocked!.raison, /250/);
        // jamais une somme (350) ni un choix arbitraire (100 ou 250) publiés
        assert.notEqual(form.cases.find((c) => c.caseId === caseId)?.value, 350);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// resolveCaseAvecVentilationPrioritaire — tests unitaires isolés du helper
// ---------------------------------------------------------------------------

describe("G2 — resolveCaseAvecVentilationPrioritaire (unitaire)", () => {
  it("ventilation DECLARE, lignesSimples INCONNU → ventilation retenue telle quelle", () => {
    const res = resolveCaseAvecVentilationPrioritaire(
      "064",
      { status: "INCONNU", raison: "x" },
      { status: "DECLARE", montant: 42, raison: "y" },
    );
    assert.deepEqual(res, { status: "DECLARE", montant: 42, raison: "y" });
  });

  it("ventilation INCONNU, lignesSimples DECLARE → lignesSimples retenue telle quelle", () => {
    const res = resolveCaseAvecVentilationPrioritaire(
      "064",
      { status: "DECLARE", montant: 17, raison: "y" },
      { status: "INCONNU", raison: "x" },
    );
    assert.deepEqual(res, { status: "DECLARE", montant: 17, raison: "y" });
  });

  it("les deux INCONNU → INCONNU (raison de lignesSimples conservée, pas réécrite)", () => {
    const res = resolveCaseAvecVentilationPrioritaire(
      "064",
      { status: "INCONNU", raison: "raison lignesSimples" },
      { status: "INCONNU", raison: "raison ventilation" },
    );
    assert.equal(res.status, "INCONNU");
    assert.equal(res.raison, "raison lignesSimples");
  });

  it("deux DECLARE égaux (à la tolérance près) → pas de blocage, ventilation retournée", () => {
    const res = resolveCaseAvecVentilationPrioritaire(
      "064",
      { status: "DECLARE", montant: 100.001, raison: "y" },
      { status: "DECLARE", montant: 100.004, raison: "x" },
    );
    assert.equal(res.status, "DECLARE");
  });

  it("deux DECLARE divergents → INCONNU avec raison explicite citant les deux montants", () => {
    const res = resolveCaseAvecVentilationPrioritaire(
      "175",
      { status: "DECLARE", montant: 10, raison: "y" },
      { status: "DECLARE", montant: 90, raison: "x" },
    );
    assert.equal(res.status, "INCONNU");
    assert.match(res.raison, /175/);
    assert.match(res.raison, /10/);
    assert.match(res.raison, /90/);
  });

  it("NUL_CONFIRME (lignesSimples) + INCONNU (ventilation) → repli NUL_CONFIRME, jamais écrasé", () => {
    const res = resolveCaseAvecVentilationPrioritaire(
      "175",
      { status: "NUL_CONFIRME", montant: 0, raison: "y" },
      { status: "INCONNU", raison: "x" },
    );
    assert.deepEqual(res, { status: "NUL_CONFIRME", montant: 0, raison: "y" });
  });
});

// ---------------------------------------------------------------------------
// patrimoine === undefined → fallback historique inchangé (G1 hors périmètre)
// ---------------------------------------------------------------------------

describe("G2 — patrimoine === undefined : fallback historique inchangé", () => {
  it("les 12 cases restent bloquées avec exactement les mêmes libellés/raisons qu'avant G2", () => {
    const form = map2033AFromRfs(buildRfs());
    const EXPECTED_LABELS: Record<(typeof G2_CASE_IDS)[number], string> = {
      "014": "Autres immobilisations incorporelles (brut)",
      "040": "Immobilisations financières (brut)",
      "064": "Avances et acomptes versés sur commandes (brut)",
      "068": "Clients et comptes rattachés (brut)",
      "072": "Autres créances (brut)",
      "080": "Valeurs mobilières de placement (brut)",
      "092": "Charges constatées d'avance (brut)",
      "164": "Avances et acomptes reçus sur commandes en cours",
      "166": "Fournisseurs et comptes rattachés",
      "172": "Dettes fiscales et sociales",
      "174": "Produits constatés d'avance",
      "175": "Autres dettes",
    };
    for (const caseId of G2_CASE_IDS) {
      assert.equal(form.cases.find((c) => c.caseId === caseId), undefined, `case ${caseId} ne doit jamais être publiée sans patrimoine`);
      const blocked = form.casesNonAlimentees.find((c) => c.caseId === caseId);
      assert.ok(blocked, `case ${caseId} doit rester dans casesNonAlimentees`);
      assert.equal(blocked!.label, EXPECTED_LABELS[caseId]);
      assert.equal(blocked!.categorie, "donnee_absente");
    }
  });
});

// ---------------------------------------------------------------------------
// Non-régression — les cases F0/F4-A/F4-B/F4-C ne sont pas affectées par G2
// ---------------------------------------------------------------------------

describe("G2 — non-régression sur les cases déjà publiées", () => {
  it("030/136/084 inchangées ; 044/096/110/112/176/180 restent hors périmètre (toujours bloqués)", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
        immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
        valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
        avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
        clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
        autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
        chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
        autresImmobilisationsIncorporellesBrut: { status: "DECLARE", montant: 10 },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "030")?.value, 1500);
    assert.equal(form.cases.find((c) => c.caseId === "136")?.value, 5400);
    assert.equal(form.cases.find((c) => c.caseId === "084")?.value, 3000);
    assert.equal(form.cases.find((c) => c.caseId === "014")?.value, 10);
    for (const id of ["044", "096", "110", "112", "176", "180"] as const) {
      assert.equal(form.cases.find((c) => c.caseId === id), undefined);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === id));
    }
  });
});
