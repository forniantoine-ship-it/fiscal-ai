import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { readActiviteFieldProvenance } from "@/lib/lmnp/services/activite-field-provenance";
import { buildDossierSteps, buildMissingItems } from "@/lib/lmnp/services/validation-profile";
import { isAnnualOutputForActiveYear } from "@/lib/lmnp/services/dossier/annual-output-year-safety";
import type { FieldSource } from "@/runtime/contracts/FieldSource";
import { LOAN_FACT_PROVENANCE_KEY, exclusionFactValue, loanExclusionCauses } from "./financing-shared";
import { resolveV3ActiveBienSource, v3DocumentBelongsToBien, type V3ActiveBienSource } from "./v3-property-scope";

export type V3DomainId = "activity" | "property" | "financing" | "revenues" | "charges" | "depreciation";
export type V3DomainStatus = "complete" | "incomplete" | "unsupported" | "selection_required";
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
  amortization: V3DomainReadModel;
}

// R7 — Déclaration is conceptually distinct from the six "Votre dossier en détail" domains:
// it is F006's AGGREGATION of them, not a seventh assistant. Kept as its own type on purpose.
export type V3DeclarationStatus = "unavailable" | "computed" | "generated";

// R7.2 (audited in R7.1) — freshness is a SEPARATE axis from `status`, never mixed into it.
// "fresh"/"stale" answer "does the stored result still match the current dossier?"; "unknown"
// means there is no current-exercise result to be fresh or stale about (status "unavailable").
export type V3DeclarationFreshness = "fresh" | "stale" | "unknown";

export interface V3DeclarationDeliverable {
  id: string;
  label: string;
  status: "generated" | "not_generated";
}

export interface V3DeclarationReadModel {
  status: V3DeclarationStatus;
  // R7.2 — derived exclusively from `fiscalYear.declarationGeneratedAt`, a field the reducer
  // already clears on every contributive mutation (see declaration-draft-invalidation.ts /
  // DECLARATION_PATCH_DRAFT). V3 only reads it — it never writes it, never compares timestamps,
  // and never computes a fingerprint. See V3-R7.1 audit for the full trace.
  freshness: V3DeclarationFreshness;
  summary: string;
  facts: V3Fact[];
  // R7.2 — projected verbatim from buildMissingItems(buildDossierSteps(...)), the same pure-read
  // authority resolveDeclarationGenerationGate() itself uses for its own pure-read blockers (see
  // V3-R7.1 audit, section "PURE-READ BLOCKERS"). Never reconstructed from the six domains'
  // V3DomainReadModel.missing/status/facts, and never extended with the gate's recompute-only
  // blockers (structural drift, validateFiscalInputs anomalies) — those still require a live
  // F006/F007/RFS run this read model must never trigger.
  blockers: string[];
  deliverables: V3DeclarationDeliverable[];
  provenance: V3ProvenanceLevel;
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

export function resolveV3Amortization(source: V3PrototypeSource): V3DomainReadModel | undefined {
  return source.mode === "real" ? buildV3DossierDetailReadModel(source.workspace).amortization : undefined;
}

export function resolveV3Declaration(source: V3PrototypeSource): V3DeclarationReadModel | undefined {
  return source.mode === "real" ? buildV3DeclarationReadModel(source.workspace) : undefined;
}

export function known(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function money(value: number | undefined): string | null {
  return typeof value === "number" ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} €` : null;
}

export function percent(value: number | undefined): string | null {
  return typeof value === "number" ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} %` : null;
}

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  appartement: "Appartement", maison: "Maison", "meuble-tourisme": "Meublé de tourisme",
  "chambre-hote": "Chambre d’hôte", "non-classe": "Non classé",
};

const FIELD_SOURCE_LABELS: Record<FieldSource, string> = {
  extracted: "Extrait", estimated: "Estimé", manual: "Saisi", derived: "Dérivé",
  judgment: "Choix de jugement", user_correction: "Corrigé",
};

export function fieldSourceLabel(source: FieldSource | undefined): string | undefined {
  return source ? FIELD_SOURCE_LABELS[source] : undefined;
}

export function isMultiProperty(workspace: PersistedWorkspace): boolean {
  return workspace.properties.length > 1 || workspace.fiscalYear.propertyIds.length > 1;
}

/** Carte d'un domaine de bien qui ne peut pas être lue : sélection requise (multi sans bien actif) ou non supporté (fail-closed). */
function blockedBienCard(source: Exclude<V3ActiveBienSource, { kind: "bien" } | { kind: "no_property" }>): Pick<V3DomainReadModel, "status" | "summary"> {
  return source.kind === "selection_required"
    ? { status: "selection_required", summary: "Choisissez un bien pour afficher cette rubrique." }
    : { status: "unsupported", summary: "Dossier multi-biens non pris en charge dans ce lot." };
}

function buildV3ActivityReadModel(workspace: PersistedWorkspace): V3DomainReadModel {
  // F009 est une donnée d'ACTIVITÉ (niveau exercice) : jamais dupliquée ni filtrée par bien, lue à l'identique en mono et en multi.
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

function buildV3PropertyReadModel(workspace: PersistedWorkspace, activePropertyId?: string | null): V3DomainReadModel {
  const emptyFacts: V3Fact[] = [
    { id: "address", label: "Adresse", value: null },
    { id: "propertyType", label: "Type de bien", value: null },
    { id: "acquisitionDate", label: "Date d’acquisition", value: null },
    { id: "prixRevient", label: "Prix de revient (F010)", value: null },
    { id: "fraisEnCharges", label: "Frais d’acquisition déduits en charges (F010)", value: null },
    { id: "dateMiseEnService", label: "Date de mise en service (F010)", value: null },
  ];

  // Same mono-property contract as Activity: never aggregate or pick a first property silently.
  // R2A — the property-scoped values of this mono read model come from the single property's BienDraft.
  const source = resolveV3ActiveBienSource(workspace, activePropertyId);
  if (source.kind === "unsupported" || source.kind === "selection_required") {
    return {
      id: "property", label: "Logement", owner: "F010", ...blockedBienCard(source),
      facts: emptyFacts, sources: [], provenance: "unavailable",
      missing: emptyFacts.map(fact => fact.label),
    };
  }

  const property = source.kind === "bien" ? workspace.properties.find(item => item.id === source.propertyId) : undefined;
  if (!property) {
    return {
      id: "property", label: "Logement", owner: "F010", status: "incomplete",
      summary: "Aucun logement enregistré.",
      facts: emptyFacts, sources: [], provenance: "unavailable",
      missing: emptyFacts.map(fact => fact.label),
    };
  }

  const draft = source.draft;
  // Exercise-scoped F010 output: only trusted for the active fiscal year, same guard as isLogementComplete.
  const amortissement = isAnnualOutputForActiveYear(draft?.logementAmortissement, workspace.fiscalYear.year)
    ? draft?.logementAmortissement : undefined;
  const fieldSources = amortissement?.fieldSources ?? {};
  // Stable, cross-year F010 base (composants bâti/mobilier/travaux) — distinct from the exercise output above.
  const base = property.amortissementBase;
  const sourceDocument = workspace.documents.find(doc => doc.id === property.notaryDocumentId && v3DocumentBelongsToBien(workspace, doc, property.id));

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

function buildV3FinancingReadModel(workspace: PersistedWorkspace, activePropertyId?: string | null): V3DomainReadModel {
  // Same mono-property contract as Activity/Property: the whole dossier stays unsupported, never partial.
  // R2A — the property-scoped values of this mono read model come from the single property's BienDraft.
  const source = resolveV3ActiveBienSource(workspace, activePropertyId);
  if (source.kind === "unsupported" || source.kind === "selection_required") {
    return {
      id: "financing", label: "Financement", owner: "F011", ...blockedBienCard(source),
      facts: [], sources: [], provenance: "unavailable", missing: [],
    };
  }

  const draft = source.draft;
  const loans = draft?.creditFinancing?.loans ?? [];
  // Exercise-scoped F011 output: only trusted for the active fiscal year, same guard as isCreditComplete.
  const financementCharges = isAnnualOutputForActiveYear(draft?.financementCharges, workspace.fiscalYear.year)
    ? draft?.financementCharges : undefined;
  const excludedLoanIds = new Set(financementCharges?.excludedLoanIds ?? []);
  const owns = (doc: { id?: string; propertyId?: string | null }) => source.kind !== "bien" || v3DocumentBelongsToBien(workspace, doc, source.propertyId);
  const sourceDocument = workspace.documents.find(doc => doc.id === draft?.creditDocumentId && owns(doc));
  // R3.6 — F011's financementCharges.fieldSources is scoped to whichever loan the assistant was last editing
  // (reset on every loan change, see assistant.ts): with several loans it cannot be attributed to a specific
  // one without risk of misattribution, so it is never read. The only provenance attached to a fact is the one
  // carried BY the loan itself (LoanProfile.provenance, frozen at confirm_loan, replaced together with the loan);
  // without it, only the known document (sourceDocument above) is exposed as a source for this domain.

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
    ].map((fact): V3Fact => {
      // Provenance travels WITH the loan (LoanProfile.provenance): never looked up by id, never taken from another loan
      // nor from financementCharges.fieldSources. No entry → no evidence (unknown, never invented).
      const key = LOAN_FACT_PROVENANCE_KEY[fact.id.slice(`loan-${index}-`.length)];
      const evidence = fact.value !== null && key ? fieldSourceLabel(loan.provenance?.[key]?.source) : undefined;
      return evidence ? { ...fact, evidence } : fact;
    });

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
        value: exclusionFactValue(loanExclusionCauses({ loans, installments: draft?.creditFinancing?.installments ?? [] }, loan, workspace.fiscalYear.year)) },
    ] : [];

    return [...contractFacts, ...exerciseFacts];
  });

  const status = buildDossierSteps(draft, workspace.fiscalYear.year)
    .find(step => step.id === "credit")?.status ?? "incomplete";
  const summary = loans.length === 0
    ? draft?.creditDeclaredNoneAt ? "Aucun financement déclaré" : "Aucun financement enregistré"
    : status === "complete" ? "Financement analysé" : "Financement à compléter";
  // Documents that actually provided (or first proposed, before a user correction) a loan value, restricted to documents
  // still present in the workspace. When any loan carries provenance it is authoritative: the dossier-level
  // creditDocumentId is only the fallback for dossiers without per-loan provenance.
  const provenanceDocumentIds = [...new Set(loans.flatMap(loan =>
    Object.values(loan.provenance ?? {}).flatMap(entry => entry?.documentId ? [entry.documentId] : [])))];
  const hasLoanProvenance = loans.some(loan => Object.keys(loan.provenance ?? {}).length > 0);
  const sources = hasLoanProvenance
    ? provenanceDocumentIds.flatMap(id => {
      const doc = workspace.documents.find(d => d.id === id && owns(d));
      return doc ? [{ id: doc.id, label: doc.fileName }] : [];
    })
    : sourceDocument ? [{ id: sourceDocument.id, label: sourceDocument.fileName }] : [];
  return {
    id: "financing", label: "Financement", owner: "F011", status,
    summary,
    facts,
    sources,
    provenance: sources.length > 0 || facts.some(fact => fact.evidence !== undefined) ? "partial" : "unavailable",
    missing: facts.filter(fact => fact.value === null).map(fact => fact.label),
  };
}

function buildV3RevenueReadModel(workspace: PersistedWorkspace, activePropertyId?: string | null): V3DomainReadModel {
  // Same mono-property contract as Activity/Property/Financing: never a partial aggregate.
  // R2A — the property-scoped values of this mono read model come from the single property's BienDraft.
  const source = resolveV3ActiveBienSource(workspace, activePropertyId);
  if (source.kind === "unsupported" || source.kind === "selection_required") {
    return {
      id: "revenues", label: "Loyers", owner: "F013", ...blockedBienCard(source),
      facts: [], sources: [], provenance: "unavailable", missing: [],
    };
  }

  const draft = source.draft;
  // Exercise-scoped F013 output: only trusted for the active fiscal year, same guard as isRevenusComplete.
  const revenus = isAnnualOutputForActiveYear(draft?.revenusAssistant, workspace.fiscalYear.year)
    ? draft?.revenusAssistant : undefined;
  const fieldSources = revenus?.fieldSources ?? {};
  const sourceDocuments = workspace.documents.filter(doc => (draft?.revenusDocumentIds ?? []).includes(doc.id) && (source.kind !== "bien" || v3DocumentBelongsToBien(workspace, doc, source.propertyId)));

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

function buildV3ChargesReadModel(workspace: PersistedWorkspace, activePropertyId?: string | null): V3DomainReadModel {
  // Same mono-property contract as the other domains: never a partial aggregate.
  // R2A — the property-scoped values of this mono read model come from the single property's BienDraft.
  const source = resolveV3ActiveBienSource(workspace, activePropertyId);
  if (source.kind === "unsupported" || source.kind === "selection_required") {
    return {
      id: "charges", label: "Dépenses", owner: "F012", ...blockedBienCard(source),
      facts: [], sources: [], provenance: "unavailable", missing: [],
    };
  }

  const draft = source.draft;
  // Exercise-scoped F012 output: only trusted for the active fiscal year, same guard as isChargesComplete.
  const charges = isAnnualOutputForActiveYear(draft?.chargesAssistant, workspace.fiscalYear.year)
    ? draft?.chargesAssistant : undefined;
  // R4.5 confirmed: F012's fieldSources accumulates across categories (spread, never reset per
  // category, unlike F011's per-loan reset) and is persisted verbatim by buildChargesAssistantOutput()
  // — per-category evidence is therefore safe to attribute here (see Charges H test).
  const fieldSources = charges?.fieldSources ?? {};
  const sourceDocuments = workspace.documents.filter(doc => (draft?.chargesDocumentIds ?? []).includes(doc.id) && (source.kind !== "bien" || v3DocumentBelongsToBien(workspace, doc, source.propertyId)));

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

export const AMORTISSEMENT_PROFIL_LABELS: Record<string, string> = {
  "PROF-001": "Première année d’amortissement",
  "PROF-002": "Plan repris sans nouvel élément",
  "PROF-003": "Plan repris avec de nouveaux éléments",
};

function buildV3AmortizationReadModel(workspace: PersistedWorkspace, activePropertyId?: string | null): V3DomainReadModel {
  // Same mono-property contract as the other domains: never a partial aggregate.
  // R2A — the property-scoped values of this mono read model come from the single property's BienDraft.
  const source = resolveV3ActiveBienSource(workspace, activePropertyId);
  if (source.kind === "unsupported" || source.kind === "selection_required") {
    return {
      id: "depreciation", label: "Amortissements", owner: "F014", ...blockedBienCard(source),
      facts: [], sources: [], provenance: "unavailable", missing: [],
    };
  }

  const draft = source.draft;
  // Exercise-scoped F014 output: only trusted for the active fiscal year, same guard as isAmortissementComplete.
  const amortissement = isAnnualOutputForActiveYear(draft?.amortissementAssistant, workspace.fiscalYear.year)
    ? draft?.amortissementAssistant : undefined;

  // F014 shows its own annual RESULT only — never F010's base/plan or F012's composantsNouveaux
  // again (already shown under Logement/Dépenses), and never F006's deficits/reports (owned by F006).
  const facts: V3Fact[] = [
    { id: "totalDotations", label: "Amortissements calculés pour l’exercice", value: money(amortissement?.totalDotations) },
    // planVersion is an internal technical identifier (f014-{exercice}-{date}) — never shown.
    { id: "profil", label: "Profil du plan",
      value: amortissement ? AMORTISSEMENT_PROFIL_LABELS[amortissement.profil] ?? amortissement.profil : null },
  ];

  const status = buildDossierSteps(draft, workspace.fiscalYear.year)
    .find(step => step.id === "amortissement")?.status ?? "incomplete";
  // Presentational only: a contested plan keeps its computed amount visible (never hidden as
  // "no data"), but the domain status stays incomplete and the summary never claims it validated.
  const summary = status === "complete" ? "Amortissements calculés"
    : amortissement?.status === "contested" ? "Amortissements calculés, à vérifier"
    : "Amortissements à compléter";
  return {
    id: "depreciation", label: "Amortissements", owner: "F014", status,
    summary,
    facts,
    sources: [],
    // AmortissementAssistantOutput carries no fieldSources: F014 is a computed result, never a
    // document-traced fact — never borrow F010's or F012's provenance to imply otherwise.
    provenance: "unavailable",
    missing: facts.filter(fact => fact.value === null).map(fact => fact.label),
  };
}

/**
 * `activePropertyId` : bien actif vérifié (scope V3). Il pilote UNIQUEMENT les rubriques de bien (F010–F014) d'un dossier multi ;
 * l'activité (F009) ne dépend jamais d'un bien. Mono : ignoré. Multi sans bien actif : rubriques `selection_required`, jamais le premier bien.
 */
export function buildV3DossierDetailReadModel(workspace: PersistedWorkspace, activePropertyId?: string | null): V3DossierDetailReadModel {
  return {
    activity: buildV3ActivityReadModel(workspace),
    property: buildV3PropertyReadModel(workspace, activePropertyId),
    financing: buildV3FinancingReadModel(workspace, activePropertyId),
    revenue: buildV3RevenueReadModel(workspace, activePropertyId),
    charges: buildV3ChargesReadModel(workspace, activePropertyId),
    amortization: buildV3AmortizationReadModel(workspace, activePropertyId),
  };
}

function buildV3DeclarationReadModel(workspace: PersistedWorkspace): V3DeclarationReadModel {
  const draft = workspace.declarationDraft;
  // Level A (calcul disponible) — the REAL, persisted F006 output only, matched to the active
  // fiscal year (FiscalEngineOutput uses `exercice`, not `exerciceFiscal`, so the shared
  // isAnnualOutputForActiveYear() helper's shape doesn't apply — same discipline, written inline).
  // Never buildFiscalSummary()'s estimate (an approximation used for previews elsewhere, not F006's
  // truth), and never F014's totalDotations again (already shown by the Amortization domain).
  const fiscalResult = draft?.fiscalResult?.exercice === workspace.fiscalYear.year ? draft.fiscalResult : undefined;

  // Level C (documents générés) — a pure existence check on the last persisted, immutable
  // generation snapshot. Never recomputed, never re-run.
  const versions = draft?.declarationVersions ?? [];
  const currentVersion = draft?.declaration?.currentVersionId
    ? versions.find(version => version.id === draft.declaration!.currentVersionId)
    : versions.at(-1);

  const facts: V3Fact[] = [
    { id: "totalRecettes", label: "Recettes retenues (F006)", value: money(fiscalResult?.totalRecettes) },
    { id: "totalCharges", label: "Charges retenues (F006)", value: money(fiscalResult?.totalCharges) },
    { id: "resultatAvantAmort", label: "Résultat avant amortissement", value: money(fiscalResult?.resultatAvantAmort) },
    // Deliberately distinct from the Amortization domain's totalDotations (F014's calculated
    // figure): this is what F006 actually deducted, which can differ after a fiscal limitation.
    { id: "amortDeduct", label: "Amortissements fiscalement déduits (F006)", value: money(fiscalResult?.amortDeduct) },
    { id: "amortReporte", label: "Stock d’amortissements non déduits reporté", value: money(fiscalResult?.amortReporte) },
    { id: "amortNonDeduitExercice", label: "Amortissements non déduits sur l’exercice", value: money(fiscalResult?.amortNonDeduitExercice) },
    { id: "resultatFiscal", label: "Résultat fiscal", value: money(fiscalResult?.resultatFiscal) },
    { id: "deficitNouveau", label: "Déficit constaté cet exercice", value: money(fiscalResult?.deficitNouveau) },
  ];

  // Prior-year deficit stock: each persisted entry projected as-is, never summed or fused by V3.
  const deficitFacts: V3Fact[] = (fiscalResult?.stocks.deficits ?? []).map((entry, index): V3Fact => ({
    id: `deficit-stock-${index}`,
    label: `Déficit antérieur reporté (${entry.millesime})`,
    value: money(entry.montant),
  }));

  const allFacts = [...facts, ...deficitFacts];

  // Which forms were actually assembled in the last generation, straight from the canonical
  // ADR-004 tracking already computed by assembleLiasseFromRfs() — never guessed by V3.
  const deliverables: V3DeclarationDeliverable[] = currentVersion ? [
    ...currentVersion.liasseRfs.formulairesGeneres.map((id): V3DeclarationDeliverable => ({ id, label: id, status: "generated" })),
    ...currentVersion.liasseRfs.formulairesManquants.map((id): V3DeclarationDeliverable => ({ id, label: id, status: "not_generated" })),
  ] : [];

  const status: V3DeclarationStatus = currentVersion ? "generated" : fiscalResult ? "computed" : "unavailable";
  const summary = status === "generated" ? "Déclaration générée"
    : status === "computed" ? "Résultat fiscal calculé, déclaration non encore générée"
    : "Résultat fiscal non disponible";

  // R7.2 — freshness is orthogonal to `status`: a "generated" or "computed" declaration can still
  // be stale. No fiscalResult for the active exercise means there is nothing to be fresh/stale
  // about ("unknown"), never "unavailable" implying fresh-by-default. Fail-closed on a legacy
  // dossier that never set this field: absent → "stale", never assumed fresh.
  const freshness: V3DeclarationFreshness = !fiscalResult
    ? "unknown"
    : workspace.fiscalYear.declarationGeneratedAt
    ? "fresh"
    : "stale";

  // R7.2 — pure-read blockers, projected verbatim from the same authority the real generation
  // gate itself uses for its own pure-read blockers. Never reconstructed from the six domains.
  const blockers = buildMissingItems(buildDossierSteps(draft, workspace.fiscalYear.year))
    .map(item => item.label);

  return {
    status,
    freshness,
    summary,
    facts: allFacts,
    blockers,
    deliverables,
    // FiscalResult is a computed aggregation, never a document-traced fact — no fieldSources
    // exist for it, and none are borrowed from the six domains to imply otherwise.
    provenance: "unavailable",
  };
}
