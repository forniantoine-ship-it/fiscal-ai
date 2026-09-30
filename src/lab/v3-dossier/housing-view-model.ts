/**
 * R15.5 — pure presentation adapter: `V3HousingDetail` (F010 data structured for ONE property) → what the V3 Logement
 * components display. No calculation, no fixture, no fallback value: every string is a stored value, a F010 label, or a
 * neutral sentence about what is (not) available. Amounts come from the persisted F010 output, only formatted.
 */
import { formatActivityDate } from "@/lab/v2-dossier/activity-detail-read-model";
import type {
  V3HousingDecision, V3HousingDetail, V3HousingEntry, V3HousingFact, V3HousingScopeReason,
} from "@/lab/v2-dossier/housing-detail-read-model";
import { V3_HOUSING_FIELD_LABELS } from "@/lab/v2-dossier/housing-detail-read-model";
import type { V3PropertyServiceDate } from "@/lab/v2-dossier/property-service-date";
import type { PieceView } from "./financing-view-model";

export type HousingAction = { label: string; href: string };

export const REVIEW_IN_F010_LABEL = "Revoir dans l’Assistant Logement";
export const NOT_SUPPORTED_YET = "Non supporté actuellement";

export type StateLabel = "À confirmer" | "Retenu" | "Saisi" | "Extrait" | "Corrigé" | "Estimé" | "Choix de jugement" | "Dérivé";

export type HousingFactView = {
  id: string;
  label: string;
  value: string;
  /** null = source unavailable: nothing is claimed. */
  source: { label: string } | null;
  stateLabel: StateLabel;
  tone: "ok" | "attention";
};

export type HousingView =
  | { state: "scope_unresolved"; year: number; message: string; action: null }
  | {
      state: "known";
      year: number;
      propertyId: string;
      title: string;
      address: string | null;
      support: "full" | "facts_only";
      confirmed: boolean;
      summary: string;
      /** « Situation d'entrée » — projection en lecture seule. `null` quand elle n'est pas déterminée : rien n'est affiché, rien n'est inféré. */
      entry: { label: string; notes: string[] } | null;
      facts: HousingFactView[];
      /** Valeurs calculées PERSISTÉES par F010 (jamais recalculées ici). */
      computed: Array<{ label: string; value: string }>;
      todo: { questions: string[]; toConfirm: string[]; decisions: string[]; notes: string[] };
      pieces: PieceView[];
      /** Message affiché à la place des sorties F010 non attribuables (multi-biens). */
      unsupportedNotice: string | null;
      action: HousingAction | null;
    };

const SCOPE_MESSAGES: Record<V3HousingScopeReason, string> = {
  no_property_id: "Le logement à afficher n’est pas précisé : rien n’est présenté tant qu’il n’est pas identifié de façon sûre.",
  unknown_property: "Ce logement n’existe pas dans le dossier : rien n’est présenté.",
  not_in_fiscal_year: "Ce logement n’est pas rattaché à cet exercice : rien n’est présenté.",
  ambiguous: "Ce logement ne peut pas être identifié de façon unique : rien n’est présenté.",
  no_property: "Aucun logement n’est enregistré pour ce dossier.",
};

/** Convention de provenance V3 commune (Logement, Revenus…). */
export const ORIGIN_SOURCE_LABEL: Record<string, string> = {
  manual: "Saisi par vous", extracted: "Extrait d’un document", user_correction: "Corrigé par vous", estimated: "Estimé",
  judgment: "Choix de jugement", derived: "Dérivé",
};
export const ORIGIN_STATE_LABEL: Record<string, StateLabel> = {
  manual: "Saisi", extracted: "Extrait", user_correction: "Corrigé", estimated: "Estimé", judgment: "Choix de jugement", derived: "Dérivé",
};

const euros = (value: number) =>
  `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value)} €`;

function factView(fact: V3HousingFact): HousingFactView {
  const kind = fact.origin.kind;
  return {
    id: fact.id,
    label: fact.label,
    value: fact.value,
    source: kind === "unknown" ? null : { label: ORIGIN_SOURCE_LABEL[kind] ?? "—" },
    // A value not yet confirmed is never presented as retained.
    stateLabel: fact.status === "to_confirm" ? "À confirmer" : kind === "unknown" ? "Retenu" : ORIGIN_STATE_LABEL[kind] ?? "Retenu",
    tone: fact.status === "to_confirm" ? "attention" : "ok",
  };
}

const ENTRY_LABEL: Record<V3HousingEntry["kind"], string> = {
  first_declaration: "Première déclaration",
  takeover: "Reprise comptable",
  continuation: "Suite du dossier",
  undetermined: "Non déterminée",
};

function entryView(entry: V3HousingEntry): { label: string; notes: string[] } | null {
  if (entry.kind === "undetermined") return null;
  const notes: string[] = [];
  if (entry.kind === "takeover") {
    notes.push("Sous reprise comptable, l’inventaire des immobilisations est repris de la comptabilité antérieure.");
    if (entry.openingAssets) {
      notes.push(`Actifs de la reprise rattachés à ce logement : ${entry.openingAssets.attributed}.`);
      if (entry.openingAssets.unattributed > 0) notes.push(`Actifs de la reprise sans logement renseigné : ${entry.openingAssets.unattributed} (non attribués).`);
    }
  }
  return { label: ENTRY_LABEL[entry.kind], notes };
}

const DATE_SOURCE_LABEL: Record<string, string> = {
  draft: "saisie dans l’Activité",
  property_base: "base du logement reportée d’un exercice précédent",
  assistant_in_progress: "Assistant Activité, non confirmée",
};

function decisionText(decision: V3HousingDecision): string {
  if (decision.kind === "review_conflict") {
    return `${decision.label} · information différente : « ${decision.currentValue} » dans votre dossier, « ${decision.proposedValue} » dans le document.`;
  }
  const values = decision.candidates.map(candidate => `« ${formatActivityDate(candidate.value)} » (${DATE_SOURCE_LABEL[candidate.source] ?? candidate.source})`).join(" et ");
  return `Date de mise en service · deux valeurs différentes : ${values}. Aucune n’est retenue tant que ce n’est pas résolu.`;
}

function serviceDateRow(serviceDate: V3PropertyServiceDate): HousingFactView | null {
  const label = "Date de mise en service";
  if (serviceDate.status === "known") {
    const fromEntry = serviceDate.origins.includes("draft");
    return {
      id: "serviceDate", label, value: formatActivityDate(serviceDate.value),
      source: fromEntry ? { label: "Saisi par vous" } : null,
      stateLabel: fromEntry ? "Saisi" : "Retenu", tone: "ok",
    };
  }
  if (serviceDate.status === "pending") {
    return { id: "serviceDate", label, value: formatActivityDate(serviceDate.value), source: { label: "Saisi par vous" }, stateLabel: "À confirmer", tone: "attention" };
  }
  return null; // conflict: no value retained; absent: nothing to show
}

function serviceDateNotes(serviceDate: V3PropertyServiceDate): string[] {
  if (serviceDate.status === "absent") return ["Date de mise en service · à renseigner dans l’Assistant Activité."];
  if (serviceDate.status === "known" && serviceDate.unconfirmedChange) {
    return [`Date de mise en service · une modification (${formatActivityDate(serviceDate.unconfirmedChange)}) reste à confirmer dans l’Assistant Activité.`];
  }
  return [];
}

const PIECE_STATE: Record<string, PieceView["state"]> = { analyzed: "done", uploaded: "reading", processing: "reading", failed: "failed" };

export function buildHousingView(detail: V3HousingDetail, action: HousingAction | null): HousingView {
  if (detail.state === "scope_unresolved") {
    // Never a link to F010 without a verified property.
    return { state: "scope_unresolved", year: detail.year, message: SCOPE_MESSAGES[detail.reason], action: null };
  }
  const facts = detail.facts.map(factView);
  const dateRow = serviceDateRow(detail.serviceDate);
  if (dateRow) facts.push(dateRow);

  const computed = detail.computed ? [
    { label: "Prix de revient", value: euros(detail.computed.prixRevient) },
    { label: "Valeur du terrain", value: euros(detail.computed.valeurTerrain) },
    { label: "Valeur du bâti", value: euros(detail.computed.valeurBati) },
    { label: "Base amortissable du bâti", value: euros(detail.computed.baseAmortissableBati) },
    { label: "Dotation annuelle", value: euros(detail.computed.dotationAnnuelle) },
  ] : [];

  const questions = detail.remaining.map(field => V3_HOUSING_FIELD_LABELS[field]);
  const toConfirm = detail.toConfirm.map(field => V3_HOUSING_FIELD_LABELS[field]);
  const decisions = detail.decisions.map(decisionText);
  const notes = [...serviceDateNotes(detail.serviceDate)];
  if (detail.f010Step === "blocked_missing_date") notes.push("Le calcul du plan d’amortissement attend la date de mise en service.");
  if (detail.f010Step === "review_plan") notes.push("Le plan d’amortissement est calculé : il reste à le valider.");
  if (detail.f010Step === "coming_soon") notes.push("Ce type d’acquisition n’est pas encore pris en charge par l’assistant.");

  const open = questions.length + toConfirm.length + decisions.length + notes.length;
  let summary: string;
  if (detail.support === "facts_only") summary = "Ce dossier concerne plusieurs biens : seules les informations propres à ce logement sont présentées.";
  else if (detail.confirmed) summary = "Votre logement est confirmé dans votre dossier.";
  else summary = open > 0
    ? "Votre logement n’est pas encore confirmé : il reste des informations à renseigner ou à confirmer."
    : "Votre logement n’est pas encore confirmé dans l’Assistant Logement.";

  return {
    state: "known",
    year: detail.year,
    propertyId: detail.propertyId,
    title: detail.label,
    address: detail.address,
    support: detail.support,
    confirmed: detail.confirmed,
    summary,
    entry: entryView(detail.entry),
    facts,
    computed,
    todo: { questions, toConfirm, decisions, notes },
    pieces: detail.documents.map(doc => ({ name: doc.label, state: PIECE_STATE[doc.status] ?? "unknown" })),
    unsupportedNotice: detail.support === "facts_only"
      ? `${NOT_SUPPORTED_YET} : les résultats de l’Assistant Logement ne sont pas attribuables à ce logement lorsque le dossier compte plusieurs biens.`
      : null,
    action,
  };
}
