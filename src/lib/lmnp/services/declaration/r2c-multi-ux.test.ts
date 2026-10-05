/**
 * MB-MULTI-UX-1 — UX multi-bien DORMANTE : ajout d'un bien, bien actif (URL), scope, isolation A/B, attribution des documents,
 * attestations d'activité (SSI, détention directe, charges communes), messages de domaine. TOUTES les capacités restent OFF :
 * rien ici n'active le multi (les capacités ouvertes ne sont injectées que dans les tests, jamais en production).
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c-multi-ux.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DomainReadinessList } from "@/components/lmnp/biens/DomainReadinessList";
import { MultiPropertyAttestationsForm } from "@/components/lmnp/biens/MultiPropertyAttestationsForm";
import { PropertySelector } from "@/components/lmnp/biens/PropertySelector";
import { V3PropertiesSection, shouldShowV3PropertiesSection } from "@/components/lmnp/biens/V3PropertiesSection";
import { buildAddPropertyReturnHref } from "@/components/lmnp/biens/add-property-return";
import { buildPropertySelectorItems, buildV3ShellPropertyItems } from "@/components/lmnp/biens/property-selector-model";
import { propertyScopeFor, readRequestedPropertyId, v3CorrectionHrefForResolvedScope, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { planAddProperty } from "@/lib/lmnp/dossier/add-property-plan";
import { bienScopeFor, resolveActivePropertyId, resolveUploadPropertyScope, withActivePropertyId } from "@/lib/lmnp/dossier/bien-scope";
import { BIEN_DRAFT_FIELDS, readBienDrafts, scopedBienView } from "@/lib/lmnp/dossier/bien-draft";
import {
  MULTI_PROPERTY_CAPABILITIES,
  isMultiPropertyCapabilityOpen,
  isMultiPropertyClosingBlocked,
  isMultiPropertyDeliveryBlocked,
  isMultiPropertyGenerationBlocked,
  isMultiPropertyNextYearBlocked,
  type MultiPropertyCapabilities,
} from "@/lib/lmnp/dossier/multi-property-activation";
import {
  MULTI_PROPERTY_ATTESTATION_KINDS,
  MULTI_PROPERTY_ATTESTATION_WORDING_VERSION,
  recordMultiPropertyAttestation,
  resolveAllMultiPropertyAttestations,
} from "@/lib/lmnp/dossier/multi-property-attestations";
import { MULTI_PROPERTY_DOMAIN_REASON_CODES as REASON } from "@/lib/lmnp/dossier/multi-property-domain";
import { describeMultiPropertyDomainReason, describeMultiPropertyDomainReasons } from "@/lib/lmnp/dossier/multi-property-domain-messages";
import { resolveMultiPropertyDomainReadiness } from "@/lib/lmnp/dossier/multi-property-readiness";
import { resolveDocumentScope } from "@/lib/lmnp/dossier/property-scope";
import { canCloseFiscalYear, canCreateNextFiscalYear } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { uploadDocument } from "@/lib/uploadDocument";
import { lmnpReducer, type LmnpAction, type LmnpState } from "@/lib/lmnp/store/reducer";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft } from "@/lib/lmnp/types";

import { A, B, CONFIRMED_ATTESTATIONS, SPEC_A, T, Y, monoWorkspace, multiWorkspace, oracleBien } from "./multi-property-test-support";

const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const EDITION_CLOSED = { edition: false, generation: false, delivery: false, payment: false, closing: false, nextYear: false } as MultiPropertyCapabilities;
const EDITION_OPEN = { edition: true, generation: false, delivery: false, payment: false, closing: false, nextYear: false } as MultiPropertyCapabilities;
const toState = (workspace: PersistedWorkspace) => ({ ...clone(workspace), fileRegistry: new Map() }) as unknown as LmnpState;
const act = (state: LmnpState, action: unknown) => lmnpReducer(state, action as LmnpAction);
const biens = (state: LmnpState | PersistedWorkspace) => (state.declarationDraft as DeclarationDraft).biens as Record<string, Record<string, unknown>>;
const SCOPE: V3CorrectionScope = { dossierId: "11111111-1111-4111-8111-111111111111", fiscalYearId: "fy-2026", year: Y, property: { kind: "not_applicable" }, shell: "v3" };

// ---------------------------------------------------------------------------
// 1. ADD_PROPERTY — une seule transition, atomique, sans perte du bien existant
// ---------------------------------------------------------------------------

describe("MB-MULTI-UX-1 — ADD PROPERTY", () => {
  it("capacité d'ÉDITION fermée (explicite) : refus, aucun dispatch possible", () => {
    const plan = planAddProperty(monoWorkspace(), { label: "Studio Lyon" }, { capabilities: EDITION_CLOSED });
    assert.deepEqual(plan, { ok: false, reason: "edition_not_enabled" });
    assert.equal(isMultiPropertyCapabilityOpen("edition", EDITION_CLOSED), false);
  });

  it("mono → A + B sans perte de A ; B a un identifiant neuf et stable, démarre vide ; le bien créé devient le bien actif", () => {
    const mono = toState(monoWorkspace());
    const flatRevenus = JSON.stringify(mono.declarationDraft!.revenusAssistant);
    const flatCharges = JSON.stringify(mono.declarationDraft!.chargesAssistant);
    const plan = planAddProperty(mono, { label: "  Studio Nantes  " }, { capabilities: EDITION_OPEN, newId: () => "bien-nouveau" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.equal(plan.property.id, "bien-nouveau");
    assert.equal(plan.property.label, "Studio Nantes");
    assert.equal(plan.activePropertyId, "bien-nouveau", "le bien créé devient actif");
    const next = act(mono, { type: "ADD_PROPERTY", property: plan.property });
    assert.notEqual(next, mono);
    assert.deepEqual(next.fiscalYear.propertyIds, [A, "bien-nouveau"]);
    assert.deepEqual(next.properties.map((property) => property.id), [A, "bien-nouveau"]);
    // A conserve toutes ses données (déplacées dans biens[A], jamais copiées vers B).
    assert.equal(JSON.stringify(biens(next)[A]!.revenusAssistant), flatRevenus);
    assert.equal(JSON.stringify(biens(next)[A]!.chargesAssistant), flatCharges);
    assert.equal(biens(next)[A]!.dateMiseEnService, SPEC_A.date);
    // B est vide : aucune donnée fiscale de A.
    const bienB = biens(next)["bien-nouveau"]!;
    assert.deepEqual(Object.keys(bienB).sort(), ["completedSteps", "propertyId"]);
    // Les données d'ACTIVITÉ restent à la racine, non dupliquées par bien.
    assert.equal(next.declarationDraft!.siret, mono.declarationDraft!.siret);
    assert.equal(biens(next)[A]!.siret, undefined);
    assert.equal(bienB.siret, undefined);
  });

  it("l'ajout est refusé AVANT dispatch : nom vide ou trop long, exercice verrouillé ; un bien déjà connu n'est pas recréé", () => {
    const mono = monoWorkspace();
    assert.deepEqual(planAddProperty(mono, { label: "   " }, { capabilities: EDITION_OPEN }), { ok: false, reason: "invalid_label" });
    assert.deepEqual(planAddProperty(mono, { label: "x".repeat(81) }, { capabilities: EDITION_OPEN }), { ok: false, reason: "invalid_label" });
    const locked = clone(mono);
    (locked.fiscalYear as { paidAt?: string }).paidAt = T;
    assert.deepEqual(planAddProperty(locked, { label: "B" }, { capabilities: EDITION_OPEN }), { ok: false, reason: "fiscal_year_locked" });
    assert.deepEqual(planAddProperty(mono, { label: "Bis" }, { capabilities: EDITION_OPEN, newId: () => A }), { ok: false, reason: "property_exists" });
  });

  it("ajout d'un TROISIÈME bien : les deux premiers sont conservés tels quels (même référence)", () => {
    const two = toState(multiWorkspace());
    const plan = planAddProperty(two, { label: "Maison Annecy" }, { capabilities: EDITION_OPEN, newId: () => "bien-c" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    const three = act(two, { type: "ADD_PROPERTY", property: plan.property });
    assert.deepEqual(three.fiscalYear.propertyIds, [A, B, "bien-c"]);
    assert.equal(biens(three)[A], biens(two)[A]);
    assert.equal(biens(three)[B], biens(two)[B]);
  });

  it("une seule implémentation de la transition : le plan délègue à addPropertyToWorkspace, aucune copie de la logique d'ajout", () => {
    const code = source("src/lib/lmnp/dossier/add-property-plan.ts");
    assert.match(code, /addPropertyToWorkspace\(workspace, property\)/);
    assert.doesNotMatch(code, /propertyIds:|declarationDraft:/);
  });

  it("le retour après ajout confirmé porte le NOUVEAU bien ; refusé si l'enregistrement n'est pas confirmé ou si le scope ne correspond plus", () => {
    const mono = toState(monoWorkspace());
    const plan = planAddProperty(mono, { label: "B" }, { capabilities: EDITION_OPEN, newId: () => "bien-nouveau" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    const next = act(mono, { type: "ADD_PROPERTY", property: plan.property });
    const workspace = { ...next, fiscalYear: { ...next.fiscalYear, id: "fy-2026", dossierId: SCOPE.dossierId } } as unknown as PersistedWorkspace;
    const href = buildAddPropertyReturnHref({ scope: SCOPE, workspace, newPropertyId: "bien-nouveau", save: { status: "confirmed", revision: 3 } });
    assert.ok(href);
    const url = new URL(href!, "http://x");
    assert.equal(url.pathname, "/lab/v3-dossier/real");
    assert.equal(url.searchParams.get("propertyId"), "bien-nouveau");
    assert.equal(url.searchParams.get("v3Return"), "1");
    assert.equal(buildAddPropertyReturnHref({ scope: SCOPE, workspace, newPropertyId: "bien-nouveau", save: { status: "failed", reason: "x" } }), null);
    assert.equal(buildAddPropertyReturnHref({ scope: SCOPE, workspace, newPropertyId: "bien-inconnu", save: { status: "confirmed", revision: 3 } }), null);
  });
});

// ---------------------------------------------------------------------------
// 2. Bien actif (URL) et scope — jamais « le premier bien »
// ---------------------------------------------------------------------------

describe("MB-MULTI-UX-1 — bien actif et scope", () => {
  const multi = () => multiWorkspace();
  const required = (propertyId: string) => ({ property: { kind: "required" as const, propertyId } });

  it("ACTIVE PROPERTY : le scope vérifié de l'URL désigne A ou B ; sans scope valide, aucun bien actif en multi (jamais le premier)", () => {
    assert.equal(resolveActivePropertyId(required(A), multi()), A);
    assert.equal(resolveActivePropertyId(required(B), multi()), B);
    assert.equal(resolveActivePropertyId(required("etranger"), multi()), undefined);
    assert.equal(resolveActivePropertyId({ property: { kind: "not_applicable" } }, multi()), undefined);
    assert.equal(resolveActivePropertyId(null, multi()), undefined);
    assert.equal(resolveActivePropertyId(null, monoWorkspace()), A, "mono : comportement historique inchangé");
  });

  it("PROPERTY SCOPE : propertyScopeFor refuse un bien inconnu / hors exercice / incohérent ; ne choisit jamais", () => {
    const ws = multi();
    assert.deepEqual(propertyScopeFor(ws.fiscalYear.propertyIds, ws.properties), { kind: "not_applicable" });
    assert.deepEqual(propertyScopeFor(ws.fiscalYear.propertyIds, ws.properties, B), { kind: "required", propertyId: B });
    assert.equal(propertyScopeFor(ws.fiscalYear.propertyIds, ws.properties, "inconnu"), null);
    assert.equal(propertyScopeFor([A], ws.properties, B), null, "liste de biens ≠ biens de l'exercice : incohérent");
    assert.equal(propertyScopeFor([A, B], [{ id: A }], A), null);
  });

  it("l'URL est la source de vérité : ?propertyId= lu strictement (absent, un seul, vide ou répété = refus)", () => {
    assert.deepEqual(readRequestedPropertyId(new URLSearchParams("")), { kind: "none" });
    assert.deepEqual(readRequestedPropertyId(new URLSearchParams("propertyId=b")), { kind: "property", propertyId: "b" });
    assert.deepEqual(readRequestedPropertyId(new URLSearchParams("propertyId=")), { kind: "invalid" });
    assert.deepEqual(readRequestedPropertyId(new URLSearchParams("propertyId=a&propertyId=b")), { kind: "invalid" });
  });

  it("les owners de bien (F010–F014) exigent un bien requis ; l'owner d'activité « Mes biens » n'en exige pas", () => {
    const withoutProperty = { ...SCOPE };
    assert.equal(v3CorrectionHrefForResolvedScope("/assistants/logement", withoutProperty), null);
    assert.ok(v3CorrectionHrefForResolvedScope("/assistants/biens", withoutProperty));
    const href = v3CorrectionHrefForResolvedScope("/assistants/logement", { ...SCOPE, property: { kind: "required", propertyId: B } });
    assert.equal(new URL(href!, "http://x").searchParams.get("propertyId"), B);
    assert.equal(new URL(v3CorrectionHrefForResolvedScope("/assistants/biens", { ...SCOPE, property: { kind: "required", propertyId: B } })!, "http://x").searchParams.get("propertyId"), null, "l'owner d'activité ne porte pas de bien");
  });

  it("chaque panel F010–F014 monte derrière BienScopeGate / useBienScope ; aucun repli sur le premier bien ni sur le bien unique", () => {
    for (const panel of ["F010LogementAssistantPanel", "F011FinancementAssistantPanel", "F012ChargesAssistantPanel", "F013RevenusAssistantPanel", "F014AmortissementsAssistantPanel"]) {
      const code = source(`src/components/lmnp/assistants/${panel}.tsx`);
      assert.match(code, /BienScopeGate/, panel);
      assert.match(code, /useBienScope\(\)/, panel);
      assert.doesNotMatch(code, /resolveMonoPropertyId|properties\[0\]|propertyIds\[0\]/, panel);
    }
    const gate = source("src/components/lmnp/assistants/BienScopeGate.tsx");
    assert.doesNotMatch(gate, /properties\[0\]|propertyIds\[0\]|resolveMonoPropertyId/);
  });

  it("MATRICE F010–F014 : donnée de bien lue/écrite sur le bien actif ; donnée d'activité à la racine, jamais par bien", () => {
    const biensWs = multi();
    const view = scopedBienView(biensWs.declarationDraft as DeclarationDraft, A)!;
    const matrix: Array<[string, string[], string[]]> = [
      ["F010 Logement", ["logementAssistantState", "logementAmortissement", "logementConfirmedAt", "propertyBackgroundExtraction", "governedFields", "dateMiseEnService"], []],
      ["F011 Financement", ["financementAssistantState", "financementCharges", "creditConfirmedAt", "creditDeclaredNoneAt", "creditFinancing", "creditGptSession", "creditDocumentId"], []],
      ["F012 Charges", ["chargesAssistantState", "chargesAssistant", "chargesConfirmedAt"], []],
      ["F013 Revenus", ["revenueGptSession", "revenusAssistant", "revenusConfirmedAt"], []],
      ["F014 Amortissements", ["amortissementAssistant", "amortissementConfirmedAt"], []],
    ];
    for (const [assistant, bienFields] of matrix) {
      for (const field of bienFields) assert.ok((BIEN_DRAFT_FIELDS as readonly string[]).includes(field), `${assistant} : ${field} propre au bien`);
    }
    const activityFields = ["siret", "siren", "activityType", "activityStartDate", "inpiDocumentId", "multiPropertyAttestations", "indivision", "dispense2033A"];
    for (const field of activityFields) assert.ok(!(BIEN_DRAFT_FIELDS as readonly string[]).includes(field), `${field} (F009 / activité) n'est jamais par bien`);
    assert.equal(view.siret, biensWs.declarationDraft!.siret, "la vue d'un bien hérite de l'activité sans la dupliquer dans le bien");
    assert.equal((biensWs.declarationDraft as { biens: Record<string, Record<string, unknown>> }).biens[A]!.siret, undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. Isolation A / B au niveau UX (reducer + vues de scope)
// ---------------------------------------------------------------------------

describe("MB-MULTI-UX-1 — PROPERTY ISOLATION (A → ajouter B → B différent → retour A → retour B)", () => {
  it("logement, revenus, charges, financement : chaque bien retrouve exactement ses valeurs", () => {
    // 1-2. A créé et renseigné (dossier mono historique).
    let state = toState(monoWorkspace());
    const monoRevenus = clone(state.declarationDraft!.revenusAssistant) as { totalRecettes: number };
    state = act(state, { type: "CONFIRM_LOGEMENT_PROFILE", profile: { label: "Appartement A", surface: 40, city: "Lyon" } });
    // 3. ajouter B (il devient actif)
    const plan = planAddProperty(state, { label: "Maison B" }, { capabilities: EDITION_OPEN, newId: () => B });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    state = act(state, { type: "ADD_PROPERTY", property: plan.property });
    assert.equal(biens(state)[A]!.revenusAssistant && (biens(state)[A]!.revenusAssistant as { totalRecettes: number }).totalRecettes, monoRevenus.totalRecettes);
    const write = (propertyId: string, action: unknown) => { state = act(state, withActivePropertyId(action as LmnpAction, propertyId)); };
    // 4. B renseigné DIFFÉREMMENT, sur plusieurs familles.
    write(B, { type: "CONFIRM_LOGEMENT_PROFILE", profile: { label: "Maison B", surface: 120, city: "Nantes" } });
    write(B, { type: "DECLARATION_PATCH_DRAFT", patch: { revenusAssistant: { ...(monoRevenus as object), totalRecettes: 4321, loyersEncaisses: 4321 } } });
    write(B, { type: "DECLARATION_PATCH_DRAFT", patch: { chargesAssistant: { ...(clone(biens(state)[A]!.chargesAssistant) as object), totalDeductible: 777 } } });
    write(B, { type: "DECLARE_NO_CREDIT" });
    // 5-6. retour sur A : valeurs A exactes.
    const viewA = bienScopeFor(state, A);
    assert.equal(viewA.status, "ready");
    if (viewA.status !== "ready") return;
    assert.equal((viewA.draft.revenusAssistant as { totalRecettes: number }).totalRecettes, monoRevenus.totalRecettes);
    assert.equal((viewA.draft.chargesAssistant as { totalDeductible: number }).totalDeductible, (clone(monoWorkspace().declarationDraft!.chargesAssistant) as { totalDeductible: number }).totalDeductible);
    assert.equal(viewA.draft.creditDeclaredNoneAt, monoWorkspace().declarationDraft!.creditDeclaredNoneAt, "A garde son état de financement");
    assert.equal(state.properties.find((property) => property.id === A)!.label, "Appartement A");
    assert.equal(state.properties.find((property) => property.id === A)!.surface, 40);
    // 7-8. retour sur B : valeurs B exactes.
    const viewB = bienScopeFor(state, B);
    assert.equal(viewB.status, "ready");
    if (viewB.status !== "ready") return;
    assert.equal((viewB.draft.revenusAssistant as { totalRecettes: number }).totalRecettes, 4321);
    assert.equal((viewB.draft.chargesAssistant as { totalDeductible: number }).totalDeductible, 777);
    assert.ok(viewB.draft.creditDeclaredNoneAt, "B a déclaré sans crédit");
    assert.equal(state.properties.find((property) => property.id === B)!.label, "Maison B");
    assert.equal(state.properties.find((property) => property.id === B)!.surface, 120);
    // Aucune fuite : A n'a pas reçu la donnée de B, ni l'inverse.
    assert.notEqual((viewA.draft.revenusAssistant as { totalRecettes: number }).totalRecettes, 4321);
    assert.equal(readBienDrafts(state).mode, "scoped");
  });

  it("changer de bien actif ne mute aucune donnée (lecture seule des vues) et ne copie rien", () => {
    const state = toState(multiWorkspace());
    const before = JSON.stringify(state.declarationDraft);
    for (const id of [A, B, A, B]) {
      const scope = bienScopeFor(state, id);
      assert.equal(scope.status, "ready");
    }
    assert.equal(JSON.stringify(state.declarationDraft), before);
  });

  it("un bien sans bien actif ne se lit jamais par repli : bloqué", () => {
    const scope = bienScopeFor(toState(multiWorkspace()), undefined);
    assert.deepEqual(scope, { status: "blocked", reason: "no_active_property" });
    assert.equal(bienScopeFor(toState(multiWorkspace()), "etranger").status, "blocked");
  });
});

// ---------------------------------------------------------------------------
// 4. Documents — attribution explicite
// ---------------------------------------------------------------------------

describe("MB-MULTI-UX-1 — attribution des documents", () => {
  it("DOCUMENT ATTRIBUTION : upload depuis B → propertyId B ; depuis A → A", () => {
    assert.deepEqual(resolveUploadPropertyScope(multiWorkspace(), B), { propertyId: B, requirePropertyId: true });
    assert.deepEqual(resolveUploadPropertyScope(multiWorkspace(), A), { propertyId: A, requirePropertyId: true });
  });

  it("multi sans bien actif (ou bien étranger) : AUCUN propertyId et téléversement exigé refusé — jamais le bien unique ni « commun »", () => {
    assert.deepEqual(resolveUploadPropertyScope(multiWorkspace(), undefined), { propertyId: undefined, requirePropertyId: true });
    assert.deepEqual(resolveUploadPropertyScope(multiWorkspace(), "etranger"), { propertyId: undefined, requirePropertyId: true });
  });

  it("mono : comportement historique inchangé (bien unique, rien d'exigé)", () => {
    assert.deepEqual(resolveUploadPropertyScope(monoWorkspace(), undefined), { propertyId: A, requirePropertyId: false });
  });

  it("uploadDocument refuse un téléversement de bien sans propertyId (aucun appel réseau)", async () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const result = await uploadDocument(file, "user-1", { dossierId: "11111111-1111-4111-8111-111111111111", fiscalYear: Y, requirePropertyId: true });
    assert.equal(result, null);
  });

  it("aucun site de téléversement de bien ne retombe sur resolveMonoPropertyId (documents du parcours, panels F010–F012)", () => {
    for (const file of ["LogementDocumentStep", "CreditDocumentStep", "RevenusDocumentStep", "ChargesDocumentStep", "AmortissementDocumentStep", "DocumentsWorkspace"]) {
      const code = source(`src/components/lmnp/documents/${file}.tsx`);
      assert.doesNotMatch(code, /resolveMonoPropertyId\(/, file);
      assert.match(code, /useUploadPropertyScope\(\)/, file);
    }
    for (const panel of ["F010LogementAssistantPanel", "F011FinancementAssistantPanel", "F012ChargesAssistantPanel"]) {
      assert.match(source(`src/components/lmnp/assistants/${panel}.tsx`), /propertyId: (bienScope\.propertyId|activePropertyId)/, panel);
    }
  });

  it("UNATTRIBUTED DOCUMENT : un document sans propertyId n'est jamais commun ; ACTIVITY DOCUMENT : le document d'activité INPI/F009 l'est", () => {
    const ws = multiWorkspace();
    assert.equal(resolveDocumentScope(ws, { id: "d1" }).kind, "unresolved");
    assert.deepEqual(resolveDocumentScope(ws, { id: "d1", propertyId: null }), { kind: "common" });
    const withInpi = clone(ws);
    (withInpi.declarationDraft as { inpiDocumentId?: string }).inpiDocumentId = "doc-inpi";
    assert.deepEqual(resolveDocumentScope(withInpi, { id: "doc-inpi" }), { kind: "common" });
    const blockedGeneration = clone(ws);
    blockedGeneration.documents = [{ id: "d1", fiscalYearId: "fy-2026", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T } as never];
    const readiness = resolveMultiPropertyDomainReadiness(blockedGeneration);
    assert.equal(readiness.status, "unsupported");
    if (readiness.status === "unsupported") assert.ok(readiness.reasons.some((reason) => reason.code === REASON.unattributedDocument));
  });

  it("navigation documents : « Mes documents » du shell V3 ne mélange pas les biens (aucune liste par bien dans un assistant de bien)", () => {
    // L'attribution est portée par le document (propertyId) ; la restitution d'un bien filtre par resolveDocumentScope.
    const ws = multiWorkspace();
    const docs = [
      { id: "a1", propertyId: A }, { id: "b1", propertyId: B }, { id: "c1", propertyId: null }, { id: "x1" },
    ];
    const forB = docs.filter((doc) => { const scope = resolveDocumentScope(ws, doc); return scope.kind === "property" && scope.propertyId === B; });
    assert.deepEqual(forB.map((doc) => doc.id), ["b1"]);
  });
});

// ---------------------------------------------------------------------------
// 5. Attestations d'activité — explicites, séparées, persistées, fail-closed
// ---------------------------------------------------------------------------

describe("MB-MULTI-UX-1 — attestations SSI / détention directe / charges communes", () => {
  const withAttestations = (attestations: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}) =>
    multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], root: { multiPropertyAttestations: attestations, ...extra } });
  const reasonCodes = (workspace: PersistedWorkspace) => {
    const readiness = resolveMultiPropertyDomainReadiness(workspace);
    return readiness.status === "unsupported" ? readiness.reasons.map((reason) => reason.code) : readiness.status;
  };

  it("SSI ATTESTATION absente → fail-closed (motif dédié) ; confirmée → domaine vérifiable ; hors domaine → bloqué", () => {
    const { ssi: _ssi, ...others } = CONFIRMED_ATTESTATIONS;
    void _ssi;
    assert.deepEqual(reasonCodes(withAttestations(others)), [REASON.ssiAttestationMissing]);
    assert.equal(reasonCodes(withAttestations({ ...CONFIRMED_ATTESTATIONS })), "supported");
    assert.deepEqual(reasonCodes(withAttestations({ ...CONFIRMED_ATTESTATIONS, ssi: { answer: "declared_out_of_domain", at: T, wordingVersion: "t" } })), [REASON.ssiNotSupported]);
  });

  it("DIRECT HOLDING : même principe, champ séparé ; l'indivision déclarée dans F009 bloque aussi", () => {
    const { directHolding: _d, ...others } = CONFIRMED_ATTESTATIONS;
    void _d;
    assert.deepEqual(reasonCodes(withAttestations(others)), [REASON.directHoldingAttestationMissing]);
    assert.deepEqual(reasonCodes(withAttestations({ ...CONFIRMED_ATTESTATIONS, directHolding: { answer: "declared_out_of_domain", at: T, wordingVersion: "t" } })), [REASON.indirectHoldingNotSupported]);
    assert.deepEqual(reasonCodes(withAttestations({ ...CONFIRMED_ATTESTATIONS }, { indivision: true })), [REASON.indirectHoldingNotSupported]);
  });

  it("COMMON CHARGES : non attestée → bloqué ; « charges communes » déclarées → bloqué ; confirmée « aucune » → supporté", () => {
    const { noCommonCharges: _n, ...others } = CONFIRMED_ATTESTATIONS;
    void _n;
    assert.deepEqual(reasonCodes(withAttestations(others)), [REASON.commonChargesAttestationMissing]);
    assert.deepEqual(reasonCodes(withAttestations({ ...CONFIRMED_ATTESTATIONS, noCommonCharges: { answer: "declared_out_of_domain", at: T, wordingVersion: "t" } })), [REASON.commonChargesNotSupported]);
  });

  it("aucune attestation du tout : les TROIS motifs distincts (jamais un booléen unique ambigu)", () => {
    assert.deepEqual(reasonCodes(withAttestations(undefined)).sort(), [REASON.commonChargesAttestationMissing, REASON.directHoldingAttestationMissing, REASON.ssiAttestationMissing].sort());
  });

  it("la génération de PRODUCTION (garde de domaine) bloque sans attestation et génère avec les trois confirmées", () => {
    const blocked = runDeclarationGenerationFromWorkspace(withAttestations(undefined));
    assert.equal(blocked.status, "blocked");
    const codes = (blocked as { blockingReasons: Array<{ code: string }> }).blockingReasons.map((reason) => reason.code);
    assert.ok(codes.includes(REASON.ssiAttestationMissing) && codes.includes(REASON.directHoldingAttestationMissing) && codes.includes(REASON.commonChargesAttestationMissing));
    assert.equal(runDeclarationGenerationFromWorkspace(withAttestations({ ...CONFIRMED_ATTESTATIONS })).status, "generated");
  });

  it("persistée et auditable : réponse + horodatage + version du libellé ; chaque fait séparé ; conservée par le snapshot (aller-retour)", () => {
    const first = recordMultiPropertyAttestation(undefined, "ssi", "confirmed", "2026-10-03T10:00:00.000Z");
    const second = recordMultiPropertyAttestation(first, "directHolding", "declared_out_of_domain", "2026-10-03T10:01:00.000Z");
    assert.deepEqual(second.ssi, { answer: "confirmed", at: "2026-10-03T10:00:00.000Z", wordingVersion: MULTI_PROPERTY_ATTESTATION_WORDING_VERSION });
    assert.equal(second.directHolding?.answer, "declared_out_of_domain");
    assert.equal(second.noCommonCharges, undefined, "un fait non répondu reste absent");
    assert.deepEqual(resolveAllMultiPropertyAttestations(second), { ssi: "confirmed", directHolding: "declared_out_of_domain", noCommonCharges: "absent" });
    assert.deepEqual([...MULTI_PROPERTY_ATTESTATION_KINDS].sort(), ["directHolding", "noCommonCharges", "ssi"]);

    // Écriture par le réducteur (DECLARATION_PATCH_DRAFT, champ d'activité) puis snapshot.
    const state = act(toState(withAttestations(undefined)), { type: "DECLARATION_PATCH_DRAFT", patch: { multiPropertyAttestations: second } });
    assert.deepEqual(state.declarationDraft!.multiPropertyAttestations, second);
    const serialized = serializeWorkspaceSnapshot(state as unknown as PersistedWorkspace);
    assert.ok(serialized.ok, JSON.stringify(serialized));
    if (!serialized.ok) return;
    const parsed = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(serialized.envelope)));
    assert.ok(parsed.ok);
    if (parsed.ok) assert.deepEqual(parsed.envelope.workspace.declarationDraft?.multiPropertyAttestations, second);
  });

  it("le libellé SSI proposé reste factuel (aucun conseil) et les trois libellés sont distincts", () => {
    const html = renderToStaticMarkup(createElement(MultiPropertyAttestationsForm, { attestations: undefined, onAnswer: () => undefined }));
    assert.match(html, /régime LMNP pris en charge par L&#x27;Assistant du Réel/);
    assert.match(html, /cotisations sociales des indépendants/);
    assert.match(html, /détenus directement/);
    // INT-5 : sémantique « aucune charge à répartir entre les biens » (une charge d'activité sans répartition reste admise).
    assert.match(html, /aucune charge de ce dossier n&#x27;est à répartir entre plusieurs biens/);
    assert.equal((html.match(/data-state="absent"/g) ?? []).length, 3);
    assert.doesNotMatch(html, /vous devez|nous vous recommandons/i);
  });
});

// ---------------------------------------------------------------------------
// 6. Messages de domaine / readiness — la garde reste la seule source
// ---------------------------------------------------------------------------

describe("MB-MULTI-UX-1 — blocages de domaine présentés à l'utilisateur", () => {
  it("chaque code de motif de la garde possède un message ; aucun code inventé côté interface", () => {
    for (const code of Object.values(REASON)) {
      const view = describeMultiPropertyDomainReason({ code });
      assert.ok(view.message.length > 10, code);
    }
  });

  it("date de mise en service manquante : localisée sur le BIEN concerné (son nom), pas une erreur générique de dossier", () => {
    const ws = multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, { ...oracleBien(5000, 2000, 2000), date: undefined }]] });
    const readiness = resolveMultiPropertyDomainReadiness(ws);
    assert.equal(readiness.status, "unsupported");
    if (readiness.status !== "unsupported") return;
    const views = describeMultiPropertyDomainReasons(readiness.reasons, ws.properties);
    const date = views.find((view) => view.code === REASON.serviceDateMissing);
    assert.ok(date);
    assert.equal(date!.propertyId, B);
    assert.equal(date!.propertyLabel, `Bien ${B}`);
    const html = renderToStaticMarkup(createElement(DomainReadinessList, { reasons: views, supported: false }));
    assert.match(html, new RegExp(`Bien ${B} — `));
  });

  it("reprise, déficit antérieur, charge commune, prêt partagé : les motifs de la garde sont traduits tels quels", () => {
    const views = describeMultiPropertyDomainReasons([
      { code: REASON.takeoverNotSupported }, { code: REASON.priorDeficitNotSupported }, { code: REASON.historicalArdNotSupported },
      { code: REASON.commonChargesNotSupported }, { code: REASON.sharedLoanNotSupported }, { code: REASON.unattributedDocument },
      { code: REASON.unattributedDocument },
    ]);
    assert.equal(views.length, 6, "sans doublon");
    assert.ok(views.every((view) => !/[a-z]+_[a-z_]+/.test(view.message)), "aucun code technique affiché");
  });

  it("les composants ne recréent aucune règle : aucune condition fiscale dans les composants du dossier multi", () => {
    for (const file of ["DomainReadinessList", "MultiPropertyAttestationsForm", "PropertySelector", "PropertiesManager", "V3PropertiesSection"]) {
      assert.doesNotMatch(source(`src/components/lmnp/biens/${file}.tsx`), /amortNonDeduitExercice|deficitsOuverture|stocksOuverture|resultatFiscal/, file);
    }
  });

  it("dossier mono : aucun état « multi »", () => {
    assert.deepEqual(resolveMultiPropertyDomainReadiness(monoWorkspace()), { status: "not_multi" });
  });
});

// ---------------------------------------------------------------------------
// 7. Sélecteur / entrée « Mes biens » — dormants
// ---------------------------------------------------------------------------

describe("MB-MULTI-UX-1 — sélecteur de bien et entrée Dossier", () => {
  const props = (names: Array<[string, string]>) => names.map(([id, label]) => ({ id, label }));

  it("2 et 3 biens : noms réels, bien actif marqué, liens du scope vérifié ; jamais « bien 1 / bien 2 »", () => {
    const two = buildPropertySelectorItems({ properties: props([["a", "Studio Lyon"], ["b", "Maison Nantes"]]), propertyIds: ["a", "b"], activePropertyId: "b", scope: { ...SCOPE }, pathname: "/assistants/logement" });
    assert.deepEqual(two.map((item) => [item.label, item.active]), [["Studio Lyon", false], ["Maison Nantes", true]]);
    assert.equal(new URL(two[0]!.href!, "http://x").searchParams.get("propertyId"), "a");
    const three = buildPropertySelectorItems({ properties: props([["a", "Studio"], ["b", "Maison"], ["c", "Garage"]]), propertyIds: ["a", "b", "c"], activePropertyId: "a", scope: { ...SCOPE }, pathname: "/assistants/charges" });
    assert.equal(three.length, 3);
    assert.ok(three.every((item) => !/^bien \d/i.test(item.label)));
  });

  it("noms identiques distingués par l'adresse puis par un rang ; bien non rattaché à l'exercice non sélectionnable ; sans scope : pas de lien", () => {
    const duplicated = buildPropertySelectorItems({
      properties: [{ id: "a", label: "Studio", address: "1 rue X", city: "Lyon" }, { id: "b", label: "Studio", address: "2 rue Y", city: "Nantes" }, { id: "c", label: "Hors exercice" }],
      propertyIds: ["a", "b"], activePropertyId: undefined, scope: null, pathname: "/assistants/logement",
    });
    assert.deepEqual(duplicated.map((item) => item.label), ["Studio — 1 rue X, Lyon", "Studio — 2 rue Y, Nantes"]);
    assert.ok(duplicated.every((item) => item.href === null));
    const noAddress = buildPropertySelectorItems({ properties: props([["a", "Studio"], ["b", "Studio"]]), propertyIds: ["a", "b"], activePropertyId: "a", scope: null, pathname: "/x" });
    assert.deepEqual(noAddress.map((item) => item.label), ["Studio (1)", "Studio (2)"]);
  });

  it("le sélecteur se masque avec moins de 2 biens et rend le bien actif non cliquable", () => {
    assert.equal(renderToStaticMarkup(createElement(PropertySelector, { items: [] })), "");
    const html = renderToStaticMarkup(createElement(PropertySelector, {
      items: buildPropertySelectorItems({ properties: props([["a", "Studio"], ["b", "Maison"]]), propertyIds: ["a", "b"], activePropertyId: "a", scope: { ...SCOPE }, pathname: "/assistants/logement" }),
    }));
    assert.match(html, /aria-current="true"[^>]*>Studio</);
    assert.match(html, /<a href="[^"]*propertyId=b[^"]*"[^>]*>Maison</);
  });

  it("lien du dossier V3 : le bien actif est le paramètre d'URL ?propertyId= (source unique)", () => {
    const items = buildV3ShellPropertyItems({ properties: props([["a", "Studio"], ["b", "Maison"]]), propertyIds: ["a", "b"], activePropertyId: "b", dossierId: SCOPE.dossierId });
    const url = new URL(items[0]!.href!, "http://x");
    assert.equal(url.pathname, "/lab/v3-dossier/real");
    assert.equal(url.searchParams.get("dossierId"), SCOPE.dossierId);
    assert.equal(url.searchParams.get("propertyId"), "a");
  });

  it("ENTRÉE « Mes biens » dormante : invisible en mono avec l'édition fermée (production) ; visible pour un dossier multi ou l'édition ouverte (test)", () => {
    const mono = monoWorkspace();
    assert.equal(shouldShowV3PropertiesSection(mono, EDITION_CLOSED), false);
    assert.equal(renderToStaticMarkup(createElement(V3PropertiesSection, { workspace: mono, scope: null, capabilities: EDITION_CLOSED })), "");
    assert.equal(shouldShowV3PropertiesSection(mono, EDITION_OPEN), true);
    const html = renderToStaticMarkup(createElement(V3PropertiesSection, { workspace: mono, scope: { ...SCOPE, property: { kind: "required", propertyId: A } }, capabilities: EDITION_OPEN }));
    assert.match(html, /Ajouter un bien/);
    assert.match(html, /\/assistants\/biens\?/);
    assert.equal(shouldShowV3PropertiesSection(multiWorkspace()), true);
  });
});

// ---------------------------------------------------------------------------
// 8. Capacités de production : TOUJOURS fermées, même avec un dossier multi entièrement valide
// ---------------------------------------------------------------------------

describe("MB-MULTI-UX-1 — GENERATION / DELIVERY / PAYMENT / CLOSING / N+1 restent OFF", () => {
  const valid = () => multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]] });

  it("dossier multi COMPLET et dans le domaine : domaine supporté, génération et livraison admissibles (capacités) ; clôture, N+1 bloqués ; paiement et édition fermés", () => {
    const ws = valid();
    assert.equal(resolveMultiPropertyDomainReadiness(ws).status, "supported");
    assert.equal(runDeclarationGenerationFromWorkspace(ws).status, "generated", "le moteur sait générer (domaine OK)…");
    assert.equal(isMultiPropertyGenerationBlocked(ws), false, "…et la capacité de génération est ouverte (MB-MULTI-CAPABILITY-WIRING-1)");
    assert.equal(isMultiPropertyDeliveryBlocked(ws), false, "capacité de livraison ouverte (MB-MULTI-DELIVERY-WIRING-1) : l'entitlement payé reste exigé par les routes");
    assert.equal(isMultiPropertyClosingBlocked(ws), true);
    assert.equal(isMultiPropertyNextYearBlocked(ws), true);
    for (const capability of ["edition", "generation", "delivery", "payment", "closing", "nextYear"] as const) {
      assert.equal(MULTI_PROPERTY_CAPABILITIES[capability], ["edition", "generation", "delivery", "payment"].includes(capability), capability);
    }
  });

  it("le gate de production ne propose ni génération, ni paiement, ni reprise après paiement, même dossier valide et payé", () => {
    const ws = valid();
    for (const paid of [false, true]) {
      const gate = resolveDeclarationGenerationGate({
        draft: ws.declarationDraft, properties: ws.properties, fiscalYear: ws.fiscalYear.year, paid, generated: false,
        workspace: { fiscalYear: ws.fiscalYear, properties: ws.properties, documents: ws.documents, declarationDraft: ws.declarationDraft },
      });
      assert.deepEqual({ g: gate.canGenerate, c: gate.canCheckout, r: gate.canRetryAfterPayment }, { g: false, c: false, r: false }, `paid=${paid}`);
    }
  });

  it("CLOSING STILL OFF / N+1 STILL OFF : refus explicites, même exercice clos avec closure", () => {
    const ws = valid();
    const ready = { ...ws.fiscalYear, status: "ready_to_close" as const, declarationGeneratedAt: T };
    const close = canCloseFiscalYear({ fiscalYear: ready, declarationDraft: ws.declarationDraft, properties: ws.properties });
    assert.equal(close.ok, false);
    const closed = { ...ws.fiscalYear, status: "closed" as const, closures: [{ id: "c" }] } as never;
    const next = canCreateNextFiscalYear(closed, { properties: ws.properties, declarationDraft: ws.declarationDraft });
    assert.equal(next.ok, false);
  });

  it("aucun code de l'UX multi ne référence une capacité ouverte ni ne force un flag (source)", () => {
    for (const file of ["src/components/lmnp/biens/PropertiesManager.tsx", "src/components/lmnp/biens/V3PropertiesSection.tsx", "src/lib/lmnp/dossier/add-property-plan.ts"]) {
      assert.doesNotMatch(source(file), /generation: true|delivery: true|payment: true|closing: true|nextYear: true|edition: true/, file);
    }
    assert.equal(isMultiPropertyCapabilityOpen("edition"), true);
    assert.equal(isMultiPropertyCapabilityOpen("closing"), false);
    assert.equal(isMultiPropertyCapabilityOpen("nextYear"), false);
  });
});
