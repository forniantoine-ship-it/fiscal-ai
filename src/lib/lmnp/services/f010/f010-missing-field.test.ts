/**
 * Cycle 4A (F010) — resolveNextMissingF010Field. Tests A→J.
 * Run: npx tsx --test src/lib/lmnp/services/f010/f010-missing-field.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { F010State } from "@/runtime";

import { resolveNextMissingF010Field } from "./f010-document-prefill";

type Fields = Pick<
  F010State,
  "prixAcquisition" | "typeBien" | "dateAcquisition" | "fraisNotaire" | "choixTraitementFrais" | "montantMobilier" | "ratioTerrain"
>;

const complete: Fields = {
  prixAcquisition: 280_000,
  typeBien: "appartement",
  dateAcquisition: "2023-05-12",
  fraisNotaire: 19_500,
  choixTraitementFrais: "integration",
  montantMobilier: 8_000,
  ratioTerrain: 0.15,
};

describe("Cycle 4A — resolveNextMissingF010Field", () => {
  it("A. tous manquants → prixAcquisition (premier de l'ordre)", () => {
    const state: Fields = {
      prixAcquisition: undefined,
      typeBien: undefined,
      dateAcquisition: undefined,
      fraisNotaire: undefined,
      choixTraitementFrais: undefined,
      montantMobilier: undefined,
      ratioTerrain: undefined,
    };
    assert.deepEqual(resolveNextMissingF010Field(state), { field: "prixAcquisition" });
  });

  it("B. seul prix manque", () => {
    const state: Fields = { ...complete, prixAcquisition: undefined };
    assert.deepEqual(resolveNextMissingF010Field(state), { field: "prixAcquisition" });
  });

  it("C. seul type manque", () => {
    const state: Fields = { ...complete, typeBien: undefined };
    assert.deepEqual(resolveNextMissingF010Field(state), { field: "typeBien" });
  });

  it("D. seule date manque", () => {
    const state: Fields = { ...complete, dateAcquisition: undefined };
    assert.deepEqual(resolveNextMissingF010Field(state), { field: "dateAcquisition" });
  });

  it("E. seuls frais manquent", () => {
    const state: Fields = { ...complete, fraisNotaire: undefined };
    assert.deepEqual(resolveNextMissingF010Field(state), { field: "fraisNotaire" });
  });

  it("F. seul traitement des frais manque", () => {
    const state: Fields = { ...complete, choixTraitementFrais: undefined };
    assert.deepEqual(resolveNextMissingF010Field(state), { field: "choixTraitementFrais" });
  });

  it("G. seul mobilier manque", () => {
    const state: Fields = { ...complete, montantMobilier: undefined };
    assert.deepEqual(resolveNextMissingF010Field(state), { field: "montantMobilier" });
  });

  it("H. seul ratio manque", () => {
    const state: Fields = { ...complete, ratioTerrain: undefined };
    assert.deepEqual(resolveNextMissingF010Field(state), { field: "ratioTerrain" });
  });

  it("I. tout présent → { field: null }", () => {
    assert.deepEqual(resolveNextMissingF010Field(complete), { field: null });
  });

  it("J. montantMobilier = 0 → considéré comme présent, jamais manquant", () => {
    const state: Fields = { ...complete, montantMobilier: 0 };
    assert.deepEqual(resolveNextMissingF010Field(state), { field: null });
  });

  it("ordre exact respecté quand plusieurs champs manquent simultanément", () => {
    const state: Fields = {
      ...complete,
      dateAcquisition: undefined,
      ratioTerrain: undefined,
    };
    // dateAcquisition précède ratioTerrain dans l'ordre — c'est lui qui doit sortir.
    assert.deepEqual(resolveNextMissingF010Field(state), { field: "dateAcquisition" });
  });

  it("ne teste jamais la provenance ni la confirmation — un champ présent suffit, quelle que soit son origine", () => {
    const stateFromDocument: F010State = {
      step: "collect_bien",
      fieldSources: { prixAcquisition: "extracted" },
      confirmed: {}, // volontairement non confirmé
      prixAcquisition: 280_000,
      typeBien: "appartement",
      dateAcquisition: "2023-05-12",
      fraisNotaire: 19_500,
      choixTraitementFrais: "integration",
      montantMobilier: 0,
      ratioTerrain: 0.15,
    };
    assert.deepEqual(resolveNextMissingF010Field(stateFromDocument), { field: null });
  });
});
