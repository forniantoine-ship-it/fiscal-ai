/**
 * P1 — wording du checkout selon `mode` ("generate" vs "pay-only"), sans
 * rendu React (ce dépôt n'a pas de harnais de test de composants) : on
 * vérifie directement la table `CHECKOUT_COPY` exportée par
 * ValidationCheckoutOverlay.tsx, seule source du texte affiché.
 *
 * Règle testée (pas un simple bannissement du mot "génération" — le mode
 * pay-only DOIT pouvoir annoncer une génération FUTURE, cf. le principe
 * demandé "sera générée dès que...") : aucune formulation ne doit laisser
 * entendre qu'une génération/télétransmission vient d'avoir lieu ou est
 * immédiate.
 *
 * Run: npx tsx --test src/components/lmnp/validation-workflow/ValidationCheckoutOverlay.copy.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CHECKOUT_COPY } from "./ValidationCheckoutOverlay";

// Phrases explicitement interdites en mode pay-only (§5 de la demande) —
// jamais un bannissement générique de "génération"/"généré", qui casserait
// la formulation attendue "sera générée dès que...".
const FORBIDDEN_PHRASES_PAY_ONLY = [
  "Finaliser la génération",
  "génération immédiate",
  "Génération immédiate",
  "télétransmission",
  "Télétransmission",
  "EDI",
];

describe("P1 — wording du checkout (ValidationCheckoutOverlay)", () => {
  it("Scénario A — mode normal (paiement + génération immédiate) : wording existant inchangé", () => {
    assert.equal(CHECKOUT_COPY.generate.title, "Finaliser la génération");
    assert.equal(CHECKOUT_COPY.generate.subtitle(2025), "LMNP 2025 — génération et télétransmission EDI");
    assert.equal(CHECKOUT_COPY.generate.explanation, undefined);
  });

  it("Scénario B — mode pay-only : titre distinct, aucune formulation de génération/EDI immédiate", () => {
    const { title, subtitle, explanation } = CHECKOUT_COPY["pay-only"];
    const subtitleText = subtitle(2025);

    assert.notEqual(title, CHECKOUT_COPY.generate.title);
    assert.ok(explanation, "une explication doit être fournie en mode pay-only");

    for (const phrase of FORBIDDEN_PHRASES_PAY_ONLY) {
      assert.ok(!title.includes(phrase), `le titre ne doit pas contenir "${phrase}"`);
      assert.ok(!subtitleText.includes(phrase), `le sous-titre ne doit pas contenir "${phrase}"`);
      assert.ok(!explanation!.includes(phrase), `l'explication ne doit pas contenir "${phrase}"`);
    }
  });

  it("Scénario B (suite) — mode pay-only : ne laisse pas entendre une validation par l'administration", () => {
    const { explanation } = CHECKOUT_COPY["pay-only"];

    assert.ok(explanation, "précondition");
    assert.ok(
      !/administration fiscale|impôts\.gouv|validé(e)? par l'INPI/i.test(explanation!),
      "l'explication ne doit jamais suggérer une validation par l'administration",
    );
    assert.match(
      explanation!,
      /SIREN|SIRET/,
      "l'explication doit mentionner la donnée réellement attendue (SIREN/SIRET)",
    );
    assert.doesNotMatch(
      explanation!,
      /date précise|avant le|au plus tard le/i,
      "l'explication ne doit jamais promettre une date précise de génération",
    );
  });

  it("les deux modes couvrent exactement les valeurs de checkoutMode (generate | pay-only)", () => {
    assert.deepEqual(Object.keys(CHECKOUT_COPY).sort(), ["generate", "pay-only"]);
  });
});
