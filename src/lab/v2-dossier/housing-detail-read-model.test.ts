/**
 * R15.5 — read model Logement structuré et property-scoped (états F010 réels : voir housing-test-support.ts).
 *
 * Run: npx tsx --test src/lab/v2-dossier/housing-detail-read-model.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { remainingF010Fields } from "@/runtime/assistants/f010-logement/assistant";
import { createInitialF010State } from "@/runtime/assistants/f010-logement/types";
import type { V3DocumentsReadModel } from "./document-read-model";
import { buildV3HousingDetail, type V3HousingDetail } from "./housing-detail-read-model";
import {
  HOUSING_YEAR, PROPOSAL, SERVICE_DATE, analysedThenReview, assistantFor, assistantWithoutDate, confirmedState, docRow, handle, manualToReview,
  persistSession, property, stateOf, workspaceOf,
} from "./housing-test-support";

type Known = Extract<V3HousingDetail, { state: "known" }>;
function known(detail: V3HousingDetail): Known {
  assert.equal(detail.state, "known");
  return detail as Known;
}
const fact = (detail: Known, id: string) => detail.facts.find(item => item.id === id);
const plain = (value: string | undefined) => value?.replace(/\s/g, " ");

test("A. aucun document logement, dossier vide : non commencé, toutes les questions F010", () => {
  const detail = known(buildV3HousingDetail(workspaceOf(stateOf()), "home-1"));
  assert.equal(detail.support, "full");
  assert.equal(detail.confirmed, false);
  assert.deepEqual(detail.remaining, remainingF010Fields(createInitialF010State()));
  assert.deepEqual(detail.documents, []);
  assert.equal(detail.serviceDate.status, "absent");
  assert.deepEqual(detail.facts.map(item => item.id), ["address"], "seule l'adresse du bien (Property) existe");
  assert.deepEqual(detail.facts[0]!.origin, { kind: "unknown" });
});

test("B. logement confirmé : valeurs persistées, retenues, plan persisté, aucune question", async () => {
  const state = await confirmedState({ documents: [docRow("doc-acte", "Acte.pdf")] });
  const workspace = workspaceOf(state);
  const before = structuredClone(workspace);
  const detail = known(buildV3HousingDetail(workspace, "home-1"));
  assert.equal(detail.confirmed, true);
  assert.equal(plain(fact(detail, "acquisitionPrice")?.value), "200 000 €");
  assert.equal(plain(fact(detail, "notaryFees")?.value), "15 000 €");
  assert.equal(fact(detail, "surface")?.value, "45 m²");
  assert.equal(fact(detail, "acquisitionDate")?.value, "2025-03-10");
  assert.equal(fact(detail, "propertyType")?.value, "Appartement");
  assert.equal(fact(detail, "feesTreatment")?.value, "Intégrés à la valeur du bien");
  assert.equal(fact(detail, "landShare")?.value, "15 %");
  assert.ok(detail.facts.every(item => item.status === "retained"));
  assert.deepEqual(detail.remaining, []);
  const persisted = state.declarationDraft!.logementAmortissement!;
  assert.deepEqual(detail.computed, {
    prixRevient: persisted.prixRevient, valeurTerrain: persisted.valeurTerrain, valeurBati: persisted.valeurBati,
    baseAmortissableBati: persisted.baseAmortissableBati, dotationAnnuelle: persisted.dotationAnnuelle,
  }, "les montants sont ceux de la sortie F010 persistée, jamais recalculés");
  assert.equal(detail.serviceDate.status, "known");
  assert.deepEqual(workspace, before, "O. aucune mutation");
});

test("C. document analysé, informations manquantes : à confirmer + questions restantes issues du helper F010", async () => {
  const assistant = assistantFor();
  const review = await analysedThenReview(assistant, "doc-acte", { prixAcquisition: 200000, typeBien: "appartement" });
  const state = persistSession(stateOf({ documents: [docRow("doc-acte", "Acte.pdf")], draft: { dateMiseEnService: SERVICE_DATE } }), review, "doc-acte");
  const detail = known(buildV3HousingDetail(workspaceOf(state), "home-1"));
  assert.equal(detail.confirmed, false);
  assert.deepEqual(detail.toConfirm.sort(), ["prixAcquisition", "typeBien"]);
  assert.equal(fact(detail, "acquisitionPrice")?.status, "to_confirm");
  assert.deepEqual(fact(detail, "acquisitionPrice")?.origin, { kind: "extracted" });
  // Fields already proposed by the document are "to confirm", never listed as missing.
  assert.ok(!detail.remaining.includes("prixAcquisition") && !detail.remaining.includes("typeBien"));
  assert.deepEqual(detail.remaining, ["dateAcquisition", "fraisNotaire", "choixTraitementFrais", "montantMobilier", "ratioTerrain"]);
});

test("D. conflit document / saisie : exposé, jamais résolu", async () => {
  const assistant = assistantFor();
  let f010 = assistant.start().state;
  f010 = await handle(assistant, f010, { type: "select_nature", nature: "achat" });
  f010 = await handle(assistant, f010, {
    type: "submit_bien", prixAcquisition: 250000, typeBien: "appartement", dateAcquisition: "2025-03-10",
    fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual" },
  });
  f010 = await handle(assistant, f010, { type: "analysis_success", documentId: "doc-acte", proposal: PROPOSAL });
  const state = persistSession(stateOf({ documents: [docRow("doc-acte", "Acte.pdf")], draft: { dateMiseEnService: SERVICE_DATE } }), f010, "doc-acte");
  const detail = known(buildV3HousingDetail(workspaceOf(state), "home-1"));
  const conflict = detail.decisions.find(item => item.kind === "review_conflict" && item.field === "prixAcquisition");
  assert.ok(conflict && conflict.kind === "review_conflict");
  assert.equal(plain(conflict.currentValue), "250 000 €");
  assert.equal(plain(conflict.proposedValue), "200 000 €");
  assert.equal(plain(fact(detail, "acquisitionPrice")?.value), "250 000 €", "la valeur retenue n'est pas remplacée silencieusement");
  assert.ok(!detail.toConfirm.includes("prixAcquisition"), "un conflit n'est pas aussi listé « à confirmer »");
});

test("E. date globale disponible, amortissementBase vide : date connue depuis le draft en mono-bien", async () => {
  const detail = known(buildV3HousingDetail(workspaceOf(await confirmedState()), "home-1"));
  assert.equal(detail.serviceDate.status, "known");
  assert.equal(detail.serviceDate.status === "known" && detail.serviceDate.value, SERVICE_DATE);
});

test("F. divergence draft / base : conflit exposé, aucune date retenue", async () => {
  const state = await confirmedState({ properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] });
  const detail = known(buildV3HousingDetail(workspaceOf(state), "home-1"));
  assert.equal(detail.serviceDate.status, "conflict");
  const decision = detail.decisions.find(item => item.kind === "service_date_conflict");
  assert.deepEqual(decision && decision.kind === "service_date_conflict" && decision.candidates.map(item => item.value).sort(), ["2024-05-02", SERVICE_DATE].sort());
});

test("G. reprise comptable validée : projection en lecture seule, actifs attribués au bien seulement", async () => {
  const opening: FiscalYearOpening = {
    openingId: "o1", revision: 1, targetFiscalYear: HOUSING_YEAR, dossierId: "dossier-1",
    source: { kind: "external_takeover", takeoverId: "t1", sourceFiscalYear: HOUSING_YEAR - 1 },
    stocks: { deficits: unavailable(), amortissementsReportes: unavailable() },
    assets: available([
      { id: "a1", propertyId: "home-1", label: "Bâti", categorie: "batiment", coutBrut: available(100), cumulOuverture: available(10), plan: unavailable() },
      { id: "a2", label: "Sans bien", categorie: "batiment", coutBrut: available(1), cumulOuverture: available(0), plan: unavailable() },
    ] as never),
    loans: unavailable(), patrimoine: { ouvertureCompteExploitant: unavailable(), ran: unavailable(), tresorerieOuverture: unavailable() },
    properties: unavailable(), identity: unavailable(), provenance: {},
    validation: { status: "validated", openingRevision: 1, contentHash: "h", validatedAt: "2026-01-01", validator: "test" },
  };
  const state = stateOf({ fiscalYear: {
    priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: "2026-01-01" },
    externalTakeoverOpening: { sourceRef: "t1", opening },
  } });
  const workspace = workspaceOf(state);
  const before = structuredClone(workspace);
  const detail = known(buildV3HousingDetail(workspace, "home-1"));
  assert.deepEqual(detail.entry, { kind: "takeover", openingAssets: { attributed: 1, unattributed: 1 } });
  assert.deepEqual(workspace, before);
  // Declared but not validated: never "takeover".
  const pending = known(buildV3HousingDetail(workspaceOf(stateOf({ fiscalYear: { priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: "x" } } })), "home-1"));
  assert.deepEqual(pending.entry, { kind: "undetermined", reason: "takeover_declared_not_validated" });
});

test("situation d'entrée : première déclaration, suite, non déterminée", () => {
  const first = known(buildV3HousingDetail(workspaceOf(stateOf({ fiscalYear: { priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: "x" } } })), "home-1"));
  assert.deepEqual(first.entry, { kind: "first_declaration" });
  const none = known(buildV3HousingDetail(workspaceOf(stateOf()), "home-1"));
  assert.deepEqual(none.entry, { kind: "undetermined", reason: "answer_required" });
});

test("H/I/J/K. propertyId absent, inconnu, hors exercice, ambigu : scope_unresolved, aucune donnée", () => {
  const ws = workspaceOf(stateOf());
  assert.deepEqual(buildV3HousingDetail(ws, undefined), { state: "scope_unresolved", reason: "no_property_id", year: HOUSING_YEAR });
  assert.deepEqual(buildV3HousingDetail(ws, null), { state: "scope_unresolved", reason: "no_property_id", year: HOUSING_YEAR });
  assert.deepEqual(buildV3HousingDetail(ws, "  "), { state: "scope_unresolved", reason: "no_property_id", year: HOUSING_YEAR });
  assert.deepEqual(buildV3HousingDetail(ws, "ghost"), { state: "scope_unresolved", reason: "unknown_property", year: HOUSING_YEAR });
  const outside = workspaceOf(stateOf({ properties: [property("home-1"), property("home-2")], propertyIds: ["home-1"] }));
  assert.equal((buildV3HousingDetail(outside, "home-2") as { reason: string }).reason, "not_in_fiscal_year");
  const duplicate = workspaceOf(stateOf({ properties: [property("home-1"), property("home-1")], propertyIds: ["home-1"] }));
  assert.equal((buildV3HousingDetail(duplicate, "home-1") as { reason: string }).reason, "ambiguous");
  const empty = workspaceOf(stateOf({ properties: [], propertyIds: [] }));
  assert.equal((buildV3HousingDetail(empty, "home-1") as { reason: string }).reason, "no_property");
});

test("aucun repli sur le premier bien : le bien demandé est le seul lu", async () => {
  const two = stateOf({ properties: [property("A", { address: "Adresse A" }), property("B", { address: "Adresse B" })] });
  const detail = known(buildV3HousingDetail(workspaceOf(two), "B"));
  assert.equal(detail.propertyId, "B");
  assert.equal(fact(detail, "address")?.value, "Adresse B");
});

test("L. multi-biens : facts_only, aucune sortie F010 globale attribuée, entrée non déterminée", async () => {
  const single = await confirmedState();
  const multi = stateOf({
    properties: [property("home-1", { address: "Adresse A", propertyType: "appartement", surface: 30 }), property("home-2")],
    draft: single.declarationDraft,
  });
  const detail = known(buildV3HousingDetail(workspaceOf(multi), "home-1"));
  assert.equal(detail.support, "facts_only");
  assert.equal(detail.confirmed, false);
  assert.equal(detail.computed, undefined);
  assert.deepEqual(detail.facts.map(item => item.id).sort(), ["address", "propertyType", "surface"]);
  assert.ok(detail.facts.every(item => item.origin.kind === "unknown"));
  assert.deepEqual([detail.remaining, detail.toConfirm, detail.documents], [[], [], []]);
  assert.deepEqual(detail.entry, { kind: "undetermined", reason: "not_attributable_to_property" });
  // The global draft date is not attributed to either property.
  assert.equal(detail.serviceDate.status, "absent");
});

test("M. provenance : Extrait / Saisi / Corrigé / Estimé / jugement selon les vraies clés fieldSources", async () => {
  const assistant = assistantFor();
  let f010 = await analysedThenReview(assistant);
  f010 = await handle(assistant, f010, { type: "confirm_extracted_field", field: "prixAcquisition" });
  f010 = await handle(assistant, f010, { type: "correct_extracted_field", field: "surface", value: "50" });
  const state = persistSession(stateOf({ documents: [docRow("doc-acte", "Acte.pdf")] }), f010, "doc-acte");
  const detail = known(buildV3HousingDetail(workspaceOf(state), "home-1"));
  assert.deepEqual(fact(detail, "acquisitionPrice")?.origin, { kind: "extracted" });
  assert.deepEqual(fact(detail, "surface")?.origin, { kind: "user_correction" });
  const manual = known(buildV3HousingDetail(workspaceOf(await confirmedState()), "home-1"));
  assert.deepEqual(fact(manual, "acquisitionDate")?.origin, { kind: "manual" });
  assert.deepEqual(fact(manual, "landShare")?.origin, { kind: "judgment" }, "ratio terrain : choix de jugement par défaut");
});

test("N. documents : seul un document réellement résolu apparaît, avec son état réel ; aucun lien champ → document", async () => {
  const review = await analysedThenReview(assistantFor(), "doc-acte");
  const withDoc = persistSession(stateOf({ documents: [docRow("doc-acte", "Acte.pdf")], draft: { dateMiseEnService: SERVICE_DATE } }), review, "doc-acte");
  const documents: V3DocumentsReadModel = { state: "known", documents: [{ id: "doc-acte", label: "Acte", fileName: "Acte.pdf", processingStatus: "processing" }] };
  assert.deepEqual(known(buildV3HousingDetail(workspaceOf(withDoc), "home-1", documents)).documents, [{ id: "doc-acte", label: "Acte.pdf", status: "processing" }]);
  assert.equal(known(buildV3HousingDetail(workspaceOf(withDoc), "home-1")).documents[0]?.status, "unknown", "sans lecture documentaire fiable : état non déterminé");
  const missing = persistSession(stateOf({ documents: [] }), review, "doc-acte");
  assert.deepEqual(known(buildV3HousingDetail(workspaceOf(missing), "home-1")).documents, [], "document inexistant : rien de fabriqué");
  assert.ok(known(buildV3HousingDetail(workspaceOf(withDoc), "home-1")).facts.every(item => !("document" in item.origin)));
});

test("blocage réel F010 : plan à valider ou en attente de la date, tel que la session le dit", async () => {
  const assistant = assistantWithoutDate();
  const blocked = await manualToReview(assistant);
  assert.equal(blocked.step, "blocked_missing_date");
  const detail = known(buildV3HousingDetail(workspaceOf(persistSession(stateOf(), blocked)), "home-1"));
  assert.equal(detail.f010Step, "blocked_missing_date");
  assert.equal(detail.serviceDate.status, "absent");
  assert.deepEqual(detail.remaining, []);
});

test("aucun champ inexistant : ni surface inventée, ni valeur sans source dans les faits", async () => {
  const detail = known(buildV3HousingDetail(workspaceOf(await confirmedState()), "home-1"));
  assert.ok(detail.facts.every(item => item.value.length > 0));
  assert.doesNotMatch(detail.facts.map(item => item.label).join("|"), /APE|NAF|TVA/i);
});
