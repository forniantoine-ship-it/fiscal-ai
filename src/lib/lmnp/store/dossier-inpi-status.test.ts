/**
 * P1 — persistance du statut INPI (Dossier-level) : création paresseuse d'un
 * Dossier hors de toute transition N→N+1 (`saveDossierInpiStatus`), lecture
 * (`loadDossierInpiStatus`), et survie explicite à travers
 * `persistFiscalYearClosureAndTransition()` (INCHANGÉE, jamais appelée avec
 * un comportement différent ici). Même patron `fake-indexeddb` que
 * dossier-db.test.ts, fichier séparé pour ne toucher à aucun test existant.
 *
 * Run: npx tsx --test --env-file=.env.local src/lib/lmnp/store/dossier-inpi-status.test.ts
 */
import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  loadDossierInpiStatus,
  saveDossierInpiStatus,
  persistFiscalYearClosureAndTransition,
} from "./dossier-db";
import { getDossierRecord, getFiscalYearRecord } from "./db";
import type { Dossier } from "../types/dossier";
import type { FiscalYear, FiscalEngineOutput } from "../types/domain";
import type { PersistedWorkspace } from "./persistence";
import type { FiscalYearRecord } from "./dossier-db";

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function fiscalResult(overrides: Partial<FiscalEngineOutput> = {}): FiscalEngineOutput {
  return {
    exercice: 2026,
    resultatFiscal: 5500,
    resultatAvantAmort: 7000,
    totalRecettes: 9000,
    totalCharges: 2000,
    amortDeduct: 1500,
    amortReporte: 0,
    amortNonDeduitExercice: 0,
    deficitNouveau: 0,
    stocks: { deficits: [], amortissementsReportes: 0 },
    trace: { ksArtifacts: [], computedAt: "2026-10-01T00:00:00.000Z", journal: [] },
    computedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function monoExerciceWorkspace(overrides: { fiscalYearOverrides?: Partial<FiscalYear> } = {}): PersistedWorkspace {
  const fiscalYearId = uid("fy");
  const propertyId = uid("prop");
  return {
    fiscalYear: {
      id: fiscalYearId,
      year: 2026,
      status: "draft",
      regime: "reel",
      propertyIds: [propertyId],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      ...overrides.fiscalYearOverrides,
    },
    properties: [{ id: propertyId, label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}

describe("P1 — saveDossierInpiStatus / loadDossierInpiStatus (dossier mono-exercice)", () => {
  it("aucun Dossier créé encore (jamais de N→N+1) → saveDossierInpiStatus le crée quand même", async () => {
    const dossierId = uid("dossier");
    const workspace = monoExerciceWorkspace();

    const before = await getDossierRecord<Dossier>(dossierId);
    assert.equal(before, undefined, "précondition — aucun Dossier n'existe avant le premier écrit");

    const dossier = await saveDossierInpiStatus({
      dossierId,
      workspace,
      status: "not_started",
      source: "declared",
      now: "2026-10-01T10:00:00.000Z",
    });

    assert.equal(dossier.id, dossierId);
    assert.equal(dossier.inpiStatus, "not_started");
    assert.equal(dossier.inpiStatusSource, "declared");

    const loaded = await loadDossierInpiStatus(dossierId);
    assert.deepEqual(loaded, {
      status: "not_started",
      source: "declared",
      updatedAt: "2026-10-01T10:00:00.000Z",
    });
  });

  it("loadDossierInpiStatus sur un dossierId inconnu → undefined, jamais un statut inventé", async () => {
    const result = await loadDossierInpiStatus(uid("dossier-inconnu"));
    assert.equal(result, undefined);
  });

  it("écriture répétée met à jour le MÊME enregistrement, jamais un second Dossier", async () => {
    const dossierId = uid("dossier");
    const workspace = monoExerciceWorkspace();

    await saveDossierInpiStatus({
      dossierId,
      workspace,
      status: "not_started",
      source: "declared",
      now: "2026-10-01T10:00:00.000Z",
    });
    const second = await saveDossierInpiStatus({
      dossierId,
      workspace,
      status: "in_progress",
      source: "declared",
      now: "2026-10-15T10:00:00.000Z",
    });

    assert.equal(second.id, dossierId);
    assert.equal(second.inpiStatus, "in_progress");

    const loaded = await loadDossierInpiStatus(dossierId);
    assert.equal(loaded?.status, "in_progress");
    assert.equal(loaded?.updatedAt, "2026-10-15T10:00:00.000Z");
  });

  it("Test 9 — survit à la transition N → N+1 (statut écrit AVANT la clôture)", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspaceN = monoExerciceWorkspace({
      fiscalYearOverrides: { status: "ready_to_close", declarationGeneratedAt: "2026-12-15T00:00:00.000Z" },
    });
    workspaceN.declarationDraft = { completedSteps: [], siren: "123456789", fiscalResult: fiscalResult() };

    await saveDossierInpiStatus({
      dossierId,
      workspace: workspaceN,
      status: "registered",
      source: "document_extracted",
      now: "2026-11-01T00:00:00.000Z",
    });

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace: workspaceN,
      now: "2026-12-31T23:59:00.000Z",
    });

    assert.equal(result.dossier.inpiStatus, "registered", "le statut INPI ne doit jamais être réinitialisé par la clôture");
    assert.equal(result.dossier.inpiStatusSource, "document_extracted");

    const dossierAfter = await getDossierRecord<Dossier>(dossierId);
    assert.equal(dossierAfter?.inpiStatus, "registered");

    const loaded = await loadDossierInpiStatus(dossierId);
    assert.equal(loaded?.status, "registered", "N+1 récupère le même statut Dossier-level, jamais réinitialisé");
  });

  it("Test 10 — l'exercice archivé (N, clôturé) ne porte pas le statut INPI : reste une propriété du Dossier, jamais dupliquée sur FiscalYear", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspaceN = monoExerciceWorkspace({
      fiscalYearOverrides: { status: "ready_to_close", declarationGeneratedAt: "2026-12-15T00:00:00.000Z" },
    });
    workspaceN.declarationDraft = { completedSteps: [], siren: "123456789", fiscalResult: fiscalResult() };

    await saveDossierInpiStatus({
      dossierId,
      workspace: workspaceN,
      status: "registered",
      source: "declared",
      now: "2026-11-01T00:00:00.000Z",
    });

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace: workspaceN,
      now: "2026-12-31T23:59:00.000Z",
    });

    const archivedN = await getFiscalYearRecord<FiscalYearRecord>(workspaceN.fiscalYear.id);
    assert.equal(
      (archivedN as unknown as { inpiStatus?: unknown })?.inpiStatus,
      undefined,
      "l'exercice archivé ne doit jamais porter de champ inpiStatus — source de vérité unique = Dossier",
    );

    // Une mise à jour du statut après la transition (ex. le client termine
    // son INPI en janvier, sur le NOUVEL exercice) met à jour le même
    // Dossier — l'exercice N archivé reste intact.
    await saveDossierInpiStatus({
      dossierId,
      workspace: result.nextWorkspace,
      status: "registered",
      source: "document_extracted",
      now: "2027-01-10T00:00:00.000Z",
    });

    const archivedNAfterUpdate = await getFiscalYearRecord<FiscalYearRecord>(workspaceN.fiscalYear.id);
    assert.equal(archivedNAfterUpdate?.status, "closed", "l'exercice N archivé reste inchangé après une mise à jour ultérieure du statut INPI");
    assert.equal(archivedNAfterUpdate?.declarationDraft?.siren, "123456789");
  });
});
