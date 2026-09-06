/**
 * P1-PDF-02-F4-B — feuilles circulant Amort (066/070/074/094) + 086 provisions.
 * Run: npx tsx --test src/runtime/bilan-map-2033a-f4b-amort-feuilles.test.ts
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

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "F4-B amort feuilles" };

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

describe("F4-B — 066/070/074/094 sans saisie amort dédiée", () => {
  it("restent bloquées (INCONNU) même si brut / ventilation DECLARE", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tiers: { creances: { status: "DECLARE", montant: 5000 }, dettes: { status: "NUL_CONFIRME" } },
      lignesSimples: {
        avancesAcomptesVerses: { status: "DECLARE", montant: 100 },
        chargesConstateesAvance: { status: "DECLARE", montant: 200 },
      },
      ventilationTiers: {
        postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 4000, libelle: "Loyer dû" }],
      },
    });
    for (const caseId of ["066", "070", "074", "094"] as const) {
      assert.equal(form.cases.find((c) => c.caseId === caseId), undefined);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === caseId));
    }
  });
});

describe("F4-B — LOYER_DU n'alimente jamais 070", () => {
  it("068 via ventilation possible en futur ; 070 reste absent sans clientsAmortissementsProvisions", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tiers: { creances: { status: "DECLARE", montant: 4000 }, dettes: { status: "NUL_CONFIRME" } },
      ventilationTiers: {
        postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 4000 }],
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "070"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "068"), undefined, "068 brut non branché mapper — seul 070 testé ici");
    const blocked070 = form.casesNonAlimentees.find((c) => c.caseId === "070");
    assert.ok(blocked070);
    assert.match(blocked070!.raison, /070|068|LOYER|Clients/i);
  });
});

describe("F4-B — publication honnête quand champs amort DECLARE/NUL", () => {
  it("066/070/074/094 publiables uniquement via leurs champs dédiés", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        avancesAcomptesVersesAmort: { status: "DECLARE", montant: 11 },
        clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
        autresCreancesAmortissementsProvisions: { status: "DECLARE", montant: 22 },
        chargesConstateesAvanceAmort: { status: "DECLARE", montant: 33 },
        avancesAcomptesVerses: { status: "DECLARE", montant: 999 },
        chargesConstateesAvance: { status: "DECLARE", montant: 888 },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "066")?.value, 11);
    assert.equal(form.cases.find((c) => c.caseId === "070")?.value, 0);
    assert.equal(form.cases.find((c) => c.caseId === "074")?.value, 22);
    assert.equal(form.cases.find((c) => c.caseId === "094")?.value, 33);
    assert.notEqual(form.cases.find((c) => c.caseId === "066")?.value, 999);
    assert.notEqual(form.cases.find((c) => c.caseId === "094")?.value, 888);
  });
});

describe("F4-B — 086 provisions (F2 préservé + Cas B)", () => {
  it("Cas C — 084=3000 sans provisionsAmortissements : 086 bloquée", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(form.cases.find((c) => c.caseId === "084")?.value, 3000);
    assert.equal(form.cases.find((c) => c.caseId === "086"), undefined);
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "086"));
  });

  it("Cas A — trésorerie nulle : 086=0 sans provisionsAmortissements", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "MIXTE", declaredProfessionalCash: 0 },
    });
    assert.equal(form.cases.find((c) => c.caseId === "086")?.value, 0);
  });

  it("Cas B — provisionsAmortissements DECLARE : 086 publiée, distincte de 084", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 3000, provisionsAmortissements: { status: "DECLARE", montant: 250 } },
    });
    assert.equal(form.cases.find((c) => c.caseId === "084")?.value, 3000);
    assert.equal(form.cases.find((c) => c.caseId === "086")?.value, 250);
    assert.notEqual(form.cases.find((c) => c.caseId === "086")?.value, 3000);
  });

  it("F1 — 030=1500 inchangé", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(form.cases.find((c) => c.caseId === "030")?.value, 1500);
  });
});

describe("F4-B — totaux interdits (112/110/180 ; 048/098 = F4-C)", () => {
  it("112/110/180 restent bloqués même si toutes feuilles amort connues", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 3000, provisionsAmortissements: { status: "NUL_CONFIRME" } },
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
        immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
        valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
        avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
        clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
        autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
        chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
      },
    });
    for (const id of ["112", "110", "180"] as const) {
      assert.equal(form.cases.find((c) => c.caseId === id), undefined);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === id));
    }
  });
});
