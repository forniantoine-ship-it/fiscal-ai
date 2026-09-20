/**
 * Latence « prêt saisi puis aucun crédit » — état crédit, purge, et absence de toute influence d'un ancien prêt
 * sur l'estimation, F-006, la RFS et la liasse ; avec le scénario INVERSE et les états AMBIGUS (rien n'est
 * détruit ni écarté dans le doute).
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/credit-state.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { effectiveFinancementCharges, resolveCreditState } from "./credit-state";
import { resolveEmpruntsForRfs } from "./resolve-emprunts-for-rfs";
import { runDeclarationGeneration } from "./run-declaration-generation";
import { buildFiscalSummary } from "../validation-profile";
import type { DeclarationDraft } from "../../types";
import {
  ALICE_YEAR,
  LOAN_RETIRE_AT,
  LOAN_SAISI_AT,
  aliceDraft,
  aliceLoanThenNone,
  aliceWithLoan,
  financementLoan,
} from "./alice-test-draft";

function generate(draft: DeclarationDraft) {
  const g = runDeclarationGeneration(draft, ALICE_YEAR);
  assert.equal(g.status, "generated", "précondition : le dossier de test doit se générer");
  if (g.status !== "generated") throw new Error("unreachable");
  return g;
}

/** Résultat fiscal comparable : sans horodatage d'exécution. */
function fiscalKey(draft: DeclarationDraft): string {
  const { fiscalResult } = generate(draft);
  const copy = { ...(fiscalResult as unknown as Record<string, unknown>) };
  delete copy.computedAt;
  delete copy.trace;
  return JSON.stringify(copy);
}

describe("état crédit — les quatre états, jamais confondus", () => {
  it("aucun crédit confirmé : déclaration explicite, rien de contradictoire → AUCUN_CREDIT_ETABLI", () => {
    assert.equal(resolveCreditState(aliceDraft(undefined, { creditDeclaredNoneAt: LOAN_RETIRE_AT })).etat, "AUCUN_CREDIT_ETABLI");
  });

  it("information inconnue : aucune réponse → INCONNU (jamais assimilé à « aucun crédit »)", () => {
    assert.equal(resolveCreditState(aliceDraft()).etat, "INCONNU");
    assert.equal(resolveCreditState(undefined).etat, "INCONNU");
    assert.equal(resolveEmpruntsForRfs(aliceDraft()), undefined);
    assert.equal(effectiveFinancementCharges(aliceDraft()), undefined);
  });

  it("crédit présent : charges de financement, aucune déclaration contraire → CREDIT_PRESENT, données transportées telles quelles", () => {
    const draft = aliceWithLoan();
    assert.equal(resolveCreditState(draft).etat, "CREDIT_PRESENT");
    assert.equal(effectiveFinancementCharges(draft), draft.financementCharges);
    assert.equal(resolveEmpruntsForRfs(draft), draft.financementCharges!.prets);
  });

  it("crédit saisi puis explicitement retiré (financement ANTÉRIEUR à la déclaration, rien d'autre) → AUCUN_CREDIT_ETABLI, ancien financement écarté", () => {
    const draft = aliceLoanThenNone();
    assert.equal(resolveCreditState(draft).etat, "AUCUN_CREDIT_ETABLI");
    assert.equal(effectiveFinancementCharges(draft), undefined, "l'ancien prêt n'influence plus rien");
    assert.deepEqual(resolveEmpruntsForRfs(draft), []);
    // Rien n'est détruit : la donnée brute est intacte (seule sa lecture effective change).
    assert.ok(draft.financementCharges, "draft.financementCharges reste présent — aucune suppression silencieuse en lecture");
  });

  it("scénario INVERSE : « aucun crédit » puis prêt saisi (financement POSTÉRIEUR, ou prêt confirmé) → jamais AUCUN_CREDIT_ETABLI, le prêt est lu", () => {
    const newer = aliceDraft(undefined, {
      creditDeclaredNoneAt: LOAN_SAISI_AT,
      financementCharges: financementLoan(LOAN_RETIRE_AT),
    });
    assert.notEqual(resolveCreditState(newer).etat, "AUCUN_CREDIT_ETABLI");
    assert.equal(effectiveFinancementCharges(newer), newer.financementCharges);
    assert.equal(resolveEmpruntsForRfs(newer), newer.financementCharges!.prets);
  });

  const AMBIGUS: Array<[string, Partial<DeclarationDraft>]> = [
    ["document de prêt déposé", { creditDocumentId: "doc-1" }],
    ["extraction de prêt en attente (tableau d'amortissement)", { creditGptSession: { amortization: {} } as never }],
    ["extraction de prêt en attente (offre de prêt)", { creditGptSession: { loanOffer: {} } as never }],
    ["prêts confirmés subsistants (creditFinancing.loans)", { creditFinancing: { loans: [{ id: "l" }], summary: {}, installments: [] } as never }],
    ["prêt confirmé coexistant (creditConfirmedAt)", { creditConfirmedAt: LOAN_SAISI_AT }],
    ["financement POSTÉRIEUR à la déclaration", { creditDeclaredNoneAt: LOAN_SAISI_AT, financementCharges: financementLoan(LOAN_RETIRE_AT) }],
    ["ordre non établi (computedAt illisible)", { financementCharges: { ...financementLoan(), computedAt: "n/a" } }],
  ];

  for (const [label, extra] of AMBIGUS) {
    it(`état AMBIGU — ${label} : rien n'est détruit ni écarté, comportement historique conservé`, () => {
      const draft = aliceLoanThenNone(extra);
      const etat = resolveCreditState(draft);
      assert.equal(etat.etat, "AMBIGU", label);
      assert.ok(etat.raisons.length > 0, "l'ambiguïté est expliquée");
      assert.equal(effectiveFinancementCharges(draft), draft.financementCharges, "les charges de financement restent lues");
      assert.equal(resolveEmpruntsForRfs(draft), draft.financementCharges!.prets, "les prêts restent transportés");
    });
  }

  it("état AMBIGU sans charges de financement (document déposé + « aucun crédit ») → emprunts inconnus (undefined), jamais [] ", () => {
    const draft = aliceDraft(undefined, { creditDeclaredNoneAt: LOAN_RETIRE_AT, creditDocumentId: "doc-1" });
    assert.equal(resolveCreditState(draft).etat, "AMBIGU");
    assert.equal(resolveEmpruntsForRfs(draft), undefined);
  });
});

describe("état FINAL « prêt saisi puis aucun crédit » — aucune influence de l'ancien financement", () => {
  it("F-006 / RFS / liasse : résultat fiscal STRICTEMENT identique à un dossier qui n'a jamais eu de prêt", () => {
    assert.equal(fiscalKey(aliceLoanThenNone()), fiscalKey(aliceDraft(undefined, { creditDeclaredNoneAt: LOAN_RETIRE_AT })));
    const g = generate(aliceLoanThenNone());
    assert.equal(g.rfs.fiscalResult.charges.chargesFinancement, 0);
    assert.equal(g.rfs.fiscalResult.charges.chargesPreExploitation, g.rfs.fiscalResult.charges.chargesExploitationPreExploitation, "aucune pré-exploitation financière résiduelle (B, C)");
    assert.deepEqual(g.rfs.emprunts, []);
    const v = (id: string) => g.liasseRfs.form2033B.cases.find((c) => c.caseId === id)?.value;
    assert.equal(v("294"), 0, "aucune charge financière résiduelle en 2033-B");
    assert.equal(g.liasseRfs.form2033A.cases.find((c) => c.caseId === "156")?.value, 0, "emprunts (156) = 0, donnée établie");
  });

  it("contre-épreuve de sensibilité : le MÊME dossier avec le prêt (sans déclaration contraire) déduit bien le financement", () => {
    const avec = generate(aliceWithLoan());
    assert.equal(avec.rfs.fiscalResult.charges.chargesFinancement, 1350);
    assert.notEqual(fiscalKey(aliceWithLoan()), fiscalKey(aliceLoanThenNone()), "le prêt change le résultat : l'écart est réel, pas neutre");
  });

  it("l'estimation avant génération n'utilise plus l'ancien prêt : égale au résultat exact du dossier sans crédit", () => {
    const draft = aliceLoanThenNone();
    const exact = generate(draft).fiscalResult.resultatFiscal;
    const estimation = buildFiscalSummary(draft, [], ALICE_YEAR);
    assert.ok(Math.abs(estimation.estimatedFiscalResult - exact) < 0.005, `estimation ${estimation.estimatedFiscalResult} ≠ exact ${exact}`);
    assert.equal(estimation.preExploitationCharges, generate(draft).rfs.fiscalResult.charges.chargesExploitationPreExploitation);
  });

  it("ÉTAT AMBIGU (document en attente) : l'ancien prêt reste lu — aucune écriture silencieuse de 0 €", () => {
    const draft = aliceLoanThenNone({ creditDocumentId: "doc-1" });
    assert.equal(fiscalKey(draft), fiscalKey(aliceWithLoan()), "même résultat que le dossier avec prêt");
    assert.equal(generate(draft).rfs.fiscalResult.charges.chargesFinancement, 1350);
  });

  it("scénario INVERSE de bout en bout : « aucun crédit » puis prêt saisi (financement postérieur) → le prêt est bien déduit", () => {
    const draft = aliceDraft(undefined, { creditDeclaredNoneAt: LOAN_SAISI_AT, financementCharges: financementLoan(LOAN_RETIRE_AT) });
    assert.equal(generate(draft).rfs.fiscalResult.charges.chargesFinancement, 1350);
  });

  it("point 3 — le repli d'estimation inclut le financement de l'exercice ET les frais d'acquisition en charges (mêmes totaux que F-006)", () => {
    const withFrais = aliceWithLoan({
      logementAmortissement: { ...aliceWithLoan().logementAmortissement!, fraisEnCharges: 800 },
    });
    const exact = generate(withFrais).fiscalResult.resultatFiscal;
    const estimation = buildFiscalSummary(withFrais, [], ALICE_YEAR);
    assert.ok(Math.abs(estimation.estimatedFiscalResult - exact) < 0.005, `estimation ${estimation.estimatedFiscalResult} ≠ exact ${exact}`);
    // Additivité de l'affichage de repli : recettes − charges − pré-exploitation − amortissement = résultat.
    assert.ok(estimation.detectedCharges >= 1350 + 800, "charges détectées incluent financement (1350) et frais d'acquisition (800)");
  });
});
