import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { produceFiscalResult } from "./capabilities/f006/produce-fiscal-result";
import { assembleForm2031SD } from "./capabilities/f007/assemble-form-2031";
import { map2031RecapitulationCases } from "./capabilities/f007/map-2031-recapitulation";
import { produceLiasse } from "./capabilities/f007/produce-liasse";
import { validateLiasseInputs } from "./capabilities/f007/validate-liasse-inputs";
import { explainLiasse } from "./presentation/explain-liasse";
import { F007LiasseEngineAssistant } from "./assistants/f007-liasse-engine/assistant";

const IDENTITE = {
  siren: "123456789",
  siret: "12345678901234",
  denomination: "Marie Dupont",
  adresseEntreprise: "12 rue des Lilas, 69003 Lyon",
  exerciceDebut: "01/01/2025",
  exerciceFin: "31/12/2025",
};

function caseValue(
  form: { cases: { caseId: string; value: unknown }[] },
  caseId: string,
): unknown {
  return form.cases.find((c) => c.caseId === caseId)?.value;
}

describe("F-007 — validation des entrées", () => {
  it("bloque sans identité", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2024,
      activite: { dateMiseEnService: "2024-04-15" },
      revenusAssistant: { exerciceFiscal: 2024, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2024, totalDeductible: 7000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2024, totalDotations: 6779, status: "validated" },
    });
    const validation = validateLiasseInputs({
      fiscalResult: result!,
      identite: { denomination: "Test" },
    });
    assert.equal(validation.ready, false);
    assert.ok(validation.anomalies.some((a) => a.field === "identite.siret"));
  });
});

describe("F-007 — TRF-0033 mapping 2031-SD", () => {
  it("CASE-001 — reporte les recettes en case AB sans recalcul", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-09-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 5287, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 2266.1, status: "validated" },
    });
    const cases = map2031RecapitulationCases(result!);
    const ab = cases.find((c) => c.caseId === "AB");
    assert.equal(ab?.value, 3000);
    assert.equal(ab?.trace.path, "recettes.total");
  });

  it("CASE-001 — reporte le déficit en col. 2 sans recalcul", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-09-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 5287, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 2266.1, status: "validated" },
    });
    const { form } = assembleForm2031SD(result!, IDENTITE);
    assert.equal(caseValue(form, "AB"), 3000);
    assert.equal(caseValue(form, "C_L1_COL2"), 2287);
    assert.equal(caseValue(form, "I_7B"), 2287);
    assert.equal(caseValue(form, "C_L1_COL1"), undefined);
  });

  it("VER-047 — reporte bénéfice nul sans case bénéfice", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2024,
      activite: { dateMiseEnService: "2024-04-15", siret: "12345678901234" },
      revenusAssistant: { exerciceFiscal: 2024, totalRecettes: 9000 },
      chargesAssistant: {
        exerciceFiscal: 2024,
        totalDeductible: 7000,
        totalPreExploitation: 560,
        parCategorie: {},
      },
      financementCharges: {
        exerciceFiscal: 2024,
        totalChargesFinancementExercice: 0,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: {
        exerciceFiscal: 2024,
        totalDotations: 6779,
        status: "validated",
      },
      logementAmortissement: { computedAt: "2024-01-01T00:00:00.000Z" },
    });
    const { form } = assembleForm2031SD(result!, { ...IDENTITE, exerciceDebut: "01/01/2024", exerciceFin: "31/12/2024" });
    assert.equal(caseValue(form, "AB"), 9000);
    assert.equal(caseValue(form, "C_L1_COL1"), undefined);
    assert.equal(caseValue(form, "C_L1_COL2"), undefined);
  });
});

describe("F-007 — composition liasse", () => {
  it("produit une liasse partielle avec 2031-SD uniquement", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-09-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 5287, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 2266, status: "validated" },
    });
    const output = produceLiasse({ fiscalResult: result!, identite: IDENTITE });
    assert.ok(output.liasse);
    assert.equal(output.liasse!.status, "partial");
    assert.equal(output.liasse!.formulairesGeneres.length, 1);
    assert.equal(output.liasse!.formulairesGeneres[0]!.formId, "2031-SD");
    assert.deepEqual(output.liasse!.formulairesManquants, [
      "2033-A-SD",
      "2033-B-SD",
      "2033-C-SD",
      "2033-D-SD",
    ]);
  });
});

describe("F-007 — Explanation Engine", () => {
  it("explique la liasse générée", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-09-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 5287, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 2266, status: "validated" },
    });
    const { liasse } = produceLiasse({ fiscalResult: result!, identite: IDENTITE });
    const explain = explainLiasse({ liasse: liasse! });
    assert.match(explain.headline, /2031-SD/);
    assert.match(explain.explanation, /aucun recalcul fiscal/i);
  });
});

describe("F-007 — Assistant Liasse Engine", () => {
  const ctx = { dossierId: "test", fiscalYear: 2025, route: "/assistants/liasse" };

  it("génère la liasse quand le fiscal est prêt", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-09-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 5287, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 2266, status: "validated" },
    });
    const assistant = new F007LiasseEngineAssistant(ctx, { fiscalResult: result!, identite: IDENTITE });
    const turn = assistant.start();
    assert.equal(turn.state.step, "preview");
    assert.ok(turn.state.result);
    assert.equal(turn.state.result!.liasse.formulairesGeneres[0]!.formId, "2031-SD");
  });

  it("redirige si fiscal manquant", () => {
    const assistant = new F007LiasseEngineAssistant(ctx, {
      fiscalResult: {
        exercice: 2025,
        recettes: { total: 0 },
        charges: {
          totalDeductible: 0,
          chargesExploitation: 0,
          chargesFinancement: 0,
          chargesPreExploitation: 0,
        },
        resultatAvantAmort: 0,
        amortCalcule: 0,
        amortDeduct: 0,
        amortReporte: 0,
        amortReportesUtilises: 0,
        resultatFiscal: 0,
        deficitNouveau: 0,
        deficitsImputes: 0,
        perteExceptionnelle: 0,
        stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
        trace: { ksArtifacts: [], computedAt: "", journal: [] },
        status: "blocked",
        anomalies: [{ severity: "fatal", message: "Bloqué" }],
      },
      identite: IDENTITE,
    });
    const turn = assistant.start();
    assert.equal(turn.state.step, "blocked");
    assert.equal(turn.event, "REDIRECT_PREREQUIS");
  });
});
