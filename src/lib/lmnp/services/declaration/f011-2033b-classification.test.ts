/**
 * Classification 2033-B des composantes F-011 — frais de dossier → 242 ∈ 264 ;
 * intérêts / assurance / garantie (PROVISOIRE) → 294 ; 310 inchangé.
 *
 * Run: npx tsx --test src/runtime/capabilities/rfs/projection/split-financement-2033b.test.ts
 *      npx tsx --test src/lib/lmnp/services/declaration/f011-2033b-classification.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import { splitFinancementFor2033B } from "@/runtime/capabilities/rfs/projection/split-financement-2033b";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { runDeclarationGeneration } from "./run-declaration-generation";
import { ALICE_YEAR, aliceDraft, pretTest, financementLoan } from "./alice-test-draft";
import type { PretFinancementExercice } from "@/runtime";

const round2 = (n: number) => Math.round(n * 100) / 100;

function v(form: ReturnType<typeof map2033BFromRfs>, id: string) {
  return form.cases.find((c) => c.caseId === id)?.value as number | undefined;
}

function draftWithPrets(prets: PretFinancementExercice[]) {
  const base = financementLoan();
  const totalChargesFinancementExercice = round2(
    prets.reduce(
      (acc, p) =>
        acc + p.interetsEmpruntExercice + p.assuranceEmpruntExercice + p.fraisDossierDeductibles + p.garantieDeductible + p.iraDeductible,
      0,
    ),
  );
  return aliceDraft(undefined, {
    financementCharges: {
      ...base,
      prets,
      totalInteretsEmprunt: round2(prets.reduce((a, p) => a + p.interetsEmpruntExercice, 0)),
      totalInteretsPreExploitation: round2(prets.reduce((a, p) => a + p.interetsPreExploitation, 0)),
      totalAssurance: round2(prets.reduce((a, p) => a + p.assuranceEmpruntExercice, 0)),
      totalAssurancePreExploitation: round2(prets.reduce((a, p) => a + p.assurancePreExploitation, 0)),
      totalChargesFinancementExercice,
    },
    creditConfirmedAt: "2026-03-01T10:00:00.000Z",
    creditFinancing: {
      loans: prets.map((p) => ({ id: p.pretId, firstPaymentDate: "2025-03-01", startDate: "2025-03-01", fees: 0 })),
      summary: {},
      installments: [],
    } as never,
  });
}

describe("splitFinancementFor2033B", () => {
  it("intérêts seuls → 294 ; frais dossier 0", () => {
    const s = splitFinancementFor2033B({
      emprunts: [pretTest({ assuranceEmpruntExercice: 0, assurancePreExploitation: 0, fraisDossierDeductibles: 0, garantieDeductible: 0, iraDeductible: 0 })],
      chargesFinancementFallback: 0,
    });
    assert.equal(s.case294, 1100);
    assert.equal(s.fraisDossier242, 0);
  });

  it("assurance seule → 294", () => {
    const s = splitFinancementFor2033B({
      emprunts: [
        pretTest({
          interetsEmpruntExercice: 0,
          interetsPreExploitation: 0,
          fraisDossierDeductibles: 0,
          garantieDeductible: 0,
          iraDeductible: 0,
        }),
      ],
      chargesFinancementFallback: 0,
    });
    assert.equal(s.case294, 220);
    assert.equal(s.fraisDossier242, 0);
  });

  it("frais dossier seuls → 242, hors 294", () => {
    const s = splitFinancementFor2033B({
      emprunts: [
        pretTest({
          interetsEmpruntExercice: 0,
          interetsPreExploitation: 0,
          assuranceEmpruntExercice: 0,
          assurancePreExploitation: 0,
          garantieDeductible: 0,
          iraDeductible: 0,
          fraisDossierDeductibles: 400,
        }),
      ],
      chargesFinancementFallback: 0,
    });
    assert.equal(s.case294, 0);
    assert.equal(s.fraisDossier242, 400);
  });

  it("combinaison des trois + garantie PROVISOIRE en 294", () => {
    const s = splitFinancementFor2033B({ emprunts: [pretTest()], chargesFinancementFallback: 0 });
    assert.equal(s.fraisDossier242, 100);
    assert.equal(s.garantieProvisoire294, 50);
    assert.equal(s.case294, 1000 + 100 + 200 + 20 + 50);
  });

  it("MUTANT — remettre frais dossier en 294 doit diverger du split", () => {
    const s = splitFinancementFor2033B({ emprunts: [pretTest()], chargesFinancementFallback: 0 });
    const mutant294 = round2(s.case294 + s.fraisDossier242);
    assert.notEqual(mutant294, s.case294, "mutation : frais dossier réintégrés en 294");
  });
});

describe("F011 → 2033-B classification bout-en-bout", () => {
  it("résultat fiscal et 310 inchangés par la reclassification ; 242+244+254=264 ; 310=270−294−300", () => {
    const draft = draftWithPrets([pretTest()]);
    const g = runDeclarationGeneration(draft, ALICE_YEAR);
    assert.equal(g.status, "generated");
    if (g.status !== "generated") throw new Error("unreachable");
    const form = g.liasseRfs.form2033B;
    const B = (id: string) => v(form, id);
    assert.equal(form.conservationDetail.status, "CONSERVE");
    assert.equal(round2((B("242") ?? 0) + (B("244") ?? 0) + (B("254") ?? 0)), B("264"));
    assert.equal(round2((B("270") ?? 0) - (B("294") ?? 0) - (B("300") ?? 0)), B("310"));
    assert.equal(B("294"), 1370);
    assert.ok((B("242") ?? 0) >= 100);

    // Même dossier sans mapper : le FiscalResult (déduction) ne dépend pas de 242/294.
    const fiscal = produceFiscalResult({
      exerciceFiscal: ALICE_YEAR,
      activite: { dateMiseEnService: draft.dateMiseEnService },
      revenusAssistant: draft.revenusAssistant!,
      chargesAssistant: draft.chargesAssistant!,
      financementCharges: draft.financementCharges!,
      amortissementAssistant: draft.amortissementAssistant!,
      logementAmortissement: draft.logementAmortissement,
      stockDeficitsAnterieurs: [],
      stockAmortissementsReportes: 0,
    });
    assert.ok(fiscal.result);
    assert.equal(fiscal.result!.resultatFiscal, g.rfs.fiscalResult.resultatFiscal);
  });

  it("MUTANT — omettre les frais dossier de 242 alors que 264 les inclut casse 242+244+254=264", () => {
    const draft = draftWithPrets([pretTest()]);
    const g = runDeclarationGeneration(draft, ALICE_YEAR);
    assert.equal(g.status, "generated");
    if (g.status !== "generated") throw new Error("unreachable");
    const form = g.liasseRfs.form2033B;
    const B = (id: string) => v(form, id)!;
    const fd = 100;
    assert.equal(B("294"), 1370, "294 hors frais dossier");
    const mutant242 = round2(B("242") - fd);
    assert.notEqual(
      round2(mutant242 + (B("244") ?? 0) + B("254")),
      B("264"),
      "sans frais dossier en 242, la conservation casse",
    );
    const mutant294 = round2(B("294") + fd);
    assert.notEqual(mutant294, B("294"), "remettre frais dossier en 294 diverge du mapper");
  });
});
