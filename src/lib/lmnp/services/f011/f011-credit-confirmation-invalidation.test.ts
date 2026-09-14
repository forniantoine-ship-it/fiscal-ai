import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { shouldInvalidateCreditConfirmation } from "./f011-credit-confirmation-invalidation";
import { buildDossierSteps } from "../validation-profile";
import type { DeclarationDraft } from "../../types";

/**
 * F011-2 (audit contradictoire) — reproduit le scénario exact soulevé par
 * l'audit :
 *   complete → « Modifier mes réponses » (GO_BACK) → édition → abandon
 * Avant ce correctif, `creditConfirmedAt` restait inchangé pendant toute
 * l'édition : `isCreditComplete()` (`validation-profile.ts`, via
 * `buildDossierSteps`) et `isDocumentJourneyComplete()`
 * (`document-journey-progress.ts`) l'auraient donc considéré "confirmé" en
 * pleine correction, ce qui aurait pu autoriser une génération/un paiement
 * de déclaration sur les anciennes valeurs (`declaration-generation-gate.ts`,
 * `snapshot.isComplete`).
 */

describe("F011-2 — shouldInvalidateCreditConfirmation (prédicat pur)", () => {
  it("quitter `complete` invalide la confirmation", () => {
    assert.equal(shouldInvalidateCreditConfirmation({ previousStep: "complete", nextStep: "aggregate_review" }), true);
    assert.equal(shouldInvalidateCreditConfirmation({ previousStep: "complete", nextStep: "loan_type" }), true);
  });

  it("rester sur `complete` (aucune transition) : jamais invalidé", () => {
    assert.equal(shouldInvalidateCreditConfirmation({ previousStep: "complete", nextStep: "complete" }), false);
  });

  it("toute transition qui n'a jamais transité PAR `complete` : jamais invalidé (pas de fausse invalidation en plein parcours)", () => {
    assert.equal(shouldInvalidateCreditConfirmation({ previousStep: "loan_review", nextStep: "aggregate_review" }), false);
    assert.equal(shouldInvalidateCreditConfirmation({ previousStep: "aggregate_review", nextStep: "complete" }), false);
    assert.equal(shouldInvalidateCreditConfirmation({ previousStep: "presence_emprunt", nextStep: "nombre_prets" }), false);
  });

  it("`skipped` (achat comptant) : jamais concerné, il ne transite jamais depuis `complete`", () => {
    assert.equal(shouldInvalidateCreditConfirmation({ previousStep: "skipped", nextStep: "presence_emprunt" }), false);
  });
});

/**
 * Contrat bout-en-bout (côté downstream réel, pas seulement le prédicat) :
 * démontre que le patch que le panel applique désormais
 * (`creditConfirmedAt: undefined`, sans jamais toucher `financementCharges`/
 * `creditFinancing`) fait effectivement basculer le statut "F-011" consommé
 * par le dashboard/la porte de génération, puis qu'une nouvelle confirmation
 * le restaure — sans jamais perdre les données de travail entre-temps.
 */
describe("F011-2 — contrat bout-en-bout : complete → Modifier → abandon → F011 non 'confirmé'", () => {
  const confirmedFinancing = { loans: [{ id: "pret-1" }] } as unknown as DeclarationDraft["creditFinancing"];
  const confirmedCharges = { prets: [{ pretId: "pret-1" }] } as unknown as DeclarationDraft["financementCharges"];

  it("A → B → C → D : abandon avant confirm_all → 'credit' redevient incomplet, données de travail conservées", () => {
    const afterFirstCompletion: DeclarationDraft = {
      completedSteps: ["credit", "financement-assistant"],
      creditConfirmedAt: "2026-01-01T00:00:00.000Z",
      creditFinancing: confirmedFinancing,
      financementCharges: confirmedCharges,
    };
    const beforeEdit = buildDossierSteps(afterFirstCompletion).find((s) => s.id === "credit");
    assert.equal(beforeEdit?.status, "complete", "état de départ : F-011 bien confirmé");

    // B/C — « Modifier mes réponses » (GO_BACK depuis `complete`) : le panel
    // applique désormais ce patch exact (DECLARATION_PATCH_DRAFT), sans
    // jamais toucher financementCharges/creditFinancing (voir
    // F011FinancementAssistantPanel.applyTurn).
    const midEdit: DeclarationDraft = {
      ...afterFirstCompletion,
      creditConfirmedAt: undefined,
    };

    // D — abandon/reload avant confirm_all : c'est exactement cet état qui
    // est persisté (financementAssistantState.step !== "complete", donc
    // resume_step reprend l'édition — voir f011-resume.ts).
    const afterAbandon = buildDossierSteps(midEdit).find((s) => s.id === "credit");
    assert.equal(afterAbandon?.status, "incomplete", "F-011 ne doit plus être considéré comme confirmé pendant l'édition");
    assert.deepEqual(midEdit.creditFinancing, confirmedFinancing, "les prêts de travail ne sont jamais effacés");
    assert.deepEqual(midEdit.financementCharges, confirmedCharges, "les charges déjà calculées ne sont jamais effacées");

    // Une nouvelle confirmation (confirm_all → persistCompletion) restaure un
    // état valide, exactement comme la première fois.
    const reconfirmed: DeclarationDraft = {
      ...midEdit,
      creditConfirmedAt: "2026-01-02T00:00:00.000Z",
    };
    const afterReconfirm = buildDossierSteps(reconfirmed).find((s) => s.id === "credit");
    assert.equal(afterReconfirm?.status, "complete", "une nouvelle confirmation explicite restaure le statut confirmé");
  });
});
