/**
 * R2B.2a — fondation d'écriture multi-bien, DORMANTE (aucune interface n'appelle ADD_PROPERTY).
 *
 * Legacy mono : écritures historiques à plat, snapshot v1, aucun changement. ADD_PROPERTY est le SEUL déclencheur de la
 * migration legacy → scopé, atomique : A garde exactement ses valeurs, B démarre vide, aucun champ du bien ne reste à
 * plat. En scopé : écriture d'un bien seulement avec un propertyId explicite, Tunnel A refusé, aucune double source.
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/r2b2a-write-foundation.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { representativeMonoWorkspaces } from "@/lab/v2-dossier/bien-read-test-support";
import { BIEN_DRAFT_FIELDS, readBienDrafts, resolveConsolidationInput } from "@/lib/lmnp/dossier/bien-draft";
import { resolveDocumentScope } from "@/lib/lmnp/dossier/property-scope";
import { lmnpReducer, type LmnpAction, type LmnpState } from "@/lib/lmnp/store/reducer";
import * as snapshotClient from "@/lib/lmnp/store/workspace-snapshot-client";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { DeclarationDraft, LmnpDocument, Property } from "@/lib/lmnp/types";

const NOW = "2026-03-01T10:00:00.000Z";
const A = "home-1";
const B = "bien-b";
const PROPERTY_B: Property = { id: B, label: "Studio Nantes", address: "3 rue Y", city: "Nantes", postalCode: "44000" };
const NEW_BIEN_FIELDS = ["creditFinancing", "creditGptSession", "creditDocumentId", "propertyBackgroundExtraction"] as const;

function doc(id: string, propertyId: string | undefined, category: LmnpDocument["category"]): LmnpDocument {
  return {
    id, fiscalYearId: "fy-2025", fileName: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 1, category,
    documentType: "unknown", status: "analyzed", uploadedAt: NOW, ...(propertyId ? { propertyId } : {}),
  } as LmnpDocument;
}

/** Dossier mono legacy RÉEL et riche : F010 + F012 + F014 (assistants réels), F011 et F013 réels, crédit, F009. */
async function legacyRich(): Promise<LmnpState> {
  const ws = await representativeMonoWorkspaces();
  const base = ws.f014;
  const draft = base.declarationDraft!;
  const credit = ws.f011.declarationDraft!;
  const revenus = ws.f013.declarationDraft!;
  assert.equal(base.properties[0]!.id, A);
  return {
    ...base,
    fileRegistry: new Map(),
    documents: [...base.documents, doc("doc-pret", A, "emprunt"), doc("doc-sans-bien", undefined, "charges")],
    fiscalYear: { ...base.fiscalYear, declarationGeneratedAt: NOW },
    declarationDraft: {
      ...draft,
      creditFinancing: credit.creditFinancing,
      financementCharges: credit.financementCharges,
      creditConfirmedAt: credit.creditConfirmedAt,
      creditDocumentId: "doc-pret",
      creditGptSession: { marker: "session-A" } as never,
      propertyBackgroundExtraction: { ...draft.propertyBackgroundExtraction, notaryFees: 9_000 },
      revenusAssistant: revenus.revenusAssistant,
      revenusConfirmedAt: revenus.revenusConfirmedAt,
      siret: "12345678901234",
      chargesCrossStepRecoveryEnabled: true,
      fiscalResult: { exercice: base.fiscalYear.year } as never,
      activiteAssistantState: {
        step: "review", dateMiseEnService: draft.dateMiseEnService, dateDebutActivite: "2025-01-01",
        confirmed: { dateMiseEnService: true }, inputs: { service_date: { date: draft.dateMiseEnService! } }, updatedAt: NOW,
      } as never,
    },
  };
}

const addB = (state: LmnpState, property: Property = PROPERTY_B) =>
  lmnpReducer(state, { type: "ADD_PROPERTY", property } as LmnpAction);

async function scopedAB(): Promise<{ legacy: LmnpState; scoped: LmnpState }> {
  const legacy = await legacyRich();
  const scoped = addB(legacy);
  assert.notEqual(scoped, legacy, "ADD_PROPERTY a produit un nouvel état");
  return { legacy, scoped };
}

const bienOf = (state: LmnpState, id: string) => state.declarationDraft?.biens?.[id];

describe("R2B.2a — A / R : legacy mono inchangé", () => {
  it("A — une écriture legacy reste à plat, sans biens, snapshot v1", async () => {
    const legacy = await legacyRich();
    const next = lmnpReducer(legacy, { type: "DECLARATION_PATCH_DRAFT", patch: { revenusConfirmedAt: "2026-04-01T00:00:00.000Z" } });
    assert.equal(next.declarationDraft?.revenusConfirmedAt, "2026-04-01T00:00:00.000Z");
    assert.equal(next.declarationDraft?.biens, undefined);
    const serialized = serializeWorkspaceSnapshot(next);
    assert.ok(serialized.ok);
    assert.equal(serialized.envelope.schemaVersion, 1);
  });

  it("R — aucune action historique ne fait migrer un dossier mono (seul ADD_PROPERTY le peut)", async () => {
    let state = await legacyRich();
    const actions: LmnpAction[] = [
      { type: "DECLARATION_PATCH_DRAFT", patch: { exploitantEmail: "a@b.fr" } },
      { type: "CONFIRM_LOGEMENT_PROFILE", profile: { label: "T2 Lyon" } },
      { type: "DECLARE_NO_CREDIT" },
      { type: "DECLARATION_COMPLETE_STEP", stepId: "revenus" },
      { type: "REMOVE_DOCUMENT", documentId: "doc-pret" },
    ];
    for (const action of actions) {
      state = lmnpReducer(state, action);
      assert.equal(state.declarationDraft?.biens, undefined, `${action.type} ne migre pas`);
    }
  });
});

describe("R2B.2a — B → E, Z10 : ADD_PROPERTY atomique", () => {
  it("B — A + B, propertyIds cohérents, mode scopé", async () => {
    const { scoped } = await scopedAB();
    assert.deepEqual(scoped.properties.map((item) => item.id), [A, B]);
    assert.deepEqual(scoped.fiscalYear.propertyIds, [A, B]);
    assert.equal(readBienDrafts(scoped).mode, "scoped");
  });

  it("C — A conserve exactement ses valeurs (champs du bien étendus compris)", async () => {
    const { legacy, scoped } = await scopedAB();
    const a = bienOf(scoped, A)!;
    for (const field of BIEN_DRAFT_FIELDS) {
      assert.deepEqual(a[field], legacy.declarationDraft![field], `${field} conservé sur A`);
    }
    for (const field of NEW_BIEN_FIELDS) {
      assert.notEqual(a[field], undefined, `${field} migré sur A`);
    }
    assert.equal(scoped.declarationDraft?.chargesCrossStepRecoveryEnabled, true, "Tunnel A historique gelé, non détruit");
    assert.equal(scoped.declarationDraft?.siret, legacy.declarationDraft?.siret, "global conservé");
  });

  it("D / Z10 — B démarre vide, ne reçoit rien de A, aucune valeur par défaut", async () => {
    const { scoped } = await scopedAB();
    assert.deepEqual(bienOf(scoped, B), { propertyId: B, completedSteps: [] });
    assert.deepEqual(scoped.properties.find((item) => item.id === B), PROPERTY_B, "bien B tel que fourni, sans défaut");
  });

  it("E — aucun champ du bien ne subsiste à plat ; documentIds supprimé", async () => {
    const { scoped } = await scopedAB();
    for (const field of [...BIEN_DRAFT_FIELDS, ...NEW_BIEN_FIELDS]) {
      assert.equal(scoped.declarationDraft?.[field as keyof DeclarationDraft], undefined, `${field} absent à plat`);
    }
    assert.equal("documentIds" in bienOf(scoped, A)!, false);
  });

  it("O — un document legacy sans bien est rattaché à A ; un nouveau dépôt sans bien reste non attribué", async () => {
    const { scoped } = await scopedAB();
    assert.equal(scoped.documents.find((item) => item.id === "doc-sans-bien")?.propertyId, A);
    const next = lmnpReducer(scoped, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file: new File(["x"], "bail.pdf", { type: "application/pdf" }), category: "bail", documentId: "doc-new" }],
    });
    const uploaded = next.documents.find((item) => item.id === "doc-new")!;
    assert.equal(uploaded.propertyId, undefined);
    assert.equal(resolveDocumentScope(next, uploaded).kind, "unresolved");
  });

  it("K — sorties consolidées invalidées, génération obsolète", async () => {
    const { scoped } = await scopedAB();
    assert.equal(scoped.declarationDraft?.fiscalResult, undefined);
    assert.equal(scoped.fiscalYear.declarationGeneratedAt, undefined);
  });

  it("ADD_PROPERTY sur un dossier déjà scopé : ajoute C sans re-migrer ni toucher A/B", async () => {
    const { scoped } = await scopedAB();
    const next = addB(scoped, { ...PROPERTY_B, id: "bien-c" });
    assert.deepEqual(next.fiscalYear.propertyIds, [A, B, "bien-c"]);
    assert.equal(bienOf(next, A), bienOf(scoped, A));
    assert.equal(bienOf(next, B), bienOf(scoped, B));
    assert.deepEqual(bienOf(next, "bien-c"), { propertyId: "bien-c", completedSteps: [] });
  });
});

describe("R2B.2a — Z1 / Z2 : option frais d'acquisition globale", () => {
  it("Z1 — extraite de A sans changement de valeur", async () => {
    const { legacy, scoped } = await scopedAB();
    const choix = legacy.declarationDraft?.logementAssistantState?.choixTraitementFrais;
    assert.ok(choix, "précondition : A a un choix F010");
    assert.deepEqual(scoped.declarationDraft?.optionFraisAcquisition, { choix, sourcePropertyId: A });
  });

  it("Z2 — sources contradictoires → ADD_PROPERTY refusé, aucune mutation", async () => {
    const legacy = await legacyRich();
    const f010 = legacy.declarationDraft!.logementAssistantState!;
    const other = f010.choixTraitementFrais === "deduction" ? "integration" : "deduction";
    const contradictory: LmnpState = {
      ...legacy,
      declarationDraft: {
        ...legacy.declarationDraft!,
        logementAssistantState: { ...f010, fraisAcquisitionHistoriques: { montant: 1_000, traitement: other } } as never,
      },
    };
    assert.equal(addB(contradictory), contradictory);
  });

  it("une option établie est immuable", async () => {
    const { scoped } = await scopedAB();
    const option = scoped.declarationDraft!.optionFraisAcquisition!;
    const other = option.choix === "deduction" ? "integration" : "deduction";
    const next = lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", patch: { optionFraisAcquisition: { ...option, choix: other } } });
    assert.equal(next, scoped);
  });
});

describe("R2B.2a — Z3 / Z4 : date de mise en service hors F009", () => {
  it("Z3 — date de mise en service F009 en cours de modification → ADD_PROPERTY refusé", async () => {
    const legacy = await legacyRich();
    const pending: LmnpState = {
      ...legacy,
      declarationDraft: {
        ...legacy.declarationDraft!,
        activiteAssistantState: { ...legacy.declarationDraft!.activiteAssistantState!, inputs: { service_date: { date: "2025-09-30" } } } as never,
      },
    };
    assert.equal(addB(pending), pending);
    const onQuestion: LmnpState = {
      ...legacy,
      declarationDraft: { ...legacy.declarationDraft!, activiteAssistantState: { ...legacy.declarationDraft!.activiteAssistantState!, step: "service_date" } as never },
    };
    assert.equal(addB(onQuestion), onQuestion);
  });

  it("Z4 — après migration, aucune représentation de la date dans activiteAssistantState, et aucune réintroduction", async () => {
    const { legacy, scoped } = await scopedAB();
    const f009 = scoped.declarationDraft!.activiteAssistantState! as unknown as Record<string, unknown>;
    assert.equal(f009.dateMiseEnService, undefined);
    assert.equal((f009.confirmed as Record<string, unknown> | undefined)?.dateMiseEnService, undefined);
    assert.equal((f009.inputs as Record<string, unknown> | undefined)?.service_date, undefined);
    assert.equal(f009.dateDebutActivite, "2025-01-01", "le reste de F009 est conservé");
    assert.equal(bienOf(scoped, A)?.dateMiseEnService, legacy.declarationDraft?.dateMiseEnService);
    const reintroduced = lmnpReducer(scoped, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { activiteAssistantState: { ...scoped.declarationDraft!.activiteAssistantState!, dateMiseEnService: "2025-02-01" } },
    });
    assert.equal(reintroduced, scoped);
  });
});

describe("R2B.2a — Z5 : charges historiques de A", () => {
  it("needs_review sur A, montants conservés, aucune ventilation, consolidation informée", async () => {
    const { legacy, scoped } = await scopedAB();
    assert.deepEqual(bienOf(scoped, A)?.chargesNatureReview, { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" });
    assert.deepEqual(bienOf(scoped, A)?.chargesAssistant, legacy.declarationDraft?.chargesAssistant);
    assert.equal(bienOf(scoped, B)?.chargesAssistant, undefined);
    assert.equal(bienOf(scoped, B)?.chargesNatureReview, undefined);
    const consolidation = resolveConsolidationInput(scoped);
    assert.ok(consolidation.kind === "blocked" && consolidation.reasons.includes("legacy_charges_nature_unreviewed" as never));
  });
});

describe("R2B.2a — Z9 : exercice payé, clôturé ou transmis", () => {
  for (const [label, patch] of [
    ["payé", { paidAt: NOW }], ["clôturé", { status: "closed" as const }], ["transmis", { transmittedAt: NOW }],
  ] as const) {
    it(`${label} → ADD_PROPERTY refusé`, async () => {
      const legacy = await legacyRich();
      const locked: LmnpState = { ...legacy, fiscalYear: { ...legacy.fiscalYear, ...patch } };
      assert.equal(addB(locked), locked);
    });
  }

  it("bien déjà présent ou identifiant réutilisé → refusé", async () => {
    const legacy = await legacyRich();
    assert.equal(addB(legacy, { ...PROPERTY_B, id: A }), legacy);
  });
});

describe("R2B.2a — F → J, N, S : routage scopé du reducer", () => {
  it("F / G — une écriture sur A ne modifie que A ; sur B que B", async () => {
    const { scoped } = await scopedAB();
    const a = lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", propertyId: A, patch: { revenusConfirmedAt: "2026-05-01T00:00:00.000Z" } } as LmnpAction);
    assert.equal(bienOf(a, A)?.revenusConfirmedAt, "2026-05-01T00:00:00.000Z");
    assert.equal(bienOf(a, B), bienOf(scoped, B));
    const b = lmnpReducer(a, { type: "DECLARATION_PATCH_DRAFT", propertyId: B, patch: { dateMiseEnService: "2025-10-01" } } as LmnpAction);
    assert.equal(bienOf(b, B)?.dateMiseEnService, "2025-10-01");
    assert.equal(bienOf(b, A), bienOf(a, A));
    assert.equal(b.declarationDraft?.dateMiseEnService, undefined);
  });

  it("H / N — champ du bien sans propertyId, ou bien inconnu → état inchangé", async () => {
    const { scoped } = await scopedAB();
    const patch = { revenusConfirmedAt: "2026-05-01T00:00:00.000Z" };
    assert.equal(lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", patch }), scoped);
    assert.equal(lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", propertyId: "fantome", patch } as LmnpAction), scoped);
  });

  it("I — un champ global s'écrit à la racine en scopé", async () => {
    const { scoped } = await scopedAB();
    const next = lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", patch: { exploitantEmail: "x@y.fr" } });
    assert.equal(next.declarationDraft?.exploitantEmail, "x@y.fr");
    assert.equal(bienOf(next, A), bienOf(scoped, A));
  });

  it("J — invalidation locale : la date de A invalide les confirmations de A seulement", async () => {
    const { scoped } = await scopedAB();
    const confirmedB = lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", propertyId: B, patch: { revenusConfirmedAt: NOW } } as LmnpAction);
    const next = lmnpReducer(confirmedB, { type: "DECLARATION_PATCH_DRAFT", propertyId: A, patch: { dateMiseEnService: "2025-07-01" } } as LmnpAction);
    assert.equal(bienOf(next, A)?.logementConfirmedAt, undefined);
    assert.equal(bienOf(next, A)?.revenusConfirmedAt, undefined);
    assert.equal(bienOf(next, B)?.revenusConfirmedAt, NOW, "B intact");
  });

  it("S — actions et champs Tunnel A refusés en scopé", async () => {
    const { scoped } = await scopedAB();
    const rejected: LmnpAction[] = [
      { type: "CONFIRM_REVENUS" } as LmnpAction,
      { type: "CONFIRM_CHARGES" } as LmnpAction,
      { type: "CONFIRM_AMORTISSEMENT" } as LmnpAction,
      { type: "APPLY_GOVERNED_EXTRACTION", sourceTunnel: "credit", documentId: "doc-pret", payload: {} } as unknown as LmnpAction,
      { type: "DECLARATION_PATCH_DRAFT", patch: { chargesCrossStepRecoveryEnabled: false } },
      { type: "DECLARATION_PATCH_DRAFT", propertyId: A, patch: { revenusExtraction: { properties: [], summary: {} } } } as unknown as LmnpAction,
    ];
    for (const action of rejected) assert.equal(lmnpReducer(scoped, action), scoped, `${action.type} refusé`);
  });

  it("actions du bien partagées avec le Tunnel B : propertyId obligatoire en scopé", async () => {
    const { scoped } = await scopedAB();
    assert.equal(lmnpReducer(scoped, { type: "DECLARE_NO_CREDIT" }), scoped);
    const none = lmnpReducer(scoped, { type: "DECLARE_NO_CREDIT", propertyId: B } as LmnpAction);
    assert.ok(bienOf(none, B)?.creditDeclaredNoneAt);
    assert.equal(bienOf(none, A), bienOf(scoped, A));
    const step = lmnpReducer(scoped, { type: "DECLARATION_COMPLETE_STEP", stepId: "revenus", propertyId: B } as LmnpAction);
    assert.deepEqual(bienOf(step, B)?.completedSteps, ["revenus"]);
    const logement = lmnpReducer(scoped, { type: "CONFIRM_LOGEMENT_PROFILE", profile: { label: "Studio B" }, propertyId: B } as LmnpAction);
    assert.equal(logement.properties.find((item) => item.id === B)?.label, "Studio B");
    assert.equal(logement.properties.find((item) => item.id === A)?.label, scoped.properties.find((item) => item.id === A)?.label);
    assert.ok(bienOf(logement, B)?.logementConfirmedAt);
  });
});

describe("R2B.2a — T, X, Z12 : crédit propre au bien", () => {
  it("T — le crédit suit son bien ; un crédit confirmé pour B n'affecte pas A", async () => {
    const { scoped } = await scopedAB();
    const financing = bienOf(scoped, A)!.creditFinancing!;
    const next = lmnpReducer(scoped, { type: "CONFIRM_CREDIT_FINANCING", financing, propertyId: B } as LmnpAction);
    assert.deepEqual(bienOf(next, B)?.creditFinancing, financing);
    assert.equal(bienOf(next, A), bienOf(scoped, A));
    assert.equal(next.declarationDraft?.creditFinancing, undefined);
  });

  it("Z12 — un document de prêt rattaché à A ne peut pas devenir celui de B", async () => {
    const { scoped } = await scopedAB();
    const financing = bienOf(scoped, A)!.creditFinancing!;
    assert.equal(lmnpReducer(scoped, { type: "CONFIRM_CREDIT_FINANCING", financing, documentId: "doc-pret", propertyId: B } as LmnpAction), scoped);
    assert.equal(lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", propertyId: B, patch: { creditDocumentId: "doc-pret" } } as LmnpAction), scoped);
  });

  it("X — supprimer le document de prêt de A n'invalide que A", async () => {
    const { scoped } = await scopedAB();
    const confirmedB = lmnpReducer(scoped, { type: "DECLARATION_PATCH_DRAFT", propertyId: B, patch: { creditConfirmedAt: NOW } } as LmnpAction);
    const next = lmnpReducer(confirmedB, { type: "REMOVE_DOCUMENT", documentId: "doc-pret" });
    assert.equal(bienOf(next, A)?.creditConfirmedAt, undefined);
    assert.equal(bienOf(next, B)?.creditConfirmedAt, NOW);
    assert.equal(next.documents.some((item) => item.id === "doc-pret"), false);
  });
});

describe("R2B.2a — L, M, Z8 : snapshot v2 et hydratation", () => {
  it("L — un dossier scopé s'écrit en v2 et se relit à l'identique", async () => {
    const { scoped } = await scopedAB();
    const serialized = serializeWorkspaceSnapshot(scoped);
    assert.ok(serialized.ok);
    assert.equal(serialized.envelope.schemaVersion, 2);
    const parsed = parseWorkspaceSnapshot(serialized.envelope);
    assert.ok(parsed.ok);
    assert.equal(parsed.envelope.schemaVersion, 2);
    assert.deepEqual(parsed.envelope.workspace.declarationDraft?.biens, JSON.parse(JSON.stringify(scoped.declarationDraft?.biens)));
  });

  it("Z8 — v1 avec biens invalide ; v2 sans biens invalide ; version future non supportée", async () => {
    const { legacy, scoped } = await scopedAB();
    const scopedEnvelope = serializeWorkspaceSnapshot(scoped);
    const legacyEnvelope = serializeWorkspaceSnapshot(legacy);
    assert.ok(scopedEnvelope.ok && legacyEnvelope.ok);
    assert.equal(parseWorkspaceSnapshot({ ...scopedEnvelope.envelope, schemaVersion: 1 }).ok, false);
    assert.equal(parseWorkspaceSnapshot({ ...legacyEnvelope.envelope, schemaVersion: 2 }).ok, false);
    const future = parseWorkspaceSnapshot({ ...scopedEnvelope.envelope, schemaVersion: 3 });
    assert.equal(future.ok, false);
    assert.equal(!future.ok && future.reason, "unsupported_schema_version");
    assert.ok(parseWorkspaceSnapshot(legacyEnvelope.envelope).ok, "legacy v1 toujours lisible");
  });

  it("M — l'hydratation d'un dossier scopé ou legacy n'écrit ni ne migre rien", async () => {
    const { legacy, scoped } = await scopedAB();
    const empty: LmnpState = { ...legacy, declarationDraft: { completedSteps: [] } };
    const hydratedScoped = lmnpReducer(empty, { type: "HYDRATE", payload: scoped });
    assert.deepEqual(hydratedScoped.declarationDraft?.biens, scoped.declarationDraft?.biens);
    const hydratedLegacy = lmnpReducer(empty, { type: "HYDRATE", payload: legacy });
    assert.equal(hydratedLegacy.declarationDraft?.biens, undefined);
  });

  it("garde client : un snapshot ne peut jamais être réécrit dans une version inférieure", () => {
    const rejection = (snapshotClient as Record<string, unknown>).snapshotWriteRejection as
      | ((existing: { schema_version: number; closed_at: string | null } | null, nextSchemaVersion: number) => string | null)
      | undefined;
    assert.ok(rejection, "garde client exporté");
    assert.equal(rejection(null, 1), null);
    assert.equal(rejection({ schema_version: 1, closed_at: null }, 2), null, "v1 → v2 autorisé");
    assert.equal(rejection({ schema_version: 2, closed_at: null }, 2), null, "v2 → v2 autorisé");
    assert.ok(rejection({ schema_version: 2, closed_at: null }, 1), "v2 → v1 refusé");
    assert.ok(rejection({ schema_version: 3, closed_at: null }, 2), "version plus récente que le client refusée");
  });
});

describe("R2B.2a — protection serveur anti-régression de version", () => {
  it("migration Supabase : trigger BEFORE UPDATE refusant new.schema_version < old.schema_version", () => {
    const migration = path.join(process.cwd(), "supabase", "migrations", "20261001120000_lmnp_snapshot_schema_no_downgrade.sql");
    const sql = readFileSync(migration, "utf8").split("\n").map((line) => line.replace(/--.*$/, "")).join("\n").toLowerCase();
    assert.match(sql, /create or replace function public\.lmnp_prevent_snapshot_schema_downgrade\(\)/);
    assert.match(sql, /new\.schema_version < old\.schema_version/);
    assert.match(sql, /raise exception 'lmnp_snapshot_schema_downgrade/);
    assert.match(sql, /before update on public\.lmnp_workspace_snapshots/);
    assert.match(sql, /for each row/);
    assert.doesNotMatch(sql, /create policy|drop policy|alter table/, "aucune autre politique modifiée");
  });
});
