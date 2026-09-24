/**
 * P0-2A.1 — sémantique native `map-2033a` + `composantsDetail` F-012.
 *
 * Avec détail enrichi, 028/030 incluent F-010 + terrain + F-012 (aligné
 * map-2033c / computeClosingImmobilisationsTotals). Sans détail +
 * composantsNouveaux : Cycle 37 (fail-closed) reste inchangé.
 *
 * Run: npx tsx --test src/runtime/rfs-2033a-composants-detail-f012.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { map2033AFromRfs } from "./capabilities/rfs/projection/map-2033a";
import { computeAmortizationPlan } from "./capabilities/f010/compute-amortization-plan";
import { composePlanAmortissement } from "./capabilities/f014/compose-plan-amortissement";
import {
  detailComposantsNouveaux,
  enrichImmobilisationsRfs,
  totalDotationComposantsDetail,
} from "@/lib/lmnp/services/dossier/immobilisations-comptables";
import type { ComposantNouveau } from "./capabilities/f012/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";
import { round2 } from "./capabilities/f007/types";

const FY = 2025;
const IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "P0-2A.1 F012 Detail",
};

const COMPOSANT_F012: ComposantNouveau = {
  id: "travaux-cuisine-p0-2a1",
  label: "Rénovation cuisine",
  montant: 8_000,
  dureeAnnees: 10,
  dotationAnnuelle: 800,
  nature: "amélioration",
  dateDebut: `${FY}-06-01`,
  origin: "f012_travaux",
};

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: FY,
    recettes: { total: 9_000 },
    charges: {
      totalDeductible: 2_000,
      chargesExploitation: 2_000,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalNonDeductible: 0,
    },
    resultatAvantAmort: 7_000,
    amortCalcule: 1_500,
    amortDeduct: 1_500,
    amortReporte: 0,
    amortNonDeduitExercice: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5_500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-09-24T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
}

function rfs(fr: FiscalResult, immobilisations: FiscalRepresentation["immobilisations"]): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    immobilisations,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-09-24T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

describe("P0-2A.1 — map-2033a + composantsDetail F-012", () => {
  it("avec composantsDetail : 028/030 = F-010 + terrain + F-012 ; amortCalcule aligné", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280_000,
      mobilierInclus: false,
      fraisNotaire: 19_500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: FY,
    });
    const { plan: planF014 } = composePlanAmortissement({
      exerciceFiscal: FY,
      dateMiseEnService: "2024-04-15",
      planLogement: computed.plan,
      prorataRatio: computed.prorataRatio,
      composantsNouveaux: [COMPOSANT_F012],
    });

    const details = detailComposantsNouveaux([COMPOSANT_F012], FY);
    const dotationF012 = totalDotationComposantsDetail(details);
    assert.ok(details.length === 1);
    assert.ok(dotationF012 > 0);

    const immobilisations = enrichImmobilisationsRfs({
      immobilisations: {
        ...computed.plan,
        valeurTerrain: computed.valeurTerrain,
        composantsNouveaux: [COMPOSANT_F012],
      },
      exerciceFiscal: FY,
      composantsMerged: [COMPOSANT_F012],
    });

    assert.ok(immobilisations.composantsDetail?.length === 1);

    const expectedAmort = round2(computed.plan.totalAnnuelExercice + dotationF012);
    assert.equal(planF014.total_dotations_exercice, expectedAmort);

    const form = map2033AFromRfs(
      rfs(fiscalResult({ amortCalcule: expectedAmort }), immobilisations),
    );

    const case028 = form.cases.find((c) => c.caseId === "028");
    const case030 = form.cases.find((c) => c.caseId === "030");
    assert.ok(case028, "028 doit être alimentée avec composantsDetail");
    assert.ok(case030, "030 doit être alimentée avec composantsDetail");

    const expectedBrut = round2(
      computed.plan.totalBrut + computed.valeurTerrain + COMPOSANT_F012.montant,
    );
    const expectedCumul = round2(
      computed.plan.lignes.reduce((a, l) => a + l.amortissementsCumules, 0) +
        details[0]!.amortissementsCumules,
    );
    assert.equal(case028!.value, expectedBrut);
    assert.equal(case030!.value, expectedCumul);
    assert.match(String(case028!.trace.path), /composantsDetail/);
    assert.match(String(case030!.trace.path), /composantsDetail/);
  });

  it("sans composantsDetail + composantsNouveaux : 028/030 restent bloquées (Cycle 37)", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280_000,
      mobilierInclus: false,
      fraisNotaire: 19_500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: FY,
    });
    const { plan: planF014 } = composePlanAmortissement({
      exerciceFiscal: FY,
      dateMiseEnService: "2024-04-15",
      planLogement: computed.plan,
      prorataRatio: computed.prorataRatio,
      composantsNouveaux: [COMPOSANT_F012],
    });

    const form = map2033AFromRfs(
      rfs(fiscalResult({ amortCalcule: planF014.total_dotations_exercice }), {
        ...computed.plan,
        valeurTerrain: computed.valeurTerrain,
        composantsNouveaux: [COMPOSANT_F012],
        // pas de composantsDetail — sémantique Cycle 37
      }),
    );

    assert.equal(form.cases.find((c) => c.caseId === "028"), undefined);
    assert.equal(form.cases.find((c) => c.caseId === "030"), undefined);
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "028"));
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "030"));
  });
});
