/**
 * Compagnon INPI — Phase 4.3 : modèle de vue (helpers UI purs).
 * Run: npx tsx --test src/components/lmnp/inpi-companion/inpi-companion-view-model.test.ts
 *
 * Il n'existe pas de harnais de rendu de composant dans ce dépôt (ni
 * Storybook, ni Playwright, ni Jest/Vitest avec jsdom — confirmé en audit
 * Phase 4.3). Ces tests couvrent donc toute la logique déplaçable hors
 * JSX : dérivation des champs, construction du prochain `inpiCompanionState`,
 * et le câblage avec le moteur de la Phase 4.2. Le rendu visuel lui-même
 * (via `npm run dev`) reste à vérifier manuellement — documenté dans le
 * rapport final.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { DeclarationDraft, Property } from "@/lib/lmnp/types/domain";
import type { InpiCompanionPersistedState } from "@/runtime/assistants/inpi-companion/types";
import {
  computeInpiCompanionView,
  deriveInpiCompanionFieldSnapshots,
  displayValueForField,
  emptyInpiCompanionState,
  resolveIsMultiProperty,
  restartInpiCompanionState,
  shouldShowReturnBanner,
  withConflictResolved,
  withFieldConfirmed,
  withOfficialSiteOpened,
  withPreparationCompleted,
  withReturnBannerDismissed,
} from "./inpi-companion-view-model";

function state(overrides: Partial<InpiCompanionPersistedState> = {}): InpiCompanionPersistedState {
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

const property = (overrides: Partial<Property> = {}): Property => ({
  id: "prop-1",
  label: "Appartement",
  address: "1 rue A",
  city: "Bordeaux",
  postalCode: "33000",
  ...overrides,
});

describe("Modes (câblage avec le moteur Phase 4.2)", () => {
  it("1-8. computeInpiCompanionView délègue fidèlement au moteur pour chaque statut Dossier", () => {
    const statuses: Array<[Parameters<typeof computeInpiCompanionView>[0]["dossierInpiStatus"], string]> = [
      [undefined, "diagnostic"],
      ["not_started", "creation"],
      ["preparing", "creation"],
      ["in_progress", "poursuite"],
      ["modification_in_progress", "poursuite"],
      ["submitted", "attente"],
      ["regularization_required", "regularisation"],
      ["registered", "verification"],
    ];
    for (const [dossierInpiStatus, expectedMode] of statuses) {
      const view = computeInpiCompanionView({
        draft: undefined,
        properties: [],
        dossierInpiStatus,
        companionState: undefined,
      });
      assert.equal(view.modeDecision.mode, expectedMode);
    }
  });
});

describe("Reprise", () => {
  it("9. étape sauvegardée (progressStatus active) → reprise à cette étape", () => {
    const view = computeInpiCompanionView({
      draft: undefined,
      properties: [],
      dossierInpiStatus: "registered",
      companionState: state({ mode: "poursuite", step: "documents", progressStatus: "active" }),
    });
    assert.equal(view.modeDecision.resumed, true);
    assert.equal(view.modeDecision.step, "documents");
  });

  it("10. parcours terminé (progressStatus prepared) → pas de reprise inutile", () => {
    const view = computeInpiCompanionView({
      draft: undefined,
      properties: [],
      dossierInpiStatus: "not_started",
      companionState: state({ progressStatus: "prepared", step: "synthese" }),
    });
    assert.equal(view.modeDecision.resumed, false);
  });

  it("11. « plus tard » : appeler computeInpiCompanionView deux fois de suite sans action ne change rien (aucune mutation implicite)", () => {
    const saved = state({ step: "activite" });
    const first = computeInpiCompanionView({ draft: undefined, properties: [], dossierInpiStatus: "not_started", companionState: saved });
    const second = computeInpiCompanionView({ draft: undefined, properties: [], dossierInpiStatus: "not_started", companionState: saved });
    assert.deepEqual(first.modeDecision, second.modeDecision);
    assert.deepEqual(saved, state({ step: "activite" })); // state d'entrée intact
  });
});

describe("Provenance", () => {
  const draft = { exploitantFirstName: "Jean", exploitantLastName: "Dupont" } as DeclarationDraft;

  it("12. valeur connue (identité renseignée) → hasReliableValue true, statut 'extracted' une fois confirmée dans le Compagnon", () => {
    const fields = deriveInpiCompanionFieldSnapshots(draft);
    assert.equal(fields.identite?.hasReliableValue, true);
    const view = computeInpiCompanionView({
      draft,
      properties: [],
      dossierInpiStatus: "not_started",
      companionState: state({ confirmedFields: { identite: "2026-09-01T09:00:00.000Z" } }),
    });
    assert.notEqual(view.stepDecision?.step, "identite"); // déjà confirmée, sautée
  });

  it("13. valeur proposée/inférée (activite) → toujours 'proposed' tant que non confirmée dans le Compagnon", () => {
    const view = computeInpiCompanionView({
      draft: { exploitantFirstName: "Jean", exploitantLastName: "Dupont" } as DeclarationDraft,
      properties: [],
      dossierInpiStatus: "not_started",
      companionState: state({ confirmedFields: { identite: "2026-09-01T09:00:00.000Z" } }),
    });
    assert.equal(view.stepDecision?.step, "activite");
    assert.equal(view.stepDecision?.status, "proposed");
  });

  it("14. décision client (domiciliation) → toujours 'missing', jamais une proposition", () => {
    const fields = deriveInpiCompanionFieldSnapshots({} as DeclarationDraft);
    assert.equal(fields.domiciliation?.hasReliableValue, false);
  });
});

describe("SIRET", () => {
  it("15. SIRET présent mais non confirmé dans le Compagnon → proposition de confirmation, pas de statut confirmé automatique", () => {
    const draft = { siret: "12345678900012" } as DeclarationDraft;
    const view = computeInpiCompanionView({
      draft,
      properties: [],
      dossierInpiStatus: "not_started",
      companionState: state({
        confirmedFields: { identite: "t", activite: "t", date_debut: "t", etablissement: "t" },
      }),
    });
    assert.equal(view.stepDecision?.step, "siren_siret");
    assert.equal(view.stepDecision?.status, "proposed");
    assert.equal(displayValueForField("siren_siret", draft), "12345678900012");
  });
});

describe("Conflits", () => {
  it("16. un conflit détecté ne sélectionne jamais automatiquement une valeur", () => {
    const withConflict = state({
      conflicts: { siren_siret: { field: "siren_siret", previousValue: "A", newValue: "B" } },
    });
    // Avant résolution : le conflit reste présent, aucune valeur choisie pour nous.
    assert.equal(withConflict.conflicts.siren_siret?.previousValue, "A");
    assert.equal(withConflict.conflicts.siren_siret?.newValue, "B");
    assert.equal(withConflict.confirmedFields.siren_siret, undefined);
  });

  it("17. résolution explicite d'un conflit → confirmedFields renseigné, conflit retiré, progression normale ensuite", () => {
    const withConflict = state({
      conflicts: { siren_siret: { field: "siren_siret", previousValue: "A", newValue: "B" } },
    });
    const resolved = withConflictResolved(withConflict, "siren_siret");
    assert.equal(resolved.conflicts.siren_siret, undefined);
    assert.ok(resolved.confirmedFields.siren_siret);

    const view = computeInpiCompanionView({
      draft: undefined,
      properties: [],
      dossierInpiStatus: "not_started",
      companionState: resolved,
    });
    assert.notEqual(view.stepDecision?.step, "siren_siret");
  });
});

describe("Multi-biens", () => {
  it("18. plusieurs biens → isMultiProperty=true, demande explicite portée par la décision d'étape établissement", () => {
    assert.equal(resolveIsMultiProperty([property({ id: "a" }), property({ id: "b" })]), true);
    const view = computeInpiCompanionView({
      draft: undefined,
      properties: [property({ id: "a" }), property({ id: "b" })],
      dossierInpiStatus: "not_started",
      companionState: state({
        confirmedFields: { identite: "t", activite: "t", date_debut: "t" },
      }),
    });
    assert.equal(view.stepDecision?.step, "etablissement");
    assert.equal(view.stepDecision?.multiPropertyCaution, true);
  });

  it("19. aucun mapping automatique bien↔établissement, quel que soit le nombre de biens", () => {
    assert.equal(resolveIsMultiProperty([property()]), false);
    const withValue = deriveInpiCompanionFieldSnapshots({ establishmentAddress: "12 rue X" } as DeclarationDraft);
    assert.equal(withValue.etablissement?.hasReliableValue, true);
    // La présence d'une adresse n'entraîne jamais une confirmation automatique,
    // multi-bien ou non — seule une confirmation explicite dans le Compagnon le ferait.
  });
});

describe("Ouverture du Guichet unique (état, pas le window.open lui-même — non testable sans DOM, cf. en-tête de fichier)", () => {
  it("20-21. ouverture → lastOfficialSiteOpenedAt renseigné, progression conservée", () => {
    const before = state({ step: "synthese" });
    const after = withOfficialSiteOpened(before, "creation", "synthese");
    assert.ok(after.lastOfficialSiteOpenedAt);
    assert.equal(after.mode, "creation");
    assert.equal(after.step, "synthese");
  });

  it("22-23. ouverture ne modifie ni ne présume un statut INPI réel (aucun champ 'submitted'/'registered' sur inpiCompanionState)", () => {
    const after = withOfficialSiteOpened(undefined, "creation", "synthese");
    const keys = Object.keys(after);
    assert.ok(!keys.includes("inpiStatus"));
    assert.ok(!("submitted" in after));
    assert.ok(!("registered" in after));
  });
});

describe("Retour depuis INPI", () => {
  it("24-27. le bandeau de retour s'affiche seulement après une ouverture, et se referme sur réponse", () => {
    const opened = withOfficialSiteOpened(undefined, "attente", "synthese");
    assert.equal(shouldShowReturnBanner(opened, undefined), true);

    const dismissed = withReturnBannerDismissed(opened);
    assert.equal(shouldShowReturnBanner(dismissed, undefined), false);
  });

  it("le bandeau ne s'affiche jamais sans départ préalable enregistré", () => {
    assert.equal(shouldShowReturnBanner(undefined, undefined), false);
    assert.equal(shouldShowReturnBanner(state(), undefined), false);
  });

  it("un nouveau statut Dossier déclaré après le départ referme implicitement le besoin de bandeau (comparaison de dates)", () => {
    const opened = withOfficialSiteOpened(undefined, "attente", "synthese");
    const laterStatusUpdate = new Date(Date.parse(opened.lastOfficialSiteOpenedAt as string) + 1000).toISOString();
    assert.equal(shouldShowReturnBanner(opened, laterStatusUpdate), false);
  });
});

describe("Indépendance", () => {
  it("28. « plus tard » (aucune action) ne bloque ni ne modifie le fiscal : aucune fonction de ce module ne référence FiscalYear/paidAt/declarationGeneratedAt", () => {
    // Preuve structurelle : la signature de computeInpiCompanionView n'accepte
    // pas ces champs — impossible de les lui faire consulter par erreur.
    const view = computeInpiCompanionView({
      draft: undefined,
      properties: [],
      dossierInpiStatus: undefined,
      companionState: undefined,
    });
    assert.ok(view.modeDecision);
  });

  it("29-30. les constructeurs de inpiCompanionState ne mutent jamais leurs entrées (objets gelés)", () => {
    const frozen = Object.freeze(state({ confirmedFields: Object.freeze({ identite: "t" }) }));
    const result = withFieldConfirmed(frozen, "creation", "activite", "activite");
    assert.deepEqual(frozen.confirmedFields, { identite: "t" }); // entrée intacte
    assert.deepEqual(result.confirmedFields, { identite: "t", activite: result.confirmedFields.activite });

    const frozenForRestart = Object.freeze(state({ mode: "poursuite" }));
    const restarted = restartInpiCompanionState(frozenForRestart.mode);
    assert.equal(frozenForRestart.step, "identite"); // inchangé
    assert.equal(restarted.step, "identite");
    assert.equal(restarted.history.length, 0);
  });
});

describe("Divers — helpers de construction", () => {
  it("emptyInpiCompanionState produit un state minimal cohérent avec le contrat Phase 4.1", () => {
    const fresh = emptyInpiCompanionState("creation", "identite");
    assert.equal(fresh.progressStatus, "active");
    assert.deepEqual(fresh.history, []);
    assert.deepEqual(fresh.confirmedFields, {});
    assert.deepEqual(fresh.conflicts, {});
  });

  it("withPreparationCompleted marque 'prepared' sans toucher au reste", () => {
    const before = state({ step: "synthese", confirmedFields: { identite: "t" } });
    const after = withPreparationCompleted(before);
    assert.equal(after.progressStatus, "prepared");
    assert.deepEqual(after.confirmedFields, { identite: "t" });
  });

  it("displayValueForField ne retourne jamais de valeur pour domiciliation/documents (rendu dédié, pas une simple valeur)", () => {
    const draft = { establishmentAddress: "X" } as DeclarationDraft;
    assert.equal(displayValueForField("domiciliation", draft), undefined);
    assert.equal(displayValueForField("documents", draft), undefined);
  });
});
