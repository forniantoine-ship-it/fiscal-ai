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

describe("F-007 — TRF-0034 mapping 2031-SD", () => {
  it("audit fiscal 2031-SD 2026 — ne reporte plus AB (Production vendue appartient au 2033-B-SD, pas au 2031-SD)", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-09-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 5287, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 2266.1, status: "validated" },
    });
    const cases = map2031RecapitulationCases(result!);
    assert.equal(
      cases.find((c) => c.caseId === "AB"),
      undefined,
      "AB retiré — aucune rubrique « Production vendue » sur le 2031-SD 2026 (Notice DGFiP 2033-NOT-SD, Cerfa 50448#28, p.8/23)",
    );
  });

  it("CASE-001 — CORRIGÉ (audit fiscal P0, Cursor/Grok) : un déficit LMNP non professionnel n'apparaît plus sur C_L1_COL2, seulement sur I_7B", () => {
    // AVANT correction, cette même assertion attendait C_L1_COL2 === 2287
    // (copie conforme de I_7B). C'était fiscalement incorrect : la ligne
    // "1. Résultat fiscal" (C_L1) du 2031-SD est le REPORT de la case 370 ou
    // 372 du 2033-B-SD (texte imprimé sur le Cerfa officiel) — jamais une
    // lecture indépendante de `deficitNouveau`. Un déficit LMNP non
    // professionnel (CGI art. 156-I-1° bis, AX-016) ne s'impute/reporte que
    // via le circuit dédié 7a/7b — jamais via 370/372/C_L1. Voir
    // map-2031-recapitulation.ts et map-2033b.ts pour le raisonnement complet.
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-09-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 5287, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 2266.1, status: "validated" },
    });
    assert.equal(result!.resultatFiscal, 0, "précondition : F-006 (inchangé) fixe resultatFiscal=0 dans une année déficitaire");
    assert.equal(result!.deficitNouveau, 2287, "précondition : le déficit LMNP de l'exercice reste 2287, F-006 inchangé");
    const { form } = assembleForm2031SD(result!, IDENTITE);
    assert.equal(caseValue(form, "C_L1_COL2"), undefined, "C_L1_COL2 = report de 372 (resultatFiscal<0), jamais déclenché ici");
    assert.equal(caseValue(form, "I_7B"), 2287, "I_7B (circuit dédié BIC non pro) continue de porter le déficit LMNP, inchangé");
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
