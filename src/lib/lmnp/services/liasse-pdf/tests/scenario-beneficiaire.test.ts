/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/scenario-beneficiaire.test.ts
 *
 * Scénario SYNTHÉTIQUE (pas un dossier réel) — construit spécifiquement
 * pour exercer, de bout en bout jusqu'au PDF, les cases qui ne se
 * déclenchent que dans la branche "bénéfice" (resultatFiscal > 0,
 * deficitNouveau = 0) et que le dossier témoin réel (déficitaire) ne peut
 * jamais couvrir : C_L1_COL1 (2031-SD), I_7A (2031-SD),
 * I_AUTRES_LMNP_BENEFICE (2031-bis-SD), 312, 350, 352 et 370 (2033-B-SD).
 * SAV-032 : ce scénario est aussi l'ORACLE « BÉNÉFICIAIRE SIMPLE SANS ARD » indépendant de rich-takeover : aucune reprise,
 * aucun ARD historique, aucun déficit antérieur ; E = 6 200 − 2 000 = 4 200 → 350 = 4 200, 352 = 370 = 0, 2031 7a = 4 200,
 * ligne 1 = 0, bouclage 4 200 + 0 + 0 − 4 200 = 0.
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
  amortNonDeduitExercice: 0,
  amortReportesUtilises: 0,
  resultatFiscal: 4200,
  resultatFiscalAvantDeficits: 4200, // aucun déficit antérieur : avant déficits = résultat fiscal
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

  it("génère un PDF où C_L1_COL1 (0), I_7A (4 200), I_AUTRES_LMNP_BENEFICE (4 200), 312 (4 200), 350 (4 200), 352 (0) et 370 (0) apparaissent à la valeur attendue", async () => {
    const rfs = buildScenarioRfs();
    const { form: form2031SD } = assembleForm2031SD(rfs.fiscalResult, rfs.identite);
    const form2031Bis = map2031BisFromRfs(rfs);
    const form2033B = map2033BFromRfs(rfs);

    // Préconditions sur la sortie des mappers (pas la couche PDF) : les 5
    // cases visées doivent bien être produites par ce scénario, sinon le
    // test ne prouverait rien.
    const v = (cases: ReadonlyArray<{ caseId: string; value: unknown }>, id: string) => cases.find((c) => c.caseId === id)?.value;
    assert.equal(v(form2031SD.cases, "C_L1_COL1"), 0, "ligne 1 = report de 370 neutralisée = 0");
    assert.equal(v(form2031SD.cases, "I_7A"), 4200);
    assert.equal(v(form2031Bis.cases, "I_AUTRES_LMNP_BENEFICE"), 4200);
    assert.equal(v(form2033B.cases, "312"), 4200);
    assert.equal(v(form2033B.cases, "350"), 4200);
    assert.equal(v(form2033B.cases, "352"), 0);
    assert.equal(v(form2033B.cases, "370"), 0);
    assert.equal(v(form2033B.cases, "330"), undefined);
    assert.equal(v(form2033B.cases, "354"), undefined);
    assert.equal(form2033B.balancing.status, "BALANCED", "312 (4 200) + 318 (0) + 330 (0) − 350 (4 200) = 0");

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

    assert.ok(page1Text.includes("0"), "C_L1_COL1 (résultat fiscal neutralisé) = « 0 » doit être dessinée sur le 2031-SD");
    assert.equal(
      page1Text.filter((s) => s === "4 200").length,
      1,
      "4 200 doit apparaître exactement une fois sur le 2031-SD (I_7A) ; C_L1_COL1 porte « 0 » (SAV-032)",
    );
    assert.ok(page2Text.includes("4 200"), "I_AUTRES_LMNP_BENEFICE doit être extractible sur le 2031-bis-SD");
    assert.equal(
      page3Text.filter((s) => s === "4 200").length,
      3,
      "4 200 doit apparaître trois fois sur le 2033-B-SD : 310 (résultat comptable), 312 (report) et 350 (bénéfice déduit) ; 352 et 370 portent « 0 »",
    );
    assert.ok(result.manifest.some((e) => e.caseId === "352" && e.text === "0"));
    assert.ok(result.manifest.some((e) => e.caseId === "370" && e.text === "0"));

    // Aucun chevauchement : chaque valeur mesurée doit rester dans sa largeur calibrée.
    assert.ok(result.manifest.every((entry) => entry.measuredWidth <= entry.maxWidth));
  });
});

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
