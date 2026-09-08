/**
 * Compagnon INPI — Phase 4.1 : contrat de données minimal.
 * Run: npx tsx --test src/runtime/assistants/inpi-companion/types.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  shouldResumeInpiCompanion,
  type InpiCompanionConflict,
  type InpiCompanionFieldKey,
  type InpiCompanionMode,
  type InpiCompanionPersistedState,
  type InpiCompanionProgressStatus,
  type InpiCompanionStep,
} from "./types";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import { createNextDeclarationDraft } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";

function sampleState(overrides: Partial<InpiCompanionPersistedState> = {}): InpiCompanionPersistedState {
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

describe("Types / valeurs", () => {
  it("chaque mode fonctionnel validé en Phase 3 est une valeur valide", () => {
    const modes: InpiCompanionMode[] = [
      "diagnostic",
      "creation",
      "verification",
      "poursuite",
      "attente",
      "regularisation",
    ];
    for (const mode of modes) {
      assert.equal(sampleState({ mode }).mode, mode);
    }
  });

  it("chaque étape de référence est une valeur valide, et 'synthese' n'est pas un champ confirmable", () => {
    const steps: InpiCompanionStep[] = [
      "identite",
      "activite",
      "date_debut",
      "etablissement",
      "siren_siret",
      "regime",
      "domiciliation",
      "documents",
      "synthese",
    ];
    for (const step of steps) {
      assert.equal(sampleState({ step }).step, step);
    }
    const confirmable: InpiCompanionFieldKey[] = [
      "identite",
      "activite",
      "date_debut",
      "etablissement",
      "siren_siret",
      "regime",
      "domiciliation",
      "documents",
    ];
    assert.equal(confirmable.length, steps.length - 1);
  });

  it("état initial / en cours / terminé sont distincts et n'empruntent pas le vocabulaire d'InpiStatus", () => {
    const statuses: InpiCompanionProgressStatus[] = ["idle", "active", "prepared"];
    assert.deepEqual(statuses, ["idle", "active", "prepared"]);
    // Ce contrat ne doit jamais réutiliser "not_started"/"in_progress"/"registered" —
    // vocabulaire réservé à Dossier.InpiStatus, pour ne jamais laisser croire à une
    // synchronisation avec la situation INPI réelle.
    for (const forbidden of ["not_started", "in_progress", "registered", "submitted"]) {
      assert.ok(!statuses.includes(forbidden as InpiCompanionProgressStatus));
    }
  });
});

describe("Sérialisation", () => {
  it("un DeclarationDraft sans inpiCompanionState reste valide (champ optionnel)", () => {
    const withoutCompanion: Pick<DeclarationDraft, "inpiCompanionState"> = {};
    assert.equal(withoutCompanion.inpiCompanionState, undefined);
  });

  it("state minimal : round-trip JSON préserve la structure", () => {
    const minimal = sampleState();
    const roundTripped = JSON.parse(JSON.stringify(minimal)) as InpiCompanionPersistedState;
    assert.deepEqual(roundTripped, minimal);
  });

  it("state complet (historique, confirmations, conflit, départ INPI) : round-trip JSON préserve tout", () => {
    const conflict: InpiCompanionConflict = {
      field: "siren_siret",
      previousValue: "123456789",
      newValue: "987654321",
    };
    const complete = sampleState({
      mode: "poursuite",
      step: "etablissement",
      progressStatus: "active",
      history: ["identite", "activite", "date_debut"],
      confirmedFields: { identite: "2026-09-01T09:00:00.000Z", activite: "2026-09-01T09:05:00.000Z" },
      conflicts: { siren_siret: conflict },
      lastOfficialSiteOpenedAt: "2026-09-05T14:30:00.000Z",
      updatedAt: "2026-09-05T14:30:00.000Z",
    });
    const roundTripped = JSON.parse(JSON.stringify(complete)) as InpiCompanionPersistedState;
    assert.deepEqual(roundTripped, complete);
  });

  it("le state ne contient aucune clé de donnée métier — seulement la progression", () => {
    const complete = sampleState({
      lastOfficialSiteOpenedAt: "2026-09-05T14:30:00.000Z",
      conflicts: { siren_siret: { field: "siren_siret", previousValue: "a", newValue: "b" } },
    });
    const expectedKeys = [
      "mode",
      "step",
      "progressStatus",
      "history",
      "confirmedFields",
      "conflicts",
      "lastOfficialSiteOpenedAt",
      "updatedAt",
    ].sort();
    assert.deepEqual(Object.keys(complete).sort(), expectedKeys);
    // Garde-fou explicite : aucune valeur métier (siret, adresses, identité...)
    // ne doit jamais apparaître directement sur ce state.
    for (const forbiddenKey of ["siret", "siren", "activityStartDate", "personalAddress", "establishmentAddress", "inpiStatus"]) {
      assert.ok(!(forbiddenKey in complete));
    }
  });
});

describe("Reprise", () => {
  it("shouldResumeInpiCompanion : undefined → false", () => {
    assert.equal(shouldResumeInpiCompanion(undefined), false);
  });

  it("shouldResumeInpiCompanion : progressStatus 'idle' → false (rien à reprendre)", () => {
    assert.equal(shouldResumeInpiCompanion(sampleState({ progressStatus: "idle" })), false);
  });

  it("shouldResumeInpiCompanion : progressStatus 'prepared' → false (déjà terminé)", () => {
    assert.equal(shouldResumeInpiCompanion(sampleState({ progressStatus: "prepared" })), false);
  });

  it("shouldResumeInpiCompanion : progressStatus 'active' → true, et l'étape/historique sont conservés", () => {
    const inProgress = sampleState({
      progressStatus: "active",
      step: "etablissement",
      history: ["identite", "activite", "date_debut"],
    });
    assert.equal(shouldResumeInpiCompanion(inProgress), true);
    const resumed = JSON.parse(JSON.stringify(inProgress)) as InpiCompanionPersistedState;
    assert.equal(resumed.step, "etablissement");
    assert.deepEqual(resumed.history, ["identite", "activite", "date_debut"]);
  });
});

describe("Indépendance", () => {
  it("modifier inpiCompanionState ne modifie pas un objet Dossier.inpiStatus voisin", () => {
    const dossier: { inpiStatus: string } = { inpiStatus: "registered" };
    const companion = sampleState({ progressStatus: "active" });
    companion.progressStatus = "prepared";
    companion.mode = "verification";
    assert.equal(dossier.inpiStatus, "registered");
  });

  it("modifier un statut Dossier.inpiStatus voisin ne modifie pas inpiCompanionState automatiquement", () => {
    const companion = sampleState({ mode: "creation", progressStatus: "active" });
    const dossier: { inpiStatus: string } = { inpiStatus: "not_started" };
    dossier.inpiStatus = "registered";
    assert.equal(companion.mode, "creation");
    assert.equal(companion.progressStatus, "active");
  });
});

describe("N→N+1", () => {
  it("createNextDeclarationDraft ne recopie jamais inpiCompanionState — chaque exercice repart sans progression héritée", () => {
    const previousDraft = {
      siret: "12345678900012",
      activityStartDate: "2024-03-01",
      inpiCompanionState: sampleState({
        mode: "poursuite",
        progressStatus: "active",
        step: "documents",
        history: ["identite", "activite", "date_debut", "etablissement", "siren_siret", "regime", "domiciliation"],
      }),
    } as unknown as DeclarationDraft;

    const nextDraft = createNextDeclarationDraft(previousDraft);

    // L'identité Dossier-level (dont siret/activityStartDate) est bien reportée...
    assert.equal(nextDraft.siret, "12345678900012");
    assert.equal(nextDraft.activityStartDate, "2024-03-01");
    // ...mais la progression du Compagnon, elle, ne l'est jamais : un nouvel
    // exercice ne doit jamais rouvrir automatiquement une étape du Compagnon
    // laissée en cours l'année précédente.
    assert.equal(nextDraft.inpiCompanionState, undefined);
  });
});
