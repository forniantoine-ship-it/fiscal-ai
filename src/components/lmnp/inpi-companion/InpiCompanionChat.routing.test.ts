/**
 * Compagnon INPI — Phase 4.5.2 : UI du chat contextuel.
 * Comme pour `ValidationInpiBlock.routing.test.ts` (Phase 4.4), ce fichier
 * teste la source du composant plutôt que son rendu — ce dépôt n'a pas de
 * harnais de test de composants React.
 *
 * Run: npx tsx --test src/components/lmnp/inpi-companion/InpiCompanionChat.routing.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHAT_SOURCE = readFileSync(
  fileURLToPath(new URL("./InpiCompanionChat.tsx", import.meta.url)),
  "utf8",
);
const PANEL_SOURCE = readFileSync(
  fileURLToPath(new URL("./InpiCompanionPanel.tsx", import.meta.url)),
  "utf8",
);

const FUNCTIONAL_CHAT_SOURCE = CHAT_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("Ouverture / fermeture", () => {
  it("fermé par défaut (useState(false))", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /useState\(false\)/);
  });

  it("le bouton 'Ouvrir l'aide' déclenche setIsOpen(true)", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /Ouvrir l&apos;aide/);
    assert.match(FUNCTIONAL_CHAT_SOURCE, /setIsOpen\(true\)/);
  });

  it("un bouton de fermeture avec aria-label appelle setIsOpen(false)", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /aria-label="Fermer l'aide"/);
    assert.match(FUNCTIONAL_CHAT_SOURCE, /onClick=\{\(\) => setIsOpen\(false\)\}/);
  });

  it("Escape ferme le panneau (géré dans le gestionnaire clavier)", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /event\.key === "Escape"/);
    assert.match(FUNCTIONAL_CHAT_SOURCE, /handleWrapperKeyDown/);
  });

  it("Enter envoie le message depuis le champ de saisie", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /event\.key === "Enter"/);
  });
});

describe("Branchement Context + Intent (réutilisation stricte, pas de nouvelle logique)", () => {
  it("importe classifyInpiCompanionIntent depuis le module existant, ne le redéfinit pas", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /import \{ classifyInpiCompanionIntent \} from ".\/inpi-companion-chat-intent"/);
    assert.match(FUNCTIONAL_CHAT_SOURCE, /classifyInpiCompanionIntent\(trimmed, context\)/);
  });

  it("importe buildInpiCompanionChatSuggestions depuis le module dédié, ne redéfinit pas la logique de suggestions localement", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /import \{ buildInpiCompanionChatSuggestions \} from ".\/inpi-companion-chat-suggestions"/);
  });

  it("InpiCompanionPanel construit le contexte via buildInpiCompanionChatContext et le passe au chat", () => {
    assert.match(PANEL_SOURCE, /buildInpiCompanionChatContext\(/);
    assert.match(PANEL_SOURCE, /<InpiCompanionChat context=\{chatContext\}/);
  });

  it("aucune seconde définition de InpiCompanionIntent ou de mode/statut n'apparaît dans le composant chat", () => {
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /type InpiCompanionIntent/);
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /"lost"\s*\|/); // pas de ré-déclaration locale de l'union d'intentions
  });
});

describe("Non-mutation — le chat ne peut structurellement rien écrire", () => {
  it("aucune référence à useLmnp/dispatch/updateInpiStatus dans le composant chat", () => {
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /useLmnp/);
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /dispatch\(/);
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /updateInpiStatus/);
  });

  it("aucune référence à DECLARATION_PATCH_DRAFT ni à inpiCompanionState dans le composant chat", () => {
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /DECLARATION_PATCH_DRAFT/);
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /inpiCompanionState/);
  });

  it("aucun appel réseau/LLM : pas de fetch, pas d'API, pas de SDK IA", () => {
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /fetch\(/);
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /\/api\//);
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /openai|OpenAI|EventSource|WebSocket/i);
  });

  it("aucune persistance : les messages ne vivent que dans useState local", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /useState<LocalChatMessage\[\]>\(\[\]\)/);
    assert.doesNotMatch(FUNCTIONAL_CHAT_SOURCE, /localStorage|sessionStorage|indexedDB/i);
  });
});

describe("Accessibilité", () => {
  it("le panneau ouvert porte un role et un aria-label", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /role="dialog"/);
    assert.match(FUNCTIONAL_CHAT_SOURCE, /aria-label="Aide contextuelle du Compagnon INPI"/);
  });

  it("le champ de saisie a un aria-label", () => {
    assert.match(FUNCTIONAL_CHAT_SOURCE, /aria-label="Votre question"/);
  });
});

describe("Intégration minimale dans InpiCompanionPanel", () => {
  it("aucune des vues existantes (Diagnostic/Conflict/Synthese/Regularisation/Verification) n'est modifiée pour intégrer le chat", () => {
    for (const view of ["DiagnosticView", "ConflictView", "SyntheseView", "RegularisationView", "VerificationView", "AttenteView"]) {
      const viewStart = PANEL_SOURCE.indexOf(`function ${view}(`);
      assert.ok(viewStart >= 0, `${view} introuvable`);
      const nextFunctionStart = PANEL_SOURCE.indexOf("\nfunction ", viewStart + 1);
      const viewBody = PANEL_SOURCE.slice(viewStart, nextFunctionStart > 0 ? nextFunctionStart : undefined);
      assert.doesNotMatch(viewBody, /InpiCompanionChat/, `${view} ne doit pas référencer le chat`);
    }
  });

  it("le chat est monté une seule fois, au niveau du composant principal", () => {
    const matches = PANEL_SOURCE.match(/<InpiCompanionChat/g) ?? [];
    assert.equal(matches.length, 1);
  });
});
