/**
 * R15.3 — read model Activité structuré (états F009 réels : voir activity-test-support.ts).
 *
 * Run: npx tsx --test src/lab/v2-dossier/activity-detail-read-model.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import { remainingQuestions, restoreF009 } from "@/runtime/assistants/f009-activite/assistant";
import { buildV3ActivityDetail, type V3ActivityDetail } from "./activity-detail-read-model";
import type { V3DocumentsReadModel } from "./document-read-model";
import { NOW, analysedInProgress, confirmedState, docRow, handle, persisted, projection, workspaceOf } from "./activity-test-support";

const byId = (detail: V3ActivityDetail, id: string) => detail.facts.find(fact => fact.id === id);

test("1. dossier Activité confirmé : données persistées, état retenu, aucune question restante", async () => {
  const state = await confirmedState();
  const draft = persisted(state, true, { inpiDocumentId: "doc-inpi" });
  const workspace = workspaceOf(draft, [docRow("doc-inpi", "Extrait RNE.pdf")], { regimeConfirmedAt: NOW });
  const before = structuredClone(workspace);
  const detail = buildV3ActivityDetail(workspace);
  assert.equal(detail.state, "known");
  assert.equal(detail.confirmed, true);
  assert.equal(byId(detail, "siret")?.value, "80890035100020");
  assert.equal(byId(detail, "siren")?.value, "808900351");
  assert.equal(byId(detail, "identity")?.value, `${draft.exploitantFirstName} ${draft.exploitantLastName}`);
  assert.equal(byId(detail, "regime")?.value, "Réel");
  assert.ok(detail.facts.every(fact => fact.status === "retained"), "après confirmation : retenu");
  assert.deepEqual(detail.remaining, []);
  assert.deepEqual(detail.decisions, []);
  assert.deepEqual(workspace, before, "aucune mutation");
});

test("2/3. dossier en cours : les valeurs intermédiaires sont visibles et « à confirmer », jamais retenues", async () => {
  const state = await analysedInProgress();
  const workspace = workspaceOf(persisted(state, false, { inpiDocumentId: "doc-inpi" }), [docRow("doc-inpi", "Extrait RNE.pdf")]);
  assert.equal(workspace.declarationDraft?.siret, undefined, "rien n'est encore persisté comme donnée métier");
  const detail = buildV3ActivityDetail(workspace);
  assert.equal(detail.confirmed, false);
  assert.equal(byId(detail, "siret")?.value, "80890035100020", "valeur connue de l'assistant, visible avant confirmation");
  assert.ok(byId(detail, "identity"));
  assert.ok(detail.facts.length > 0);
  assert.ok(detail.facts.every(fact => fact.status === "to_confirm"));
  assert.equal(byId(detail, "regime"), undefined, "le régime n'est pas confirmé");
});

test("4. date de mise en service : saisie utilisateur, jamais extraite", async () => {
  let state = await analysedInProgress();
  state = await handle(state, { type: "review_all" });
  state = await handle(state, { type: "answer", values: { date: "2025-06-01" } });
  const inProgress = buildV3ActivityDetail(workspaceOf(persisted(state, false, { inpiDocumentId: "doc-inpi" }), [docRow("doc-inpi", "Extrait RNE.pdf")]));
  assert.equal(byId(inProgress, "serviceDate")?.value, "01/06/2025");
  assert.deepEqual(byId(inProgress, "serviceDate")?.origin, { kind: "manual" });
  const done = buildV3ActivityDetail(workspaceOf(persisted(await confirmedState(), true, { inpiDocumentId: "doc-inpi" }), [docRow("doc-inpi", "Extrait RNE.pdf")]));
  assert.deepEqual(byId(done, "serviceDate")?.origin, { kind: "manual" });
  assert.notEqual(byId(done, "serviceDate")?.origin.kind, "extracted");
});

test("5. provenance inconnue : aucune provenance ni documentId inventés", () => {
  const draft: DeclarationDraft = {
    completedSteps: [], siret: "80890035100020", siren: "808900351", exploitantLastName: "Dupont", exploitantFirstName: "Marie",
    establishmentAddress: "1 rue Test", establishmentCity: "Paris", establishmentPostalCode: "75001",
    activityStartDate: "2024-01-01", inpiConfirmedAt: NOW,
  };
  // A document exists in the dossier, but nothing proves any field comes from it.
  const detail = buildV3ActivityDetail(workspaceOf(draft, [docRow("doc-x", "Kbis.pdf")]));
  for (const id of ["identity", "siren", "siret", "startDate", "address"]) {
    assert.deepEqual(byId(detail, id)?.origin, { kind: "unknown" }, id);
  }
  assert.deepEqual(detail.documents, [], "pas de inpiDocumentId : aucun document « utilisé »");
});

test("5b. provenance persistée démontrable (extrait INPI) reprise ; sans document résolu, aucun document n'est fabriqué", () => {
  const draft: DeclarationDraft = {
    completedSteps: [], siren: "808900351", exploitantLastName: "Dupont", exploitantFirstName: "Marie", establishmentAddress: "1 rue Test",
    inpiDocumentId: "doc-absent", inpiConfirmedAt: NOW,
    activiteFieldProvenance: { siren: { status: "extracted", origin: "inpi_document", fieldSource: "extracted" } },
  };
  const detail = buildV3ActivityDetail(workspaceOf(draft, []));
  assert.deepEqual(byId(detail, "siren")?.origin, { kind: "extracted" });
  assert.deepEqual(detail.documents, [], "inpiDocumentId qui ne résout aucun document : rien affiché");
});

test("6. document INPI réellement associé : lié au document du dossier, avec son état d'analyse réel", async () => {
  const state = await analysedInProgress();
  const workspace = workspaceOf(persisted(state, false, { inpiDocumentId: "doc-inpi" }), [docRow("doc-inpi", "Extrait RNE.pdf")]);
  const documents: V3DocumentsReadModel = { state: "known", documents: [{ id: "doc-inpi", label: "Extrait RNE", fileName: "Extrait RNE.pdf", processingStatus: "processing" }] };
  const detail = buildV3ActivityDetail(workspace, documents);
  assert.deepEqual(detail.documents, [{ id: "doc-inpi", label: "Extrait RNE.pdf", status: "processing" }]);
  assert.deepEqual(byId(detail, "siret")?.origin, { kind: "extracted", document: { id: "doc-inpi", label: "Extrait RNE.pdf" } });
  assert.equal(buildV3ActivityDetail(workspace).documents[0]?.status, "unknown", "sans lecture documentaire fiable : état non déterminé");
});

test("7. absence de document : aucune pièce, aucune provenance documentaire", () => {
  const detail = buildV3ActivityDetail(workspaceOf({ completedSteps: [], exploitantLastName: "Dupont", exploitantFirstName: "Marie" }));
  assert.deepEqual(detail.documents, []);
  assert.ok(detail.facts.every(fact => fact.origin.kind !== "extracted"));
});

test("8/10. questions restantes = helper F009 ; aucune quand tout est renseigné", async () => {
  const state = await analysedInProgress();
  const draft = persisted(state, false, { inpiDocumentId: "doc-inpi" });
  const detail = buildV3ActivityDetail(workspaceOf(draft, [docRow("doc-inpi", "Extrait RNE.pdf")]));
  assert.deepEqual(detail.remaining, remainingQuestions(restoreF009(draft)));
  assert.ok(detail.remaining.includes("service_date"));
  assert.deepEqual(buildV3ActivityDetail(workspaceOf(persisted(await confirmedState(), true))).remaining, []);
  const empty = buildV3ActivityDetail(workspaceOf(undefined));
  assert.deepEqual(empty.remaining, ["identifier", "identity", "address", "activity_date", "service_date"]);
  assert.deepEqual(empty.facts, []);
});

test("9. conflit en attente : exposé tel quel, jamais résolu", async () => {
  const confirmed = await confirmedState();
  const other = projection();
  other.siret = "80890035100038";
  other.siretCandidates = [];
  const conflicted = await handle({ ...confirmed, step: "review", history: [] }, { type: "analysis_success", projection: other });
  assert.ok(conflicted.conflicts?.siret, "le conflit existe dans F009");
  const detail = buildV3ActivityDetail(workspaceOf(persisted(conflicted, false, { inpiDocumentId: "doc-inpi" }), [docRow("doc-inpi", "Extrait RNE.pdf")]));
  const conflict = detail.decisions.find(decision => decision.kind === "conflict" && decision.field === "siret");
  assert.deepEqual(conflict, { kind: "conflict", field: "siret", label: "SIRET", confirmedValue: "80890035100020", newValue: "80890035100038" });
  assert.equal(byId(detail, "siret")?.value, "80890035100020", "la valeur retenue n'est pas remplacée silencieusement");
});

test("11. multi-biens : l'activité reste lisible au niveau activité (jamais par bien, jamais bloquée)", async () => {
  const workspace = workspaceOf(persisted(await confirmedState(), true));
  workspace.properties.push({ id: "home-2", label: "Autre", address: "2 rue Y", city: "Lyon", postalCode: "69001" });
  const detail = buildV3ActivityDetail(workspace);
  assert.equal(detail.state, "known");
  assert.deepEqual(detail, buildV3ActivityDetail({ ...workspace, properties: workspace.properties.slice(0, 1), fiscalYear: { ...workspace.fiscalYear, propertyIds: workspace.fiscalYear.propertyIds.slice(0, 1) } }), "identique au mono : F009 ne dépend d'aucun bien");
});

test("14. anciens dossiers compatibles : draft sans état d'assistant, sans provenance, sans mise en service", () => {
  const legacy: DeclarationDraft = { completedSteps: [], siret: "80890035100020", exploitantLastName: "Dupont", exploitantFirstName: "Marie", activityStartDate: "2024-01-01", inpiConfirmedAt: NOW };
  const detail = buildV3ActivityDetail(workspaceOf(legacy));
  assert.equal(detail.confirmed, true);
  assert.equal(byId(detail, "siret")?.status, "retained");
  assert.equal(byId(detail, "serviceDate"), undefined, "absente : aucune ligne inventée");
  assert.ok(detail.remaining.includes("service_date") && detail.remaining.includes("address"));
  assert.doesNotThrow(() => buildV3ActivityDetail(workspaceOf(undefined)));
});

test("aucun champ inexistant : ni APE/NAF, ni TVA, ni forme juridique", async () => {
  const detail = buildV3ActivityDetail(workspaceOf(persisted(await confirmedState(), true), [], { regimeConfirmedAt: NOW }));
  const labels = [...detail.facts, ...detail.additional].map(item => item.label).join("|");
  assert.doesNotMatch(labels, /APE|NAF|TVA|forme juridique/i);
});
