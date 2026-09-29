/**
 * F-011 — provenance persistante par prêt : fonctions pures.
 *
 * Invariants :
 * - jamais de provenance sans valeur ni sans source connue ;
 * - `documentId` uniquement pour `extracted` / `user_correction` (document d'origine conservé après correction) ;
 * - une saisie purement manuelle n'a jamais de `documentId` (aucune provenance documentaire fabriquée) ;
 * - `capitalInitialOffre` n'est tracé que si le document qui l'a lu est connu.
 *
 * Run: npx tsx --test src/lib/lmnp/services/f011/f011-loan-provenance.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { F011LoanDraft } from "@/runtime";
import {
  buildLoanProvenance,
  reconcileFieldDocumentIdsWithPendingLoan,
  restoreFieldMapsFromLoanProvenance,
  withoutFieldDocumentId,
} from "./f011-field-sources";

const LOAN: Partial<F011LoanDraft> = {
  pretId: "pret-1", typePret: "amortissable", capitalInitial: 100000, tauxNominal: 0.02, dureeMois: 240,
  datePremiereMensualite: "2025-02-05",
};

describe("F-011 provenance — buildLoanProvenance", () => {
  it("extracted + document → {source, documentId} ; manual → {source} sans documentId", () => {
    const provenance = buildLoanProvenance(
      LOAN,
      { capitalInitial: "extracted", tauxNominal: "manual" },
      { capitalInitial: "doc-1", tauxNominal: "doc-1" },
    );
    assert.deepEqual(provenance, {
      capitalInitial: { source: "extracted", documentId: "doc-1" },
      tauxNominal: { source: "manual" },
    });
  });

  it("user_correction conserve le document d'origine (la valeur écrasée n'est jamais conservée)", () => {
    const provenance = buildLoanProvenance(LOAN, { capitalInitial: "user_correction" }, { capitalInitial: "doc-1" });
    assert.deepEqual(provenance, { capitalInitial: { source: "user_correction", documentId: "doc-1" } });
    assert.equal(JSON.stringify(provenance).includes("100000"), false);
  });

  it("aucun documentId n'est jamais attaché à une saisie manuelle, même si la map en contient un périmé", () => {
    const provenance = buildLoanProvenance(LOAN, { dureeMois: "manual" }, { dureeMois: "doc-stale" });
    assert.deepEqual(provenance, { dureeMois: { source: "manual" } });
  });

  it("jamais de provenance pour un champ sans valeur, ni pour un champ sans source connue", () => {
    const provenance = buildLoanProvenance(
      { pretId: "pret-1", capitalInitial: 100000 },
      { capitalInitial: "extracted", tauxNominal: "extracted", commissionCaution: "manual" },
      { tauxNominal: "doc-1" },
    );
    assert.deepEqual(provenance, { capitalInitial: { source: "extracted" } }, "tauxNominal/commissionCaution : pas de valeur");
    assert.equal(buildLoanProvenance(LOAN, {}, {}), undefined, "rien de prouvé → aucune provenance (clé omise)");
    assert.equal(buildLoanProvenance(LOAN, {}, undefined), undefined);
  });

  it("extracted sans document connu : source seule, jamais de documentId inventé", () => {
    assert.deepEqual(buildLoanProvenance(LOAN, { capitalInitial: "extracted" }, undefined), {
      capitalInitial: { source: "extracted" },
    });
  });

  it("capitalInitialOffre : tracé uniquement avec son document, toujours 'extracted' (lu sur l'offre)", () => {
    const withOffer = { ...LOAN, capitalInitialOffre: 120000 };
    assert.deepEqual(buildLoanProvenance(withOffer, {}, { capitalInitialOffre: "doc-offer" }), {
      capitalInitialOffre: { source: "extracted", documentId: "doc-offer" },
    });
    assert.equal(buildLoanProvenance(withOffer, {}, {}), undefined, "document inconnu → non tracé");
  });

  it("0 est une valeur connue : sa provenance est conservée", () => {
    assert.deepEqual(buildLoanProvenance({ ...LOAN, dureeMois: 0 }, { dureeMois: "manual" }, undefined), {
      dureeMois: { source: "manual" },
    });
  });

  it("ne mute jamais ses entrées", () => {
    const sources = Object.freeze({ capitalInitial: "extracted" as const });
    const docs = Object.freeze({ capitalInitial: "doc-1" });
    assert.doesNotThrow(() => buildLoanProvenance(Object.freeze({ ...LOAN }), sources, docs));
  });
});

describe("F-011 provenance — restoreFieldMapsFromLoanProvenance (edit_loan)", () => {
  it("restaure sources et documents ; capitalInitialOffre n'entre jamais dans fieldSources", () => {
    const restored = restoreFieldMapsFromLoanProvenance({
      capitalInitial: { source: "user_correction", documentId: "doc-1" },
      tauxNominal: { source: "manual" },
      capitalInitialOffre: { source: "extracted", documentId: "doc-offer" },
    });
    assert.deepEqual(restored.fieldSources, { capitalInitial: "user_correction", tauxNominal: "manual" });
    assert.deepEqual(restored.fieldDocumentIds, { capitalInitial: "doc-1", capitalInitialOffre: "doc-offer" });
  });

  it("prêt sans provenance (dossier antérieur) → maps vides, jamais fabriquées", () => {
    assert.deepEqual(restoreFieldMapsFromLoanProvenance(undefined), { fieldSources: {}, fieldDocumentIds: {} });
  });

  it("aller-retour : build → restore → build est stable", () => {
    const first = buildLoanProvenance(
      { ...LOAN, capitalInitialOffre: 120000 },
      { capitalInitial: "extracted", tauxNominal: "user_correction", dureeMois: "manual" },
      { capitalInitial: "doc-1", tauxNominal: "doc-1", capitalInitialOffre: "doc-offer" },
    )!;
    const maps = restoreFieldMapsFromLoanProvenance(first);
    const second = buildLoanProvenance({ ...LOAN, capitalInitialOffre: 120000 }, maps.fieldSources, maps.fieldDocumentIds);
    assert.deepEqual(second, first);
  });
});

describe("F-011 provenance — réconciliation des documents avec pendingLoan", () => {
  it("retire le document d'un champ que pendingLoan ne porte plus, garde les autres", () => {
    assert.deepEqual(
      reconcileFieldDocumentIdsWithPendingLoan({ capitalInitial: "doc-1", tauxNominal: "doc-1" }, { capitalInitial: 90000 }),
      { capitalInitial: "doc-1" },
    );
    assert.deepEqual(reconcileFieldDocumentIdsWithPendingLoan({ capitalInitial: "doc-1" }, undefined), {});
    assert.deepEqual(reconcileFieldDocumentIdsWithPendingLoan(undefined, { capitalInitial: 1 }), {});
  });

  it("withoutFieldDocumentId ne mute pas l'entrée", () => {
    const input = Object.freeze({ fraisDossier: "doc-1", capitalInitial: "doc-1" });
    assert.deepEqual(withoutFieldDocumentId(input, "fraisDossier"), { capitalInitial: "doc-1" });
    assert.deepEqual(withoutFieldDocumentId(undefined, "fraisDossier"), {});
  });
});
