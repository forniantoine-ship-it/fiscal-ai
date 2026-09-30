import { isAnnualOutputForActiveYear } from "@/lib/lmnp/services/dossier/annual-output-year-safety";
import {
  F010_REVIEW_FIELD_ORDER, collectF010ReviewConflictFields, f010ReviewFieldCurrentValue,
} from "@/lib/lmnp/services/f010/f010-review-conflicts";
import { isAvailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import {
  resolveExternalOpeningProofFromFiscalYear, resolvePriorHistoryEligibility,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { Property } from "@/lib/lmnp/types";
import type { FieldSource } from "@/runtime/contracts/FieldSource";
import { createInitialF010State, remainingF010Fields } from "@/runtime/assistants/f010-logement/assistant";
import type { F010FieldKey, F010ReviewFieldKey, F010State, F010Step } from "@/runtime/assistants/f010-logement/types";
import type { V3DocumentProcessingStatus, V3DocumentsReadModel } from "./document-read-model";
import { propertyScopeFor } from "./correction-scope";
import { PROPERTY_TYPE_LABELS } from "./read-model";
import { resolveV3PropertyServiceDate, type V3PropertyServiceDate } from "./property-service-date";

/**
 * R15.5 — projection structurée du domaine Logement (F010) POUR UN BIEN, pour la V3.
 * Transport pur des données persistées : rien n'est recalculé, rien ne vient d'une fixture.
 *
 * Contrat R15.4 : `propertyId` OBLIGATOIRE, jamais de repli sur le premier bien de la liste. Les sorties F010 actuelles
 * (`logementAmortissement`, `propertyBackgroundExtraction`, `logementAssistantState`) n'ont pas de `propertyId` : elles ne
 * sont attribuées au bien que s'il est le seul de l'exercice (`support: "full"`). Sinon (`facts_only`) seuls les faits
 * portés par l'objet `Property` lui-même sont exposés ; le reste est « non supporté actuellement ».
 */
export type V3HousingScopeReason = "no_property_id" | "unknown_property" | "not_in_fiscal_year" | "ambiguous" | "no_property";

export type V3HousingFactId =
  | "address" | "propertyType" | "surface" | "acquisitionDate" | "acquisitionPrice" | "notaryFees" | "feesTreatment"
  | "furniture" | "landShare";

export type V3HousingOrigin = { kind: FieldSource | "unknown" };
export type V3HousingFactStatus = "retained" | "to_confirm";

export interface V3HousingFact {
  id: V3HousingFactId;
  label: string;
  value: string;
  status: V3HousingFactStatus;
  origin: V3HousingOrigin;
}

/** Situation d'entrée du bien — PROJECTION en lecture seule des données existantes, jamais persistée. */
export interface V3HousingEntry {
  kind: "takeover" | "first_declaration" | "continuation" | "undetermined";
  /** Pourquoi « non déterminée » quand c'est le cas. */
  reason?: "not_attributable_to_property" | "answer_required" | "takeover_declared_not_validated" | "continuity_missing" | "claim_without_continuity";
  /** Reprise validée : actifs de l'Opening rattachés à CE bien / sans bien renseigné (jamais attribués). */
  openingAssets?: { attributed: number; unattributed: number };
}

export type V3HousingDecision =
  | { kind: "review_conflict"; field: F010ReviewFieldKey; label: string; currentValue: string; proposedValue: string }
  | { kind: "service_date_conflict"; candidates: Array<{ source: string; value: string }> };

export interface V3HousingComputed {
  prixRevient: number;
  valeurTerrain: number;
  valeurBati: number;
  baseAmortissableBati: number;
  dotationAnnuelle: number;
}

export interface V3HousingDocument {
  id: string;
  label: string;
  status: V3DocumentProcessingStatus | "unknown";
}

export type V3HousingDetail =
  | { state: "scope_unresolved"; reason: V3HousingScopeReason; year: number }
  | {
      state: "known";
      propertyId: string;
      year: number;
      label: string;
      address: string | null;
      /** `full` : le bien est le seul de l'exercice, les sorties F010 lui sont attribuables. `facts_only` : sinon. */
      support: "full" | "facts_only";
      entry: V3HousingEntry;
      /** Sortie annuelle F010 confirmée pour l'exercice (plan calculé et validé). Toujours faux en `facts_only`. */
      confirmed: boolean;
      facts: V3HousingFact[];
      computed?: V3HousingComputed;
      serviceDate: V3PropertyServiceDate;
      /** Champs F010 encore à demander (règle F010 exposée par `remainingF010Fields`), hors ceux déjà proposés par un document. */
      remaining: F010FieldKey[];
      /** Propositions de document non encore confirmées (hors conflits). */
      toConfirm: F010ReviewFieldKey[];
      decisions: V3HousingDecision[];
      /** Étape réelle de la session F010 (bloquée sans date, plan à valider…), si une session existe. */
      f010Step?: F010Step;
      documents: V3HousingDocument[];
    };

export const V3_HOUSING_FIELD_LABELS: Record<F010FieldKey, string> = {
  prixAcquisition: "Prix d’acquisition", typeBien: "Type de bien", dateAcquisition: "Date d’acquisition",
  fraisNotaire: "Frais de notaire", choixTraitementFrais: "Traitement des frais", montantMobilier: "Mobilier",
  ratioTerrain: "Part de terrain", surface: "Surface", adresse: "Adresse",
};

const TYPE_BIEN_LABELS: Record<string, string> = { appartement: "Appartement", maison: "Maison", autre: "Autre" };

/** Whole euros stay whole; cents are shown when present. Display only — never a calculation. */
function euros(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value)} €`;
}

function format(field: F010FieldKey, raw: number | string): string {
  switch (field) {
    case "prixAcquisition": case "fraisNotaire": case "montantMobilier":
      return typeof raw === "number" ? euros(raw) : Number.isFinite(Number(raw)) ? euros(Number(raw)) : String(raw);
    case "surface": return `${raw} m²`;
    case "typeBien": return TYPE_BIEN_LABELS[String(raw)] ?? PROPERTY_TYPE_LABELS[String(raw)] ?? String(raw);
    case "choixTraitementFrais": return raw === "integration" ? "Intégrés à la valeur du bien" : raw === "deduction" ? "Déduits immédiatement" : String(raw);
    case "ratioTerrain": return typeof raw === "number" ? `${Math.round(raw * 100)} %` : String(raw);
    default: return String(raw);
  }
}

const FACT_FIELDS: Array<{ id: V3HousingFactId; field: F010FieldKey }> = [
  { id: "address", field: "adresse" }, { id: "propertyType", field: "typeBien" }, { id: "surface", field: "surface" },
  { id: "acquisitionDate", field: "dateAcquisition" }, { id: "acquisitionPrice", field: "prixAcquisition" },
  { id: "notaryFees", field: "fraisNotaire" }, { id: "feesTreatment", field: "choixTraitementFrais" },
  { id: "furniture", field: "montantMobilier" }, { id: "landShare", field: "ratioTerrain" },
];

/** Scope resolution, fail-closed. Never picks a property: it only verifies the one it is given. */
export function resolveV3HousingScope(
  workspace: PersistedWorkspace,
  propertyId: string | null | undefined,
): { ok: true; property: Property } | { ok: false; reason: V3HousingScopeReason } {
  if (typeof propertyId !== "string" || !propertyId.trim()) return { ok: false, reason: "no_property_id" };
  if (workspace.properties.length === 0) return { ok: false, reason: "no_property" };
  const matching = workspace.properties.filter(item => item.id === propertyId);
  const inYear = workspace.fiscalYear.propertyIds.filter(id => id === propertyId);
  if (matching.length > 1 || inYear.length > 1) return { ok: false, reason: "ambiguous" };
  if (matching.length === 0) return { ok: false, reason: "unknown_property" };
  if (inYear.length === 0) return { ok: false, reason: "not_in_fiscal_year" };
  return { ok: true, property: matching[0]! };
}

function projectEntry(workspace: PersistedWorkspace, propertyId: string, support: "full" | "facts_only"): V3HousingEntry {
  if (support !== "full") return { kind: "undetermined", reason: "not_attributable_to_property" };
  const fiscalYear = workspace.fiscalYear;
  const eligibility = resolvePriorHistoryEligibility(fiscalYear, resolveExternalOpeningProofFromFiscalYear(fiscalYear));
  if (eligibility.eligible) {
    if (eligibility.status === "EXTERNAL_HISTORY") {
      const assets = fiscalYear.externalTakeoverOpening?.opening.assets;
      const list = assets && isAvailable(assets) ? assets.value : [];
      return {
        kind: "takeover",
        openingAssets: {
          attributed: list.filter(asset => asset.propertyId === propertyId).length,
          unattributed: list.filter(asset => !asset.propertyId).length,
        },
      };
    }
    return { kind: eligibility.status === "FIRST_REAL_YEAR" ? "first_declaration" : "continuation" };
  }
  switch (eligibility.reason) {
    case "ANSWER_REQUIRED": return { kind: "undetermined", reason: "answer_required" };
    case "EXTERNAL_HISTORY_DECLARED": return { kind: "undetermined", reason: "takeover_declared_not_validated" };
    case "FISCAL_AI_CLAIM_WITHOUT_CONTINUITY": return { kind: "undetermined", reason: "claim_without_continuity" };
    case "NATIVE_CONTINUITY_MISSING": return { kind: "undetermined", reason: "continuity_missing" };
  }
}

function processingStatusFor(id: string, documents: V3DocumentsReadModel | undefined): V3HousingDocument["status"] {
  if (!documents || documents.state !== "known") return "unknown";
  return documents.documents.find(item => item.id === id)?.processingStatus ?? "unknown";
}

function addressOf(property: Property): string | null {
  const value = [property.address?.trim(), [property.postalCode, property.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return value || null;
}

export function buildV3HousingDetail(
  workspace: PersistedWorkspace,
  propertyId: string | null | undefined,
  documents?: V3DocumentsReadModel,
): V3HousingDetail {
  const year = workspace.fiscalYear.year;
  const scope = resolveV3HousingScope(workspace, propertyId);
  if (!scope.ok) return { state: "scope_unresolved", reason: scope.reason, year };
  const { property } = scope;
  const id = property.id;

  const exerciseScope = propertyScopeFor(workspace.fiscalYear.propertyIds, workspace.properties);
  const support: "full" | "facts_only" = exerciseScope?.kind === "required" && exerciseScope.propertyId === id ? "full" : "facts_only";
  const serviceDate = resolveV3PropertyServiceDate(workspace, id);
  const entry = projectEntry(workspace, id, support);
  const base = { state: "known" as const, propertyId: id, year, label: property.label, address: addressOf(property), support, entry, serviceDate };

  // Facts carried by the Property record itself: attributable to this property in every case.
  const propertyValue = (field: F010FieldKey): string | undefined => {
    switch (field) {
      case "adresse": return property.address?.trim() || undefined;
      case "typeBien": return property.propertyType ? format("typeBien", property.propertyType) : undefined;
      case "surface": return property.surface !== undefined ? format("surface", property.surface) : undefined;
      case "dateAcquisition": return property.acquisitionDate?.trim() || undefined;
      default: return undefined;
    }
  };

  if (support === "facts_only") {
    const facts = FACT_FIELDS.flatMap(({ id: factId, field }): V3HousingFact[] => {
      const value = propertyValue(field);
      return value === undefined ? [] : [{ id: factId, label: V3_HOUSING_FIELD_LABELS[field], value, status: "retained", origin: { kind: "unknown" } }];
    });
    return { ...base, confirmed: false, facts, remaining: [], toConfirm: [], decisions: serviceDateDecisions(serviceDate), documents: [] };
  }

  // Full support: the single-property F010 outputs belong to this property.
  const draft = workspace.declarationDraft;
  const session: F010State | undefined = draft?.logementAssistantState;
  const output = isAnnualOutputForActiveYear(draft?.logementAmortissement, year) ? draft?.logementAmortissement : undefined;
  const confirmed = output !== undefined;
  const background = draft?.propertyBackgroundExtraction;

  const retained = (field: F010FieldKey): string | undefined => {
    switch (field) {
      case "prixAcquisition": return background?.acquisitionPrice !== undefined ? format(field, background.acquisitionPrice) : undefined;
      case "fraisNotaire": return background?.notaryFees !== undefined ? format(field, background.notaryFees) : undefined;
      case "montantMobilier": {
        const amount = background?.furnitureAmount ?? output?.montantMobilier;
        return amount !== undefined ? format(field, amount) : undefined;
      }
      case "choixTraitementFrais": return session?.choixTraitementFrais ? format(field, session.choixTraitementFrais) : undefined;
      case "ratioTerrain": return session?.ratioTerrain !== undefined ? format(field, session.ratioTerrain) : undefined;
      default: return propertyValue(field);
    }
  };
  const fromSession = (field: F010FieldKey): string | undefined => {
    const raw = session?.[field];
    return raw === undefined || raw === null || raw === "" ? undefined : format(field, raw as number | string);
  };

  const reviewFields = session?.review?.fields;
  const pendingReview = new Set<F010ReviewFieldKey>(
    reviewFields ? F010_REVIEW_FIELD_ORDER.filter(field => reviewFields[field].status === "pending" && reviewFields[field].proposedValue !== undefined) : [],
  );
  const conflictFields = new Set<F010ReviewFieldKey>(session ? collectF010ReviewConflictFields(session) : []);

  const facts = FACT_FIELDS.flatMap(({ id: factId, field }): V3HousingFact[] => {
    const label = V3_HOUSING_FIELD_LABELS[field];
    const sourceKey = (confirmed ? output?.fieldSources[field] : undefined) ?? session?.fieldSources[field];
    const origin: V3HousingOrigin = { kind: sourceKey ?? "unknown" };
    if (confirmed) {
      const value = retained(field) ?? fromSession(field);
      return value === undefined ? [] : [{ id: factId, label, value, status: "retained", origin }];
    }
    const validated = fromSession(field);
    if (validated !== undefined) return [{ id: factId, label, value: validated, status: "to_confirm", origin }];
    const proposal = field in (reviewFields ?? {}) ? reviewFields?.[field as F010ReviewFieldKey] : undefined;
    if (proposal?.status === "pending" && proposal.proposedValue !== undefined) {
      return [{ id: factId, label, value: format(field, proposal.proposedValue), status: "to_confirm", origin: { kind: proposal.source } }];
    }
    const own = propertyValue(field);
    return own === undefined ? [] : [{ id: factId, label, value: own, status: "retained", origin: { kind: "unknown" } }];
  });

  const remaining = confirmed
    ? []
    : remainingF010Fields(session ?? createInitialF010State()).filter(field => !(pendingReview as Set<string>).has(field));

  const decisions: V3HousingDecision[] = [
    ...(session ? [...conflictFields].map((field): V3HousingDecision => ({
      kind: "review_conflict", field, label: V3_HOUSING_FIELD_LABELS[field],
      currentValue: format(field, f010ReviewFieldCurrentValue(session, field) ?? ""),
      proposedValue: format(field, reviewFields?.[field].proposedValue ?? ""),
    })) : []),
    ...serviceDateDecisions(serviceDate),
  ];

  const documentId = session?.review?.documentId;
  const document = documentId ? workspace.documents.find(item => item.id === documentId) : undefined;

  return {
    ...base,
    confirmed,
    facts,
    ...(output ? {
      computed: {
        prixRevient: output.prixRevient, valeurTerrain: output.valeurTerrain, valeurBati: output.valeurBati,
        baseAmortissableBati: output.baseAmortissableBati, dotationAnnuelle: output.dotationAnnuelle,
      },
    } : {}),
    remaining,
    toConfirm: [...pendingReview].filter(field => !conflictFields.has(field)),
    decisions,
    ...(session ? { f010Step: session.step } : {}),
    documents: document ? [{ id: document.id, label: document.fileName, status: processingStatusFor(document.id, documents) }] : [],
  };
}

function serviceDateDecisions(serviceDate: V3PropertyServiceDate): V3HousingDecision[] {
  return serviceDate.status === "conflict"
    ? [{ kind: "service_date_conflict", candidates: serviceDate.candidates.map(candidate => ({ source: candidate.source, value: candidate.value })) }]
    : [];
}
