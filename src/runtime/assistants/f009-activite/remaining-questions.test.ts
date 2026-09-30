/**
 * R15.3 — helper pur `remainingQuestions` : liste complète des questions F009 encore nécessaires.
 * Run: npx tsx --test src/runtime/assistants/f009-activite/remaining-questions.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { nextMissingQuestion, remainingQuestions } from "./assistant";
import type { F009State } from "./types";

const base = (): F009State => ({ version: 2, step: "review", fieldSources: {} });
const full = (): F009State => ({
  ...base(), siret: "80890035100020", siren: "808900351", lastName: "Dupont", firstName: "Marie",
  establishmentAddress: "1 rue Test 75001 Paris", dateDebutActivite: "2024-01-01", dateMiseEnService: "2024-02-01",
});

test("état vide : toutes les questions, dans l’ordre de l’assistant", () => {
  assert.deepEqual(remainingQuestions(base()), ["identifier", "identity", "address", "activity_date", "service_date"]);
});

test("état complet : aucune question", () => {
  assert.deepEqual(remainingQuestions(full()), []);
  assert.equal(nextMissingQuestion(full()), undefined);
});

test("dossier différé : la question SIRET n’est pas posée (règle F009 existante)", () => {
  assert.deepEqual(remainingQuestions({ ...base(), deferred: true }), ["identity", "address", "activity_date", "service_date"]);
});

test("un SIREN valide seul suffit comme identifiant ; une adresse personnelle suffit en repli", () => {
  const state = { ...full(), siret: undefined, establishmentAddress: undefined, personalAddress: "2 rue Repli" };
  assert.deepEqual(remainingQuestions(state), []);
});

test("date invalide = question ; prénom vide = question identité", () => {
  assert.deepEqual(remainingQuestions({ ...full(), dateMiseEnService: "2024-13-40", firstName: " " }), ["identity", "service_date"]);
});

test("nextMissingQuestion (comportement F009 inchangé) = première question du helper, sur toutes les combinaisons", () => {
  const variants: Array<Partial<F009State>> = [
    {}, { siret: "80890035100020" }, { siren: "808900351" }, { deferred: true },
    { lastName: "A", firstName: "B" }, { personalAddress: "x" }, { establishmentAddress: "x" },
    { dateDebutActivite: "2024-01-01" }, { dateMiseEnService: "2024-02-01" }, { dateDebutActivite: "nope" },
  ];
  for (let mask = 0; mask < 1 << variants.length; mask++) {
    const state = variants.reduce<F009State>((acc, patch, index) => (mask & (1 << index) ? { ...acc, ...patch } : acc), base());
    assert.equal(nextMissingQuestion(state), remainingQuestions(state)[0], `mask ${mask}`);
  }
});

test("le helper est pur : aucune mutation de l’état", () => {
  const state = full();
  const before = structuredClone(state);
  remainingQuestions(state);
  assert.deepEqual(state, before);
});
