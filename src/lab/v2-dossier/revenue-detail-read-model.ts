import { isAnnualOutputForActiveYear } from "@/lib/lmnp/services/dossier/annual-output-year-safety";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { RevenusAssistantOutput } from "@/lib/lmnp/types/domain";
import type { FieldSource } from "@/runtime/contracts/FieldSource";
import { blockingAnomalies } from "@/runtime/assistants/f013-revenus/assistant";
import type { V3DocumentProcessingStatus, V3DocumentsReadModel } from "./document-read-model";
import { resolveV3PropertyServiceDate, type V3PropertyServiceDate } from "./property-service-date";
import {
  projectV3PropertyEntry, resolveV3PropertyScope, resolveV3PropertySupport,
  type V3PropertyEntry, type V3PropertyScopeReason, type V3PropertySupport, v3BienDraft,
} from "./v3-property-scope";

/**
 * R15.6 — projection structurée du domaine Revenus (F013) POUR UN BIEN, pour la V3.
 * Transport pur des données persistées : aucun total n'est recalculé, rien ne vient d'une fixture ni de la session
 * documentaire (dont les libellés par défaut peuvent être fictifs).
 *
 * - Le montant fiscal est `revenusAssistant.totalRecettes` tel que persisté. `loyersEncaisses` CONTIENT déjà l'ajustement
 *   janvier/décembre : `ajustementsJanDec` n'est jamais une composante à additionner.
 * - Absent ≠ zéro : sortie absente = inconnu ; sortie confirmée à 0 = zéro confirmé.
 * - Le revenu théorique et les mois de location sont des dérivés du bail et de la date de mise en service : exposés
 *   seulement si l'on peut démontrer qu'ils reposent sur une date réelle (voir `derivedFromRealDate`).
 * - Les sorties F013 n'ont pas de `propertyId` : attribuées au bien seulement s'il est le seul de l'exercice.
 */
export type V3RevenueChannel = "conversational" | "documents" | "unknown";

export type V3RevenueTotal =
  /** Plusieurs biens : la sortie globale n'est attribuable à aucun bien. */
  | { state: "not_attributable" }
  | { state: "unknown" }
  | { state: "unconfirmed"; amount: number }
  | { state: "confirmed_zero" }
  | { state: "known_amount"; amount: number };

export interface V3RevenueComponent {
  id: "rents" | "insurance" | "platform";
  label: string;
  /** Toujours > 0 : une composante à zéro n'est jamais exposée (0 = « non renseigné » ou « non demandé »). */
  amount: number;
  origin: { kind: FieldSource | "unknown" };
  /** Loyers : ajustement janvier/décembre DÉJÀ compris dans `amount` (information, jamais à additionner). */
  includesJanDecAdjustment?: number;
}

/** Estimation d'après le bail — jamais un revenu encaissé. */
export interface V3RevenueTheoretical { amount: number; rentalMonths?: number }

export interface V3RevenueDocument {
  id: string;
  label: string;
  status: V3DocumentProcessingStatus | "unknown";
}

export type V3RevenueDetail =
  | { state: "scope_unresolved"; reason: V3PropertyScopeReason; year: number }
  | {
      state: "known";
      propertyId: string;
      year: number;
      label: string;
      address: string | null;
      support: V3PropertySupport;
      channel: V3RevenueChannel;
      /** Sortie F013 de l'exercice, marquée confirmée (`revenusConfirmedAt`). */
      confirmed: boolean;
      total: V3RevenueTotal;
      components: V3RevenueComponent[];
      /** Les trois parties persistées reconstituent le total au centime (contrôle de présentation, jamais un calcul métier). */
      reconciliation?: { reconciled: boolean };
      /** Estimation d'après le bail — jamais un revenu encaissé. */
      theoretical?: V3RevenueTheoretical;
      serviceDate: V3PropertyServiceDate;
      entry: V3PropertyEntry;
      /** Messages des anomalies bloquantes persistées (`blockingAnomalies` F013, seule définition de « bloquant »). */
      blocking: string[];
      documents: V3RevenueDocument[];
    };

export const V3_REVENUE_COMPONENT_LABELS: Record<V3RevenueComponent["id"], string> = {
  rents: "Loyers encaissés",
  insurance: "Indemnités d’assurance (GLI)",
  platform: "Recettes plateforme",
};

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const cents = (value: number) => Math.round(value * 100);

function channelOf(draft: PersistedWorkspace["declarationDraft"]): V3RevenueChannel {
  if (draft?.revenusExtraction) return "documents";
  // Same lock as the document step: an assistant output without extraction belongs to the conversational channel.
  if (draft?.revenusAssistant) return "conversational";
  // The document session itself is never read: its default labels can be fictitious.
  if (draft?.revenusDocumentIds?.length) return "documents";
  return "unknown";
}

function processingStatusFor(id: string, documents: V3DocumentsReadModel | undefined): V3RevenueDocument["status"] {
  if (!documents || documents.state !== "known") return "unknown";
  return documents.documents.find(item => item.id === id)?.processingStatus ?? "unknown";
}

/**
 * The derived figures (theoretical revenue, rental months) were computed by F013 from `draft.dateMiseEnService`, or from a
 * historical default date (January 1st of the year) when it was absent. They are exposed only when the persisted data proves they rest on
 * the real date: the date is known FROM THE DRAFT (what F013 reads), is not being changed, and was confirmed (F009
 * completion) no later than the F013 computation. Anything else: hidden.
 */
export function derivedFromRealDate(serviceDate: V3PropertyServiceDate, draftConfirmedAt: string | undefined, computedAt: string | undefined): boolean {
  if (serviceDate.status !== "known" || !serviceDate.origins.includes("draft") || serviceDate.unconfirmedChange !== undefined) return false;
  const confirmed = draftConfirmedAt ? Date.parse(draftConfirmedAt) : Number.NaN;
  const computed = computedAt ? Date.parse(computedAt) : Number.NaN;
  return Number.isFinite(confirmed) && Number.isFinite(computed) && confirmed <= computed;
}

export function buildV3RevenueDetail(
  workspace: PersistedWorkspace,
  propertyId: string | null | undefined,
  documents?: V3DocumentsReadModel,
): V3RevenueDetail {
  const year = workspace.fiscalYear.year;
  const scope = resolveV3PropertyScope(workspace, propertyId);
  if (!scope.ok) return { state: "scope_unresolved", reason: scope.reason, year };
  const { property } = scope;
  const support = resolveV3PropertySupport(workspace, property.id);
  const serviceDate = resolveV3PropertyServiceDate(workspace, property.id);
  const entry = projectV3PropertyEntry(workspace, property.id, support);
  const address = [property.address?.trim(), [property.postalCode, property.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  const base = { state: "known" as const, propertyId: property.id, year, label: property.label, address, support, serviceDate, entry };

  if (support === "facts_only") {
    // The global F013 output is not demonstrably this property's: nothing of it is exposed.
    return { ...base, channel: "unknown", confirmed: false, total: { state: "not_attributable" }, components: [], blocking: [], documents: [] };
  }

  const draft = v3BienDraft(workspace, property.id);
  const channel = channelOf(draft);
  const output: RevenusAssistantOutput | undefined =
    draft?.revenusAssistant && isAnnualOutputForActiveYear(draft.revenusAssistant, year) && Number.isFinite(draft.revenusAssistant.totalRecettes)
      ? draft.revenusAssistant : undefined;
  const confirmed = output !== undefined && Boolean(draft?.revenusConfirmedAt);

  let total: V3RevenueTotal;
  if (!output) total = { state: "unknown" };
  else if (!confirmed) total = { state: "unconfirmed", amount: output.totalRecettes };
  else total = output.totalRecettes === 0 ? { state: "confirmed_zero" } : { state: "known_amount", amount: output.totalRecettes };

  const sources = output?.fieldSources ?? {};
  const components: V3RevenueComponent[] = [];
  if (output && positive(output.loyersEncaisses)) {
    components.push({
      id: "rents", label: V3_REVENUE_COMPONENT_LABELS.rents, amount: output.loyersEncaisses,
      origin: { kind: sources.revenu_declare ?? "unknown" },
      ...(typeof output.ajustementsJanDec === "number" && output.ajustementsJanDec !== 0 ? { includesJanDecAdjustment: output.ajustementsJanDec } : {}),
    });
  }
  if (output && positive(output.indemnitesAssurance)) {
    components.push({ id: "insurance", label: V3_REVENUE_COMPONENT_LABELS.insurance, amount: output.indemnitesAssurance, origin: { kind: sources.indemnites ?? "unknown" } });
  }
  if (output && positive(output.recettesPlateforme)) {
    components.push({ id: "platform", label: V3_REVENUE_COMPONENT_LABELS.platform, amount: output.recettesPlateforme, origin: { kind: sources.plateforme ?? "unknown" } });
  }

  const parts = [output?.loyersEncaisses, output?.indemnitesAssurance, output?.recettesPlateforme];
  const reconciliation = output && parts.every(part => typeof part === "number" && Number.isFinite(part))
    ? { reconciled: cents(parts[0]!) + cents(parts[1]!) + cents(parts[2]!) === cents(output.totalRecettes) }
    : undefined;

  let theoretical: V3RevenueTheoretical | undefined;
  if (output && channel === "conversational" && positive(output.revenuTheorique)
    && derivedFromRealDate(serviceDate, draft?.inpiConfirmedAt, output.computedAt)) {
    theoretical = {
      amount: output.revenuTheorique,
      ...(positive(output.moisLocationEffectifs) ? { rentalMonths: output.moisLocationEffectifs } : {}),
    };
  }

  const documentIds = channel === "documents" ? [...new Set(draft?.revenusDocumentIds ?? [])] : [];
  const usedDocuments = documentIds.flatMap((id): V3RevenueDocument[] => {
    const doc = workspace.documents.find(item => item.id === id);
    return doc ? [{ id: doc.id, label: doc.fileName, status: processingStatusFor(doc.id, documents) }] : [];
  });

  return {
    ...base,
    channel,
    confirmed,
    total,
    components,
    ...(reconciliation ? { reconciliation } : {}),
    ...(theoretical ? { theoretical } : {}),
    blocking: output ? blockingAnomalies(output.anomalies ?? []).map(anomaly => anomaly.message) : [],
    documents: usedDocuments,
  };
}
