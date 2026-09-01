import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { reconcileFieldSourcesWithPendingLoan } from "./f011-field-sources";

describe("F-011 — correctif provenance manual/user_correction (reconcileFieldSourcesWithPendingLoan)", () => {
  it("supprime la provenance d'un champ absent de pendingLoan (pendingLoan undefined)", () => {
    const fieldSources = { capitalInitial: "extracted", tauxNominal: "extracted" } as const;
    const result = reconcileFieldSourcesWithPendingLoan(fieldSources, undefined);
    assert.deepEqual(result, {});
  });

  it("supprime la provenance d'un champ absent de pendingLoan ({}) ", () => {
    const fieldSources = {
      capitalInitial: "extracted",
      tauxNominal: "extracted",
      dureeMois: "extracted",
      datePremiereMensualite: "extracted",
    } as const;
    const result = reconcileFieldSourcesWithPendingLoan(fieldSources, {});
    assert.deepEqual(result, {});
  });

  it("conserve la provenance d'un champ qui porte encore une valeur réelle", () => {
    const fieldSources = { capitalInitial: "extracted", tauxNominal: "extracted" } as const;
    const result = reconcileFieldSourcesWithPendingLoan(fieldSources, { capitalInitial: 90000 });
    assert.deepEqual(result, { capitalInitial: "extracted" }, "tauxNominal absent de pendingLoan est retiré");
  });

  it("conserve toutes les provenances quand pendingLoan porte encore toutes les valeurs", () => {
    const fieldSources = {
      capitalInitial: "extracted",
      tauxNominal: "user_correction",
      typePret: "manual",
    } as const;
    const pendingLoan = { capitalInitial: 90000, tauxNominal: 0.03, typePret: "amortissable" as const };
    const result = reconcileFieldSourcesWithPendingLoan(fieldSources, pendingLoan);
    assert.deepEqual(result, fieldSources);
  });

  it("le champ 0 (valeur métier valide, jamais 'absente') n'est jamais retiré", () => {
    const fieldSources = { dureeMois: "extracted" } as const;
    const result = reconcileFieldSourcesWithPendingLoan(fieldSources, { dureeMois: 0 });
    assert.deepEqual(result, { dureeMois: "extracted" }, "0 est une valeur connue, pas une absence");
  });

  it("ne mute jamais l'objet fieldSources reçu (aucun effet de bord)", () => {
    const fieldSources = { capitalInitial: "extracted" } as const;
    const frozen = Object.freeze({ ...fieldSources });
    assert.doesNotThrow(() => reconcileFieldSourcesWithPendingLoan(frozen, undefined));
    assert.deepEqual(frozen, fieldSources, "l'entrée n'est jamais mutée");
  });

  it("fieldSources vide reste vide, quel que soit pendingLoan", () => {
    assert.deepEqual(reconcileFieldSourcesWithPendingLoan({}, { capitalInitial: 1 }), {});
    assert.deepEqual(reconcileFieldSourcesWithPendingLoan({}, undefined), {});
  });
});
