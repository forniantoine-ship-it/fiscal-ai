/**
 * F-012 Cycle 8 — décisions de review (pures).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { ChargeProposal } from "./charge-proposal";
import {
  allIgnoredWithoutCharge,
  amountAfterConflict,
  annualImpotsAmount,
  canConfirmAll,
  confirmAllProposals,
  conflictMessage,
  detectAmountConflict,
  documentSourceLabel,
  everydayDecisionLabel,
  everydayProposalNote,
  everydayProposalTitle,
  groupDisplayAmount,
  groupProposals,
  isConflictResolved,
  isProposalDetermined,
  provenanceAfterReview,
  reviewRecap,
  reviewRecapMessage,
} from "./document-review-decisions";

function proposal(partial: Partial<ChargeProposal> & Pick<ChargeProposal, "id">): ChargeProposal {
  return {
    documentId: "doc",
    familyId: "impots",
    description: "Taxe foncière",
    missingFields: [],
    decision: "pending",
    ...partial,
  };
}

describe("F-012 Cycle 8 — document-review-decisions", () => {
  it("conflit : mêmes choix que F-011, jamais d'écrasement", () => {
    const conflict = detectAmountConflict({
      existingAmount: 1200,
      incomingAmount: 1250,
      label: "Taxe foncière",
    });
    assert.ok(conflict);
    assert.equal(isConflictResolved(conflict), false);
    assert.equal(amountAfterConflict(conflict, 1250), undefined);
    assert.match(conflictMessage(conflict!), /Vous aviez indiqué : 1[\s\u00a0\u202f]?200 €/);
    assert.match(conflictMessage(conflict!), /Le document indique : 1[\s\u00a0\u202f]?250 €/);
    assert.equal(amountAfterConflict({ ...conflict!, choice: "keep_existing" }, 1250), 1200);
    assert.equal(amountAfterConflict({ ...conflict!, choice: "use_document" }, 1250), 1250);
  });

  it("deux prélèvements → un montant annuel", () => {
    const proposals = [
      proposal({ id: "p1", amount: 600, decision: "confirmed", groupId: "g", exercise: 2024 }),
      proposal({ id: "p2", amount: 600, decision: "confirmed", groupId: "g", exercise: 2024 }),
    ];
    assert.equal(annualImpotsAmount(proposals, 2024), 1200);
    assert.equal(groupProposals(proposals).length, 1);
    assert.equal(groupDisplayAmount(proposals), 1200);
  });

  it("Tout confirmer seulement si tout est déterminé et sans conflit ouvert", () => {
    const ok = [proposal({ id: "p1", amount: 1200 })];
    assert.equal(canConfirmAll(ok), true);
    assert.equal(
      canConfirmAll([proposal({ id: "p2", missingFields: ["amount"] })]),
      false,
    );
    assert.equal(
      canConfirmAll(ok, [{ existingAmount: 1200, incomingAmount: 1250, label: "Taxe foncière" }]),
      false,
    );
  });

  it("confirmAll ignore les lignes exclues, sans inventer 0 €", () => {
    const next = confirmAllProposals([
      proposal({ id: "a", amount: 800 }),
      proposal({
        id: "b",
        familyId: "syndic",
        description: "Fonds",
        amount: 300,
        coproType: "fonds_travaux",
        exclusionReason: "épargne pour de futurs travaux — pas encore une dépense",
      }),
    ]);
    assert.equal(next[0]?.decision, "confirmed");
    assert.equal(next[1]?.decision, "ignored");
    assert.equal(next[1]?.amount, 300);
  });

  it("ignorer toutes les lignes ≠ none automatique", () => {
    const ignored = [
      proposal({ id: "a", amount: 1200, decision: "ignored" }),
      proposal({
        id: "b",
        amount: 300,
        decision: "ignored",
        exclusionReason: "épargne pour de futurs travaux — pas encore une dépense",
      }),
    ];
    assert.equal(allIgnoredWithoutCharge(ignored), true);
  });

  it("information manquante : pas déterminée, wording manuel", () => {
    const hole = proposal({ id: "h", missingFields: ["amount"] });
    assert.equal(isProposalDetermined(hole), false);
    assert.match(everydayProposalNote(hole) ?? "", /manuellement/);
  });

  it("langage naturel : pas de jargon interne", () => {
    const syndic = proposal({
      id: "s",
      familyId: "syndic",
      description: "FONDS TRAVAUX (ALUR)",
      amount: 300,
      coproType: "fonds_travaux",
      exclusionReason: "épargne pour de futurs travaux — pas encore une dépense",
    });
    const text = [
      everydayProposalTitle(syndic),
      everydayProposalNote(syndic),
      everydayDecisionLabel("pending"),
      documentSourceLabel(),
      reviewRecapMessage(reviewRecap([syndic])),
    ].join(" ");
    assert.doesNotMatch(text, /ChargeProposal|FieldSource|FamilyCoverage|provenance|exclusionReason/);
    assert.doesNotMatch(text, /\bALUR\b/);
    assert.doesNotMatch(text, /\bprovisions?\b/i);
    assert.match(text, /À vérifier/);
    assert.match(text, /Trouvé dans votre document/);
    const logement = proposal({
      id: "ass",
      familyId: "assurances",
      description: "Assurance du logement",
      insuranceKind: "logement",
      amount: 300,
      paymentProven: true,
      exercise: 2024,
    });
    assert.equal(everydayProposalTitle(logement), "Assurance du logement");
    assert.match(everydayProposalNote(logement) ?? "", /assurance pour ce logement de 300 €/);
    assert.doesNotMatch(everydayProposalTitle(logement), /PNO|assuranceAnnuelle|F011/);
    const agence = proposal({
      id: "ges",
      familyId: "gestion",
      description: "Frais de l'agence",
      gestionKind: "gestion",
      amount: 480,
      paymentProven: false,
    });
    assert.equal(everydayProposalTitle(agence), "Frais de l'agence");
    assert.match(everydayProposalNote(agence) ?? "", /honoraires de 480 €/);
    assert.doesNotMatch(everydayProposalTitle(agence), /honorairesGestion|honoraires déductibles/);
  });

  it("provenance : correction / garder le manuel / document", () => {
    assert.equal(provenanceAfterReview({ decisions: ["modified"] }), "user_correction");
    assert.equal(
      provenanceAfterReview({
        conflict: { existingAmount: 1200, incomingAmount: 1250, label: "x", choice: "keep_existing" },
        decisions: ["confirmed"],
      }),
      "manual",
    );
    assert.equal(provenanceAfterReview({ decisions: ["confirmed"] }), "extracted");
  });
});
