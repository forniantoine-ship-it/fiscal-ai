import assert from "node:assert/strict";
import test from "node:test";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, ValidationItem } from "@/lib/lmnp/types";
import { buildDossierSteps, type DossierStepId } from "@/lib/lmnp/services/validation-profile";
import { buildV3UserActionReadModel } from "./user-action-read-model";

function workspace(): PersistedWorkspace {
  return {
    fiscalYear: { id: "year-2025", year: 2025, status: "draft", regime: "reel", propertyIds: ["home-1"], createdAt: "2025-01-01", updatedAt: "2025-01-01" },
    properties: [{ id: "home-1", label: "Bien", address: "Adresse", city: "Paris", postalCode: "75001" }],
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}

function completeDraft(): DeclarationDraft {
  return {
    completedSteps: [], inpiConfirmedAt: "2025-01-01",
    logementAmortissement: { exerciceFiscal: 2025 } as DeclarationDraft["logementAmortissement"],
    creditDeclaredNoneAt: "2025-01-01",
    revenusConfirmedAt: "2025-01-01",
    revenusAssistant: { exerciceFiscal: 2025 } as DeclarationDraft["revenusAssistant"],
    chargesAssistant: { exerciceFiscal: 2025 } as DeclarationDraft["chargesAssistant"],
    amortissementAssistant: { exerciceFiscal: 2025, status: "validated" } as DeclarationDraft["amortissementAssistant"],
  };
}

function pending(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    id: "validation-1", fiscalYearId: "year-2025", propertyId: "home-1",
    fieldKey: "property.address", label: "Adresse du bien", proposedValue: "Adresse",
    status: "pending", isRequired: true, extractionIds: [], confidence: 80,
    createdAt: "2025-01-01", updatedAt: "2025-01-01", ...overrides,
  };
}

function expectOnly(workspaceValue: PersistedWorkspace, domain: DossierStepId, label: string) {
  const result = buildV3UserActionReadModel(workspaceValue);
  assert.equal(result.state, "known");
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].domain, domain);
  assert.equal(result.actions[0].label, label);
  assert.ok(result.actions[0].href.startsWith("/"));
}

test("A/B — une seule reprise générique, même lorsque les six étapes manquent", () => {
  const value = workspace();
  expectOnly(value, "activite", "Reprendre l’activité");
  const onlyActivity = completeDraft();
  onlyActivity.inpiConfirmedAt = undefined;
  value.declarationDraft = onlyActivity;
  expectOnly(value, "activite", "Reprendre l’activité");
});

test("C/D — la première étape incomplète suit l’ordre de présentation", () => {
  const value = workspace();
  value.declarationDraft = completeDraft();
  value.declarationDraft.logementAmortissement = undefined;
  expectOnly(value, "logement", "Reprendre le logement");
  value.declarationDraft.logementAmortissement = completeDraft().logementAmortissement;
  value.declarationDraft.chargesAssistant = undefined;
  value.declarationDraft.amortissementAssistant = undefined;
  assert.deepEqual(buildDossierSteps(value.declarationDraft, 2025).filter(step => step.status === "incomplete").map(step => step.id), ["amortissement", "charges"]);
  expectOnly(value, "charges", "Reprendre les dépenses");
});

test("E/F — F014 attend les domaines précédents et un contested durable est formulé prudemment", () => {
  const value = workspace();
  expectOnly(value, "activite", "Reprendre l’activité");
  value.declarationDraft = completeDraft();
  value.declarationDraft.amortissementAssistant = undefined;
  expectOnly(value, "amortissement", "Vérifier les amortissements");
  value.declarationDraft.amortissementAssistant = { ...completeDraft().amortissementAssistant!, status: "contested" };
  expectOnly(value, "amortissement", "Revoir le plan d’amortissement");
});

test("G/J — une validation précise du domaine courant remplace la reprise, deux signaux sont dédupliqués", () => {
  const value = workspace();
  value.declarationDraft = completeDraft();
  value.declarationDraft.logementAmortissement = undefined;
  value.validationItems = [pending(), pending({ id: "validation-2", fieldKey: "property.label", label: "Nom du bien" })];
  const result = buildV3UserActionReadModel(value);
  assert.deepEqual(result.actions, [{ id: "validation-1", domain: "logement", label: "Confirmer : Adresse du bien", href: "/documents?step=validation" }]);
});

test("H/I — validations d’un autre exercice ou bien ignorées", () => {
  const value = workspace();
  value.validationItems = [pending({ fiscalYearId: "year-2024" }), pending({ id: "other-property", propertyId: "home-2" })];
  expectOnly(value, "activite", "Reprendre l’activité");
});

test("une confirmation d’un autre domaine reste visible sans ajouter d’autres reprises génériques", () => {
  const value = workspace();
  value.validationItems = [pending({ fieldKey: "expense.propertyTax", label: "Taxe foncière" })];
  const result = buildV3UserActionReadModel(value);
  assert.deepEqual(result.actions.map(action => action.domain), ["activite", "charges"]);
  assert.equal(result.actions.filter(action => action.id === "activite").length, 1);
});

test("K/L/N — zéro action connu, périmètre inconnu et multi-biens sont distincts", () => {
  const value = workspace();
  value.declarationDraft = completeDraft();
  assert.deepEqual(buildV3UserActionReadModel(value), { state: "known", actions: [] });
  value.fiscalYear.propertyIds = ["home-2"];
  assert.deepEqual(buildV3UserActionReadModel(value), { state: "unknown", actions: [] });
  value.fiscalYear.propertyIds = ["home-1", "home-2"];
  assert.deepEqual(buildV3UserActionReadModel(value), { state: "unknown", actions: [] });
  value.fiscalYear.propertyIds = ["home-1"];
  value.validationItems = [pending({ fieldKey: "unknown.field" as ValidationItem["fieldKey"] })];
  assert.deepEqual(buildV3UserActionReadModel(value), { state: "unknown", actions: [] });
});

test("M/T — un résultat fiscal périmé ne crée pas d’action et la projection ne mute rien", () => {
  const value = workspace();
  value.declarationDraft = completeDraft();
  value.declarationDraft.fiscalResult = { exercice: 2025 } as DeclarationDraft["fiscalResult"];
  value.fiscalYear.declarationGeneratedAt = undefined;
  const before = structuredClone(value);
  assert.deepEqual(buildV3UserActionReadModel(value), { state: "known", actions: [] });
  assert.deepEqual(value, before);
});
