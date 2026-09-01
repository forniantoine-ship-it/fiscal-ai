/**
 * Cycle 4E5A — nettoyage du bloc mort extractionOutcome "partial" dans F010.
 * Tests 1→3 (4→5 couverts par la suite F010 complète et la recherche finale
 * lancées séparément, 6→8 par tsc/eslint/régression).
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e5a.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F010LogementAssistantPanel.tsx"),
  "utf-8",
);

describe("Cycle 4E5A — 1. le panel compile sans l'import supprimé", () => {
  it("aucune référence à LogementExtractionRecoveryActions ne subsiste dans le panel F010", () => {
    assert.doesNotMatch(panelSource, /LogementExtractionRecoveryActions/);
  });
});

describe("Cycle 4E5A — 2. le chemin d'échec 'failed' reste fonctionnel", () => {
  it("LogementExtractionFallbackCard et la branche 'failed' sont toujours présentes, inchangées", () => {
    assert.match(panelSource, /extractionOutcome\?\.state === "failed"/);
    assert.match(panelSource, /<LogementExtractionFallbackCard/);
    assert.match(
      panelSource,
      /import \{ LogementExtractionFallbackCard \} from "@\/components\/lmnp\/logement\/LogementExtractionFallbackCard";/,
    );
  });
});

describe("Cycle 4E5A — 3. aucun 'partial' F010 ne peut encore être produit", () => {
  it("le bloc JSX conditionné sur extractionOutcome?.state === 'partial' n'existe plus", () => {
    assert.doesNotMatch(panelSource, /extractionOutcome\?\.state === "partial"/);
  });

  it("aucun autre code du panel ne peut écrire 'partial' dans extractionOutcome (inchangé, déjà vérifié en audit)", () => {
    // Chaque setExtractionOutcome(...) littéral écrit "failed" ou rien ; le
    // seul appel avec une variable (result.outcome) reste gardé par
    // `if (result.outcome.state === "failed")` juste au-dessus, inchangé.
    const literalCalls = [...panelSource.matchAll(/setExtractionOutcome\(\{[^}]*\}\)/gs)];
    assert.ok(literalCalls.length > 0);
    for (const [call] of literalCalls) {
      assert.match(call, /state:\s*"failed"/);
    }
    assert.match(
      panelSource,
      /if \(result\.outcome\.state === "failed"\) \{\s*\n\s*setExtractionOutcome\(result\.outcome\);/,
    );
  });
});
