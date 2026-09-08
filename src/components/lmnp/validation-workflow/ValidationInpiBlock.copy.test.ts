/**
 * P1 (correctif) — wording du bloc INPI sur Validation, sans rendu React (ce
 * dépôt n'a pas de harnais de test de composants) : vérifie directement la
 * table `INPI_BLOCK_COPY` exportée par ValidationInpiBlock.tsx et la source
 * du fichier pour le bouton renommé (label non extrait dans la table de
 * wording, contrairement aux titres/corps de texte).
 *
 * Run: npx tsx --test src/components/lmnp/validation-workflow/ValidationInpiBlock.copy.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { INPI_BLOCK_COPY } from "./ValidationInpiBlock";

const COMPONENT_SOURCE = readFileSync(
  fileURLToPath(new URL("./ValidationInpiBlock.tsx", import.meta.url)),
  "utf8",
);

describe("P1 (correctif) — wording du bloc INPI (ValidationInpiBlock)", () => {
  it("Test A — regularization_required : titre distinct signalant une action attendue", () => {
    assert.equal(INPI_BLOCK_COPY.REGULARIZATION_REQUIRED.title, "Une action est nécessaire sur votre démarche INPI");
    assert.notEqual(INPI_BLOCK_COPY.REGULARIZATION_REQUIRED.title, INPI_BLOCK_COPY.IN_PROGRESS.title);
    // Ne prétend jamais connaître la correction précise demandée.
    assert.doesNotMatch(INPI_BLOCK_COPY.REGULARIZATION_REQUIRED.body, /justificatif|corrigez votre/i);
  });

  it("Test B — submitted : wording \"démarche envoyée\", distinct de l'état générique", () => {
    assert.equal(INPI_BLOCK_COPY.SUBMITTED.title, "Votre démarche a été envoyée");
    assert.notEqual(INPI_BLOCK_COPY.SUBMITTED.title, INPI_BLOCK_COPY.IN_PROGRESS.title);
    // Ne prétend jamais connaître le résultat ou le délai de traitement.
    assert.doesNotMatch(INPI_BLOCK_COPY.SUBMITTED.body, /résultat|délai|jours|semaines/i);
  });

  it("Test C — in_progress générique : wording existant inchangé", () => {
    assert.equal(INPI_BLOCK_COPY.IN_PROGRESS.title, "Votre démarche INPI est en cours");
  });

  it("Test D — \"Voir ce qu'il me reste à faire\" n'existe plus nulle part dans le composant", () => {
    assert.doesNotMatch(COMPONENT_SOURCE, /Voir ce qu'il me reste à faire/);
  });

  it("Test D (bis) — le nouveau libellé \"En savoir plus sur la suite\" est bien présent", () => {
    assert.match(COMPONENT_SOURCE, /En savoir plus sur la suite/);
  });

  it("aucun texte introduit ne prétend connaître l'état réel de la formalité côté INPI", () => {
    const allText = Object.values(INPI_BLOCK_COPY)
      .flatMap((entry) => Object.values(entry))
      .join(" ");
    assert.doesNotMatch(allText, /nous savons où vous en êtes|synchronisé avec l'INPI|en temps réel/i);
  });
});
