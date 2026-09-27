import assert from "node:assert/strict";
import test from "node:test";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { buildV3DossierDetailReadModel, resolveV3Activity } from "./read-model";

function workspace(): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "year-2026", year: 2026, status: "draft", regime: "reel",
      propertyIds: ["home-1"], createdAt: "2026-01-01", updatedAt: "2026-01-01",
    },
    properties: [{ id: "home-1", label: "Logement test", address: "1 rue Test", city: "Lyon", postalCode: "69001" }],
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}

function fact(data: ReturnType<typeof buildV3DossierDetailReadModel>, id: string) {
  return data.activity.facts.find(item => item.id === id);
}

test("A — activité complète : valeurs canoniques et statut du profil existant", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [], exploitantFirstName: "Marie", exploitantLastName: "Durand",
    activityType: "LMNP", siren: "123456789", siret: "12345678900011",
    activityStartDate: "2024-02-01", inpiConfirmedAt: "2026-02-10T10:00:00Z",
  };
  input.fiscalYear.regimeConfirmedAt = "2026-02-10T10:00:00Z";
  const before = structuredClone(input);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.activity.status, "complete");
  assert.equal(model.activity.owner, "F009");
  assert.deepEqual(model.activity.facts.map(item => item.value),
    ["Marie Durand", "LMNP", "123456789", "12345678900011", "Réel", "2024-02-01"]);
  assert.deepEqual(input, before);
});

test("B — activité partielle : aucune valeur par défaut n'est présentée comme confirmée", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], activityType: "LMNP", siren: "987654321" };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.activity.status, "incomplete");
  assert.equal(fact(model, "activityType")?.value, "LMNP");
  assert.equal(fact(model, "siren")?.value, "987654321");
  assert.equal(fact(model, "siret")?.value, null);
  assert.equal(fact(model, "regime")?.value, null);
  assert.ok(model.activity.missing.includes("SIRET"));
  assert.equal(JSON.stringify(model).includes("Antoine Martin"), false);
});

test("C — document F009 connu sans page ni extrait : provenance partielle", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], siren: "123456789", inpiDocumentId: "doc-inpi" };
  input.documents = [{
    id: "doc-inpi", fiscalYearId: input.fiscalYear.id, fileName: "Extrait INPI réel.pdf",
    mimeType: "application/pdf", sizeBytes: 100, category: "autre", documentType: "unknown",
    status: "analyzed", uploadedAt: "2026-01-01",
  }];
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.activity.provenance, "partial");
  assert.deepEqual(model.activity.sources, [{ id: "doc-inpi", label: "Extrait INPI réel.pdf" }]);
  assert.equal(fact(model, "siren")?.evidence, undefined);
  assert.equal("page" in model.activity.sources[0], false);
});

test("C — extrait et confiance F009 existants sont transmis sans enrichissement fictif", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [], siren: "123456789",
    activiteFieldProvenance: { siren: {
      status: "extracted", origin: "inpi_document", fieldSource: "extracted",
      evidence: "SIREN : 123 456 789", confidence: 0.91,
    } },
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(fact(model, "siren")?.evidence, "SIREN : 123 456 789");
  assert.equal(fact(model, "siren")?.confidence, 0.91);
  assert.equal(model.activity.provenance, "partial");
  assert.deepEqual(model.activity.sources, []);
});

test("D/E — absence réelle et séparation explicite demo / real", () => {
  const input = workspace();
  input.declarationDraft = undefined;
  assert.equal(resolveV3Activity({ mode: "demo" }), undefined);
  const activity = resolveV3Activity({ mode: "real", workspace: input });
  assert.equal(activity?.status, "incomplete");
  assert.ok(activity?.facts.every(item => item.value === null));
  assert.deepEqual(activity?.sources, []);
  assert.equal(JSON.stringify(activity).includes("Antoine Martin"), false);
  assert.equal(JSON.stringify(activity).includes("Extrait d’activité.pdf"), false);
});

test("une proposition sans valeur retenue ne devient pas une preuve affichée", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], activiteFieldProvenance: { siren: {
    status: "proposed", origin: "inpi_document", evidence: "SIREN : 123456789", confidence: 0.7,
  } } };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(fact(model, "siren")?.value, null);
  assert.equal(fact(model, "siren")?.evidence, undefined);
});

test("G — multi-biens : état explicite et aucune projection partielle", () => {
  const input = workspace();
  input.fiscalYear.propertyIds.push("home-2");
  input.declarationDraft = { completedSteps: [], siren: "123456789", inpiConfirmedAt: "2026-02-10" };
  const activity = buildV3DossierDetailReadModel(input).activity;
  assert.equal(activity.status, "unsupported");
  assert.ok(activity.facts.every(item => item.value === null));
  assert.deepEqual(activity.sources, []);
  assert.match(activity.summary, /multi-biens/);
});
