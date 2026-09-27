import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { readActiviteFieldProvenance } from "@/lib/lmnp/services/activite-field-provenance";
import { buildDossierSteps } from "@/lib/lmnp/services/validation-profile";
import { isAnnualOutputForActiveYear } from "@/lib/lmnp/services/dossier/annual-output-year-safety";
import type { FieldSource } from "@/runtime/contracts/FieldSource";

export type V3DomainId = "activity" | "property" | "financing" | "revenues" | "charges" | "depreciation";
export type V3DomainStatus = "complete" | "incomplete" | "unsupported";
export type V3ProvenanceLevel = "complete" | "partial" | "unavailable";

export interface V3Fact {
  id: string;
  label: string;
  value: string | null;
  evidence?: string;
  confidence?: number;
}

export interface V3DomainReadModel {
  id: V3DomainId;
  label: string;
  owner: string;
  status: V3DomainStatus;
  summary: string;
  facts: V3Fact[];
  sources: { id: string; label: string }[];
  provenance: V3ProvenanceLevel;
  missing: string[];
}

export interface V3DossierDetailReadModel {
  activity: V3DomainReadModel;
  property: V3DomainReadModel;
  financing: V3DomainReadModel;
  revenue: V3DomainReadModel;
  charges: V3DomainReadModel;
  // F014 deliberately has no projection in V3-R5.
}

export type V3PrototypeSource = { mode: "demo" } | { mode: "real"; workspace: PersistedWorkspace };

export function resolveV3Activity(source: V3PrototypeSource): V3DomainReadModel | undefined {
  return source.mode === "real" ? buildV3DossierDetailReadModel(source.workspace).activity : undefined;
}

export function resolveV3Property(source: V3PrototypeSource): V3DomainReadModel | undefined {
  return source.mode === "real" ? buildV3DossierDetailReadModel(source.workspace).property : undefined;
}

export function resolveV3Financing(source: V3PrototypeSource): V3DomainReadModel | undefined {
  return source.mode === "real" ? buildV3DossierDetailReadModel(source.workspace).financing : undefined;
}

export function resolveV3Revenue(source: V3PrototypeSource): V3DomainReadModel | undefined {
  return source.mode === "real" ? buildV3DossierDetailReadModel(source.workspace).revenue : undefined;
}

export function resolveV3Charges(source: V3PrototypeSource): V3DomainReadModel | undefined {
  return source.mode === "real" ? buildV3DossierDetailReadModel(source.workspace).charges : undefined;
}

function known(value: string | undefined): string | null {
  return value?.trim() || null;
}

function money(value: number | undefined): string | null {
  return typeof value === "number" ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} €` : null;
}

function percent(value: number | undefined): string | null {
  return typeof value === "number" ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} %` : null;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  appartement: "Appartement", maison: "Maison", "meuble-tourisme": "Meublé de tourisme",
  "chambre-hote": "Chambre d’hôte", "non-classe": "Non classé",
};

const FIELD_SOURCE_LABELS: Record<FieldSource, string> = {
  extracted: "Extrait", estimated: "Estimé", manual: "Saisi", derived: "Dérivé",
  judgment: "Choix de jugement", user_correction: "Corrigé",
};

function fieldSourceLabel(source: FieldSource | undefined): string | undefined {
  return source ? FIELD_SOURCE_LABELS[source] : undefined;
}

function isMultiProperty(workspace: PersistedWorkspace): boolean {
  return workspace.properties.length > 1 || workspace.fiscalYear.propertyIds.length > 1;
}

function buildV3ActivityReadModel(workspace: PersistedWorkspace): V3DomainReadModel {
  const emptyFacts: V3Fact[] = [
    { id: "identity", label: "Exploitant", value: null },
    { id: "activityType", label: "Activité", value: null },
    { id: "siren", label: "SIREN", value: null },
    { id: "siret", label: "SIRET", value: null },
    { id: "regime", label: "Régime", value: null },
    { id: "startDate", label: "Début d’activité", value: null },
  ];

  // The first bridge is explicitly mono-property: never project a partial aggregate.
  if (isMultiProperty(workspace)) {
    return {
      id: "activity", label: "Activité", owner: "F009", status: "unsupported",
      summary: "Dossier multi-biens non pris en charge dans ce lot.",
      facts: emptyFacts, sources: [], provenance: "unavailable",
      missing: emptyFacts.map(fact => fact.label),
    };
  }

  const draft = workspace.declarationDraft;
  const provenance = readActiviteFieldProvenance(draft);
  const sourceDocument = workspace.documents.find(doc => doc.id === draft?.inpiDocumentId);
  const firstName = known(draft?.exploitantFirstName);
  const lastName = known(draft?.exploitantLastName);
  const identity = [firstName, lastName].filter(Boolean).join(" ") || null;
  const siren = known(draft?.siren);
  const sirenProof = siren && provenance.siren?.origin === "inpi_document" ? provenance.siren : undefined;
  const facts: V3Fact[] = [
    { id: "identity", label: "Exploitant", value: identity },
    { id: "activityType", label: "Activité", value: draft?.activityType ?? null },
    { id: "siren", label: "SIREN", value: siren, evidence: sirenProof?.evidence,
      confidence: sirenProof?.confidence },
    { id: "siret", label: "SIRET", value: known(draft?.siret) },
    // FiscalYear.regime has a default; it becomes a known choice only after confirmation.
    { id: "regime", label: "Régime", value: workspace.fiscalYear.regimeConfirmedAt
      ? workspace.fiscalYear.regime === "reel" ? "Réel" : "Micro-BIC" : null },
    { id: "startDate", label: "Début d’activité", value: known(draft?.activityStartDate) },
  ];
  const status = buildDossierSteps(draft, workspace.fiscalYear.year)
    .find(step => step.id === "activite")?.status ?? "incomplete";
  const hasFieldProvenance = Object.values(provenance).some(entry => Boolean(entry && entry.status !== "missing"));
  return {
    id: "activity", label: "Activité", owner: "F009", status,
    summary: status === "complete" ? "Activité validée" : "Activité à compléter",
    facts,
    sources: sourceDocument ? [{ id: sourceDocument.id, label: sourceDocument.fileName }] : [],
    // F009 stores useful excerpts/confidence but no universal page/region trail yet.
    provenance: sourceDocument || hasFieldProvenance ? "partial" : "unavailable",
    missing: facts.filter(fact => fact.value === null).map(fact => fact.label),
  };
}

function buildV3PropertyReadModel(workspace: PersistedWorkspace): V3DomainReadModel {
  const emptyFacts: V3Fact[] = [
    { id: "address", label: "Adresse", value: null },
    { id: "propertyType", label: "Type de bien", value: null },
    { id: "acquisitionDate", label: "Date d’acquisition", value: null },
    { id: "prixRevient", label: "Prix de revient (F010)", value: null },
    { id: "fraisEnCharges", label: "Frais d’acquisition déduits en charges (F010)", value: null },
    { id: "dateMiseEnService", label: "Date de mise en service (F010)", value: null },
  ];

  // Same mono-property contract as Activity: never aggregate or pick a first property silently.
  if (isMultiProperty(workspace)) {
    return {
      id: "property", label: "Logement", owner: "F010", status: "unsupported",
      summary: "Dossier multi-biens non pris en charge dans ce lot.",
      facts: emptyFacts, sources: [], provenance: "unavailable",
      missing: emptyFacts.map(fact => fact.label),
    };
  }

  const property = workspace.properties[0];
  if (!property) {
    return {
      id: "property", label: "Logement", owner: "F010", status: "incomplete",
      summary: "Aucun logement enregistré.",
      facts: emptyFacts, sources: [], provenance: "unavailable",
      missing: emptyFacts.map(fact => fact.label),
    };
  }

  const draft = workspace.declarationDraft;
  // Exercise-scoped F010 output: only trusted for the active fiscal year, same guard as isLogementComplete.
  const amortissement = isAnnualOutputForActiveYear(draft?.logementAmortissement, workspace.fiscalYear.year)
    ? draft?.logementAmortissement : undefined;
  const fieldSources = amortissement?.fieldSources ?? {};
  // Stable, cross-year F010 base (composants bâti/mobilier/travaux) — distinct from the exercise output above.
  const base = property.amortissementBase;
  const sourceDocument = workspace.documents.find(doc => doc.id === property.notaryDocumentId);

  const addressValue = [property.address, [property.postalCode, property.city].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ") || null;

  const facts: V3Fact[] = [
    { id: "address", label: "Adresse", value: addressValue },
    { id: "propertyType", label: "Type de bien",
      value: property.propertyType ? PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType : null },
    { id: "acquisitionDate", label: "Date d’acquisition", value: known(property.acquisitionDate) },
    { id: "prixRevient", label: "Prix de revient (F010)", value: money(amortissement?.prixRevient),
      evidence: fieldSourceLabel(fieldSources.prixRevient) },
    { id: "fraisEnCharges", label: "Frais d’acquisition déduits en charges (F010)", value: money(amortissement?.fraisEnCharges),
      evidence: fieldSourceLabel(fieldSources.fraisEnCharges) },
    // Deliberately distinct from acquisitionDate — F010's own stable "mise en service" base, never derived from it.
    { id: "dateMiseEnService", label: "Date de mise en service (F010)", value: known(base?.dateMiseEnService) },
  ];

  const basesFacts: V3Fact[] = base ? [
    { id: "valeurTerrain", label: "Valeur du terrain (F010)", value: money(base.valeurTerrain),
      evidence: fieldSourceLabel(fieldSources.valeurTerrain) },
    { id: "montantMobilier", label: "Montant du mobilier (F010)", value: money(base.montantMobilier),
      evidence: fieldSourceLabel(fieldSources.montantMobilier) },
    ...base.composants.map((composant, index): V3Fact => ({
      id: `composant-${index}`,
      label: `Composant F010 · ${composant.label}`,
      value: `${money(composant.montant)} · ${composant.dureeAnnees} ans`,
    })),
  ] : [];

  const allFacts = [...facts, ...basesFacts];
  const status = buildDossierSteps(draft, workspace.fiscalYear.year)
    .find(step => step.id === "logement")?.status ?? "incomplete";
  const hasFieldSourceEvidence = Object.keys(fieldSources).length > 0;
  return {
    id: "property", label: "Logement", owner: "F010", status,
    summary: status === "complete" ? "Logement analysé" : "Logement à compléter",
    facts: allFacts,
    sources: sourceDocument ? [{ id: sourceDocument.id, label: sourceDocument.fileName }] : [],
    provenance: sourceDocument || hasFieldSourceEvidence ? "partial" : "unavailable",
    missing: allFacts.filter(fact => fact.value === null).map(fact => fact.label),
  };
}

function loanLabel(index: number, bank: string | null): string {
  return bank ? `Prêt ${index + 1} (${bank})` : `Prêt ${index + 1}`;
}

function buildV3FinancingReadModel(workspace: PersistedWorkspace): V3DomainReadModel {
  // Same mono-property contract as Activity/Property: the whole dossier stays unsupported, never partial.
  if (isMultiProperty(workspace)) {
    return {
      id: "financing", label: "Financement", owner: "F011", status: "unsupported",
      summary: "Dossier multi-biens non pris en charge dans ce lot.",
      facts: [], sources: [], provenance: "unavailable", missing: [],
    };
  }

  const draft = workspace.declarationDraft;
  const loans = draft?.creditFinancing?.loans ?? [];
  // Exercise-scoped F011 output: only trusted for the active fiscal year, same guard as isCreditComplete.
  const financementCharges = isAnnualOutputForActiveYear(draft?.financementCharges, workspace.fiscalYear.year)
    ? draft?.financementCharges : undefined;
  const excludedLoanIds = new Set(financementCharges?.excludedLoanIds ?? []);
  const sourceDocument = workspace.documents.find(doc => doc.id === draft?.creditDocumentId);
  // R3.6 — F011's fieldSources is scoped to whichever loan the assistant was last editing (reset on
  // every loan change, see assistant.ts): with several loans it cannot be attributed to a specific
  // one without risk of misattribution. Uncertain provenance is never attached to a fact — only the
  // known document (sourceDocument above) is exposed as a source for this domain.

  // Never merge, average, or pick loans[0]: every declared loan is projected on its own, matched by id.
  const facts: V3Fact[] = loans.flatMap((loan, index): V3Fact[] => {
    const label = loanLabel(index, known(loan.bank));
    const contractFacts: V3Fact[] = [
      { id: `loan-${index}-loanType`, label: `${label} · Type de prêt`, value: known(loan.loanType) },
      { id: `loan-${index}-borrowedAmount`, label: `${label} · Capital emprunté`, value: money(loan.borrowedAmount) },
      // Distinct from borrowedAmount: capital read on the loan OFFER document, never derived from it.
      { id: `loan-${index}-capitalInitialOffre`, label: `${label} · Capital initial (offre)`, value: money(loan.capitalInitialOffre) },
      { id: `loan-${index}-rate`, label: `${label} · Taux`, value: percent(loan.rate) },
      { id: `loan-${index}-durationMonths`, label: `${label} · Durée`,
        value: typeof loan.durationMonths === "number" ? `${loan.durationMonths} mois` : null },
      { id: `loan-${index}-startDate`, label: `${label} · Date du prêt`, value: known(loan.startDate) },
      // Deliberately distinct from startDate — never conflated with the first-payment date.
      { id: `loan-${index}-firstPaymentDate`, label: `${label} · Date de première mensualité`, value: known(loan.firstPaymentDate) },
      { id: `loan-${index}-insurance`, label: `${label} · Assurance contractuelle (annuelle)`, value: money(loan.insurance) },
    ];

    const pret = financementCharges?.prets.find(p => p.pretId === loan.id);
    const exerciseYear = financementCharges?.exerciceFiscal ?? workspace.fiscalYear.year;
    const exerciseFacts: V3Fact[] = pret ? [
      { id: `loan-${index}-interetsExercice`, label: `${label} · Intérêts déductibles (exercice ${exerciseYear})`, value: money(pret.interetsEmpruntExercice) },
      { id: `loan-${index}-assuranceExercice`, label: `${label} · Assurance déductible (exercice ${exerciseYear})`, value: money(pret.assuranceEmpruntExercice) },
      { id: `loan-${index}-capitalRembourseExercice`, label: `${label} · Capital remboursé (exercice ${exerciseYear})`, value: money(pret.capitalRembourseExercice) },
      // Computed by F011's own engine for this exercise — never recalculated here.
      { id: `loan-${index}-capitalRestantDu`, label: `${label} · Capital restant dû au 31/12/${exerciseYear} (F011)`, value: money(pret.capitalRestantDu31_12) },
    ] : excludedLoanIds.has(loan.id) ? [
      { id: `loan-${index}-exerciseStatus`, label: `${label} · Situation exercice ${exerciseYear}`,
        value: "Exclu du calcul (date de première mensualité inconnue)" },
    ] : [];

    return [...contractFacts, ...exerciseFacts];
  });

  const status = buildDossierSteps(draft, workspace.fiscalYear.year)
    .find(step => step.id === "credit")?.status ?? "incomplete";
  const summary = loans.length === 0
    ? draft?.creditDeclaredNoneAt ? "Aucun financement déclaré" : "Aucun financement enregistré"
    : status === "complete" ? "Financement analysé" : "Financement à compléter";
  return {
    id: "financing", label: "Financement", owner: "F011", status,
    summary,
    facts,
    sources: sourceDocument ? [{ id: sourceDocument.id, label: sourceDocument.fileName }] : [],
    provenance: sourceDocument ? "partial" : "unavailable",
    missing: facts.filter(fact => fact.value === null).map(fact => fact.label),
  };
}

function buildV3RevenueReadModel(workspace: PersistedWorkspace): V3DomainReadModel {
  // Same mono-property contract as Activity/Property/Financing: never a partial aggregate.
  if (isMultiProperty(workspace)) {
    return {
      id: "revenues", label: "Loyers", owner: "F013", status: "unsupported",
      summary: "Dossier multi-biens non pris en charge dans ce lot.",
      facts: [], sources: [], provenance: "unavailable", missing: [],
    };
  }

  const draft = workspace.declarationDraft;
  // Exercise-scoped F013 output: only trusted for the active fiscal year, same guard as isRevenusComplete.
  const revenus = isAnnualOutputForActiveYear(draft?.revenusAssistant, workspace.fiscalYear.year)
    ? draft?.revenusAssistant : undefined;
  const fieldSources = revenus?.fieldSources ?? {};
  const sourceDocuments = workspace.documents.filter(doc => (draft?.revenusDocumentIds ?? []).includes(doc.id));

  // R3.6 discipline, confirmed by tracing computeRecettesExercice(): indemnitesAssurance,
  // recettesPlateforme, ajustementsJanDec and moisLocationEffectifs all fold "not applicable"
  // and "not asked" into 0 inside F013's own engine (`?? 0`) before persistence — never exposed
  // here, since V3 cannot tell a confirmed zero from an unasked question for these fields.
  const facts: V3Fact[] = [
    { id: "totalRecettes", label: "Recettes retenues (exercice)", value: money(revenus?.totalRecettes),
      evidence: fieldSourceLabel(fieldSources.revenu_declare) },
    { id: "loyersEncaisses", label: "Loyers encaissés déclarés", value: money(revenus?.loyersEncaisses),
      evidence: fieldSourceLabel(fieldSources.revenu_declare) },
    // F013's contractual expectation from the lease (computeRevenuTheorique) — never presented as
    // cash actually collected, and never derived here as loyerMensuel × 12.
    { id: "revenuTheorique", label: "Loyer prévu au bail (théorique, F013)", value: money(revenus?.revenuTheorique),
      evidence: fieldSourceLabel(fieldSources.loyer_mensuel) },
  ];

  const status = buildDossierSteps(draft, workspace.fiscalYear.year)
    .find(step => step.id === "revenus")?.status ?? "incomplete";
  const summary = status === "complete" ? "Revenus détectés" : "Revenus à compléter";
  return {
    id: "revenues", label: "Loyers", owner: "F013", status,
    summary,
    facts,
    sources: sourceDocuments.map(doc => ({ id: doc.id, label: doc.fileName })),
    provenance: sourceDocuments.length > 0 || facts.some(fact => fact.evidence) ? "partial" : "unavailable",
    missing: facts.filter(fact => fact.value === null).map(fact => fact.label),
  };
}

const CHARGE_CATEGORY_LABELS: Record<string, string> = {
  taxe_fonciere: "Taxe foncière", assurance_pno: "Assurance PNO", assurance_gli: "Assurance GLI",
  copropriete: "Copropriété", honoraires_gestion: "Honoraires et frais de gestion", travaux: "Travaux",
  honoraires_comptable: "Honoraires comptables", frais_bancaires: "Frais bancaires", divers: "Divers",
};
const CHARGE_CATEGORY_IDS = Object.keys(CHARGE_CATEGORY_LABELS);

function buildV3ChargesReadModel(workspace: PersistedWorkspace): V3DomainReadModel {
  // Same mono-property contract as the other domains: never a partial aggregate.
  if (isMultiProperty(workspace)) {
    return {
      id: "charges", label: "Dépenses", owner: "F012", status: "unsupported",
      summary: "Dossier multi-biens non pris en charge dans ce lot.",
      facts: [], sources: [], provenance: "unavailable", missing: [],
    };
  }

  const draft = workspace.declarationDraft;
  // Exercise-scoped F012 output: only trusted for the active fiscal year, same guard as isChargesComplete.
  const charges = isAnnualOutputForActiveYear(draft?.chargesAssistant, workspace.fiscalYear.year)
    ? draft?.chargesAssistant : undefined;
  // R4.5 confirmed: F012's fieldSources accumulates across categories (spread, never reset per
  // category, unlike F011's per-loan reset) and is persisted verbatim by buildChargesAssistantOutput()
  // — per-category evidence is therefore safe to attribute here (see Charges H test).
  const fieldSources = charges?.fieldSources ?? {};
  const sourceDocuments = workspace.documents.filter(doc => (draft?.chargesDocumentIds ?? []).includes(doc.id));

  const totalFacts: V3Fact[] = [
    { id: "totalDeductible", label: "Charges déductibles (exercice)", value: money(charges?.totalDeductible) },
    { id: "totalNonDeductible", label: "Charges non déductibles (exercice)", value: money(charges?.totalNonDeductible) },
    { id: "totalPreExploitation", label: "Charges avant mise en location", value: money(charges?.totalPreExploitation) },
    // Deliberately never labelled "charge déductible": these amounts are heading to F014's amortization
    // plan (via composantsNouveaux), not deducted directly from the fiscal result.
    { id: "totalAmortissable", label: "Dépenses orientées vers amortissement (F012)", value: money(charges?.totalAmortissable) },
  ];

  // R4.5: parCategorie[X] absent means "not applicable", "not asked" or "confirmed zero" —
  // F012 cannot durably distinguish these. Only a key that genuinely exists is ever shown as a
  // known amount; an absent key stays null/missing, never fabricated as "0 €".
  const categoryFacts: V3Fact[] = CHARGE_CATEGORY_IDS.map(categoryId => {
    const amount = charges?.parCategorie?.[categoryId];
    return {
      id: `category-${categoryId}`, label: CHARGE_CATEGORY_LABELS[categoryId],
      value: amount === undefined ? null : money(amount),
      evidence: fieldSourceLabel(fieldSources[categoryId]),
    };
  });

  // Real, persisted components oriented toward amortization (travaux/copro requalifiés) — never
  // presented as a deductible charge, never recomputed (no duration/dotation/plan built here).
  const componentFacts: V3Fact[] = (charges?.composantsNouveaux ?? []).map((composant, index): V3Fact => ({
    id: `component-${index}`,
    label: `Composant F012 · ${composant.label} (vers amortissement)`,
    value: `${money(composant.montant)} · ${composant.dureeAnnees} ans`,
  }));

  const facts = [...totalFacts, ...categoryFacts, ...componentFacts];
  const status = buildDossierSteps(draft, workspace.fiscalYear.year)
    .find(step => step.id === "charges")?.status ?? "incomplete";
  const summary = status === "complete" ? "Charges classées" : "Charges à compléter";
  return {
    id: "charges", label: "Dépenses", owner: "F012", status,
    summary,
    facts,
    sources: sourceDocuments.map(doc => ({ id: doc.id, label: doc.fileName })),
    provenance: sourceDocuments.length > 0 || facts.some(fact => fact.evidence) ? "partial" : "unavailable",
    missing: facts.filter(fact => fact.value === null).map(fact => fact.label),
  };
}

export function buildV3DossierDetailReadModel(workspace: PersistedWorkspace): V3DossierDetailReadModel {
  return {
    activity: buildV3ActivityReadModel(workspace),
    property: buildV3PropertyReadModel(workspace),
    financing: buildV3FinancingReadModel(workspace),
    revenue: buildV3RevenueReadModel(workspace),
    charges: buildV3ChargesReadModel(workspace),
  };
}
