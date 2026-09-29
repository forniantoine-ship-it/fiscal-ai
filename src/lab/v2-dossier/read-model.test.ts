import assert from "node:assert/strict";
import test from "node:test";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { AmortissementAssistantOutput, ChargesAssistantOutput, DeclarationVersion, FinancementChargesOutput, FiscalEngineOutput, LoanProfile, LogementAmortissementOutput, RevenusAssistantOutput } from "@/lib/lmnp/types/domain";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import { buildDossierSteps, buildMissingItems } from "@/lib/lmnp/services/validation-profile";
import { buildV3DossierDetailReadModel, resolveV3Activity, resolveV3Amortization, resolveV3Charges, resolveV3Declaration, resolveV3Financing, resolveV3Property, resolveV3Revenue, type V3PrototypeSource } from "./read-model";

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

function chargesFact(data: ReturnType<typeof buildV3DossierDetailReadModel>, id: string) {
  return data.charges.facts.find(item => item.id === id);
}

function chargesOutput(overrides: Partial<ChargesAssistantOutput> = {}): ChargesAssistantOutput {
  return {
    exerciceFiscal: 2026, totalDeductible: 2500, totalNonDeductible: 100, totalAmortissable: 0,
    totalPreExploitation: 0, parCategorie: { taxe_fonciere: 900, assurance_pno: 250 },
    composantsNouveaux: [], fieldSources: {}, computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function composantNouveau(overrides: Partial<ComposantNouveau> = {}): ComposantNouveau {
  return {
    id: "travaux-1", label: "Réfection toiture", montant: 8000, dureeAnnees: 15,
    dotationAnnuelle: 533.33, nature: "amélioration", dateDebut: "2026-06-01", origin: "f012_travaux",
    ...overrides,
  };
}

function amortizationFact(data: ReturnType<typeof buildV3DossierDetailReadModel>, id: string) {
  return data.amortization.facts.find(item => item.id === id);
}

function amortissementOutput(overrides: Partial<AmortissementAssistantOutput> = {}): AmortissementAssistantOutput {
  return {
    exerciceFiscal: 2026, totalDotations: 1500, status: "validated", planVersion: "f014-2026-2026-02-10",
    profil: "PROF-001", validatedAt: "2026-02-10T10:00:00Z",
    ...overrides,
  };
}

function fiscalEngineOutput(overrides: Partial<FiscalEngineOutput> = {}): FiscalEngineOutput {
  return {
    exercice: 2026, resultatFiscal: 5500, resultatAvantAmort: 7000, totalRecettes: 12000, totalCharges: 4000,
    amortDeduct: 1500, amortReporte: 0, amortNonDeduitExercice: 0, deficitNouveau: 0,
    stocks: { deficits: [], amortissementsReportes: 0 },
    trace: { ksArtifacts: [], computedAt: "2026-03-01T00:00:00Z", journal: [] },
    computedAt: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function declarationVersion(overrides: { id?: string; formulairesGeneres?: string[]; formulairesManquants?: string[] } = {}): DeclarationVersion {
  return {
    id: overrides.id ?? "v1", declarationId: "decl-1", versionNumber: 1, generatedAt: "2026-03-01T00:00:00Z",
    fiscalResult: fiscalEngineOutput() as unknown as DeclarationVersion["fiscalResult"],
    liasseResult: {} as DeclarationVersion["liasseResult"],
    rfs: {} as DeclarationVersion["rfs"],
    liasseRfs: {
      formulairesGeneres: overrides.formulairesGeneres ?? ["2031-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"],
      formulairesManquants: overrides.formulairesManquants ?? [],
    } as unknown as DeclarationVersion["liasseRfs"],
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

test("Charges A — F012 complet : statut confirmé, projection exacte des totaux et catégories", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({ fieldSources: { taxe_fonciere: "extracted", assurance_pno: "manual" } }),
  };
  const before = structuredClone(input);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.charges.status, "complete");
  assert.equal(model.charges.owner, "F012");
  assert.equal(chargesFact(model, "totalDeductible")?.value, money(2500));
  assert.equal(chargesFact(model, "totalNonDeductible")?.value, money(100));
  assert.equal(chargesFact(model, "totalPreExploitation")?.value, money(0));
  assert.equal(chargesFact(model, "category-taxe_fonciere")?.value, money(900));
  assert.equal(chargesFact(model, "category-assurance_pno")?.value, money(250));
  assert.deepEqual(input, before);
});

test("Charges B — partiel : catégories absentes ne deviennent jamais 0 €", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({ parCategorie: { taxe_fonciere: 900 } }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(chargesFact(model, "category-taxe_fonciere")?.value, money(900));
  assert.equal(chargesFact(model, "category-assurance_pno")?.value, null);
  assert.equal(chargesFact(model, "category-copropriete")?.value, null);
  assert.ok(model.charges.missing.includes("Assurance PNO"));
});

test("Charges C — zéro réel : une catégorie explicitement à 0 reste 0 €, jamais confondue avec l'absence", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({ parCategorie: { taxe_fonciere: 0, assurance_pno: 250 } }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(chargesFact(model, "category-taxe_fonciere")?.value, money(0));
  assert.notEqual(chargesFact(model, "category-taxe_fonciere")?.value, null);
});

test("Charges D — l'output F012 d'un exercice différent n'est pas utilisé (year-safety)", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({ exerciceFiscal: 2025 }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(chargesFact(model, "totalDeductible")?.value, null);
  assert.equal(model.charges.status, "incomplete");
});

test("Charges E — totaux confirmés à zéro : le statut reste complete, jamais déduit du montant", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({ totalDeductible: 0, totalNonDeductible: 0, totalPreExploitation: 0, parCategorie: {} }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.charges.status, "complete");
  assert.equal(chargesFact(model, "totalDeductible")?.value, money(0));
});

test("Charges F — aucune donnée : pas de crash, aucune charge inventée", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [] };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.charges.status, "incomplete");
  assert.ok(model.charges.facts.every(item => item.value === null));
  assert.deepEqual(model.charges.sources, []);
});

test("Charges G — deux catégories distinctes : projection exacte, aucune ligne individuelle inventée", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({ parCategorie: { copropriete: 1200, frais_bancaires: 45 } }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(chargesFact(model, "category-copropriete")?.value, money(1200));
  assert.equal(chargesFact(model, "category-frais_bancaires")?.value, money(45));
  assert.equal(model.charges.facts.some(f => f.label.includes("Facture") || f.id.startsWith("ligne-")), false);
});

test("Charges H — provenance multi-catégorie : deux sources différentes préservées sans écrasement ni fuite", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({
      parCategorie: { taxe_fonciere: 900, assurance_pno: 250 },
      fieldSources: { taxe_fonciere: "extracted", assurance_pno: "manual" },
    }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(chargesFact(model, "category-taxe_fonciere")?.evidence, "Extrait");
  assert.equal(chargesFact(model, "category-assurance_pno")?.evidence, "Saisi");
  assert.notEqual(chargesFact(model, "category-taxe_fonciere")?.evidence, chargesFact(model, "category-assurance_pno")?.evidence);
});

test("Charges I — totalAmortissable n'est jamais présenté comme une charge déductible", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({ totalAmortissable: 8000 }),
  };
  const model = buildV3DossierDetailReadModel(input);
  const fact = chargesFact(model, "totalAmortissable");
  assert.equal(fact?.value, money(8000));
  assert.doesNotMatch(fact!.label, /déductible/i);
  assert.match(fact!.label, /amortissement/i);
});

test("Charges J — composantsNouveaux projetés avec un label amortissement, aucune dotation recalculée", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({ composantsNouveaux: [composantNouveau()] }),
  };
  const model = buildV3DossierDetailReadModel(input);
  const fact = chargesFact(model, "component-0");
  assert.match(fact!.label, /amortissement/i);
  assert.equal(fact?.value, `${money(8000)} · 15 ans`);
  assert.equal(JSON.stringify(model.charges).includes("533"), false);
});

test("Charges K — le recoupement F011 n'est ni recalculé ni comparé dans V3", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    chargesAssistant: chargesOutput({
      recouvrementAssuranceF011: { reference: 350, periodeCompatible: true, recouvert: 200, reliquat: 0 },
    }),
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.charges.facts.some(f => f.id.toLowerCase().includes("recouvrement") || f.id.toLowerCase().includes("f011")), false);
});

test("Charges L — multi-biens : garde identique aux autres domaines", () => {
  const input = workspace();
  input.properties.push({ id: "home-2", label: "Second bien", address: "2 rue Test", city: "Lyon", postalCode: "69002" });
  input.fiscalYear.propertyIds.push("home-2");
  input.declarationDraft = { completedSteps: [], chargesAssistant: chargesOutput() };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.charges.status, "unsupported");
  assert.deepEqual(model.charges.facts, []);
  assert.match(model.charges.summary, /multi-biens/);
});

test("Charges M — REAL sans données : aucune fixture de dépenses ne fuit", () => {
  const input = workspace();
  input.declarationDraft = undefined;
  assert.equal(resolveV3Charges({ mode: "demo" }), undefined);
  const charges = resolveV3Charges({ mode: "real", workspace: input });
  assert.equal(charges?.status, "incomplete");
  assert.ok(charges?.facts.every(item => item.value === null));
  assert.deepEqual(charges?.sources, []);
  const serialized = JSON.stringify(charges);
  assert.equal(serialized.includes("2 350"), false);
  assert.equal(serialized.includes("1 250"), false);
});

test("Amortization A — validé : projection exacte, statut complete depuis l'autorité canonique", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], amortissementAssistant: amortissementOutput() };
  const before = structuredClone(input);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.amortization.status, "complete");
  assert.equal(model.amortization.owner, "F014");
  assert.equal(amortizationFact(model, "totalDotations")?.value, money(1500));
  assert.equal(amortizationFact(model, "profil")?.value, "Première année d’amortissement");
  assert.deepEqual(input, before);
});

test("Amortization B — contested : montant conservé, domaine incomplete, jamais présenté comme validé", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], amortissementAssistant: amortissementOutput({ status: "contested" }) };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.amortization.status, "incomplete");
  assert.equal(amortizationFact(model, "totalDotations")?.value, money(1500));
  assert.doesNotMatch(model.amortization.summary, /^Amortissements calculés$/);
  assert.match(model.amortization.summary, /vérifier/i);
});

test("Amortization C — zéro réel validé : 0 € conservé, statut complete", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], amortissementAssistant: amortissementOutput({ totalDotations: 0 }) };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(amortizationFact(model, "totalDotations")?.value, money(0));
  assert.equal(model.amortization.status, "complete");
});

test("Amortization D — absence : aucun 0 € inventé, incomplete", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [] };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(amortizationFact(model, "totalDotations")?.value, null);
  assert.equal(model.amortization.status, "incomplete");
});

test("Amortization E — l'output F014 d'un exercice différent n'est pas utilisé (year-safety)", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], amortissementAssistant: amortissementOutput({ exerciceFiscal: 2025 }) };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(amortizationFact(model, "totalDotations")?.value, null);
  assert.equal(model.amortization.status, "incomplete");
});

test("Amortization F — provenance : F014 n'a pas de fieldSources, aucune évidence inventée", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], amortissementAssistant: amortissementOutput() };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.amortization.provenance, "unavailable");
  assert.ok(model.amortization.facts.every(f => f.evidence === undefined));
});

test("Amortization G — aucune reprojection des composants F010", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], amortissementAssistant: amortissementOutput() };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.amortization.facts.some(f => f.id.startsWith("composant-") || f.id === "valeurTerrain" || f.id === "montantMobilier"), false);
});

test("Amortization H — aucune reprojection des composantsNouveaux F012", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], amortissementAssistant: amortissementOutput() };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.amortization.facts.some(f => f.id.startsWith("component-") || f.id.startsWith("category-")), false);
});

test("Amortization I — aucun déficit / report fiscal (propriété de F006, pas F014)", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], amortissementAssistant: amortissementOutput() };
  const model = buildV3DossierDetailReadModel(input);
  const serialized = JSON.stringify(model.amortization).toLowerCase();
  assert.equal(serialized.includes("déficit") || serialized.includes("report") || serialized.includes("resultatfiscal"), false);
});

test("Amortization J — multi-biens : garde identique aux autres domaines", () => {
  const input = workspace();
  input.properties.push({ id: "home-2", label: "Second bien", address: "2 rue Test", city: "Lyon", postalCode: "69002" });
  input.fiscalYear.propertyIds.push("home-2");
  input.declarationDraft = { completedSteps: [], amortissementAssistant: amortissementOutput() };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(model.amortization.status, "unsupported");
  assert.deepEqual(model.amortization.facts, []);
  assert.match(model.amortization.summary, /multi-biens/);
});

test("Amortization K — REAL sans données : aucune fixture d'amortissement ne fuit", () => {
  const input = workspace();
  input.declarationDraft = undefined;
  assert.equal(resolveV3Amortization({ mode: "demo" }), undefined);
  const amortization = resolveV3Amortization({ mode: "real", workspace: input });
  assert.equal(amortization?.status, "incomplete");
  assert.ok(amortization?.facts.every(item => item.value === null));
  assert.deepEqual(amortization?.sources, []);
});

test("Contract L — les six domaines réels ne retombent jamais sur une fixture démo", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [] };
  const source: V3PrototypeSource = { mode: "real", workspace: input };
  const resolvers: [string, (s: V3PrototypeSource) => unknown][] = [
    ["activity", resolveV3Activity], ["property", resolveV3Property], ["financing", resolveV3Financing],
    ["revenue", resolveV3Revenue], ["charges", resolveV3Charges], ["amortization", resolveV3Amortization],
  ];
  const demoFixtureStrings = [
    "Antoine Martin", "Bordeaux", "140 000", "14 400", "2 350", "1 250", "3,45",
    "Extrait d’activité", "Acte d’acquisition", "Offre de prêt", "Bail de location", "Relevé de gestion", "Échéancier bancaire",
  ];
  for (const [name, resolve] of resolvers) {
    assert.equal(resolve({ mode: "demo" }), undefined, `${name}: doit rester undefined en mode demo`);
    const serialized = JSON.stringify(resolve(source));
    for (const fixture of demoFixtureStrings) {
      assert.equal(serialized?.includes(fixture) ?? false, false, `${name}: fuite de la fixture démo "${fixture}"`);
    }
  }
});

function declarationFact(model: ReturnType<typeof resolveV3Declaration>, id: string) {
  return model?.facts.find(item => item.id === id);
}

test("Declaration A — FiscalResult valide : projection exacte, statut computed", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput() };
  const before = structuredClone(input);
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.status, "computed");
  assert.equal(declarationFact(model, "totalRecettes")?.value, money(12000));
  assert.equal(declarationFact(model, "totalCharges")?.value, money(4000));
  assert.equal(declarationFact(model, "resultatFiscal")?.value, money(5500));
  assert.equal(declarationFact(model, "amortDeduct")?.value, money(1500));
  assert.deepEqual(input, before);
});

test("Declaration A2 — declarationGeneratedAt présent + exercice actif : freshness fresh", () => {
  const input = workspace();
  input.fiscalYear.declarationGeneratedAt = "2026-03-01T00:00:00Z";
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput() };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.freshness, "fresh");
});

test("Declaration B2 — declarationGeneratedAt absent + exercice actif : freshness stale", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput() };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.freshness, "stale");
});

test("Declaration B — résultat fiscal réellement à 0 : 0 € conservé, jamais missing", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput({ resultatFiscal: 0 }) };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(declarationFact(model, "resultatFiscal")?.value, money(0));
  assert.notEqual(declarationFact(model, "resultatFiscal")?.value, null);
});

test("Declaration C — FiscalResult absent : aucun 0 € inventé, statut unavailable, freshness unknown", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [] };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.status, "unavailable");
  assert.equal(model?.freshness, "unknown");
  assert.ok(model?.facts.every(f => f.value === null));
});

test("Declaration D — un FiscalResult d'un exercice différent n'est pas utilisé (year-safety), jamais fresh", () => {
  const input = workspace();
  input.fiscalYear.declarationGeneratedAt = "2026-03-01T00:00:00Z";
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput({ exercice: 2025 }) };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.status, "unavailable");
  assert.equal(declarationFact(model, "resultatFiscal")?.value, null);
  assert.equal(model?.freshness, "unknown");
});

test("Declaration E — amortissement calculé (F014) ≠ amortissement retenu (F006) : les deux vérités restent distinctes", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    amortissementAssistant: amortissementOutput({ totalDotations: 6000 }),
    fiscalResult: fiscalEngineOutput({ amortDeduct: 4000 }),
  };
  const model = buildV3DossierDetailReadModel(input);
  const declaration = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model.amortization.facts.find(f => f.id === "totalDotations")?.value, money(6000));
  assert.equal(declarationFact(declaration, "amortDeduct")?.value, money(4000));
  assert.notEqual(
    model.amortization.facts.find(f => f.id === "totalDotations")?.value,
    declarationFact(declaration, "amortDeduct")?.value,
  );
});

test("Declaration F — déficits antérieurs projetés individuellement, jamais fusionnés ni sommés", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    fiscalResult: fiscalEngineOutput({
      deficitNouveau: 500,
      stocks: { deficits: [{ millesime: 2024, montant: 300 }, { millesime: 2025, montant: 200 }], amortissementsReportes: 0 },
    }),
  };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(declarationFact(model, "deficitNouveau")?.value, money(500));
  assert.equal(declarationFact(model, "deficit-stock-0")?.value, money(300));
  assert.equal(declarationFact(model, "deficit-stock-1")?.value, money(200));
  assert.equal(model?.facts.some(f => f.id === "deficit-total" || f.label.includes("total")), false);
});

test("Declaration G — `status` reste une notion de génération, jamais de fraîcheur : freshness est un champ séparé", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput() };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.ok(["unavailable", "computed", "generated"].includes(model!.status));
  assert.equal(model?.freshness, "stale");
});

test("Declaration H — blockers projetés exactement depuis buildMissingItems(buildDossierSteps(...)), jamais reconstruits", () => {
  const input = workspace();
  // Tous les six domaines sont volontairement complets ici : buildMissingItems doit renvoyer [],
  // et V3 ne doit inventer aucun blocker par ailleurs.
  input.declarationDraft = {
    completedSteps: [],
    inpiConfirmedAt: "2026-01-01T00:00:00Z",
    logementAmortissement: logementOutput(),
    creditDeclaredNoneAt: "2026-01-01T00:00:00Z",
    amortissementAssistant: amortissementOutput(),
    revenusConfirmedAt: "2026-01-01T00:00:00Z",
    revenusAssistant: revenusOutput(),
    chargesAssistant: chargesOutput(),
    fiscalResult: fiscalEngineOutput(),
  };
  const expected = buildMissingItems(buildDossierSteps(input.declarationDraft, input.fiscalYear.year)).map(item => item.label);
  assert.deepEqual(expected, []);
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.deepEqual(model?.blockers, []);
});

test("Declaration H2 — aucun blocker n'est jamais fabriqué depuis les six domaines (V3DomainReadModel)", () => {
  // Dossier vide : buildMissingItems retournera des éléments non vides ; le test vérifie que
  // les blockers V3 correspondent EXACTEMENT à cette autorité, jamais à V3DomainReadModel.missing.
  const input = workspace();
  input.declarationDraft = { completedSteps: [] };
  const expected = buildMissingItems(buildDossierSteps(input.declarationDraft, input.fiscalYear.year)).map(item => item.label);
  assert.ok(expected.length > 0);
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.deepEqual(model?.blockers, expected);
});

test("Declaration I — F014 contesté : le blocker Amortissements vient de buildDossierSteps, aucune règle Déclaration ajoutée", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    amortissementAssistant: amortissementOutput({ status: "contested" }),
    fiscalResult: fiscalEngineOutput(),
  };
  const expected = buildMissingItems(buildDossierSteps(input.declarationDraft, input.fiscalYear.year)).map(item => item.label);
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.status, "computed");
  assert.deepEqual(model?.blockers, expected);
});

test("Declaration J — reprise comptable : aucun statut 'prêt' fabriqué en l'absence du generation gate réel", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput() };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.notEqual(model?.status, "ready");
  assert.ok(["unavailable", "computed", "generated"].includes(model!.status));
});

test("Declaration K — deliverables : uniquement les formulaires réellement générés/manquants d'après la dernière version", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    fiscalResult: fiscalEngineOutput(),
    declaration: { id: "decl-1", fiscalYearId: "year-2026", currentVersionId: "v1", createdAt: "2026-03-01T00:00:00Z" },
    declarationVersions: [declarationVersion({ formulairesGeneres: ["2031-SD", "2033-A-SD"], formulairesManquants: ["2033-D-SD"] })],
  };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.status, "generated");
  assert.deepEqual(model?.deliverables.filter(d => d.status === "generated").map(d => d.id), ["2031-SD", "2033-A-SD"]);
  assert.deepEqual(model?.deliverables.filter(d => d.status === "not_generated").map(d => d.id), ["2033-D-SD"]);
});

test("Declaration E2 — stale garde les valeurs : le dernier résultat connu reste projeté, mais marqué stale", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput() };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.freshness, "stale");
  assert.equal(declarationFact(model, "resultatFiscal")?.value, money(5500));
  assert.notEqual(model?.status, "unavailable");
});

test("Declaration F2 — généré mais stale : les documents historiques restent lisibles, l'état courant reste stale", () => {
  const input = workspace();
  input.declarationDraft = {
    completedSteps: [],
    fiscalResult: fiscalEngineOutput(),
    declaration: { id: "decl-1", fiscalYearId: "year-2026", currentVersionId: "v1", createdAt: "2026-03-01T00:00:00Z" },
    declarationVersions: [declarationVersion()],
  };
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.status, "generated");
  assert.equal(model?.freshness, "stale");
  assert.equal(model?.deliverables.filter(d => d.status === "generated").length, 5);
});

test("Declaration J2 — paiement séparé : paidAt présent ou absent ne change jamais freshness", () => {
  const input = workspace();
  input.fiscalYear.declarationGeneratedAt = "2026-03-01T00:00:00Z";
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput() };
  const withoutPayment = resolveV3Declaration({ mode: "real", workspace: input });
  input.fiscalYear.paidAt = "2026-03-02T00:00:00Z";
  const withPayment = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(withoutPayment?.freshness, "fresh");
  assert.equal(withPayment?.freshness, "fresh");
});

test("Declaration K2 — legacy : fiscalResult actif sans declarationGeneratedAt jamais posé (fail-closed) → stale", () => {
  const input = workspace();
  input.declarationDraft = { completedSteps: [], fiscalResult: fiscalEngineOutput() };
  assert.equal(input.fiscalYear.declarationGeneratedAt, undefined);
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.freshness, "stale");
});

test("Declaration L2 — aucun appel au generation gate / recalcul F006 depuis le read model", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./read-model.ts", import.meta.url), "utf8");
  // Ignore comments (a comment naming the real gate as the audited authority is fine and expected —
  // see the R7.1/R7.2 provenance comments above buildV3DeclarationReadModel); only forbid an actual
  // import or call of these functions, which would mean V3 triggers a live fiscal computation.
  const code = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const forbidden of ["resolveDeclarationGenerationGate(", "runDeclarationGeneration(", "produceFiscalResult(", "resolveDeclarationOutOfDate("]) {
    assert.equal(code.includes(forbidden), false, `read-model.ts ne doit jamais appeler ${forbidden}`);
  }
  for (const forbiddenImport of ["declaration-generation-gate", "run-declaration-generation", "declaration-freshness"]) {
    assert.equal(code.includes(forbiddenImport), false, `read-model.ts ne doit jamais importer depuis ${forbiddenImport}`);
  }
});

test("Declaration L — REAL sans données : aucune chaîne du scénario demo ne fuit", () => {
  const input = workspace();
  input.declarationDraft = undefined;
  assert.equal(resolveV3Declaration({ mode: "demo" }), undefined);
  const model = resolveV3Declaration({ mode: "real", workspace: input });
  assert.equal(model?.status, "unavailable");
  assert.equal(model?.freshness, "unknown");
  assert.ok(model?.facts.every(f => f.value === null));
  assert.deepEqual(model?.deliverables, []);
  assert.deepEqual(model?.blockers, buildMissingItems(buildDossierSteps(undefined, input.fiscalYear.year)).map(item => item.label));
});

// ── F-011 provenance persistante par prêt (LoanProfile.provenance) ─────────────────────────────────────────
function offerDocument(id: string, fileName: string, fiscalYearId: string): PersistedWorkspace["documents"][number] {
  return {
    id, fiscalYearId, fileName, mimeType: "application/pdf", sizeBytes: 100, category: "autre",
    documentType: "unknown", status: "analyzed", uploadedAt: "2026-01-01",
  };
}

function financingWorkspace(loans: LoanProfile[], docs: { id: string; fileName: string }[] = []): PersistedWorkspace {
  const input = workspace();
  input.documents = docs.map(doc => offerDocument(doc.id, doc.fileName, input.fiscalYear.id));
  input.declarationDraft = {
    completedSteps: [],
    creditFinancing: { loans, summary: { fiscalYearLabel: "2026", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] },
  };
  return input;
}

test("Financing P1 — provenance par prêt : chaque fait porte l'origine de son propre champ, les documents sont listés", () => {
  const input = financingWorkspace([loan({
    provenance: {
      capitalInitial: { source: "extracted", documentId: "doc-1" },
      tauxNominal: { source: "user_correction", documentId: "doc-1" },
      dureeMois: { source: "manual" },
    },
  })], [{ id: "doc-1", fileName: "Tableau réel.pdf" }]);
  const before = structuredClone(input);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.evidence, "Extrait");
  assert.equal(financingFact(model, "loan-0-rate")?.evidence, "Corrigé");
  assert.equal(financingFact(model, "loan-0-durationMonths")?.evidence, "Saisi");
  assert.equal(financingFact(model, "loan-0-loanType")?.evidence, undefined, "aucune provenance pour ce champ : aucune évidence inventée");
  assert.deepEqual(model.financing.sources, [{ id: "doc-1", label: "Tableau réel.pdf" }]);
  assert.equal(model.financing.provenance, "partial");
  assert.ok(model.financing.facts.every(f => f.evidence !== "Estimé"), "reconstruction ≠ estimation (KS F-011)");
  assert.deepEqual(input, before);
});

test("Financing P2 — deux prêts, deux documents : chaque prêt ne montre que sa propre provenance", () => {
  const input = financingWorkspace([
    loan({ id: "pret-1", bank: "Banque A", provenance: { capitalInitial: { source: "extracted", documentId: "doc-A" } } }),
    loan({ id: "pret-2", bank: "Banque B", provenance: { capitalInitial: { source: "user_correction", documentId: "doc-B" }, tauxNominal: { source: "manual" } } }),
    loan({ id: "pret-3", bank: "Banque C" }),
  ], [{ id: "doc-A", fileName: "A.pdf" }, { id: "doc-B", fileName: "B.pdf" }]);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.evidence, "Extrait");
  assert.equal(financingFact(model, "loan-0-rate")?.evidence, undefined, "le prêt A n'hérite jamais du taux saisi du prêt B");
  assert.equal(financingFact(model, "loan-1-borrowedAmount")?.evidence, "Corrigé");
  assert.equal(financingFact(model, "loan-1-rate")?.evidence, "Saisi");
  assert.ok(model.financing.facts.filter(f => f.id.startsWith("loan-2-")).every(f => f.evidence === undefined), "prêt sans provenance : aucune évidence");
  assert.deepEqual(model.financing.sources, [{ id: "doc-A", label: "A.pdf" }, { id: "doc-B", label: "B.pdf" }]);
});

test("Financing P3 — document supprimé : l'origine reste affichée sans document, et le document dossier n'est PAS substitué", () => {
  const input = financingWorkspace(
    [loan({ provenance: { capitalInitial: { source: "extracted", documentId: "doc-gone" } } })],
    [{ id: "doc-other", fileName: "Autre.pdf" }],
  );
  input.declarationDraft = { ...input.declarationDraft!, creditDocumentId: "doc-other" };
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.evidence, "Extrait");
  assert.deepEqual(model.financing.sources, [], "aucune source fabriquée : ni le document supprimé, ni creditDocumentId");
  assert.equal(model.financing.provenance, "partial");
});

test("Financing P4 — dossier sans provenance par prêt : comportement historique, fieldSources F011 toujours ignoré (R3.6)", () => {
  const input = financingWorkspace([loan()], [{ id: "doc-offer", fileName: "Offre.pdf" }]);
  input.declarationDraft = {
    ...input.declarationDraft!, creditDocumentId: "doc-offer",
    financementCharges: financementChargesOutput({ fieldSources: { capitalInitial: "extracted" } }),
    // La provenance d'un ÉTAT d'assistant n'est jamais lue : seule celle portée par le prêt canonique compte.
    financementAssistantState: {
      step: "complete", currentLoanIndex: 1, fieldSources: {}, updatedAt: "2026-01-01T00:00:00Z",
      loans: [{ pretId: "loan-1", typePret: "amortissable", capitalInitial: 140000, tauxNominal: 0.0345, dureeMois: 240, datePremiereMensualite: "2024-04-05",
        provenance: { capitalInitial: { source: "extracted", documentId: "doc-offer" } } }],
    },
  };
  const model = buildV3DossierDetailReadModel(input);
  assert.ok(model.financing.facts.every(f => f.evidence === undefined));
  assert.deepEqual(model.financing.sources, [{ id: "doc-offer", label: "Offre.pdf" }]);
  assert.equal(model.financing.provenance, "partial");
});

test("Financing P5 — jamais d'évidence sur un fait absent, même si le prêt porte une provenance pour ce champ", () => {
  const input = financingWorkspace([loan({
    firstPaymentDate: "",
    provenance: { datePremiereMensualite: { source: "extracted", documentId: "doc-1" } },
  })], [{ id: "doc-1", fileName: "T.pdf" }]);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-firstPaymentDate")?.value, null);
  assert.equal(financingFact(model, "loan-0-firstPaymentDate")?.evidence, undefined);
  assert.equal(financingFact(model, "loan-0-startDate")?.evidence, "Extrait", "startDate est renseignée et vient du même champ F011");
});

test("Financing P6 — saisie purement manuelle : évidence 'Saisi', aucune source documentaire, provenance partielle", () => {
  const input = financingWorkspace([loan({ provenance: { capitalInitial: { source: "manual" }, tauxNominal: { source: "manual" } } })]);
  const model = buildV3DossierDetailReadModel(input);
  assert.equal(financingFact(model, "loan-0-borrowedAmount")?.evidence, "Saisi");
  assert.deepEqual(model.financing.sources, []);
  assert.equal(model.financing.provenance, "partial");
});
