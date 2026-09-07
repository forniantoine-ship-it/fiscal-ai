/**
 * P1-PDF-02-F4-D — total général actif Amort (112 = 048 + 098).
 * Run: npx tsx --test src/runtime/bilan-map-2033a-f4d-total-112.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
import { gateTotal048, gateTotal098, gateTotal112, resolveLignesSimples } from "./capabilities/bilan/lignes-simples";
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

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "F4-D total 112" };

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

function lignesAmortCompletes(): NonNullable<BilanInputs["lignesSimples"]> {
  return {
    autresImmobilisationsIncorporellesNet: { status: "DECLARE", montant: 100 },
    immobilisationsFinancieresNet: { status: "DECLARE", montant: 200 },
    valeursMobilieresPlacementNet: { status: "DECLARE", montant: 100 },
    avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
    clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
    autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
    chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
  };
}

describe("F4-D — Cas 1 : 048 et 098 connus → 112 = 1900", () => {
  it("112 = 048 + 098", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 3000, provisionsAmortissements: { status: "NUL_CONFIRME" } },
      lignesSimples: lignesAmortCompletes(),
    });
    assert.equal(form.cases.find((c) => c.caseId === "048")?.value, 1800);
    assert.equal(form.cases.find((c) => c.caseId === "098")?.value, 100);
    assert.equal(form.cases.find((c) => c.caseId === "112")?.value, 1900);
    assert.match(form.cases.find((c) => c.caseId === "112")!.trace.path, /112 = 048 \+ 098/);
  });
});

describe("F4-D — blocages 112", () => {
  it("Cas 2 — 048 inconnu → 112 bloqué", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 3000, provisionsAmortissements: { status: "NUL_CONFIRME" } },
      lignesSimples: {
        immobilisationsFinancieresNet: { status: "DECLARE", montant: 200 },
        ...lignesAmortCompletes(),
        autresImmobilisationsIncorporellesNet: undefined,
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "048"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "112"), undefined);
    assert.match(form.casesNonAlimentees.find((c) => c.caseId === "112")!.raison, /composante 048 non publiable/i);
  });

  it("Cas 3 — 098 inconnu → 112 bloqué", () => {
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
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "098"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "112"), undefined);
    assert.match(form.casesNonAlimentees.find((c) => c.caseId === "112")!.raison, /composante 098 non publiable/i);
  });

  it("Cas 4 — 048 et 098 inconnus → 112 bloqué", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(form.cases.find((c) => c.caseId === "112"), undefined);
    assert.match(form.casesNonAlimentees.find((c) => c.caseId === "112")!.raison, /composantes 048 et 098 non publiables/i);
  });
});

describe("F4-D — zéro explicite et absence ≠ zéro", () => {
  it("Cas 5 — 048=0 et 098=0 confirmés → 112=0", () => {
    const rfsZero = buildRfs();
    rfsZero.fiscalResult = { ...FISCAL_RESULT, amortCalcule: 0, amortDeduct: 0 };
    rfsZero.immobilisations = {
      lignes: [{ label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 0, amortissementsCumules: 0, vnc: 45000 }],
      totalAnnuelExercice: 0,
      totalBrut: 45000,
      valeurTerrain: 15000,
    };
    const patrimoine = assemblePatrimoine(rfsZero, {
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "MIXTE", declaredProfessionalCash: 0 },
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
    const form = map2033AFromRfs({ ...rfsZero, patrimoine });
    assert.equal(form.cases.find((c) => c.caseId === "048")?.value, 0);
    assert.equal(form.cases.find((c) => c.caseId === "098")?.value, 0);
    assert.equal(form.cases.find((c) => c.caseId === "112")?.value, 0);
  });

  it("Cas 6 — absence 016 ne devient pas zéro → 112 bloqué", () => {
    const lignes = resolveLignesSimples({
      immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
      avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
      clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
      autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
      valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
      chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
    });
    const gate048 = gateTotal048(lignes, true);
    const gate098 = gateTotal098(lignes, true);
    assert.equal(gate048.status, "BLOQUE");
    const gate112 = gateTotal112(gate048, gate098, false, true);
    assert.equal(gate112.status, "BLOQUE");
    assert.match(gate112.status === "BLOQUE" ? gate112.raison : "", /048 not publishable|016/i);
  });
});

describe("F4-D — Cas 7 : anti formule 110 − 180", () => {
  it("112 provient de 048+098 ; 110/180 absents du mapper", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 3000, provisionsAmortissements: { status: "NUL_CONFIRME" } },
      lignesSimples: lignesAmortCompletes(),
    });
    const trace112 = form.cases.find((c) => c.caseId === "112")!.trace.path;
    assert.match(trace112, /048 \+ 098/);
    assert.doesNotMatch(trace112, /110\s*−\s*180|110 - 180/);
    assert.equal(form.cases.find((c) => c.caseId === "110"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "180"), undefined);
    const v048 = form.cases.find((c) => c.caseId === "048")!.value as number;
    const v098 = form.cases.find((c) => c.caseId === "098")!.value as number;
    assert.equal(form.cases.find((c) => c.caseId === "112")!.value, v048 + v098);
  });
});

describe("F4-D — 052/062 non_applicable LMNP (revalidation F4-C)", () => {
  it("052/062 catégorie non_applicable sans patrimoine ; gate098 ne les exige pas", () => {
    const formSansPatrimoine = map2033AFromRfs(buildRfs());
    const c052 = formSansPatrimoine.casesNonAlimentees.find((c) => c.caseId === "052");
    const c062 = formSansPatrimoine.casesNonAlimentees.find((c) => c.caseId === "062");
    assert.equal(c052?.categorie, "non_applicable");
    assert.equal(c062?.categorie, "non_applicable");
    assert.match(c052!.raison, /stock|location meublée/i);
    assert.match(c062!.raison, /marchandise|location meublée/i);
    const gate098 = gateTotal098(resolveLignesSimples(lignesAmortCompletes()), true);
    assert.equal(gate098.status, "COMPOSANTES_CONNUES");
  });
});

describe("F4-D — non-régression F1/F2", () => {
  it("030=1500 et 086 F2 inchangés", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(form.cases.find((c) => c.caseId === "030")?.value, 1500);
    assert.equal(form.cases.find((c) => c.caseId === "086"), undefined);
  });
});

describe("F4-D — non-régression chemin legacy (sans patrimoine)", () => {
  it("rfs.patrimoine === undefined → 112 reste bloquée, même si 048/098 seraient par ailleurs publiables", () => {
    const form = map2033AFromRfs(buildRfs());
    assert.equal(form.cases.find((c) => c.caseId === "048"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "098"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "112"), undefined);
    assert.equal(form.casesNonAlimentees.find((c) => c.caseId === "112")?.categorie, "incoherence_modele");
  });
});
