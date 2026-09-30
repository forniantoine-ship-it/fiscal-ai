/**
 * R15.5 — seam pur `remainingF010Fields` : liste complète des champs F010 encore à demander.
 * Comportement F010 inchangé : `nextMissingF010Field` (privée) = premier élément ; équivalence avec la copie `lib`.
 * Run: npx tsx --test src/runtime/assistants/f010-logement/remaining-f010-fields.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { resolveNextMissingF010Field } from "@/lib/lmnp/services/f010/f010-document-prefill";
import { F010LogementAssistant, remainingF010Fields } from "./assistant";
import type { F010State } from "./types";

const empty = (): F010State => ({ step: "collect_bien", fieldSources: {} });
const ORDER = ["prixAcquisition", "typeBien", "dateAcquisition", "fraisNotaire", "choixTraitementFrais", "montantMobilier", "ratioTerrain"];

test("état vide : les sept champs, dans l’ordre F010 existant", () => {
  assert.deepEqual(remainingF010Fields(empty()), ORDER);
});

test("état complet : aucun champ ; montantMobilier: 0 est une valeur présente", () => {
  const full: F010State = {
    ...empty(), prixAcquisition: 1, typeBien: "appartement", dateAcquisition: "2025-01-01", fraisNotaire: 0,
    choixTraitementFrais: "deduction", montantMobilier: 0, ratioTerrain: 0.15,
  };
  assert.deepEqual(remainingF010Fields(full), []);
  assert.deepEqual(remainingF010Fields({ ...full, montantMobilier: undefined }), ["montantMobilier"]);
});

test("équivalence avec la copie lib `resolveNextMissingF010Field` sur toutes les combinaisons", () => {
  const patches: Array<Partial<F010State>> = [
    { prixAcquisition: 10 }, { typeBien: "maison" }, { dateAcquisition: "2025-01-01" }, { fraisNotaire: 5 },
    { choixTraitementFrais: "integration" }, { montantMobilier: 0 }, { ratioTerrain: 0.2 },
  ];
  for (let mask = 0; mask < 1 << patches.length; mask++) {
    const state = patches.reduce<F010State>((acc, patch, index) => (mask & (1 << index) ? { ...acc, ...patch } : acc), empty());
    assert.equal(remainingF010Fields(state)[0] ?? null, resolveNextMissingF010Field(state).field, `mask ${mask}`);
  }
});

test("le parcours F010 réel demande exactement le premier champ de la liste (comportement inchangé)", async () => {
  const assistant = new F010LogementAssistant({ dossierId: "d", fiscalYear: 2025, route: "/assistants/logement" }, { dateMiseEnService: "2025-06-01" });
  let state = assistant.start().state;
  state = (await assistant.handle(state, { type: "select_nature", nature: "achat" })).state;
  state = (await assistant.handle(state, { type: "submit_bien", prixAcquisition: 100000, typeBien: "appartement", dateAcquisition: "2025-02-01" })).state;
  assert.deepEqual(remainingF010Fields(state), ["fraisNotaire", "choixTraitementFrais", "montantMobilier", "ratioTerrain"]);
  assert.equal(state.step, "collect_frais");
});

test("le helper est pur : aucune mutation", () => {
  const state = empty();
  const before = structuredClone(state);
  remainingF010Fields(state);
  assert.deepEqual(state, before);
});
