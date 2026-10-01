/**
 * R1 — socle multi-bien invisible.
 *
 * Le bien est l'unité de calcul (draft.biens[propertyId]) ; l'activité reste l'unité de déclaration (un seul agrégat).
 * Un dossier historique mono-bien est lu, sans écriture, comme un BienDraft unique ; les sorties fiscales restent
 * identiques au centime. Avec plusieurs biens, aucune attribution implicite au premier bien.
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/r1-multi-bien-foundation.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { amortizedWithWorks } from "@/lab/v2-dossier/amortization-test-support";
import { resolveV3PropertySupport } from "@/lab/v2-dossier/v3-property-scope";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { extractAmortissementBase, resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { createEmptyRevenueSession } from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, LmnpDocument, Property } from "@/lib/lmnp/types";
import {
  BIEN_DRAFT_FIELDS,
  BIEN_STEP_IDS,
  applyBienPatch,
  createBienDraft,
  getBienDraft,
  migrateLegacyMonoToBiens,
  readBienDrafts,
  resolveConsolidationInput,
} from "./bien-draft";
import {
  resolveDocumentScope,
  resolveMonoPropertyId,
  resolvePropertyScope,
} from "./property-scope";

const YEAR = 2025;

function property(id: string): Property {
  return { id, label: "", address: "", city: "", postalCode: "" };
}

function workspaceWith(properties: Property[], draft: DeclarationDraft, documents: LmnpDocument[] = []): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "fy-1", year: YEAR, status: "draft", regime: "reel", propertyIds: properties.map((p) => p.id),
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    },
    properties,
    documents,
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: draft,
  };
}

function doc(id: string, propertyId?: string | null): LmnpDocument {
  return {
    id, fiscalYearId: "fy-1", fileName: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 1,
    category: "charges", documentType: "unknown", status: "uploaded", uploadedAt: "2026-01-02T00:00:00Z",
    ...(propertyId !== undefined ? { propertyId: propertyId as string } : {}),
  } as LmnpDocument;
}

/** Dossier mono-bien RÉEL : F010, F012, F014 par les vrais assistants (fabriques V3), F013 par le vrai pont. */
async function legacyMonoWorkspace(): Promise<PersistedWorkspace> {
  const state = await amortizedWithWorks();
  const draft = state.declarationDraft!;
  const session = createEmptyRevenueSession(state.properties, state.fiscalYear.year);
  session.properties[0]!.rows = session.properties[0]!.rows.map((row) => ({ ...row, loyers: 1200 }));
  session.properties[0]!.gridUserEdited = true;
  const { revenusAssistant } = buildRevenusAssistantFromSession(session, state.fiscalYear.year, draft.dateMiseEnService!);
  return {
    fiscalYear: state.fiscalYear,
    properties: state.properties,
    documents: [doc("doc-legacy"), doc("doc-explicit", state.properties[0]!.id)],
    extractions: state.extractions,
    validationItems: state.validationItems,
    ledgerEntries: state.ledgerEntries,
    declarationDraft: {
      ...draft,
      siret: "12345678901234",
      siren: "123456789",
      revenueGptSession: session,
      revenusAssistant,
      revenusConfirmedAt: "2026-03-01T00:00:00.000Z",
      completedSteps: [...new Set([...draft.completedSteps, "activite-assistant", "revenus", "revenus-assistant"])],
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

/** Résultat fiscal comparable : les horodatages de trace ne sont pas des montants. */
function fiscalOutputs(draft: DeclarationDraft | undefined) {
  const generation = runDeclarationGeneration(draft, YEAR);
  assert.equal(generation.status, "generated", "le dossier de référence doit être générable");
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  return JSON.parse(JSON.stringify(generation, (key, value) => (key.endsWith("At") && typeof value === "string" && timestamp.test(value) ? undefined : value)));
}

function twoBienWorkspace(): PersistedWorkspace {
  return workspaceWith([property("bien-a"), property("bien-b")], {
    completedSteps: [],
    biens: { "bien-a": createBienDraft("bien-a"), "bien-b": createBienDraft("bien-b") },
  });
}

describe("R1 — Oracle 1 : dossier mono historique lu comme un BienDraft unique", () => {
  it("toutes les valeurs F010–F014 restent accessibles, sans donnée inventée", async () => {
    const workspace = await legacyMonoWorkspace();
    const draft = workspace.declarationDraft!;
    const propertyId = workspace.properties[0]!.id;
    const view = readBienDrafts(workspace);
    assert.equal(view.mode, "legacy_mono");
    assert.deepEqual(Object.keys(view.mode === "legacy_mono" ? view.biens : {}), [propertyId]);
    const bien = view.mode === "legacy_mono" ? view.biens[propertyId]! : undefined;
    assert.ok(bien);
    for (const field of BIEN_DRAFT_FIELDS) {
      assert.deepEqual(bien[field], draft[field], `champ ${field} conservé`);
    }
    for (const confirmation of ["logementConfirmedAt", "chargesConfirmedAt", "revenusConfirmedAt", "amortissementConfirmedAt"] as const) {
      assert.ok(bien[confirmation], `${confirmation} reste confirmé`);
    }
    const allowed = new Set<string>(["propertyId", "documentIds", "completedSteps", ...BIEN_DRAFT_FIELDS]);
    for (const [key, value] of Object.entries(bien)) {
      assert.ok(allowed.has(key), `clé inattendue ${key}`);
      if (BIEN_DRAFT_FIELDS.includes(key as never)) assert.notEqual(value, undefined, `aucune clé vide inventée (${key})`);
    }
    assert.equal(bien.suiviAmortissementsDifferes, undefined, "aucun suivi ARD inventé");
    assert.deepEqual(bien.completedSteps, draft.completedSteps.filter((step) => BIEN_STEP_IDS.includes(step as never)));
    assert.deepEqual(bien.documentIds, ["doc-legacy", "doc-explicit"], "documents propres rattachés au bien unique");
  });

  it("propertyId absent ou explicite : même BienDraft en mono", async () => {
    const workspace = await legacyMonoWorkspace();
    const implicit = getBienDraft(workspace);
    const explicit = getBienDraft(workspace, workspace.properties[0]!.id);
    assert.equal(implicit.ok && implicit.source, "legacy_mono");
    assert.deepEqual(implicit, explicit);
  });
});

describe("R1 — Oracle 2 : isolation par bien", () => {
  it("deux BienDraft gardent des valeurs différentes, sans écrasement croisé", () => {
    const workspace = twoBienWorkspace();
    const a = applyBienPatch(workspace, "bien-a", { revenusConfirmedAt: "2026-04-01T00:00:00.000Z", dateMiseEnService: "2025-03-01" });
    assert.ok(a.ok);
    const b = applyBienPatch({ ...workspace, declarationDraft: a.draft }, "bien-b", { dateMiseEnService: "2025-09-15" });
    assert.ok(b.ok);
    assert.equal(b.draft.biens?.["bien-a"]?.dateMiseEnService, "2025-03-01");
    assert.equal(b.draft.biens?.["bien-b"]?.dateMiseEnService, "2025-09-15");
    assert.equal(b.draft.biens?.["bien-b"]?.revenusConfirmedAt, undefined);
    assert.equal(b.draft.biens?.["bien-a"], a.draft.biens?.["bien-a"], "le bien A n'est pas réécrit par une écriture sur B");
    assert.equal(b.draft.dateMiseEnService, undefined, "aucune remontée au niveau exercice");
  });

  it("invalidation : une modification du bien A n'invalide que A, et rend les sorties consolidées obsolètes", () => {
    const base = twoBienWorkspace();
    const confirmed = { ...base.declarationDraft!, fiscalResult: { exercice: YEAR } as never };
    confirmed.biens = {
      "bien-a": { ...createBienDraft("bien-a"), dateMiseEnService: "2025-03-01", logementConfirmedAt: "t", completedSteps: ["logement"] },
      "bien-b": { ...createBienDraft("bien-b"), dateMiseEnService: "2025-09-15", logementConfirmedAt: "t", completedSteps: ["logement"] },
    };
    const result = applyBienPatch({ ...base, declarationDraft: confirmed }, "bien-a", { dateMiseEnService: "2025-04-01" });
    assert.ok(result.ok);
    assert.equal(result.draft.biens?.["bien-a"]?.logementConfirmedAt, undefined, "confirmation de A invalidée");
    assert.equal(result.draft.biens?.["bien-b"]?.logementConfirmedAt, "t", "B intact");
    assert.equal(result.draft.fiscalResult, undefined, "sortie consolidée invalidée");
    assert.equal(result.consolidatedOutputsStale, true);
  });

  it("une donnée propre au bien n'est jamais écrite sans propertyId connu", () => {
    const result = applyBienPatch(twoBienWorkspace(), "bien-inconnu", { revenusConfirmedAt: "t" });
    assert.deepEqual(result, { ok: false, reason: "unknown_property" });
  });
});

describe("R1 — Oracle 3 : résolution stricte avec plusieurs biens", () => {
  it("propertyId absent → ambiguïté explicite, jamais le premier bien", () => {
    const workspace = twoBienWorkspace();
    assert.deepEqual(resolvePropertyScope(workspace), { ok: false, reason: "ambiguous" });
    assert.equal(resolveMonoPropertyId(workspace), undefined);
    assert.deepEqual(getBienDraft(workspace), { ok: false, reason: "ambiguous" });
  });

  it("génération : la continuité des immobilisations ne reçoit aucun bien (jamais le premier)", () => {
    const workspace = twoBienWorkspace();
    const continuity = resolveImmobilisationsContinuityForGeneration({
      draft: workspace.declarationDraft, properties: workspace.properties, propertyIds: workspace.fiscalYear.propertyIds,
    });
    assert.equal(continuity.propertyId, undefined);
    assert.deepEqual(continuity.composantsF012Merged, []);
  });

  it("données historiques non scopées avec plusieurs biens → non attribuables", () => {
    const workspace = workspaceWith([property("bien-a"), property("bien-b")], { completedSteps: [], logementConfirmedAt: "t" });
    assert.deepEqual(readBienDrafts(workspace), { mode: "unresolved", reason: "ambiguous" });
  });

  it("un dépôt de document sans bien choisi n'est jamais rattaché au premier bien", () => {
    const state: LmnpState = { ...twoBienWorkspace(), fileRegistry: new Map() };
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file: new File(["x"], "taxe.pdf", { type: "application/pdf" }), category: "charges", documentId: "doc-new" }],
    });
    const uploaded = next.documents.find((item) => item.id === "doc-new");
    assert.ok(uploaded);
    assert.equal(uploaded.propertyId, undefined);
    assert.deepEqual(resolveDocumentScope(next, uploaded), { kind: "unresolved", reason: "ambiguous" });
  });
});

describe("R1 — Oracle 3bis : écriture propre au bien sans bien résolu", () => {
  it("confirmation Logement avec plusieurs biens et sans propertyId → aucun bien modifié, aucune confirmation", () => {
    const state: LmnpState = { ...workspaceWith([property("bien-a"), property("bien-b")], { completedSteps: [] }), fileRegistry: new Map() };
    const next = lmnpReducer(state, { type: "CONFIRM_LOGEMENT_PROFILE", profile: { label: "T2 Nantes" } });
    assert.deepEqual(next.properties, state.properties);
    assert.equal(next.declarationDraft?.logementConfirmedAt, undefined);
  });

  it("mono : la confirmation Logement met toujours à jour le bien unique", () => {
    const state: LmnpState = { ...workspaceWith([property("home-1")], { completedSteps: [] }), fileRegistry: new Map() };
    const next = lmnpReducer(state, { type: "CONFIRM_LOGEMENT_PROFILE", profile: { label: "T2 Nantes" } });
    assert.equal(next.properties[0]?.label, "T2 Nantes");
    assert.ok(next.declarationDraft?.logementConfirmedAt);
  });
});

describe("R1 — Oracle 4 : résolution mono-bien déterministe", () => {
  it("propertyId absent sur un chemin mono historique → le bien unique", () => {
    const workspace = workspaceWith([property("home-1")], { completedSteps: [] });
    assert.deepEqual(resolvePropertyScope(workspace), { ok: true, propertyId: "home-1", via: "mono_legacy" });
    assert.equal(resolveMonoPropertyId(workspace), "home-1");
  });

  it("dépôt mono : le document reste rattaché au bien unique (comportement historique)", () => {
    const state: LmnpState = { ...workspaceWith([property("home-1")], { completedSteps: [] }), fileRegistry: new Map() };
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file: new File(["x"], "bail.pdf", { type: "application/pdf" }), category: "bail", documentId: "doc-mono" }],
    });
    assert.equal(next.documents.find((item) => item.id === "doc-mono")?.propertyId, "home-1");
  });
});

describe("R1 — Oracle 5 : portée des documents", () => {
  const workspace = workspaceWith([property("bien-a"), property("bien-b")], { completedSteps: [] });

  it("document propre au bien → propertyId exact ; document commun → null", () => {
    assert.deepEqual(resolveDocumentScope(workspace, doc("d1", "bien-b")), { kind: "property", propertyId: "bien-b", via: "explicit" });
    assert.deepEqual(resolveDocumentScope(workspace, doc("d2", null)), { kind: "common" });
  });

  it("document ambigu ou inconnu en multi-bien → non résolu, et la consolidation est bloquée", () => {
    assert.deepEqual(resolveDocumentScope(workspace, doc("d3")), { kind: "unresolved", reason: "ambiguous" });
    assert.deepEqual(resolveDocumentScope(workspace, doc("d4", "fantome")), { kind: "unresolved", reason: "unknown_property" });
    const withAmbiguous = { ...twoBienWorkspace(), documents: [doc("d3")] };
    const consolidation = resolveConsolidationInput(withAmbiguous);
    assert.equal(consolidation.kind, "blocked");
    assert.ok(consolidation.kind === "blocked" && consolidation.reasons.includes("unattributed_documents"));
  });
});

describe("R1 — Oracle 6 : hydratation sans écriture", () => {
  it("lire un ancien dossier ne modifie rien et n'ajoute pas de biens persistés", async () => {
    const workspace = deepFreeze(await legacyMonoWorkspace());
    const before = JSON.stringify(workspace);
    readBienDrafts(workspace);
    getBienDraft(workspace);
    resolveConsolidationInput(workspace);
    for (const item of workspace.documents) resolveDocumentScope(workspace, item);
    assert.equal(JSON.stringify(workspace), before);
    assert.equal("biens" in workspace.declarationDraft!, false);
  });
});

describe("R1 — Oracle 7 : non-régression fiscale mono", () => {
  it("même dossier avant / après adaptation : sorties fiscales identiques au centime", async () => {
    const workspace = await legacyMonoWorkspace();
    const reference = fiscalOutputs(workspace.declarationDraft);
    assert.ok(reference.fiscalResult.totalRecettes > 0, "dossier de référence non trivial");

    const legacy = resolveConsolidationInput(workspace);
    assert.equal(legacy.kind, "single_declaration");
    assert.deepEqual(fiscalOutputs(legacy.kind === "single_declaration" ? legacy.draft : undefined), reference);

    const migrated = migrateLegacyMonoToBiens(workspace);
    assert.ok(migrated.ok);
    const propertyId = workspace.properties[0]!.id;
    for (const field of BIEN_DRAFT_FIELDS) assert.equal(migrated.draft[field], undefined, `${field} déplacé, pas copié`);
    assert.deepEqual(Object.keys(migrated.draft.biens ?? {}), [propertyId], "aucune donnée copiée vers plusieurs biens");
    const scoped = resolveConsolidationInput({ ...workspace, declarationDraft: migrated.draft });
    assert.equal(scoped.kind, "single_declaration");
    assert.deepEqual(fiscalOutputs(scoped.kind === "single_declaration" ? scoped.draft : undefined), reference);
  });

  it("migration idempotente", async () => {
    const workspace = await legacyMonoWorkspace();
    const once = migrateLegacyMonoToBiens(workspace);
    assert.ok(once.ok);
    const twice = migrateLegacyMonoToBiens({ ...workspace, declarationDraft: once.draft });
    assert.ok(twice.ok);
    assert.deepEqual(twice.draft, once.draft);
  });

  it("V3 : le support « full » reste réservé au mono historique ; un dossier scopé n'est jamais lu à plat", async () => {
    const workspace = await legacyMonoWorkspace();
    const propertyId = workspace.properties[0]!.id;
    assert.equal(resolveV3PropertySupport(workspace, propertyId), "full");
    const migrated = migrateLegacyMonoToBiens(workspace);
    assert.ok(migrated.ok);
    assert.equal(resolveV3PropertySupport({ ...workspace, declarationDraft: migrated.draft }, propertyId), "facts_only");
  });
});

describe("R1 — Oracle 9 : une seule déclaration consolidée", () => {
  it("plusieurs biens → un agrégat unique (bloqué tant que la consolidation multi-bien n'existe pas), jamais une liasse par bien", () => {
    const consolidation = resolveConsolidationInput(twoBienWorkspace());
    assert.equal(Array.isArray(consolidation), false);
    assert.deepEqual(consolidation, { kind: "blocked", reasons: ["multi_property_consolidation_not_supported"] });
  });

  it("mono → une déclaration unique portant le bien unique", async () => {
    const workspace = await legacyMonoWorkspace();
    const consolidation = resolveConsolidationInput(workspace);
    assert.equal(consolidation.kind, "single_declaration");
    assert.deepEqual(consolidation.kind === "single_declaration" && consolidation.propertyIds, [workspace.properties[0]!.id]);
  });
});

describe("R1.1 — Oracle E : dossier mono incohérent (Property[] ≠ propertyIds)", () => {
  /** Bien réel portant une base d'amortissement réelle (F010 + composant F012 réels), extraite par le code de production. */
  async function realPropertyWithBase(): Promise<{ property: Property; draft: DeclarationDraft }> {
    const state = await amortizedWithWorks();
    const draft = state.declarationDraft!;
    const base = extractAmortissementBase(draft.logementAmortissement, draft.dateMiseEnService, draft.chargesAssistant?.composantsNouveaux);
    assert.ok(base && base.composants.length > 0, "base réelle non vide");
    return { property: { ...state.properties[0]!, amortissementBase: base }, draft: { ...draft, chargesAssistant: undefined } };
  }

  function stateOf(property: Property, propertyIds: string[], draft: DeclarationDraft): LmnpState {
    const workspace = workspaceWith([property], draft);
    return { ...workspace, fiscalYear: { ...workspace.fiscalYear, propertyIds }, fileRegistry: new Map() };
  }

  function continuityOf(state: LmnpState) {
    return resolveImmobilisationsContinuityForGeneration({ draft: state.declarationDraft, properties: state.properties, propertyIds: state.fiscalYear.propertyIds });
  }

  function upload(state: LmnpState): LmnpDocument | undefined {
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file: new File(["x"], "bail.pdf", { type: "application/pdf" }), category: "bail", documentId: "doc-e" }],
    });
    return next.documents.find((item) => item.id === "doc-e");
  }

  it("cohérent : comportement mono inchangé (bien unique, base reprise, document rattaché, une déclaration)", async () => {
    const { property, draft } = await realPropertyWithBase();
    const state = stateOf(property, [property.id], draft);
    const continuity = continuityOf(state);
    assert.equal(continuity.propertyId, property.id);
    assert.ok((continuity.composantsF012Merged ?? []).length > 0, "la base du bien unique alimente la continuité");
    assert.equal(upload(state)?.propertyId, property.id);
    assert.equal(lmnpReducer(state, { type: "CONFIRM_LOGEMENT_PROFILE", profile: { label: "T2 Nantes" } }).properties[0]?.label, "T2 Nantes");
    assert.equal(resolveConsolidationInput(state).kind, "single_declaration");
  });

  for (const propertyIds of [["__P__", "fantome"], ["fantome"]]) {
    it(`incohérent ${JSON.stringify(propertyIds)} : aucune donnée modifiée, aucun bien arbitraire`, async () => {
      const { property, draft } = await realPropertyWithBase();
      const state = stateOf(property, propertyIds.map((id) => (id === "__P__" ? property.id : id)), draft);
      assert.deepEqual(resolvePropertyScope(state), { ok: false, reason: "inconsistent_scope" });
      assert.equal(lmnpReducer(state, { type: "CONFIRM_LOGEMENT_PROFILE", profile: { label: "T2 Nantes" } }), state, "aucune écriture");
      assert.equal(upload(state)?.propertyId, undefined, "aucun rattachement arbitraire");
      assert.deepEqual(readBienDrafts(state), { mode: "unresolved", reason: "inconsistent_scope" });
      assert.deepEqual(resolveConsolidationInput(state), { kind: "blocked", reasons: ["inconsistent_scope"] });
      const continuity = continuityOf(state);
      assert.equal(continuity.propertyId, undefined, "la génération ne reçoit aucun bien arbitraire");
      assert.deepEqual(continuity.composantsF012Merged, [], "aucune base d'amortissement d'un bien arbitraire");
    });
  }
});
