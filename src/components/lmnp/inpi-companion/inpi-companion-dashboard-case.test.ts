/**
 * Compagnon INPI — Phase 4.4 : Dashboard (adaptateur de cas) + vérification
 * du rôle de Validation (via `resolveInpiValidationState`, frozen, importé
 * en lecture seule — jamais modifié).
 * Run: npx tsx --test src/components/lmnp/inpi-companion/inpi-companion-dashboard-case.test.ts
 *
 * Comme en Phase 4.3, aucun harnais de rendu de composant n'existe dans ce
 * dépôt — ces tests couvrent la logique de sélection de cas (Dashboard) et
 * les propriétés de statut déjà exposées par le socle Validation gelé, pas
 * le rendu JSX lui-même.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { resolveInpiCompanionMode } from "@/runtime/assistants/inpi-companion/engine";
import type { InpiCompanionPersistedState } from "@/runtime/assistants/inpi-companion/types";
import { resolveInpiValidationState } from "@/lib/lmnp/services/inpi/resolve-inpi-validation-state";
import { resolveIsMultiProperty } from "./inpi-companion-view-model";
import { resolveInpiCompanionDashboardCase } from "./inpi-companion-dashboard-case";

function companionState(overrides: Partial<InpiCompanionPersistedState> = {}): InpiCompanionPersistedState {
  return {
    mode: "creation",
    step: "identite",
    progressStatus: "active",
    history: [],
    confirmedFields: {},
    conflicts: {},
    updatedAt: "2026-09-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("Dashboard — 1-8. mapping statut Dossier → cas affiché", () => {
  const cases: Array<[Parameters<typeof resolveInpiCompanionMode>[0]["dossierInpiStatus"], string]> = [
    [undefined, "diagnostic"],
    ["not_started", "creation"],
    ["preparing", "creation"],
    ["in_progress", "poursuite"],
    ["modification_in_progress", "poursuite"],
    ["submitted", "attente"],
    ["regularization_required", "regularisation"],
    ["registered", "verification"],
  ];
  for (const [status, expected] of cases) {
    it(`${status ?? "undefined"} → ${expected}`, () => {
      const modeDecision = resolveInpiCompanionMode({ dossierInpiStatus: status, companionState: undefined });
      assert.equal(resolveInpiCompanionDashboardCase(modeDecision), expected);
    });
  }
});

describe("Dashboard — Reprise", () => {
  it("9. Compagnon actif (creation) → cas 'resumed', jamais confondu avec la démarche INPI elle-même", () => {
    const modeDecision = resolveInpiCompanionMode({
      dossierInpiStatus: "not_started",
      companionState: companionState({ mode: "creation", progressStatus: "active" }),
    });
    assert.equal(resolveInpiCompanionDashboardCase(modeDecision), "resumed");
  });

  it("9bis. Compagnon actif (poursuite) → cas 'resumed' également", () => {
    const modeDecision = resolveInpiCompanionMode({
      dossierInpiStatus: "in_progress",
      companionState: companionState({ mode: "poursuite", progressStatus: "active" }),
    });
    assert.equal(resolveInpiCompanionDashboardCase(modeDecision), "resumed");
  });

  it("10. Compagnon terminé (progressStatus prepared) → pas de reprise, cas dérivé normalement du statut Dossier", () => {
    const modeDecision = resolveInpiCompanionMode({
      dossierInpiStatus: "not_started",
      companionState: companionState({ progressStatus: "prepared" }),
    });
    assert.equal(resolveInpiCompanionDashboardCase(modeDecision), "creation");
    assert.notEqual(resolveInpiCompanionDashboardCase(modeDecision), "resumed");
  });
});

describe("Validation — vérification du rôle (resolveInpiValidationState, frozen, lecture seule)", () => {
  it("11. sans statut connu → UNKNOWN (orientation)", () => {
    const state = resolveInpiValidationState({ inpiStatus: undefined, paidAt: undefined, declarationGeneratedAt: undefined });
    assert.equal(state, "UNKNOWN");
  });

  it("12. INPI en cours → IN_PROGRESS", () => {
    const state = resolveInpiValidationState({ inpiStatus: "in_progress", paidAt: undefined, declarationGeneratedAt: undefined });
    assert.equal(state, "IN_PROGRESS");
  });

  it("13. submitted → SUBMITTED (attente, pas de blocage)", () => {
    const state = resolveInpiValidationState({ inpiStatus: "submitted", paidAt: undefined, declarationGeneratedAt: undefined });
    assert.equal(state, "SUBMITTED");
  });

  it("14. regularization_required → REGULARIZATION_REQUIRED (action demandée)", () => {
    const state = resolveInpiValidationState({ inpiStatus: "regularization_required", paidAt: undefined, declarationGeneratedAt: undefined });
    assert.equal(state, "REGULARIZATION_REQUIRED");
  });

  it("15. registered → REGISTERED, prioritaire même si payé/généré", () => {
    const state = resolveInpiValidationState({ inpiStatus: "registered", paidAt: "2026-09-01T00:00:00.000Z", declarationGeneratedAt: "2026-09-02T00:00:00.000Z" });
    assert.equal(state, "REGISTERED");
  });
});

describe("Paiement (via resolveInpiValidationState, frozen)", () => {
  it("16-17. payé, INPI absent, pas encore généré → PAID_WAITING_INPI (jamais un second paiement, CTA orienté INPI)", () => {
    const state = resolveInpiValidationState({ inpiStatus: undefined, paidAt: "2026-09-01T00:00:00.000Z", declarationGeneratedAt: undefined });
    assert.equal(state, "PAID_WAITING_INPI");
    // Le composant frozen ValidationInpiBlock ne propose, pour cet état,
    // aucun bouton de paiement — uniquement "Préparer ma démarche INPI"
    // (vérifié par lecture du fichier, cf. rapport ; non ré-exécuté ici car
    // ValidationInpiBlock.tsx est gelé et non testé par ce module).
  });

  it("18. payé ET généré → pas de workflow INPI forcé (l'état retombe sur le statut Dossier normal, jamais PAID_WAITING_INPI)", () => {
    const state = resolveInpiValidationState({ inpiStatus: "not_started", paidAt: "2026-09-01T00:00:00.000Z", declarationGeneratedAt: "2026-09-02T00:00:00.000Z" });
    assert.notEqual(state, "PAID_WAITING_INPI");
    assert.equal(state, "NOT_STARTED");
  });
});

describe("Multi-biens", () => {
  it("19. plusieurs biens → isMultiProperty=true, mais aucun impact sur le cas Dashboard affiché (pas de mapping affiché, seulement une note additive côté composant)", () => {
    const modeDecision = resolveInpiCompanionMode({ dossierInpiStatus: "not_started", companionState: undefined });
    const withOne = resolveIsMultiProperty([{ id: "a", label: "A", address: "1 rue A", city: "Bordeaux", postalCode: "33000" }]);
    const withTwo = resolveIsMultiProperty([
      { id: "a", label: "A", address: "1 rue A", city: "Bordeaux", postalCode: "33000" },
      { id: "b", label: "B", address: "2 rue B", city: "Bordeaux", postalCode: "33000" },
    ]);
    assert.equal(withOne, false);
    assert.equal(withTwo, true);
    // Le cas Dashboard ne dépend jamais de isMultiProperty : même mode, avec ou sans plusieurs biens.
    assert.equal(resolveInpiCompanionDashboardCase(modeDecision), "creation");
  });
});

describe("Indépendance", () => {
  it("20-22. resolveInpiCompanionDashboardCase n'accepte que {mode, resumed} — structurellement incapable de lire FiscalYear/paidAt/declarationGeneratedAt/paiement/génération", () => {
    const modeDecision = resolveInpiCompanionMode({ dossierInpiStatus: "registered", companionState: undefined });
    const result = resolveInpiCompanionDashboardCase(modeDecision);
    assert.equal(result, "verification");
  });
});

describe("Navigation", () => {
  it("23. le Dashboard route vers /assistants/activite (route existante, aucune nouvelle route créée)", () => {
    assert.equal(LMNP_ROUTES.activite, "/assistants/activite");
  });

  it("24. Validation — vérification de la route cible (voir blocker en rapport : le CTA du bloc gelé n'utilise PAS cette route aujourd'hui)", () => {
    // Ce test documente la route qui DEVRAIT être utilisée par Validation,
    // conformément à la Phase 4.4 — il ne prétend pas que ValidationInpiBlock
    // (gelé) l'utilise réellement aujourd'hui. Voir le blocker dans le rapport.
    assert.equal(LMNP_ROUTES.activite, "/assistants/activite");
  });
});
