/**
 * Latence « prêt saisi puis aucun crédit » — écritures : reducer `DECLARE_NO_CREDIT` (purge des copies dérivées
 * d'un ancien prêt confirmé, sauf donnée en attente) et fusion du flush. Importe le reducer (donc Supabase, comme
 * les autres tests de reducer du dépôt) : séparé de `credit-state.test.ts`, qui reste pur.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/credit-state-reducer.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { noCreditSupersessionPatch, resolveCreditState } from "./credit-state";
import { lmnpReducer, type LmnpState } from "../../store/reducer";
import type { DeclarationDraft } from "../../types";
import { ALICE_YEAR, LOAN_RETIRE_AT, LOAN_SAISI_AT, aliceDraft, aliceWithLoan } from "./alice-test-draft";

function baseState(declarationDraft: DeclarationDraft): LmnpState {
  return {
    fiscalYear: { id: "fy-1", year: ALICE_YEAR, status: "draft", regime: "reel", propertyIds: ["prop-1"], createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
    properties: [{ id: "prop-1", label: "", address: "", city: "", postalCode: "" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft,
    fileRegistry: new Map(),
  } as LmnpState;
}

describe("purge à l'écriture — DECLARE_NO_CREDIT et fusion du flush", () => {
  it("prêt confirmé puis DECLARE_NO_CREDIT : financementCharges, creditFinancing et creditConfirmedAt sont purgés, la déclaration est posée", () => {
    const before = aliceWithLoan();
    assert.ok(before.financementCharges && before.creditFinancing && before.creditConfirmedAt);
    const after = lmnpReducer(baseState(before), { type: "DECLARE_NO_CREDIT" }).declarationDraft!;
    assert.equal(after.financementCharges, undefined);
    assert.equal(after.creditFinancing, undefined);
    assert.equal(after.creditConfirmedAt, undefined);
    assert.ok(after.creditDeclaredNoneAt);
    assert.equal(resolveCreditState(after).etat, "AUCUN_CREDIT_ETABLI");
  });

  it("donnée de prêt EN ATTENTE (document déposé) : DECLARE_NO_CREDIT ne détruit rien — le doute ne se résout pas par une suppression", () => {
    const before = aliceWithLoan({ creditDocumentId: "doc-1" });
    const after = lmnpReducer(baseState(before), { type: "DECLARE_NO_CREDIT" }).declarationDraft!;
    assert.equal(after.financementCharges, before.financementCharges);
    assert.equal(after.creditFinancing, before.creditFinancing);
    assert.equal(after.creditDocumentId, "doc-1");
    assert.equal(resolveCreditState(after).etat, "AMBIGU");
  });

  it("extraction en attente (creditGptSession) : rien n'est purgé non plus", () => {
    const before = aliceWithLoan({ creditGptSession: { loanOffer: {} } as never });
    assert.deepEqual(noCreditSupersessionPatch(before), {});
  });

  it("flush : le patch de purge écrase RÉELLEMENT l'état précédent fusionné (clés présentes à undefined), sinon la version persistée garderait l'ancien prêt", () => {
    const stateAvantReducer = aliceWithLoan();
    const patch = noCreditSupersessionPatch(stateAvantReducer);
    for (const key of ["financementCharges", "creditFinancing", "creditConfirmedAt"] as const) {
      assert.ok(Object.prototype.hasOwnProperty.call(patch, key), `${key} doit figurer explicitement dans le patch`);
    }
    // Même fusion que `flushWorkspace` : { ...base.declarationDraft, ...patch }.
    const persisted = JSON.parse(JSON.stringify({ ...stateAvantReducer, ...patch, creditDeclaredNoneAt: LOAN_RETIRE_AT }));
    assert.equal("financementCharges" in persisted, false, "absent du JSON persisté");
    assert.equal("creditFinancing" in persisted, false);
    // Contre-épreuve : SANS les clés explicites, la fusion garderait l'ancien prêt.
    const sansPurge = JSON.parse(JSON.stringify({ ...stateAvantReducer, creditDeclaredNoneAt: LOAN_RETIRE_AT }));
    assert.ok(sansPurge.financementCharges, "sans purge explicite, l'ancien prêt survivrait à la fusion");
  });
});

describe("scénario INVERSE — « aucun crédit » puis prêt : la confirmation d'un prêt efface la déclaration", () => {
  it("CONFIRM_CREDIT_FINANCING après DECLARE_NO_CREDIT : creditDeclaredNoneAt effacée, prêt confirmé, état CREDIT_PRESENT une fois les charges recalculées", () => {
    const withNone = aliceDraft(undefined, { creditDeclaredNoneAt: LOAN_SAISI_AT });
    const after = lmnpReducer(baseState(withNone), {
      type: "CONFIRM_CREDIT_FINANCING",
      financing: { loans: [{ id: "p" }], summary: {}, installments: [] } as never,
    }).declarationDraft!;
    assert.equal(after.creditDeclaredNoneAt, undefined);
    assert.ok(after.creditConfirmedAt);
    assert.notEqual(resolveCreditState(after).etat, "AUCUN_CREDIT_ETABLI");
  });

  it("aller-retour complet : prêt → aucun crédit → prêt de nouveau : le dernier état gagne à chaque étape", () => {
    let state = baseState(aliceWithLoan());
    state = lmnpReducer(state, { type: "DECLARE_NO_CREDIT" });
    assert.equal(resolveCreditState(state.declarationDraft).etat, "AUCUN_CREDIT_ETABLI");
    state = lmnpReducer(state, {
      type: "CONFIRM_CREDIT_FINANCING",
      financing: { loans: [{ id: "p2" }], summary: {}, installments: [] } as never,
    });
    assert.equal(state.declarationDraft!.creditDeclaredNoneAt, undefined);
    assert.equal(state.declarationDraft!.creditFinancing!.loans[0].id, "p2");
  });
});
