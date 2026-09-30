/**
 * R15.6 — pure presentation adapter: `V3RevenueDetail` (F013 data structured for ONE property) → what the V3 Revenus
 * components display. No calculation, no fixture, no fallback: every amount is a persisted F013 value, only formatted.
 * The total shown is `totalRecettes` as persisted; this layer never sums components.
 */
import { formatActivityDate } from "@/lab/v2-dossier/activity-detail-read-model";
import type { V3PropertyScopeReason } from "@/lab/v2-dossier/v3-property-scope";
import type { V3RevenueComponent, V3RevenueDetail } from "@/lab/v2-dossier/revenue-detail-read-model";
import type { V3PropertyServiceDate } from "@/lab/v2-dossier/property-service-date";
import type { PieceView } from "./financing-view-model";
import { NOT_SUPPORTED_YET, ORIGIN_SOURCE_LABEL, ORIGIN_STATE_LABEL, type StateLabel } from "./housing-view-model";

export type RevenueAction = { label: string; href: string };

export const REVIEW_IN_F013_LABEL = "Revoir dans l’Assistant Revenus";

export type RevenueRowView = {
  id: string;
  label: string;
  value: string;
  /** null = source unavailable: nothing is claimed. */
  source: { label: string } | null;
  stateLabel: StateLabel;
  tone: "ok" | "attention";
  /** Information attached to the row (never an amount to add). */
  note?: string;
};

export type RevenueHeadline = {
  /** "Non renseigné" | "0 €" | "12 345 €" — never "0 €" for an unknown total. */
  value: string;
  kind: "unknown" | "unconfirmed" | "confirmed_zero" | "known_amount";
  caption: string;
  stateLabel: "Non renseigné" | "À confirmer" | "Confirmé";
};

export type RevenueView =
  | { state: "scope_unresolved"; year: number; message: string; action: null }
  | {
      state: "known";
      year: number;
      propertyId: string;
      title: string;
      address: string | null;
      support: "full" | "facts_only";
      /** « Recettes retenues — exercice {year} » — null en multi-biens (rien n'est attribuable). */
      headline: RevenueHeadline | null;
      headlineTitle: string;
      summary: string;
      rows: RevenueRowView[];
      /** « Estimation d'après le bail » — zone secondaire, jamais un revenu encaissé. */
      estimation: { title: string; lines: Array<{ label: string; value: string }>; note: string } | null;
      serviceDateLine: string | null;
      entry: { label: string; notes: string[] } | null;
      todo: { decisions: string[]; notes: string[]; blocking: string[] };
      pieces: PieceView[];
      unsupportedNotice: string | null;
      action: RevenueAction | null;
    };

const SCOPE_MESSAGES: Record<V3PropertyScopeReason, string> = {
  no_property_id: "Le logement à afficher n’est pas précisé : rien n’est présenté tant qu’il n’est pas identifié de façon sûre.",
  unknown_property: "Ce logement n’existe pas dans le dossier : rien n’est présenté.",
  not_in_fiscal_year: "Ce logement n’est pas rattaché à cet exercice : rien n’est présenté.",
  ambiguous: "Ce logement ne peut pas être identifié de façon unique : rien n’est présenté.",
  no_property: "Aucun logement n’est enregistré pour ce dossier.",
};

const euros = (value: number) =>
  `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value)} €`;

const DATE_SOURCE_LABEL: Record<string, string> = {
  draft: "saisie dans l’Activité",
  property_base: "base du logement reportée d’un exercice précédent",
  assistant_in_progress: "Assistant Activité, non confirmée",
};

const PIECE_STATE: Record<string, PieceView["state"]> = { analyzed: "done", uploaded: "reading", processing: "reading", failed: "failed" };

function headlineOf(total: Exclude<Extract<V3RevenueDetail, { state: "known" }>["total"], { state: "not_attributable" }>, year: number): RevenueHeadline {
  switch (total.state) {
    case "unknown": return { value: "Non renseigné", kind: "unknown", caption: `Les revenus de l’exercice ${year} ne sont pas encore renseignés dans le dossier.`, stateLabel: "Non renseigné" };
    case "unconfirmed": return { value: euros(total.amount), kind: "unconfirmed", caption: `Recettes enregistrées pour l’exercice ${year}, pas encore confirmées.`, stateLabel: "À confirmer" };
    case "confirmed_zero": return { value: "0 €", kind: "confirmed_zero", caption: `Vous avez confirmé 0 € de recettes pour l’exercice ${year}.`, stateLabel: "Confirmé" };
    case "known_amount": return { value: euros(total.amount), kind: "known_amount", caption: `Résultat retenu par l’Assistant Revenus pour l’exercice ${year}.`, stateLabel: "Confirmé" };
  }
}

function rowView(component: V3RevenueComponent, pending: boolean): RevenueRowView {
  const kind = component.origin.kind;
  return {
    id: component.id,
    label: component.label,
    value: euros(component.amount),
    source: kind === "unknown" ? null : { label: ORIGIN_SOURCE_LABEL[kind] ?? "—" },
    // A value that is not confirmed is never presented as retained.
    stateLabel: pending ? "À confirmer" : kind === "unknown" ? "Retenu" : ORIGIN_STATE_LABEL[kind] ?? "Retenu",
    tone: pending ? "attention" : "ok",
    ...(component.includesJanDecAdjustment !== undefined
      ? { note: `dont ajustement janvier/décembre de ${euros(component.includesJanDecAdjustment)}, déjà compris dans ce montant` }
      : {}),
  };
}

function serviceDateNotes(serviceDate: V3PropertyServiceDate): { line: string | null; decisions: string[]; notes: string[] } {
  switch (serviceDate.status) {
    case "known": return {
      line: `Date de mise en service : ${formatActivityDate(serviceDate.value)}`, decisions: [],
      notes: serviceDate.unconfirmedChange ? [`Date de mise en service · une modification (${formatActivityDate(serviceDate.unconfirmedChange)}) reste à confirmer dans l’Assistant Activité.`] : [],
    };
    case "pending": return { line: null, decisions: [], notes: [`Date de mise en service · ${formatActivityDate(serviceDate.value)} reste à confirmer dans l’Assistant Activité.`] };
    case "conflict": return {
      line: null,
      decisions: [`Date de mise en service · deux valeurs différentes : ${serviceDate.candidates.map(candidate => `« ${formatActivityDate(candidate.value)} » (${DATE_SOURCE_LABEL[candidate.source] ?? candidate.source})`).join(" et ")}. Aucune n’est retenue tant que ce n’est pas résolu.`],
      notes: [],
    };
    case "absent": return { line: null, decisions: [], notes: ["Date de mise en service · à renseigner dans l’Assistant Activité."] };
  }
}

export function buildRevenueView(detail: V3RevenueDetail, action: RevenueAction | null): RevenueView {
  if (detail.state === "scope_unresolved") {
    // Never a link to F013 without a verified property.
    return { state: "scope_unresolved", year: detail.year, message: SCOPE_MESSAGES[detail.reason], action: null };
  }
  const date = serviceDateNotes(detail.serviceDate);
  const entry = detail.entry.kind === "undetermined" ? null : {
    label: { first_declaration: "Première déclaration", takeover: "Reprise comptable", continuation: "Suite du dossier" }[detail.entry.kind],
    notes: detail.entry.kind === "takeover" ? ["Sous reprise comptable, les revenus de l’exercice restent collectés normalement."] : [],
  };
  const headlineTitle = `Recettes retenues — exercice ${detail.year}`;

  if (detail.total.state === "not_attributable") {
    return {
      state: "known", year: detail.year, propertyId: detail.propertyId, title: detail.label, address: detail.address, support: detail.support,
      headline: null, headlineTitle,
      summary: "Ce dossier concerne plusieurs biens : les revenus enregistrés ne sont pas attribuables à ce logement.",
      rows: [], estimation: null, serviceDateLine: date.line, entry,
      todo: { decisions: date.decisions, notes: [], blocking: [] }, pieces: [],
      unsupportedNotice: `${NOT_SUPPORTED_YET} : les revenus de l’Assistant Revenus ne sont pas attribuables à ce logement lorsque le dossier compte plusieurs biens.`,
      action,
    };
  }

  const pending = detail.total.state === "unconfirmed";
  const notes = [...date.notes];
  if (detail.reconciliation && !detail.reconciliation.reconciled) {
    notes.push("Le détail enregistré ne permet pas de reconstituer exactement ce total ; aucun montant n’est ajouté pour le combler.");
  }
  const open = notes.length + date.decisions.length + detail.blocking.length;
  const summary = detail.total.state === "unknown"
    ? "Aucun revenu n’est encore enregistré pour cet exercice."
    : detail.blocking.length > 0
      ? "Une vérification reste nécessaire avant de pouvoir confirmer ces revenus."
      : pending
        ? "Ces revenus sont enregistrés mais pas encore confirmés."
        : open > 0 ? "Vos revenus sont confirmés ; certaines informations restent à compléter." : "Vos revenus sont confirmés dans votre dossier.";

  const estimation = detail.theoretical ? {
    title: "Estimation d’après le bail",
    lines: [
      { label: "Loyers attendus d’après le bail", value: euros(detail.theoretical.amount) },
      ...(detail.theoretical.rentalMonths !== undefined ? [{ label: "Mois de location pris en compte", value: String(detail.theoretical.rentalMonths) }] : []),
    ],
    note: "Estimation, pas un revenu encaissé : elle n’entre pas dans les recettes retenues.",
  } : null;

  return {
    state: "known", year: detail.year, propertyId: detail.propertyId, title: detail.label, address: detail.address, support: detail.support,
    headline: headlineOf(detail.total, detail.year), headlineTitle, summary,
    rows: detail.components.map(component => rowView(component, pending)),
    estimation, serviceDateLine: date.line, entry,
    todo: { decisions: date.decisions, notes, blocking: detail.blocking },
    pieces: detail.documents.map(doc => ({ name: doc.label, state: PIECE_STATE[doc.status] ?? "unknown" })),
    unsupportedNotice: null,
    action,
  };
}
