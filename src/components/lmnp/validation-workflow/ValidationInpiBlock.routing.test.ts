/**
 * Phase 4.4 (correction finale) — les CTA de `ValidationInpiBlock` orientent
 * vers le Compagnon INPI (`/assistants/activite`), jamais directement vers
 * le site officiel. Comme pour `.copy.test.ts` (même dossier), ce fichier
 * teste la source du composant plutôt que son rendu — ce dépôt n'a pas de
 * harnais de test de composants React (cf. rapports Phase 4.3/4.4).
 *
 * Run: npx tsx --test src/components/lmnp/validation-workflow/ValidationInpiBlock.routing.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const COMPONENT_SOURCE = readFileSync(
  fileURLToPath(new URL("./ValidationInpiBlock.tsx", import.meta.url)),
  "utf8",
);

const COMPANION_PANEL_SOURCE = readFileSync(
  fileURLToPath(new URL("../inpi-companion/InpiCompanionPanel.tsx", import.meta.url)),
  "utf8",
);

/** Code fonctionnel uniquement — exclut les commentaires (docstrings, notes de phase) qui peuvent légitimement mentionner une URL ou un nom de fichier sans que ce soit un appel réel. */
const FUNCTIONAL_SOURCE = COMPONENT_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function blockSource(stateGuard: string): string {
  const start = COMPONENT_SOURCE.indexOf(stateGuard);
  assert.ok(start >= 0, `bloc introuvable pour ${stateGuard}`);
  const nextGuardIndex = COMPONENT_SOURCE.indexOf('if (state ===', start + stateGuard.length);
  const end = nextGuardIndex > 0 ? nextGuardIndex : start + 800;
  return COMPONENT_SOURCE.slice(start, end);
}

describe("Phase 4.4 — routing des CTA Validation → Compagnon", () => {
  it("1. NOT_STARTED → handlePrepare route vers LMNP_ROUTES.activite (pas d'ouverture directe)", () => {
    const block = blockSource('if (state === "NOT_STARTED")');
    assert.match(block, /onClick=\{handlePrepare\}/);
    assert.match(COMPONENT_SOURCE, /router\.push\(LMNP_ROUTES\.activite\)/);
  });

  it("2. IN_PROGRESS → CTA href vers LMNP_ROUTES.activite", () => {
    const block = blockSource('if (state === "IN_PROGRESS")');
    assert.match(block, /href=\{LMNP_ROUTES\.activite\}/);
  });

  it("3. SUBMITTED → CTA href vers LMNP_ROUTES.activite", () => {
    const block = blockSource('if (state === "SUBMITTED")');
    assert.match(block, /href=\{LMNP_ROUTES\.activite\}/);
  });

  it("4. REGULARIZATION_REQUIRED → CTA href vers LMNP_ROUTES.activite", () => {
    const block = blockSource('if (state === "REGULARIZATION_REQUIRED")');
    assert.match(block, /href=\{LMNP_ROUTES\.activite\}/);
  });

  it("5. PAID_WAITING_INPI → CTA onClick={handlePrepare} (route vers Activité, jamais un second paiement)", () => {
    const block = blockSource('if (state === "PAID_WAITING_INPI")');
    assert.match(block, /onClick=\{handlePrepare\}/);
    assert.doesNotMatch(block, /Stripe|checkout|paiement|payer/i);
  });

  it("6. REGISTERED → aucun bouton, donc aucun CTA de création possible", () => {
    const block = blockSource('if (state === "REGISTERED")');
    assert.doesNotMatch(block, /<Button/);
  });

  it("7. aucun CTA de Validation n'appelle openOfficialInpiSite ni window.open (code fonctionnel, hors commentaires)", () => {
    assert.doesNotMatch(FUNCTIONAL_SOURCE, /openOfficialInpiSite/);
    assert.doesNotMatch(FUNCTIONAL_SOURCE, /window\.open/);
    assert.doesNotMatch(FUNCTIONAL_SOURCE, /formalites\.entreprises\.gouv\.fr/);
  });

  it("8. aucun second paiement introduit — pas de nouvel appel de paiement/checkout dans le code fonctionnel", () => {
    assert.doesNotMatch(FUNCTIONAL_SOURCE, /Stripe|createCheckout|useCheckout\(/i);
  });

  it("9. aucun changement de logique fiscale — pas de nouvelle référence au Generation Gate ou à la génération de déclaration", () => {
    assert.doesNotMatch(COMPONENT_SOURCE, /declaration-generation-gate|run-declaration-generation|resolveDeclarationGenerationGate|runDeclarationGeneration/);
  });

  it("10. le Compagnon (InpiCompanionPanel) reste l'unique responsable de l'ouverture du site officiel", () => {
    assert.doesNotMatch(FUNCTIONAL_SOURCE, /window\.open/);
    assert.match(COMPANION_PANEL_SOURCE, /window\.open\(OFFICIAL_INPI_URL/);
  });
});
