/**
 * P0-39C — oracle Option B sur le chemin de production.
 * Run: npx tsx --test src/runtime/p0-39c-option-b.test.ts
 *
 * produceFiscalResult → RFS → map2033B. Aucune valeur d'oracle n'est
 * codée dans le moteur : les montants attendus sont les assertions.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { produceFiscalResult } from "./capabilities/f006/produce-fiscal-result";
import type { FiscalEngineInputs } from "./capabilities/f006/types";
import { buildFiscalRepresentation } from "./capabilities/rfs/build-fiscal-representation";
import { map2033BFromRfs } from "./capabilities/rfs/projection/map-2033b";
import { assembleForm2031SD } from "./capabilities/f007/assemble-form-2031";

const EXERCICE = 2026;

function oracleInput(priorDeficit: number): FiscalEngineInputs {
  return {
    exerciceFiscal: EXERCICE,
    activite: { dateMiseEnService: "2024-01-01", siret: "12345678901234" },
    revenusAssistant: {
      exerciceFiscal: EXERCICE,
      totalRecettes: 18_000,
      loyersEncaisses: 18_000,
    },
    chargesAssistant: {
      exerciceFiscal: EXERCICE,
      totalDeductible: 8_000,
      totalPreExploitation: 0,
    },
    financementCharges: {
      exerciceFiscal: EXERCICE,
      totalChargesFinancementExercice: 0,
      totalInteretsPreExploitation: 0,
    },
    amortissementAssistant: {
      exerciceFiscal: EXERCICE,
      totalDotations: 8_000,
      status: "validated",
    },
    logementAmortissement: { computedAt: "2026-01-01T00:00:00.000Z" },
    stockDeficitsAnterieurs: priorDeficit > 0 ? [{ millesime: 2024, montant: priorDeficit }] : [],
    stockAmortissementsReportes: 0,
  };
}

function rfsFor(priorDeficit: number) {
  const { result } = produceFiscalResult(oracleInput(priorDeficit));
  assert.ok(result);
  return buildFiscalRepresentation({
    fiscalResult: result,
    identite: { siren: "104545108", siret: "10454510800011", denomination: "Oracle P0-39C" },
  });
}

function caseValue(caseId: string, priorDeficit: number): number | undefined {
  return map2033BFromRfs(rfsFor(priorDeficit)).cases.find((c) => c.caseId === caseId)?.value as number | undefined;
}

describe("P0-39C — oracle Option B (chemin produceFiscalResult)", () => {
  it("plafond 10 000, dotation 8 000, déficit antérieur 3 000", () => {
    const { result } = produceFiscalResult(oracleInput(3_000));
    assert.ok(result);

    assert.equal(result.resultatAvantAmort, 10_000);
    assert.equal(result.amortCalcule, 8_000);
    assert.equal(result.amortDeduct, 8_000);
    assert.equal(result.amortNonDeduitExercice, 0);
    assert.equal(result.resultatFiscalAvantDeficits, 2_000);
    assert.equal(result.deficitsImputes, 2_000);
    assert.equal(
      result.stocks.deficits.reduce((sum, row) => sum + row.montant, 0),
      1_000,
    );
    assert.equal(result.stocks.deficits[0]?.millesime, 2024);
    assert.equal(result.stocks.deficits[0]?.montant, 1_000);
    assert.equal(result.amortNonDeduitExercice, 0);
    assert.equal(result.amortReporte, 0);
    assert.equal(result.stocks.amortissementsReportes, 0);
    assert.equal(result.resultatFiscal, 0);

    assert.equal(caseValue("318", 3_000), 0);
    // SAV-032 : `resultatFiscalAvantDeficits` (2 000, grandeur métier) n'est PAS la ligne 352 du Cerfa. Pour un LMNP
    // exclusif, la 2033-B neutralise le résultat : 350 = E = 2 000 (le déficit antérieur de 3 000 n'y figure pas :
    // il est imputé après 7a), 352 = 370 = 0 imprimés, 354/372/360 vides.
    assert.equal(caseValue("350", 3_000), 2_000);
    assert.equal(caseValue("352", 3_000), 0);
    assert.equal(caseValue("354", 3_000), undefined);
    assert.equal(caseValue("370", 3_000), 0);
    assert.equal(caseValue("372", 3_000), undefined);
    assert.equal(caseValue("360", 3_000), undefined);
    assert.equal(caseValue("330", 3_000), undefined);
    // 2031 : 7a = résultat AVANT imputation des déficits antérieurs (2 000), jamais resultatFiscal (0, après imputation).
    const rfs = rfsFor(3_000);
    const form2031 = assembleForm2031SD(rfs.fiscalResult, rfs.identite).form;
    assert.equal(form2031.cases.find((c) => c.caseId === "I_7A")?.value, 2_000);
    assert.equal(form2031.cases.find((c) => c.caseId === "C_L1_COL1")?.value, 0);
    assert.equal(map2033BFromRfs(rfs).balancing.status, "BALANCED");
  });

  it("un autre stock de déficits antérieurs ne change ni le plafond 39 C ni la fraction non déductible", () => {
    const low = produceFiscalResult(oracleInput(3_000)).result!;
    const high = produceFiscalResult(oracleInput(9_000)).result!;
    const none = produceFiscalResult(oracleInput(0)).result!;

    assert.equal(low.resultatAvantAmort, 10_000);
    assert.equal(high.resultatAvantAmort, low.resultatAvantAmort);
    assert.equal(none.resultatAvantAmort, low.resultatAvantAmort);
    assert.equal(low.amortDeduct, 8_000);
    assert.equal(high.amortDeduct, low.amortDeduct);
    assert.equal(none.amortDeduct, low.amortDeduct);
    assert.equal(low.amortNonDeduitExercice, 0);
    assert.equal(high.amortNonDeduitExercice, 0);
    assert.equal(none.amortNonDeduitExercice, 0);
    assert.equal(low.resultatFiscalAvantDeficits, 2_000);
    assert.equal(high.resultatFiscalAvantDeficits, 2_000);
    assert.equal(none.resultatFiscalAvantDeficits, 2_000);
    assert.equal(caseValue("318", 3_000), 0);
    assert.equal(caseValue("318", 9_000), 0);
    assert.equal(caseValue("318", 0), 0);
  });
});
