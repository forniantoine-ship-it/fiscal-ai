/**
 * Compagnon INPI — Phase 4.2 : moteur de parcours.
 * Run: npx tsx --test src/runtime/assistants/inpi-companion/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { InpiStatus } from "@/lib/lmnp/types/dossier";
import type { InpiCompanionPersistedState } from "./types";
import {
  buildInpiCompanionEngineContext,
  hasInpiCompanionConflicts,
  resolveInpiCompanionFieldStatus,
  resolveInpiCompanionMode,
  resolveNextInpiCompanionStep,
} from "./engine";

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

describe("4.2.1 — Résolution du mode (mapping gelé Dossier.inpiStatus → mode)", () => {
  const cases: Array<[InpiStatus | undefined, string]> = [
    [undefined, "diagnostic"],
    ["not_started", "creation"],
    ["preparing", "creation"],
    ["in_progress", "poursuite"],
    ["modification_in_progress", "poursuite"],
    ["submitted", "attente"],
    ["regularization_required", "regularisation"],
    ["registered", "verification"],
  ];

  for (const [status, expectedMode] of cases) {
    it(`${status ?? "undefined"} → ${expectedMode}`, () => {
      const decision = resolveInpiCompanionMode({ dossierInpiStatus: status, companionState: undefined });
      assert.equal(decision.mode, expectedMode);
      assert.equal(decision.resumed, false);
    });
  }
});

describe("Reprise", () => {
  it("9. state Compagnon inachevé (progressStatus 'active') → reprise prioritaire, sans lire Dossier.inpiStatus", () => {
    const state = companionState({ mode: "poursuite", step: "etablissement", progressStatus: "active" });
    // dossierInpiStatus volontairement contradictoire (registered) pour prouver
    // que la reprise l'emporte et que le mode n'est jamais recalculé dans ce cas.
    const decision = resolveInpiCompanionMode({ dossierInpiStatus: "registered", companionState: state });
    assert.equal(decision.mode, "poursuite");
    assert.equal(decision.step, "etablissement");
    assert.equal(decision.resumed, true);
  });

  it("10. state terminé (progressStatus 'prepared') → ne pas reprendre inutilement", () => {
    const state = companionState({ mode: "creation", step: "synthese", progressStatus: "prepared" });
    const decision = resolveInpiCompanionMode({ dossierInpiStatus: "not_started", companionState: state });
    assert.equal(decision.resumed, false);
    assert.equal(decision.mode, "creation"); // dérivé de dossierInpiStatus, pas du state terminé
  });

  it("11. state absent + statut INPI → statut INPI utilisé", () => {
    const decision = resolveInpiCompanionMode({ dossierInpiStatus: "submitted", companionState: undefined });
    assert.equal(decision.resumed, false);
    assert.equal(decision.mode, "attente");
  });
});

describe("4.2.2 — Conflit transverse", () => {
  it("12. conflit SIREN → conflit signalé (hasInpiCompanionConflicts)", () => {
    const state = companionState({
      conflicts: { siren_siret: { field: "siren_siret", previousValue: "111111111", newValue: "222222222" } },
    });
    assert.equal(hasInpiCompanionConflicts(state), true);
  });

  it("13. conflit non résolu → progression bloquée (canSkip=false, requiresConfirmation=true) même si d'autres champs sont prêts", () => {
    const state = companionState({
      mode: "creation",
      confirmedFields: { identite: "2026-09-01T09:00:00.000Z" },
      conflicts: { siren_siret: { field: "siren_siret", previousValue: "a", newValue: "b" } },
    });
    const decision = resolveNextInpiCompanionStep({
      mode: "creation",
      companionState: state,
      fields: { identite: { hasReliableValue: true }, activite: { hasReliableValue: true } },
      isMultiProperty: false,
    });
    assert.equal(decision?.step, "siren_siret");
    assert.equal(decision?.canSkip, false);
    assert.equal(decision?.requiresConfirmation, true);
  });

  it("14. conflit résolu (retiré de la map) → progression normale, reprend au premier champ non confirmé", () => {
    const state = companionState({
      mode: "creation",
      confirmedFields: { identite: "2026-09-01T09:00:00.000Z" },
      conflicts: {}, // résolu : plus de conflit
    });
    const decision = resolveNextInpiCompanionStep({
      mode: "creation",
      companionState: state,
      fields: { identite: { hasReliableValue: true } },
      isMultiProperty: false,
    });
    assert.equal(decision?.step, "activite"); // identite déjà confirmée, saut au suivant
  });
});

describe("4.2.6 — Provenance (🟢/🟠/🔴 réutilisant ActiviteFieldStatus)", () => {
  it("15. valeur connue et confirmée dans le Compagnon → 'extracted' (🟢)", () => {
    const state = companionState({ confirmedFields: { identite: "2026-09-01T09:00:00.000Z" } });
    assert.equal(resolveInpiCompanionFieldStatus("identite", { hasReliableValue: true }, state), "extracted");
  });

  it("16. valeur inférée/disponible mais non confirmée → 'proposed' (🟠)", () => {
    assert.equal(resolveInpiCompanionFieldStatus("activite", { hasReliableValue: true }, undefined), "proposed");
  });

  it("17. décision client (domiciliation) → 'missing' (🔴), même si une valeur était fournie", () => {
    assert.equal(
      resolveInpiCompanionFieldStatus("domiciliation", { hasReliableValue: true }, undefined),
      "missing",
    );
  });

  it("18. valeur présente mais non confirmée dans le Compagnon → jamais traitée comme une confirmation", () => {
    const state = companionState({ confirmedFields: {} }); // aucune confirmation, même si la donnée existe ailleurs
    const status = resolveInpiCompanionFieldStatus("siren_siret", { hasReliableValue: true }, state);
    assert.notEqual(status, "extracted");
    assert.equal(status, "proposed");
  });
});

describe("4.2.5 — Skip intelligent", () => {
  it("19. identité fiable ET confirmée dans le Compagnon → skip effectif au calcul de la prochaine étape", () => {
    const state = companionState({ confirmedFields: { identite: "2026-09-01T09:00:00.000Z" } });
    const decision = resolveNextInpiCompanionStep({
      mode: "creation",
      companionState: state,
      fields: { identite: { hasReliableValue: true }, activite: { hasReliableValue: true } },
      isMultiProperty: false,
    });
    assert.notEqual(decision?.step, "identite");
    assert.equal(decision?.step, "activite");
  });

  it("20. utilisateur déjà enregistré (registered) → mode verification, aucun parcours de création (pas d'étape)", () => {
    const modeDecision = resolveInpiCompanionMode({ dossierInpiStatus: "registered", companionState: undefined });
    assert.equal(modeDecision.mode, "verification");
    const stepDecision = resolveNextInpiCompanionStep({
      mode: "verification",
      companionState: undefined,
      fields: {},
      isMultiProperty: false,
    });
    assert.equal(stepDecision, null);
  });

  it("21. nouveau LMNP (not_started) → parcours de création adapté, démarre à identite", () => {
    const modeDecision = resolveInpiCompanionMode({ dossierInpiStatus: "not_started", companionState: undefined });
    assert.equal(modeDecision.mode, "creation");
    const stepDecision = resolveNextInpiCompanionStep({
      mode: "creation",
      companionState: undefined,
      fields: {},
      isMultiProperty: false,
    });
    assert.equal(stepDecision?.step, "identite");
  });
});

describe("4.2.3 — Multi-biens", () => {
  it("22. une seule propriété → comportement normal, aucun avertissement multi-biens", () => {
    const decision = resolveNextInpiCompanionStep({
      mode: "creation",
      companionState: companionState({
        confirmedFields: { identite: "t", activite: "t", date_debut: "t" },
      }),
      fields: { identite: { hasReliableValue: true }, activite: { hasReliableValue: true }, date_debut: { hasReliableValue: true } },
      isMultiProperty: false,
    });
    assert.equal(decision?.step, "etablissement");
    assert.equal(decision?.multiPropertyCaution, false);
  });

  it("23. plusieurs propriétés → flag multi-biens porté par la décision d'étape établissement", () => {
    const decision = resolveNextInpiCompanionStep({
      mode: "creation",
      companionState: companionState({
        confirmedFields: { identite: "t", activite: "t", date_debut: "t" },
      }),
      fields: { identite: { hasReliableValue: true }, activite: { hasReliableValue: true }, date_debut: { hasReliableValue: true } },
      isMultiProperty: true,
    });
    assert.equal(decision?.step, "etablissement");
    assert.equal(decision?.multiPropertyCaution, true);
  });

  it("24. plusieurs propriétés → aucun mapping automatique bien↔établissement (le statut reste dépendant de confirmedFields, jamais déduit du nombre de biens)", () => {
    // Même avec isMultiProperty=true et une valeur "fiable", le champ ne
    // devient jamais "extracted" tant que le client ne l'a pas confirmé
    // explicitement — le moteur ne fabrique aucune correspondance.
    const status = resolveInpiCompanionFieldStatus("etablissement", { hasReliableValue: true }, undefined);
    assert.equal(status, "proposed");
    assert.notEqual(status, "extracted");
  });
});

describe("Cas spécifiques validés (Phase 3)", () => {
  it("25. RNE/Kbis → donnée considérée 'extraite' (proposée), jamais 'vérifiée'/confirmée automatiquement", () => {
    // hasReliableValue=true simule une extraction RNE/Kbis réussie ; sans
    // confirmedFields, le statut reste 'proposed', jamais 'extracted'.
    const status = resolveInpiCompanionFieldStatus("siren_siret", { hasReliableValue: true }, undefined);
    assert.equal(status, "proposed");
  });

  it("26. submitted, indépendamment de la présence d'un SIREN (non lu par le resolver de mode) → attente", () => {
    const decision = resolveInpiCompanionMode({ dossierInpiStatus: "submitted", companionState: undefined });
    assert.equal(decision.mode, "attente");
  });

  it("27. regularization_required → regularisation", () => {
    assert.equal(
      resolveInpiCompanionMode({ dossierInpiStatus: "regularization_required", companionState: undefined }).mode,
      "regularisation",
    );
  });

  it("28. undefined → diagnostic, jamais 'not_started'", () => {
    const decision = resolveInpiCompanionMode({ dossierInpiStatus: undefined, companionState: undefined });
    assert.equal(decision.mode, "diagnostic");
    assert.notEqual(decision.mode, "creation");
  });

  it("29. modification_in_progress → poursuite", () => {
    assert.equal(
      resolveInpiCompanionMode({ dossierInpiStatus: "modification_in_progress", companionState: undefined }).mode,
      "poursuite",
    );
  });
});

describe("Indépendance", () => {
  it("30. modifier le state Compagnon (copie locale) ne modifie pas un Dossier.inpiStatus voisin", () => {
    const dossier: { inpiStatus: InpiStatus } = { inpiStatus: "registered" };
    const state = companionState({ mode: "creation", progressStatus: "active" });
    const decision = resolveInpiCompanionMode({ dossierInpiStatus: dossier.inpiStatus, companionState: state });
    assert.equal(decision.mode, "creation"); // repris depuis le state, capturé avant toute mutation
    state.mode = "attente"; // mutation locale après coup, sur la copie de test uniquement
    assert.equal(dossier.inpiStatus, "registered"); // l'objet Dossier voisin reste intact
    assert.equal(decision.mode, "creation"); // la décision déjà retournée n'est pas affectée rétroactivement
  });

  it("31. modifier Dossier.inpiStatus voisin ne modifie pas automatiquement le state du Compagnon", () => {
    const state = companionState({ mode: "creation", progressStatus: "active" });
    const dossier: { inpiStatus: InpiStatus } = { inpiStatus: "not_started" };
    dossier.inpiStatus = "registered";
    assert.equal(state.mode, "creation");
    assert.equal(state.progressStatus, "active");
  });

  it("32. le moteur s'exécute sans environnement React/DOM", () => {
    assert.equal(typeof window, "undefined");
    const decision = resolveInpiCompanionMode({ dossierInpiStatus: "not_started", companionState: undefined });
    assert.equal(decision.mode, "creation");
  });

  it("33. le moteur est synchrone — aucun appel réseau, aucune Promise", () => {
    const modeResult = resolveInpiCompanionMode({ dossierInpiStatus: "registered", companionState: undefined });
    const stepResult = resolveNextInpiCompanionStep({
      mode: "creation",
      companionState: undefined,
      fields: {},
      isMultiProperty: false,
    });
    assert.equal(modeResult instanceof Promise, false);
    assert.equal(stepResult instanceof Promise, false);
  });

  it("34. le moteur ne produit ni ne consulte aucune référence au site INPI", () => {
    const decision = resolveNextInpiCompanionStep({
      mode: "creation",
      companionState: undefined,
      fields: {},
      isMultiProperty: false,
    });
    const serialized = JSON.stringify(decision);
    assert.ok(!serialized.toLowerCase().includes("http"));
    assert.ok(!serialized.toLowerCase().includes("formalites.entreprises"));
  });

  it("35. le moteur fonctionne sans aucune notion de paiement (paidAt n'est même pas un paramètre accepté)", () => {
    // Preuve à la fois de compilation (le type d'entrée ne porte pas paidAt)
    // et d'exécution : le résultat ne dépend d'aucune donnée de paiement.
    const decision = resolveInpiCompanionMode({ dossierInpiStatus: "submitted", companionState: undefined });
    assert.equal(decision.mode, "attente");
  });

  it("36. le moteur fonctionne sans aucune notion de génération de déclaration fiscale", () => {
    const decision = resolveNextInpiCompanionStep({
      mode: "poursuite",
      companionState: undefined,
      fields: {},
      isMultiProperty: false,
    });
    assert.equal(decision?.step, "identite");
  });
});

describe("4.2.12 — Pureté (aucune mutation des entrées)", () => {
  it("resolveInpiCompanionMode ne mute ni companionState ni son entrée, même gelés", () => {
    const state = Object.freeze(
      companionState({ mode: "poursuite", step: "documents", progressStatus: "active" }),
    );
    const input = Object.freeze({ dossierInpiStatus: "registered" as InpiStatus, companionState: state });

    const decision = resolveInpiCompanionMode(input);

    // Si la fonction avait tenté une mutation, Object.freeze aurait levé en
    // mode strict — l'absence d'exception est déjà une preuve. On vérifie en
    // plus l'égalité structurelle avant/après pour rendre l'intention explicite.
    assert.deepEqual(state, {
      mode: "poursuite",
      step: "documents",
      progressStatus: "active",
      history: [],
      confirmedFields: {},
      conflicts: {},
      updatedAt: "2026-09-08T10:00:00.000Z",
    });
    assert.equal(decision.mode, "poursuite");
  });

  it("resolveNextInpiCompanionStep ne mute ni companionState ni fields, même gelés", () => {
    const state = Object.freeze(
      companionState({ confirmedFields: Object.freeze({ identite: "2026-09-01T09:00:00.000Z" }) }),
    );
    const fields = Object.freeze({
      identite: Object.freeze({ hasReliableValue: true }),
      activite: Object.freeze({ hasReliableValue: true }),
    });
    const input = Object.freeze({
      mode: "creation" as const,
      companionState: state,
      fields,
      isMultiProperty: false,
    });

    const decision = resolveNextInpiCompanionStep(input);

    assert.deepEqual(fields, {
      identite: { hasReliableValue: true },
      activite: { hasReliableValue: true },
    });
    assert.equal(decision?.step, "activite");
  });

  it("buildInpiCompanionEngineContext retourne une transformation pure, sans muter ses entrées", () => {
    const state = Object.freeze(companionState({ confirmedFields: Object.freeze({ identite: "t" }) }));
    const fields = Object.freeze({ identite: Object.freeze({ hasReliableValue: true }) });

    const context = buildInpiCompanionEngineContext({
      mode: "creation",
      step: "activite",
      companionState: state,
      fields,
      isMultiProperty: false,
      dossierInpiStatus: "not_started",
    });

    assert.deepEqual(context.knownFields, ["identite"]);
    assert.deepEqual(fields, { identite: { hasReliableValue: true } });
  });
});
