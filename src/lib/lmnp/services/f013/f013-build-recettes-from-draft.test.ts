/**
 * P0-B — verrouille le transport de `revenuTheorique` depuis le draft
 * persisté jusqu'à `result.recettes` lors de la reprise/reconstruction du
 * panel F-013 après rechargement (F013RevenusAssistantPanel.tsx).
 *
 * `buildRecettesFromRevenusAssistant()` est la fonction pure extraite de
 * l'initializer `useState<F013State>` qui portait la perte — testée ici sans
 * rendre le composant (aucune infrastructure de test React dans ce projet).
 *
 * Run: npx tsx --test src/lib/lmnp/services/f013/f013-build-recettes-from-draft.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildRecettesFromRevenusAssistant } from "./f013-build-recettes-from-draft";
import type { RevenusAssistantOutput } from "@/lib/lmnp/types/domain";

function persistedRevenusAssistant(
  overrides: Partial<RevenusAssistantOutput> = {},
): RevenusAssistantOutput {
  return {
    exerciceFiscal: 2025,
    totalRecettes: 11500,
    loyersEncaisses: 10800,
    indemnitesAssurance: 200,
    recettesPlateforme: 500,
    ajustementsJanDec: 0,
    moisLocationEffectifs: 12,
    fieldSources: {},
    computedAt: "2025-02-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRecettesFromRevenusAssistant() — P0-B, revenuTheorique", () => {
  it("revenuTheorique persisté (non nul) → présent et correctement formé dans recettes.revenuTheorique", () => {
    const recettes = buildRecettesFromRevenusAssistant(
      persistedRevenusAssistant({ revenuTheorique: 11800 }),
    );

    assert.ok(recettes.revenuTheorique, "revenuTheorique doit être présent après reprise — auparavant perdu ici");
    assert.equal(
      recettes.revenuTheorique?.montantAttendu,
      11800,
      "la valeur réelle doit être transportée, pas seulement le champ être présent",
    );
    // Forme utile pour l'affichage (ResultSummary ne lit que .montantAttendu),
    // et cohérence avec le mois effectif réellement persisté.
    assert.equal(recettes.revenuTheorique?.moisLocationEffectifs, 12);
  });

  it("revenuTheorique absent du draft (dossier plus ancien) → recettes.revenuTheorique reste undefined, rien d'inventé", () => {
    const recettes = buildRecettesFromRevenusAssistant(persistedRevenusAssistant());
    assert.equal(recettes.revenuTheorique, undefined);
  });

  it("non-régression — les champs déjà correctement transportés avant ce correctif restent inchangés", () => {
    const recettes = buildRecettesFromRevenusAssistant(
      persistedRevenusAssistant({ revenuTheorique: 11800 }),
    );
    assert.equal(recettes.totalRecettes, 11500);
    assert.equal(recettes.loyersEncaisses, 10800);
    assert.equal(recettes.indemnitesAssurance, 200);
    assert.equal(recettes.recettesPlateforme, 500);
    assert.equal(recettes.moisLocationEffectifs, 12);
  });
});
