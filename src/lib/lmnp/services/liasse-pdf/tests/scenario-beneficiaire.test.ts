/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/scenario-beneficiaire.test.ts
 *
 * Scénario SYNTHÉTIQUE (pas un dossier réel) — construit spécifiquement
 * pour exercer, de bout en bout jusqu'au PDF, les cases qui ne se
 * déclenchent que dans la branche "bénéfice" (resultatFiscal > 0,
 * deficitNouveau = 0) et que le dossier témoin réel (déficitaire) ne peut
 * jamais couvrir : C_L1_COL1 (2031-SD), I_7A (2031-SD),
 * I_AUTRES_LMNP_BENEFICE (2031-bis-SD), 312 et 370 (2033-B-SD).
 *
 * Ces 5 coordonnées étaient marquées "estimee-par-symetrie" avant la
 * mission de sécurisation P0 ; elles ont été remesurées directement sur le
 * Cerfa officiel vierge (recherche des séparateurs de grille vectoriels) et
 * sont désormais "mesure-empirique" — ce test prouve qu'elles produisent
 * bien un rendu correct de bout en bout, pas seulement une entrée de
 * registre plausible.
 *
 * AUCUNE VALEUR DE CE SCÉNARIO N'EST TIRÉE D'UN DOSSIER RÉEL — chiffres
 * ronds choisis pour la lisibilité du test, jamais à confondre avec le
 * dossier témoin (golden-master-technical-pipeline.test.ts).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assembleForm2031SD } from "@/runtime/capabilities/f007/assemble-form-2031";
import { map2031BisFromRfs } from "@/runtime/capabilities/rfs/projection/map-2031-bis";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

import { generateCerfaLiassePdf } from "../generator/render-cerfa-liasse";
import { extractDrawnStringsForPage } from "./extract-rendered-text";

export const SCENARIO_FISCAL_RESULT: FiscalResult = {
  exercice: 2026,
  recettes: { total: 20000 },
  charges: {
    totalDeductible: 10000,
    chargesExploitation: 8000,
    chargesFinancement: 2000,
    chargesPreExploitation: 0,
    totalNonDeductible: 0,
  },
  resultatAvantAmort: 6200,
  amortCalcule: 2000,
  amortDeduct: 2000,
  amortReporte: 0,
  amortReportesUtilises: 0,
  resultatFiscal: 4200,
  deficitNouveau: 0,
  deficitsImputes: 0,
  perteExceptionnelle: 0,
  stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
  trace: { ksArtifacts: ["TRF-0032"], computedAt: "2027-05-01T00:00:00.000Z", journal: [] },
  status: "computed",
  anomalies: [],
};

export const SCENARIO_IDENTITE: IdentiteDeclarante = {
  siren: "999999999",
  denomination: "SCENARIO SYNTHETIQUE",
  exerciceDebut: "01/01/2026",
  exerciceFin: "31/12/2026",
};

export function buildScenarioRfs(): FiscalRepresentation {
  return {
    exercice: SCENARIO_FISCAL_RESULT.exercice,
    identite: SCENARIO_IDENTITE,
    fiscalResult: SCENARIO_FISCAL_RESULT,
    trace: {
      ksArtifacts: SCENARIO_FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2027-05-01T00:00:00.000Z",
      sourceFiscalResultAt: SCENARIO_FISCAL_RESULT.trace.computedAt,
      sources: { identite: "synthétique", fiscalResult: "synthétique" },
    },
  };
}

describe("Scénario synthétique bénéficiaire — coordonnées remesurées (ex-'estimee-par-symetrie')", () => {
  it("resultatComptable est bien positif dans ce scénario (précondition du test, pas une assertion de couche PDF)", () => {
    const resultatComptable = round2(
      SCENARIO_FISCAL_RESULT.resultatAvantAmort -
        SCENARIO_FISCAL_RESULT.amortCalcule -
        SCENARIO_FISCAL_RESULT.charges.totalNonDeductible,
    );
    assert.ok(resultatComptable > 0, "précondition du scénario : résultat comptable positif pour exercer 312");
  });

  it("génère un PDF où C_L1_COL1, I_7A, I_AUTRES_LMNP_BENEFICE, 312 et 370 apparaissent tous à la valeur attendue", async () => {
    const rfs = buildScenarioRfs();
    const { form: form2031SD } = assembleForm2031SD(rfs.fiscalResult, rfs.identite);
    const form2031Bis = map2031BisFromRfs(rfs);
    const form2033B = map2033BFromRfs(rfs);

    // Préconditions sur la sortie des mappers (pas la couche PDF) : les 5
    // cases visées doivent bien être produites par ce scénario, sinon le
    // test ne prouverait rien.
    assert.ok(form2031SD.cases.some((c) => c.caseId === "C_L1_COL1"));
    assert.ok(form2031SD.cases.some((c) => c.caseId === "I_7A"));
    assert.ok(form2031Bis.cases.some((c) => c.caseId === "I_AUTRES_LMNP_BENEFICE"));
    assert.ok(form2033B.cases.some((c) => c.caseId === "312"));
    assert.ok(form2033B.cases.some((c) => c.caseId === "370"));

    const result = await generateCerfaLiassePdf({
      millesime: 2026,
      forms: [
        { form: "2031-SD", cases: form2031SD.cases },
        { form: "2031-bis-SD", cases: form2031Bis.cases },
        { form: "2033-B-SD", cases: form2033B.cases },
      ],
    });

    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const page1Text = await extractDrawnStringsForPage(result.pdfBytes, 1); // 2031-SD
    const page2Text = await extractDrawnStringsForPage(result.pdfBytes, 2); // 2031-bis-SD
    const page3Text = await extractDrawnStringsForPage(result.pdfBytes, 3); // 2033-B-SD

    assert.ok(page1Text.includes("4 200"), "C_L1_COL1 (résultat fiscal, bénéfice) doit être extractible sur le 2031-SD");
    assert.ok(page1Text.includes("4 200"), "I_7A (dont BIC non pro. — bénéfice) doit être extractible sur le 2031-SD");
    assert.equal(
      page1Text.filter((s) => s === "4 200").length,
      2,
      "4 200 doit apparaître exactement deux fois sur le 2031-SD (C_L1_COL1 et I_7A)",
    );
    assert.ok(page2Text.includes("4 200"), "I_AUTRES_LMNP_BENEFICE doit être extractible sur le 2031-bis-SD");
    assert.ok(page3Text.includes("4 200"), "312/370 (résultat comptable/fiscal, bénéfice) doivent être extractibles sur le 2033-B-SD");

    // Aucun chevauchement : chaque valeur mesurée doit rester dans sa largeur calibrée.
    assert.ok(result.manifest.every((entry) => entry.measuredWidth <= entry.maxWidth));
  });
});

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
