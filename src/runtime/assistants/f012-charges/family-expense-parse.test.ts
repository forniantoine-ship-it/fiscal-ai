/**
 * Cycle 12A — helpers purs : plusieurs dépenses dans une saisie libre.
 * Run: npx tsx --test src/runtime/assistants/f012-charges/family-expense-parse.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { dedupeParsedExpenses } from "./family-expense-apply";
import {
  detectFamilySignals,
  inferFamilyFromFiletText,
  isAmbiguousAmountText,
  parseFamilyExpenseMentions,
  parseFamilyExpenseMentionsBounded,
  parseStructuredAmount,
  paymentBelongsToExercise,
} from "./family-expense-parse";

describe("F-012 Cycle 12A — parseFamilyExpenseMentions", () => {
  it("1200 € produit exactement 1200, sans fragment", () => {
    assert.deepEqual(
      parseFamilyExpenseMentions("1200 €", "impots").map((row) => row.amount),
      [1200],
    );
    const items = parseFamilyExpenseMentions("1200 € de taxe foncière", "impots");
    assert.deepEqual(items.map((row) => row.amount), [1200]);
    assert.equal(items[0]?.kind, "taxe_fonciere");
  });

  it("1 800 € produit exactement 1800, sans fragment", () => {
    const items = parseFamilyExpenseMentions("1 800 € de charges", "syndic");
    assert.deepEqual(items.map((row) => row.amount), [1800]);
    assert.equal(items[0]?.kind, "copro_provisions");
  });

  it("année 2024 ne produit aucun montant", () => {
    assert.deepEqual(parseFamilyExpenseMentions("payé en 2024", "autres"), []);
    const items = parseFamilyExpenseMentions("payé en 2024, 110 € de fournitures", "autres");
    assert.equal(items.length, 1);
    assert.equal(items[0]?.amount, 110);
  });

  it("plusieurs montants dans une phrase restent indépendants", () => {
    const items = parseFamilyExpenseMentions(
      "600 € d'assurance habitation et 240 € de loyers impayés",
      "assurances",
    );
    assert.equal(items.length, 2);
    assert.deepEqual(
      items.map((row) => ({ kind: row.kind, amount: row.amount })),
      [
        { kind: "assurance_pno", amount: 600 },
        { kind: "assurance_gli", amount: 240 },
      ],
    );
  });

  it("le mot-clé de la dépense suivante ne reclassifie pas la précédente", () => {
    const items = parseFamilyExpenseMentions(
      "600 € d'assurance habitation et 240 € de loyers impayés",
      "assurances",
    );
    assert.equal(items[0]?.kind, "assurance_pno");
    assert.equal(items[1]?.kind, "assurance_gli");
    assert.equal(items[0]?.amount, 600);
    assert.equal(items[1]?.amount, 240);
  });

  it("syndic + régularisation → deux lignes", () => {
    const items = parseFamilyExpenseMentions("1 800 € de charges et 350 € de régularisation", "syndic");
    assert.equal(items.length, 2);
    assert.equal(items.find((row) => row.kind === "copro_provisions")?.amount, 1800);
    assert.equal(items.find((row) => row.kind === "copro_regularisation")?.amount, 350);
  });

  it("gestion + état des lieux + mise en location → trois lignes", () => {
    const items = parseFamilyExpenseMentions(
      "1 200 € de gestion + 180 € d'état des lieux + 300 € de mise en location",
      "gestion",
    );
    assert.equal(items.length, 3);
    assert.equal(items.find((row) => row.kind === "honoraires_gestion")?.amount, 1200);
    assert.equal(items.find((row) => row.kind === "frais_etat_des_lieux")?.amount, 180);
    assert.equal(items.find((row) => row.kind === "mise_en_location")?.amount, 300);
  });

  it("une seule dépense reste une seule dépense", () => {
    const items = parseFamilyExpenseMentions("1200 € de taxe foncière", "impots");
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, "taxe_fonciere");
    assert.equal(items[0]?.amount, 1200);
  });

  it("filet : plombier → travaux, habitation → assurances", () => {
    assert.equal(inferFamilyFromFiletText("450 € à un plombier"), "travaux");
    assert.equal(inferFamilyFromFiletText("annonce leboncois 40€"), "autres");
    assert.equal(inferFamilyFromFiletText("600 € d'assurance habitation"), "assurances");
  });

  it("Cycle 13A — S2 multi-familles n'écrit rien dans Impôts", () => {
    const text =
      "1800 € syndic, 600 € d'assurance, 450 € à un plombier et 300 € à mon comptable";
    const bounded = parseFamilyExpenseMentionsBounded(text, "impots");
    assert.equal(bounded.items.length, 0);
    assert.ok(bounded.foreignFamilies.includes("syndic"));
    assert.ok(bounded.foreignFamilies.includes("assurances"));
    assert.ok(bounded.foreignFamilies.includes("travaux"));
    assert.ok(bounded.foreignFamilies.includes("gestion"));
  });

  it("Cycle 13A — PNO + GLI dans Assurances n'est pas étranger", () => {
    const text = "600 € d'assurance habitation et 240 € de loyers impayés";
    assert.deepEqual(detectFamilySignals(text), ["assurances"]);
    const bounded = parseFamilyExpenseMentionsBounded(text, "assurances");
    assert.equal(bounded.foreignFamilies.length, 0);
    assert.equal(bounded.items.length, 2);
  });

  it("Cycle 13A — fonds travaux n'est pas la famille travaux", () => {
    const text = "1 800 € de charges et 120 € de fonds travaux";
    assert.equal(detectFamilySignals(text).includes("travaux"), false);
    const bounded = parseFamilyExpenseMentionsBounded(text, "syndic");
    assert.equal(bounded.foreignFamilies.length, 0);
    assert.ok(bounded.items.length >= 1);
  });

  it("paiement N+1 n'appartient pas à N", () => {
    assert.equal(paymentBelongsToExercise("2025-01-15", 2024), false);
    assert.equal(paymentBelongsToExercise("2024-10-15", 2024), true);
    assert.equal(paymentBelongsToExercise(undefined, 2024), true);
  });

  it("doublons strictement identiques sont dédupliqués", () => {
    const parsed = parseFamilyExpenseMentions(
      "600 € d'habitation et 240 € de loyers impayés",
      "assurances",
    );
    const twice = dedupeParsedExpenses([...parsed, ...parsed]);
    assert.equal(twice.length, 2);
  });
});

describe("F-012 Cycle 12B — structured amount + ambiguïté", () => {
  it("1 800 en champ structuré produit 1800", () => {
    assert.equal(parseStructuredAmount("1 800"), 1800);
    assert.equal(parseStructuredAmount("1 800 €"), 1800);
    assert.equal(parseStructuredAmount("1200"), 1200);
  });

  it("1200 ou 1300 € est ambigu, sans montant fiscal certain", () => {
    assert.equal(isAmbiguousAmountText("1200 ou 1300 €"), true);
    assert.equal(isAmbiguousAmountText("600 € d'habitation et 240 € de loyers impayés"), false);
  });
});
