/**
 * P1-PDF-02-F4-C — totaux colonne Amortissements-Provisions (048, 098).
 * Run: npx tsx --test src/runtime/bilan-map-2033a-f4c-totaux-amort.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
import { gateTotal048, gateTotal098, resolveLignesSimples } from "./capabilities/bilan/lignes-simples";
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

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "F4-C totaux amort" };

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

/** Feuilles Amort toutes connues (NUL ou DECLARE) — permet 098 si 086 fournie. */
function lignesAmortCompletes(): NonNullable<BilanInputs["lignesSimples"]> {
  return {
    autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
    immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
    valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
    avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
    clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
    autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
    chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
  };
}

describe("F4-C — gate 048", () => {
  it("Cas A — 016=100, 030 publié, 042=200 → 048=1800", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "DECLARE", montant: 100 },
        immobilisationsFinancieresNet: { status: "DECLARE", montant: 200 },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "016")?.value, 100);
    assert.equal(form.cases.find((c) => c.caseId === "030")?.value, 1500);
    assert.equal(form.cases.find((c) => c.caseId === "042")?.value, 200);
    assert.equal(form.cases.find((c) => c.caseId === "048")?.value, 1800);
    assert.match(form.cases.find((c) => c.caseId === "048")!.trace.path, /016 \+ 030 \+ 042/);
  });

  it("Cas B — 016 INCONNU → 048 bloqué", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        immobilisationsFinancieresNet: { status: "DECLARE", montant: 200 },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "048"), undefined);
    const blocked = form.casesNonAlimentees.find((c) => c.caseId === "048");
    assert.ok(blocked);
    assert.match(blocked!.raison, /016|INCONNU/i);
  });

  it("042 INCONNU → 048 bloqué", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "DECLARE", montant: 100 },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "048"), undefined);
    assert.match(form.casesNonAlimentees.find((c) => c.caseId === "048")!.raison, /042|INCONNU/i);
  });

  it("Cas C — NUL_CONFIRME compte comme zéro explicite → 048=1500", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
        immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "048")?.value, 1500);
  });

  it("absence de saisie 016 ≠ zéro — gate unitaire bloque", () => {
    const lignes = resolveLignesSimples({ immobilisationsFinancieresNet: { status: "NUL_CONFIRME" } });
    const gate = gateTotal048(lignes, true);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("016"));
  });
});

describe("F4-C — gate 098", () => {
  it("toutes composantes connues + 086 → 098 correct", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 3000, provisionsAmortissements: { status: "NUL_CONFIRME" } },
      lignesSimples: {
        ...lignesAmortCompletes(),
        valeursMobilieresPlacementNet: { status: "DECLARE", montant: 100 },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "098")?.value, 100);
    assert.match(form.cases.find((c) => c.caseId === "098")!.trace.path, /066 \+ 070 \+ 074 \+ 082 \+ 086 \+ 094/);
  });

  it("066 INCONNU → 098 bloqué", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 3000, provisionsAmortissements: { status: "NUL_CONFIRME" } },
      lignesSimples: {
        ...lignesAmortCompletes(),
        avancesAcomptesVersesAmort: undefined,
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "098"), undefined);
    assert.match(form.casesNonAlimentees.find((c) => c.caseId === "098")!.raison, /066|INCONNU/i);
  });

  it("070 INCONNU → 098 bloqué", () => {
    const lignes = resolveLignesSimples({
      ...lignesAmortCompletes(),
      clientsAmortissementsProvisions: undefined,
    });
    const gate = gateTotal098(lignes, true);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("070"));
  });

  it("074 INCONNU → 098 bloqué", () => {
    const gate = gateTotal098(
      resolveLignesSimples({ ...lignesAmortCompletes(), autresCreancesAmortissementsProvisions: undefined }),
      true,
    );
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("074"));
  });

  it("086 non publiée → 098 bloqué", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: lignesAmortCompletes(),
    });
    assert.equal(form.cases.find((c) => c.caseId === "086"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "098"), undefined);
    assert.match(form.casesNonAlimentees.find((c) => c.caseId === "098")!.raison, /086/i);
  });

  it("094 INCONNU → 098 bloqué", () => {
    const gate = gateTotal098(
      resolveLignesSimples({ ...lignesAmortCompletes(), chargesConstateesAvanceAmort: undefined }),
      true,
    );
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("094"));
  });

  it("NUL_CONFIRME explicites + 082=100 → 098=100", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "MIXTE", declaredProfessionalCash: 0 },
      lignesSimples: {
        ...lignesAmortCompletes(),
        valeursMobilieresPlacementNet: { status: "DECLARE", montant: 100 },
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "086")?.value, 0);
    assert.equal(form.cases.find((c) => c.caseId === "098")?.value, 100);
  });

  it("052/062 hors périmètre LMNP — ne bloquent pas gateTotal098", () => {
    const lignes = resolveLignesSimples(lignesAmortCompletes());
    const gate = gateTotal098(lignes, true);
    assert.equal(gate.status, "COMPOSANTES_CONNUES");
    assert.ok(gate.status === "COMPOSANTES_CONNUES" || !("casesInconnues" in gate && gate.casesInconnues.includes("052")));
  });
});

describe("F4-C — pas de double comptage", () => {
  it("048 = somme des feuilles 016/030/042, pas 030+048 ni bruts", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "DECLARE", montant: 100 },
        immobilisationsFinancieresNet: { status: "DECLARE", montant: 200 },
        autresImmobilisationsIncorporellesBrut: { status: "DECLARE", montant: 99999 },
        immobilisationsFinancieresBrut: { status: "DECLARE", montant: 88888 },
      },
    });
    const v048 = form.cases.find((c) => c.caseId === "048")?.value;
    assert.equal(v048, 1800);
    assert.notEqual(v048, 1500 + 1800, "048 ne doit pas additionner 030 avec un sous-total déjà formé");
    // G2 — 014/040 (brut) sont désormais publiées (bloc dédié, indépendant de F4-C) avec LEUR
    // PROPRE valeur ; elles restent exclues du total 048 (colonne Amort.), qui ne change pas.
    assert.equal(form.cases.find((c) => c.caseId === "014")?.value, 99999);
    assert.equal(form.cases.find((c) => c.caseId === "040")?.value, 88888);
    assert.notEqual(v048, 99999 + 88888, "048 (Amort.) ne doit jamais inclure les bruts 014/040");
  });
});

describe("F4-C — non-régression F1/F2 et totaux interdits", () => {
  it("030=1500 inchangé", () => {
    const form = mapWithPatrimoine(BILAN_INPUTS);
    assert.equal(form.cases.find((c) => c.caseId === "030")?.value, 1500);
  });

  it("086 F2 — 084>0 sans provision : 086 bloquée, 098 bloquée", () => {
    const form = mapWithPatrimoine({ ...BILAN_INPUTS, lignesSimples: lignesAmortCompletes() });
    assert.equal(form.cases.find((c) => c.caseId === "084")?.value, 3000);
    assert.equal(form.cases.find((c) => c.caseId === "086"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "098"), undefined);
  });

  it("112 = 048 + 098 = 1500 quand 048 et 098 publiables (F4-D) ; 110/180 restent bloqués (aucune gate)", () => {
    const form = mapWithPatrimoine({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 3000, provisionsAmortissements: { status: "NUL_CONFIRME" } },
      lignesSimples: {
        autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
        immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
        ...lignesAmortCompletes(),
      },
    });
    assert.equal(form.cases.find((c) => c.caseId === "048")?.value, 1500);
    assert.equal(form.cases.find((c) => c.caseId === "098")?.value, 0);

    // F4-D (e0a25de) — 048 et 098 sont tous deux réellement publiés : 112 doit
    // désormais l'être aussi. Ancien contrat (112 toujours bloquée) révolu.
    const case112 = form.cases.find((c) => c.caseId === "112");
    assert.ok(case112, "112 doit être publiée : 048 et 098 sont tous deux publiables");
    assert.equal(case112!.value, 1500, "112 = 048 (1500) + 098 (0)");
    assert.match(case112!.trace.path, /112 = 048 \+ 098/);

    for (const id of ["110", "180"] as const) {
      assert.equal(form.cases.find((c) => c.caseId === id), undefined);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === id));
    }
  });
});
