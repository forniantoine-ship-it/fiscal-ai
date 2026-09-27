import assert from "node:assert/strict";
import test from "node:test";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { LogementAmortissementOutput } from "@/lib/lmnp/types/domain";
import { buildV3DossierDetailReadModel, resolveV3Activity, resolveV3Property } from "./read-model";

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

function propertyFact(data: ReturnType<typeof buildV3DossierDetailReadModel>, id: string) {
  return data.property.facts.find(item => item.id === id);
}

function money(value: number) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} €`;
}

function logementOutput(overrides: Partial<LogementAmortissementOutput> = {}): LogementAmortissementOutput {
  return {
    exerciceFiscal: 2026, prixRevient: 200000, valeurTerrain: 40000, valeurBati: 160000,
    baseAmortissableBati: 160000, montantMobilier: 5000, dotationAnnuelle: 6000,
    dureeMoyenneAnnees: 27, prorataRatio: 1,
    plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
    fieldSources: {}, computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
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

test("Property A — logement complet : valeurs canoniques et statut de l'assistant F010", () => {
  const input = workspace();
  input.properties[0] = {
    ...input.properties[0], propertyType: "appartement", acquisitionDate: "2024-03-15",
    amortissementBase: {
      valeurTerrain: 40000, montantMobilier: 5000, dateMiseEnService: "2024-06-01",
      composants: [{ label: "Bâti", montant: 160000, dureeAnnees: 27 }],
    },
  };
  input.declarationDraft = { completedSteps: [], logementAmortissement: logementOutput({ fieldSources: { prixRevient: "extracted" } }) };
  const before = structuredClone(input);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.property.status, "complete");
  assert.equal(model.property.owner, "F010");
  assert.equal(propertyFact(model, "address")?.value, "1 rue Test, 69001 Lyon");
  assert.equal(propertyFact(model, "propertyType")?.value, "Appartement");
  assert.equal(propertyFact(model, "acquisitionDate")?.value, "2024-03-15");
  assert.equal(propertyFact(model, "prixRevient")?.value, money(200000));
  assert.equal(propertyFact(model, "prixRevient")?.evidence, "Extrait");
  assert.equal(propertyFact(model, "dateMiseEnService")?.value, "2024-06-01");
  assert.equal(propertyFact(model, "valeurTerrain")?.value, money(40000));
  assert.equal(propertyFact(model, "montantMobilier")?.value, money(5000));
  assert.ok(model.property.facts.some(f => f.id === "composant-0" && f.value === `${money(160000)} · 27 ans`));
  assert.deepEqual(input, before);
});

test("Property B — logement partiel : aucune valeur par défaut n'est présentée comme confirmée", () => {
  const input = workspace();
  input.properties[0] = { ...input.properties[0], acquisitionDate: "2024-03-15" };
  input.declarationDraft = { completedSteps: [] };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.property.status, "incomplete");
  assert.equal(propertyFact(model, "acquisitionDate")?.value, "2024-03-15");
  assert.equal(propertyFact(model, "prixRevient")?.value, null);
  assert.equal(propertyFact(model, "dateMiseEnService")?.value, null);
  assert.ok(model.property.missing.includes("Prix de revient (F010)"));
  assert.equal(model.property.facts.some(f => f.id === "valeurTerrain"), false);
});

test("Property C — acquisitionDate et dateMiseEnService restent deux dates distinctes", () => {
  const input = workspace();
  input.properties[0] = {
    ...input.properties[0], acquisitionDate: "2024-03-15",
    amortissementBase: { valeurTerrain: 40000, montantMobilier: 5000, dateMiseEnService: "2024-09-01", composants: [] },
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(propertyFact(model, "acquisitionDate")?.value, "2024-03-15");
  assert.equal(propertyFact(model, "dateMiseEnService")?.value, "2024-09-01");
  assert.notEqual(propertyFact(model, "acquisitionDate")?.value, propertyFact(model, "dateMiseEnService")?.value);
});

test("Property D — provenance : document notarié connu, puis absence de maillons non prouvés", () => {
  const input = workspace();
  input.properties[0] = { ...input.properties[0], notaryDocumentId: "doc-notary" };
  input.documents = [{
    id: "doc-notary", fiscalYearId: input.fiscalYear.id, fileName: "Acte réel.pdf",
    mimeType: "application/pdf", sizeBytes: 100, category: "autre", documentType: "unknown",
    status: "analyzed", uploadedAt: "2026-01-01",
  }];
  input.declarationDraft = { completedSteps: [], logementAmortissement: logementOutput({ fieldSources: {} }) };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.property.provenance, "partial");
  assert.deepEqual(model.property.sources, [{ id: "doc-notary", label: "Acte réel.pdf" }]);
  assert.equal(propertyFact(model, "prixRevient")?.evidence, undefined);
});

test("Property E — REAL sans données F010 confirmées : aucune fixture logement ne fuit", () => {
  const input = workspace();
  input.declarationDraft = undefined;
  assert.equal(resolveV3Property({ mode: "demo" }), undefined);
  const property = resolveV3Property({ mode: "real", workspace: input });
  assert.equal(property?.status, "incomplete");
  // Real Property identity fields (from the workspace fixture) are honestly shown...
  assert.equal(property?.facts.find(f => f.id === "address")?.value, "1 rue Test, 69001 Lyon");
  // ...while every F010-confirmed fact, absent from this workspace, stays null — never a fallback.
  assert.equal(property?.facts.find(f => f.id === "prixRevient")?.value, null);
  assert.equal(property?.facts.find(f => f.id === "fraisEnCharges")?.value, null);
  assert.equal(property?.facts.find(f => f.id === "dateMiseEnService")?.value, null);
  assert.equal(property?.facts.some(f => f.id === "valeurTerrain"), false);
  assert.deepEqual(property?.sources, []);
  const serialized = JSON.stringify(property);
  assert.equal(serialized.includes("Bordeaux"), false);
  assert.equal(serialized.includes("15 septembre 2025"), false);
  assert.equal(serialized.includes("Acte d’acquisition"), false);
});

test("Property F — zéro bien : pas de crash, aucun logement inventé", () => {
  const input = workspace();
  input.properties = [];
  input.fiscalYear.propertyIds = [];
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.property.status, "incomplete");
  assert.ok(model.property.facts.every(item => item.value === null));
  assert.deepEqual(model.property.sources, []);
  assert.match(model.property.summary, /Aucun logement/);
});

test("Property G — multi-biens : jamais le premier bien choisi silencieusement", () => {
  const input = workspace();
  input.properties.push({ id: "home-2", label: "Second bien", address: "2 rue Test", city: "Lyon", postalCode: "69002" });
  input.fiscalYear.propertyIds.push("home-2");
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.property.status, "unsupported");
  assert.ok(model.property.facts.every(item => item.value === null));
  assert.deepEqual(model.property.sources, []);
  assert.match(model.property.summary, /multi-biens/);
});

test("Property — l'output F010 d'un exercice différent n'est pas utilisé (year-safety)", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], logementAmortissement: logementOutput({ exerciceFiscal: 2025 }) };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(propertyFact(model, "prixRevient")?.value, null);
  assert.equal(model.property.status, "incomplete");
});
