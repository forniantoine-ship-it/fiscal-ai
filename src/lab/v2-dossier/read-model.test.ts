import assert from "node:assert/strict";
import test from "node:test";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { FinancementChargesOutput, LoanProfile, LogementAmortissementOutput, RevenusAssistantOutput } from "@/lib/lmnp/types/domain";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import { buildV3DossierDetailReadModel, resolveV3Activity, resolveV3Financing, resolveV3Property, resolveV3Revenue } from "./read-model";

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

function financingFact(data: ReturnType<typeof buildV3DossierDetailReadModel>, id: string) {
  return data.financing.facts.find(item => item.id === id);
}

function revenueFact(data: ReturnType<typeof buildV3DossierDetailReadModel>, id: string) {
  return data.revenue.facts.find(item => item.id === id);
}

function revenusOutput(overrides: Partial<RevenusAssistantOutput> = {}): RevenusAssistantOutput {
  return {
    exerciceFiscal: 2026, totalRecettes: 14400, loyersEncaisses: 14400, indemnitesAssurance: 0,
    recettesPlateforme: 0, ajustementsJanDec: 0, moisLocationEffectifs: 12,
    fieldSources: {}, computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function loan(overrides: Partial<LoanProfile> = {}): LoanProfile {
  return {
    id: "loan-1", bank: "Banque Test", loanType: "amortissable", borrowedAmount: 140000,
    rate: 3.45, durationMonths: 240, monthlyPayment: 800, insurance: 350, fees: 500,
    startDate: "2024-03-15", firstPaymentDate: "2024-04-05", remainingCapital: 130000,
    ...overrides,
  };
}

function pretExercice(overrides: Partial<PretFinancementExercice> = {}): PretFinancementExercice {
  return {
    pretId: "loan-1", typePret: "amortissable", interetsEmpruntExercice: 4500, interetsPreExploitation: 0,
    assuranceEmpruntExercice: 350, assurancePreExploitation: 0, capitalRembourseExercice: 5200,
    capitalRestantDu31_12: 130000, fraisDossierDeductibles: 0, garantieDeductible: 0, iraDeductible: 0,
    ...overrides,
  };
}

function financementChargesOutput(overrides: Partial<FinancementChargesOutput> = {}): FinancementChargesOutput {
  return {
    exerciceFiscal: 2026, totalInteretsEmprunt: 4500, totalInteretsPreExploitation: 0, totalAssurance: 350,
    totalCapitalRembourse: 5200, totalChargesFinancementExercice: 4850,
    prets: [pretExercice()], fieldSources: {}, computedAt: "2026-01-01T00:00:00Z",
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

test("Financing A — financement complet : contrat et exercice projetés fidèlement", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [], creditConfirmedAt: "2026-02-10T10:00:00Z",
    creditFinancing: { loans: [loan()], summary: { fiscalYearLabel: "2026", annualInterest: 4500, annualInsurance: 350, remainingCapital: 130000 }, installments: [] },
    financementCharges: financementChargesOutput(),
  };
  const before = structuredClone(input);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.financing.status, "complete");
  assert.equal(model.financing.owner, "F011");
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.value, money(140000));
  assert.equal(financingFact(model, "loan-0-rate")?.value, "3,45 %");
  assert.equal(financingFact(model, "loan-0-durationMonths")?.value, "240 mois");
  assert.equal(financingFact(model, "loan-0-startDate")?.value, "2024-03-15");
  assert.equal(financingFact(model, "loan-0-firstPaymentDate")?.value, "2024-04-05");
  assert.equal(financingFact(model, "loan-0-interetsExercice")?.value, money(4500));
  assert.equal(financingFact(model, "loan-0-capitalRestantDu")?.value, money(130000));
  assert.deepEqual(input, before);
});

test("Financing B — financement partiel : taux et durée absents, aucun fallback", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    creditFinancing: { loans: [{ ...loan(), rate: undefined as unknown as number, durationMonths: undefined as unknown as number }], summary: { fiscalYearLabel: "2026", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] },
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.value, money(140000));
  assert.equal(financingFact(model, "loan-0-rate")?.value, null);
  assert.equal(financingFact(model, "loan-0-durationMonths")?.value, null);
  assert.equal(model.financing.missing.includes(`${loanLabelFor(0, "Banque Test")} · Taux`), true);
});

function loanLabelFor(index: number, bank: string | null) {
  return bank ? `Prêt ${index + 1} (${bank})` : `Prêt ${index + 1}`;
}

test("Financing C — contrat durable et exercice annuel restent deux sections distinctes", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    creditFinancing: { loans: [loan()], summary: { fiscalYearLabel: "2026", annualInterest: 4500, annualInsurance: 350, remainingCapital: 130000 }, installments: [] },
    financementCharges: financementChargesOutput(),
  };
  const model = buildV3DossierDetailReadModel(input);
  // Contract fact: unaffected by the exercise.
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.value, money(140000));
  // Exercise fact: a distinct fact, distinctly labelled, never the same value as the contract's capital.
  assert.equal(financingFact(model, "loan-0-capitalRembourseExercice")?.value, money(5200));
  assert.notEqual(financingFact(model, "loan-0-borrowedAmount")?.value, financingFact(model, "loan-0-capitalRembourseExercice")?.value);
});

test("Financing D — l'output F011 d'un exercice différent n'apparaît pas comme celui de l'exercice actif", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    creditFinancing: { loans: [loan()], summary: { fiscalYearLabel: "2025", annualInterest: 4500, annualInsurance: 350, remainingCapital: 130000 }, installments: [] },
    financementCharges: financementChargesOutput({ exerciceFiscal: 2025 }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-interetsExercice"), undefined);
  assert.equal(financingFact(model, "loan-0-capitalRestantDu"), undefined);
  // Contract facts (durable) remain visible — their continuity is legitimate.
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.value, money(140000));
});

test("Financing E — REAL sans données : aucune fixture financement ne fuit", () => {
  const input = workspace();
  input.declarationDraft = undefined;
  assert.equal(resolveV3Financing({ mode: "demo" }), undefined);
  const financing = resolveV3Financing({ mode: "real", workspace: input });
  assert.equal(financing?.facts.length, 0);
  assert.deepEqual(financing?.sources, []);
  const serialized = JSON.stringify(financing);
  assert.equal(serialized.includes("140 000"), false);
  assert.equal(serialized.includes("3,45"), false);
  assert.equal(serialized.includes("20 ans") || serialized.includes("240 mois"), false);
  assert.equal(serialized.includes("0,25"), false);
});

test("Financing F — provenance : document connu, sans maillon inventé", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], creditDocumentId: "doc-offer", creditFinancing: { loans: [loan()], summary: { fiscalYearLabel: "2026", annualInterest: 4500, annualInsurance: 350, remainingCapital: 130000 }, installments: [] } };
  input.documents = [{
    id: "doc-offer", fiscalYearId: input.fiscalYear.id, fileName: "Offre réelle.pdf",
    mimeType: "application/pdf", sizeBytes: 100, category: "autre", documentType: "unknown",
    status: "analyzed", uploadedAt: "2026-01-01",
  }];
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.financing.provenance, "partial");
  assert.deepEqual(model.financing.sources, [{ id: "doc-offer", label: "Offre réelle.pdf" }]);
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.evidence, undefined);
});

test("Financing G — plusieurs prêts : deux prêts distincts, jamais fusionnés ni moyennés", () => {
  const input = workspace();
  const loanA = loan({ id: "loan-1", bank: "Banque A", borrowedAmount: 100000, rate: 2 });
  const loanB = loan({ id: "loan-2", bank: "Banque B", borrowedAmount: 60000, rate: 4 });
  input.declarationDraft = {
    completedSteps: [],
    creditFinancing: { loans: [loanA, loanB], summary: { fiscalYearLabel: "2026", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] },
    financementCharges: financementChargesOutput({ prets: [pretExercice({ pretId: "loan-1" }), pretExercice({ pretId: "loan-2", capitalRestantDu31_12: 55000 })] }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.value, money(100000));
  assert.equal(financingFact(model, "loan-1-borrowedAmount")?.value, money(60000));
  assert.equal(financingFact(model, "loan-0-capitalRestantDu")?.value, money(130000));
  assert.equal(financingFact(model, "loan-1-capitalRestantDu")?.value, money(55000));
  // No aggregate/averaged fact exists anywhere in the model.
  assert.equal(model.financing.facts.some(f => f.id.includes("total") || f.id.includes("average")), false);
});

test("Financing H — zéro prêt : pas de crash, aucun prêt inventé", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], creditDeclaredNoneAt: "2026-02-10T10:00:00Z" };
  const model = buildV3DossierDetailReadModel(input);
  assert.deepEqual(model.financing.facts, []);
  assert.deepEqual(model.financing.sources, []);
  assert.match(model.financing.summary, /Aucun financement déclaré/);
});

test("Financing I — multi-biens : garde identique à Activité/Logement", () => {
  const input = workspace();
  input.properties.push({ id: "home-2", label: "Second bien", address: "2 rue Test", city: "Lyon", postalCode: "69002" });
  input.fiscalYear.propertyIds.push("home-2");
  input.declarationDraft = { completedSteps: [], creditFinancing: { loans: [loan()], summary: { fiscalYearLabel: "2026", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] } };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.financing.status, "unsupported");
  assert.deepEqual(model.financing.facts, []);
  assert.match(model.financing.summary, /multi-biens/);
});

test("Financing — un prêt exclu du calcul de l'exercice l'indique explicitement, sans être masqué", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    creditFinancing: { loans: [loan()], summary: { fiscalYearLabel: "2026", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] },
    financementCharges: financementChargesOutput({ prets: [], excludedLoanIds: ["loan-1"] }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-exerciseStatus")?.value, "Exclu du calcul (date de première mensualité inconnue)");
  assert.equal(financingFact(model, "loan-0-interetsExercice"), undefined);
});

test("Financing R3.6 — CRD F011 inconnu (aucune échéance exploitable) : jamais fabriqué en 0 €", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    creditFinancing: { loans: [loan()], summary: { fiscalYearLabel: "2026", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] },
    financementCharges: financementChargesOutput({ prets: [pretExercice({ capitalRestantDu31_12: undefined })] }),
  };
  const model = buildV3DossierDetailReadModel(input);
  const crdFact = financingFact(model, "loan-0-capitalRestantDu");
  assert.equal(crdFact?.value, null);
  assert.notEqual(crdFact?.value, money(0));
  assert.ok(model.financing.missing.includes(crdFact!.label));
});

test("Financing R3.6 — CRD F011 réellement soldé (0 exact) reste distinct de l'inconnu", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    creditFinancing: { loans: [loan()], summary: { fiscalYearLabel: "2026", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] },
    financementCharges: financementChargesOutput({ prets: [pretExercice({ capitalRestantDu31_12: 0 })] }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-capitalRestantDu")?.value, money(0));
});

test("Financing R3.6 — aucune provenance champ-par-champ F011 n'est affichée (attribution au bon prêt non prouvée)", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    creditFinancing: { loans: [loan()], summary: { fiscalYearLabel: "2026", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] },
    financementCharges: financementChargesOutput({ fieldSources: { capitalInitial: "extracted", tauxNominal: "extracted" } }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.evidence, undefined);
  assert.equal(financingFact(model, "loan-0-rate")?.evidence, undefined);
  assert.ok(model.financing.facts.every(f => f.evidence === undefined));
});

test("Revenue A — revenu complet : statut confirmé (isRevenusComplete), projection exacte", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [], revenusConfirmedAt: "2026-02-10T10:00:00Z",
    revenusAssistant: revenusOutput({ revenuTheorique: 14000, fieldSources: { revenu_declare: "manual", loyer_mensuel: "extracted" } }),
  };
  const before = structuredClone(input);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.revenue.status, "complete");
  assert.equal(model.revenue.owner, "F013");
  assert.equal(revenueFact(model, "totalRecettes")?.value, money(14400));
  assert.equal(revenueFact(model, "totalRecettes")?.evidence, "Saisi");
  assert.equal(revenueFact(model, "loyersEncaisses")?.value, money(14400));
  assert.equal(revenueFact(model, "revenuTheorique")?.value, money(14000));
  assert.equal(revenueFact(model, "revenuTheorique")?.evidence, "Extrait");
  assert.deepEqual(input, before);
});

test("Revenue B — revenu partiel (mode déclaratif direct) : revenuTheorique non calculé reste absent, aucun fallback", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    revenusAssistant: revenusOutput({ revenuTheorique: undefined }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.revenue.status, "incomplete");
  assert.equal(revenueFact(model, "totalRecettes")?.value, money(14400));
  assert.equal(revenueFact(model, "revenuTheorique")?.value, null);
  assert.ok(model.revenue.missing.includes("Loyer prévu au bail (théorique, F013)"));
});

test("Revenue C — l'output F013 d'un exercice différent n'est pas utilisé (year-safety)", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [], revenusConfirmedAt: "2025-12-01T00:00:00Z",
    revenusAssistant: revenusOutput({ exerciceFiscal: 2025 }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(revenueFact(model, "totalRecettes")?.value, null);
  assert.equal(revenueFact(model, "loyersEncaisses")?.value, null);
  assert.equal(model.revenue.status, "incomplete");
});

test("Revenue D — unknown vs zéro : aucune donnée diffère d'un zéro réellement confirmé, le statut ne suit pas le montant", () => {
  const noData = workspace();
  const noDataModel = buildV3DossierDetailReadModel(noData);
  assert.equal(revenueFact(noDataModel, "totalRecettes")?.value, null);
  assert.equal(noDataModel.revenue.status, "incomplete");

  const zeroConfirmed = workspace();
  zeroConfirmed.declarationDraft = {
    completedSteps: [], revenusConfirmedAt: "2026-03-01T00:00:00Z",
    revenusAssistant: revenusOutput({ totalRecettes: 0, loyersEncaisses: 0 }),
  };
  const zeroModel = buildV3DossierDetailReadModel(zeroConfirmed);
  assert.equal(revenueFact(zeroModel, "totalRecettes")?.value, money(0));
  assert.equal(zeroModel.revenue.status, "complete");
});

test("Revenue E — jamais de loyer mensuel × 12 fabriqué : les deux montants restent indépendants tels que persistés", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    revenusAssistant: revenusOutput({ totalRecettes: 3000, loyersEncaisses: 3000, revenuTheorique: 6000 }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(revenueFact(model, "totalRecettes")?.value, money(3000));
  assert.equal(revenueFact(model, "revenuTheorique")?.value, money(6000));
  assert.notEqual(revenueFact(model, "totalRecettes")?.value, revenueFact(model, "revenuTheorique")?.value);
});

test("Revenue F — aucune réconciliation recalculée : F013 ne persiste pas d'écart durable, V3 n'en invente aucun", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    revenusAssistant: revenusOutput({ totalRecettes: 3000, revenuTheorique: 6000 }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.revenue.facts.some(f => f.id.toLowerCase().includes("ecart") || f.label.toLowerCase().includes("écart")), false);
});

test("Revenue G — provenance : document lié connu, fieldSources correctement rattachés, sinon aucune évidence inventée", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [], revenusDocumentIds: ["doc-bail"],
    revenusAssistant: revenusOutput({ fieldSources: {} }),
  };
  input.documents = [{
    id: "doc-bail", fiscalYearId: input.fiscalYear.id, fileName: "Bail réel.pdf",
    mimeType: "application/pdf", sizeBytes: 100, category: "autre", documentType: "unknown",
    status: "analyzed", uploadedAt: "2026-01-01",
  }];
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.revenue.provenance, "partial");
  assert.deepEqual(model.revenue.sources, [{ id: "doc-bail", label: "Bail réel.pdf" }]);
  assert.equal(revenueFact(model, "totalRecettes")?.evidence, undefined);
});

test("Revenue E/G — REAL sans données : aucune fixture revenu ne fuit", () => {
  const input = workspace();
  input.declarationDraft = undefined;
  assert.equal(resolveV3Revenue({ mode: "demo" }), undefined);
  const revenue = resolveV3Revenue({ mode: "real", workspace: input });
  assert.equal(revenue?.status, "incomplete");
  assert.ok(revenue?.facts.every(item => item.value === null));
  assert.deepEqual(revenue?.sources, []);
  const serialized = JSON.stringify(revenue);
  assert.equal(serialized.includes("14 400"), false);
  assert.equal(serialized.includes("Bail de location"), false);
  assert.equal(serialized.includes("Relevé de gestion"), false);
});

test("Revenue I — zéro donnée : pas de crash, aucun revenu inventé", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [] };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.revenue.status, "incomplete");
  assert.ok(model.revenue.facts.every(item => item.value === null));
  assert.deepEqual(model.revenue.sources, []);
});

test("Revenue J — multi-biens : garde identique aux autres domaines", () => {
  const input = workspace();
  input.properties.push({ id: "home-2", label: "Second bien", address: "2 rue Test", city: "Lyon", postalCode: "69002" });
  input.fiscalYear.propertyIds.push("home-2");
  input.declarationDraft = { completedSteps: [], revenusConfirmedAt: "2026-01-01", revenusAssistant: revenusOutput() };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.revenue.status, "unsupported");
  assert.deepEqual(model.revenue.facts, []);
  assert.match(model.revenue.summary, /multi-biens/);
});
