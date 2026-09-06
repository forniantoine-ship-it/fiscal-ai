/**
 * P1-PDF-02-F4-A — feuilles colonne Amortissements-Provisions (016/042/082 et
 * blocages 066/070/074/094). Totaux 048/098/112 interdits.
 * Run: npx tsx --test src/runtime/bilan-map-2033a-f4a-amort-feuilles.test.ts
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

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "F4-A amort feuilles" };

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

describe("F4-A — immobilisé P1-B.2 (016/042/082)", () => {
  it("sans lignesSimples : 016/042/082 bloquées (INCONNU), jamais confondues avec 014/040/080 brut", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    for (const caseId of ["016", "042", "082"] as const) {
      assert.equal(form.cases.find((c) => c.caseId === caseId), undefined, `${caseId} absent sans saisie explicite`);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === caseId));
    }
    assert.equal(form.cases.find((c) => c.caseId === "014"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "040"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "080"), undefined);
  });

  it("DECLARE alimente 016/042/082 distinctement du brut voisin", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "DECLARE", montant: 120 },
        immobilisationsFinancieresNet: { status: "DECLARE", montant: 340 },
        valeursMobilieresPlacementNet: { status: "DECLARE", montant: 560 },
        autresImmobilisationsIncorporellesBrut: { status: "DECLARE", montant: 9999 },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "016")?.value, 120);
    assert.equal(form.cases.find((c) => c.caseId === "042")?.value, 340);
    assert.equal(form.cases.find((c) => c.caseId === "082")?.value, 560);
    assert.equal(form.cases.find((c) => c.caseId === "014"), undefined, "014 brut non branché par F4-A");
    assert.notEqual(form.cases.find((c) => c.caseId === "016")?.value, 9999);
  });

  it("NUL_CONFIRME publie 0 explicite sur 016/042/082", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
        immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
        valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "016")?.value, 0);
    assert.equal(form.cases.find((c) => c.caseId === "042")?.value, 0);
    assert.equal(form.cases.find((c) => c.caseId === "082")?.value, 0);
  });
});

describe("F4-A — circulant amort (066/070/074/094) sans source métier", () => {
  it("restent bloquées même avec ventilation brut DECLARE et lignesSimples brut", () => {
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
      assert.equal(form.cases.find((c) => c.caseId === caseId), undefined, `${caseId} ne doit pas être déduite du brut`);
      const blocked = form.casesNonAlimentees.find((c) => c.caseId === caseId);
      assert.ok(blocked);
      assert.match(blocked!.raison, /066|070|074|094|068|072|092|064|brut|provision|Amortissements/i);
    }
  });
});

describe("F4-A — invariants F1/F2 et totaux interdits", () => {
  it("030 = 1500 (F1) et 086 bloquée (F2) inchangés sur fixture P0", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(form.cases.find((c) => c.caseId === "030")?.value, 1500);
    assert.equal(form.cases.find((c) => c.caseId === "086"), undefined);
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "086"));
    assert.equal(form.cases.find((c) => c.caseId === "084")?.value, 3000);
  });

  it("048 publiable si 016/030/042 connus ; 098/112/110/180 restent bloqués sans feuilles circulant", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
        immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
        valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "048")?.value, 1500);
    for (const totalId of ["098", "112", "110", "180"] as const) {
      assert.equal(form.cases.find((c) => c.caseId === totalId), undefined);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === totalId));
    }
  });
});
