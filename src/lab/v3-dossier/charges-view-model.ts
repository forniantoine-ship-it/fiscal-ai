/**
 * R15.7 — pure presentation adapter: `V3ChargesDetail` (F012 data structured for ONE property) → what the V3 Charges
 * components display. No calculation, no fixture, no fallback: every amount is a persisted F012 value, only formatted.
 * The headline is `chargesAssistant.totalDeductible` as persisted; this layer never sums categories.
 */
import { formatActivityDate } from "@/lab/v2-dossier/activity-detail-read-model";
import type { V3ChargesCategory, V3ChargesDetail, V3ChargesOpenItem } from "@/lab/v2-dossier/charges-detail-read-model";
import type { V3PropertyServiceDate } from "@/lab/v2-dossier/property-service-date";
import type { V3PropertyScopeReason } from "@/lab/v2-dossier/v3-property-scope";
import type { PieceView, RubriqueView } from "./financing-view-model";
import { NOT_SUPPORTED_YET, ORIGIN_SOURCE_LABEL, ORIGIN_STATE_LABEL, type StateLabel } from "./housing-view-model";

export type ChargesAction = { label: string; href: string };

export const REVIEW_IN_F012_LABEL = "Revoir dans l’Assistant Charges";

export type ChargesRowView = {
  id: string;
  label: string;
  value: string;
  /** null = source unavailable: nothing is claimed. */
  source: { label: string } | null;
  stateLabel: StateLabel | "À revoir";
  tone: "ok" | "attention";
};

export type ChargesHeadline = {
  /** "Non renseigné" | "0 €" | "12 345 €" — never "0 €" for an unknown total. */
  value: string;
  kind: "unknown" | "unconfirmed" | "stale" | "confirmed_zero" | "known_amount";
  caption: string;
  stateLabel: "Non renseigné" | "À confirmer" | "À revoir" | "À compléter" | "Confirmé";
};

/** A block shown next to (never inside) the deductible total. */
export type ChargesSecondaryView = {
  id: "non_deductible" | "amortizable" | "pre_exploitation" | "financing";
  title: string;
  amount: string;
  note: string;
  lines: Array<{ label: string; value: string }>;
};

export type ChargesView =
  | { state: "scope_unresolved"; year: number; message: string; action: null }
  | {
      state: "known";
      year: number;
      propertyId: string;
      title: string;
      address: string | null;
      support: "full" | "facts_only";
      /** « Charges déductibles de l'exercice {year} » — null en multi-biens (rien n'est attribuable). */
      headline: ChargesHeadline | null;
      headlineTitle: string;
      summary: string;
      rows: ChargesRowView[];
      secondary: ChargesSecondaryView[];
      notRetained: Array<{ label: string; value: string; reason: string }>;
      coverageNotes: string[];
      serviceDateLine: string | null;
      entry: { label: string; notes: string[] } | null;
      todo: { decisions: string[]; notes: string[] };
      pieces: PieceView[];
      unsupportedNotice: string | null;
      action: ChargesAction | null;
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

const UNKNOWN_REASON: Record<string, string> = {
  unsure: "vous n’étiez pas sûr",
  document_missing: "il manque un document",
  later: "à voir plus tard",
};

type Known = Extract<V3ChargesDetail, { state: "known" }>;

function headlineOf(total: Exclude<Known["total"], { state: "not_attributable" }>, year: number): ChargesHeadline {
  switch (total.state) {
    case "unknown": return { value: "Non renseigné", kind: "unknown", caption: `Les charges de l’exercice ${year} ne sont pas encore renseignées dans le dossier.`, stateLabel: "Non renseigné" };
    case "unconfirmed": return { value: euros(total.amount), kind: "unconfirmed", caption: `Ancienne sortie de l’Assistant Charges pour l’exercice ${year} : elle n’est plus confirmée.`, stateLabel: "À confirmer" };
    case "stale": return { value: euros(total.amount), kind: "stale", caption: `Dernière sortie de l’Assistant Charges pour l’exercice ${year} : le parcours a été modifié depuis, à revoir.`, stateLabel: "À revoir" };
    case "confirmed_zero": return { value: "0 €", kind: "confirmed_zero", caption: `Vous avez confirmé 0 € de charges déductibles pour l’exercice ${year}.`, stateLabel: "Confirmé" };
    case "known_amount": return { value: euros(total.amount), kind: "known_amount", caption: `Résultat retenu par l’Assistant Charges pour l’exercice ${year}.`, stateLabel: "Confirmé" };
  }
}

/** A technically confirmed output stays "Confirmé" only when nothing is left to settle; otherwise "À compléter" (amount unchanged). */
function withCompleteness(headline: ChargesHeadline, remaining: number): ChargesHeadline {
  const confirmed = headline.kind === "confirmed_zero" || headline.kind === "known_amount";
  return confirmed && remaining > 0 ? { ...headline, stateLabel: "À compléter" } : headline;
}

function rowView(category: V3ChargesCategory, total: Known["total"]): ChargesRowView {
  const kind = category.origin.kind;
  // A value that is not confirmed is never presented as retained.
  const notConfirmed = total.state === "unconfirmed" ? "À confirmer" : total.state === "stale" ? "À revoir" : null;
  const provenance = kind === "unknown" || kind === "mixed" ? null : ORIGIN_SOURCE_LABEL[kind] ?? null;
  return {
    id: category.id,
    label: category.label,
    value: euros(category.amount),
    source: kind === "mixed" ? { label: "Plusieurs sources" } : provenance ? { label: provenance } : null,
    stateLabel: notConfirmed ?? (kind === "unknown" || kind === "mixed" ? "Retenu" : ORIGIN_STATE_LABEL[kind] ?? "Retenu"),
    tone: notConfirmed ? "attention" : "ok",
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
    case "absent": return { line: null, decisions: [], notes: ["Date de mise en service · à renseigner dans l’Assistant Activité ; les charges avant mise en location ne sont pas présentées sans elle."] };
  }
}

function openText(item: V3ChargesOpenItem): string {
  switch (item.kind) {
    case "family_pending": return `${item.label} · pas encore traité dans l’Assistant Charges.`;
    case "family_unknown": return `${item.label} · à compléter${item.reason ? ` (${UNKNOWN_REASON[item.reason] ?? item.reason})` : ""}.`;
    case "review_needed": return `${item.label} · une vérification ou une décision reste nécessaire.`;
    case "conflict": return `${item.label} · ${item.message}`;
    case "tax_choice_pending": return "Taxe foncière · un choix entre deux montants ou deux avis reste à faire.";
    case "expense_pending": return `${item.label} · à confirmer dans l’Assistant Charges.`;
  }
}

function secondaryOf(detail: Known): ChargesSecondaryView[] {
  const blocks: ChargesSecondaryView[] = [];
  if (detail.nonDeductible) {
    blocks.push({
      id: "non_deductible", title: "Non déductibles", amount: euros(detail.nonDeductible.amount),
      note: "Payées, mais non retenues comme charges déductibles : elles ne sont pas comprises dans le montant ci-dessus.",
      lines: detail.nonDeductible.byCategory.map(line => ({ label: line.label, value: euros(line.amount) })),
    });
  }
  if (detail.amortizable) {
    blocks.push({
      id: "amortizable", title: "Orienté vers l’amortissement", amount: euros(detail.amortizable.amount),
      note: "Ces dépenses ne sont pas des charges déductibles de l’exercice : elles sont reprises dans le plan d’amortissement.",
      lines: detail.amortizable.components.map(line => ({ label: line.label, value: euros(line.amount) })),
    });
  }
  if (detail.preExploitation) {
    blocks.push({
      id: "pre_exploitation", title: "Avant mise en location", amount: euros(detail.preExploitation.amount),
      note: "Charges engagées avant la mise en location, présentées séparément.",
      lines: detail.preExploitation.byCategory.map(line => ({ label: line.label, value: euros(line.amount) })),
    });
  }
  if (detail.financingAlreadyCounted) {
    blocks.push({
      id: "financing", title: "Déjà compté dans Financement", amount: euros(detail.financingAlreadyCounted.amount),
      note: "Ces montants sont déjà pris en compte dans Financement : ils ne sont pas ajoutés aux charges.",
      lines: detail.financingAlreadyCounted.parts.map(part => ({ label: part.kind === "insurance" ? "Assurance emprunteur" : "Frais de dossier", value: euros(part.amount) })),
    });
  }
  return blocks;
}

export function buildChargesView(detail: V3ChargesDetail, action: ChargesAction | null): ChargesView {
  if (detail.state === "scope_unresolved") {
    // Never a link to F012 without a verified property.
    return { state: "scope_unresolved", year: detail.year, message: SCOPE_MESSAGES[detail.reason], action: null };
  }
  const date = serviceDateNotes(detail.serviceDate);
  const entry = detail.entry.kind === "undetermined" ? null : {
    label: { first_declaration: "Première déclaration", takeover: "Reprise comptable", continuation: "Suite du dossier" }[detail.entry.kind],
    notes: detail.entry.kind === "takeover" ? ["Sous reprise comptable, les charges de l’exercice restent collectées normalement."] : [],
  };
  const headlineTitle = `Charges déductibles de l’exercice ${detail.year}`;

  if (detail.total.state === "not_attributable") {
    return {
      state: "known", year: detail.year, propertyId: detail.propertyId, title: detail.label, address: detail.address, support: detail.support,
      headline: null, headlineTitle,
      summary: "Ce dossier concerne plusieurs biens : les charges enregistrées ne sont pas attribuables à ce logement.",
      rows: [], secondary: [], notRetained: [], coverageNotes: [], serviceDateLine: date.line, entry,
      todo: { decisions: date.decisions, notes: [] }, pieces: [],
      unsupportedNotice: `${NOT_SUPPORTED_YET} : les charges de l’Assistant Charges ne sont pas attribuables à ce logement lorsque le dossier compte plusieurs biens.`,
      action,
    };
  }

  const { total } = detail;
  const notes = [...date.notes];
  if (total.state === "unconfirmed") notes.push("Cette sortie n’est plus confirmée : revoyez-la et reconfirmez-la dans l’Assistant Charges.");
  if (total.state === "stale") notes.push("Le parcours de l’Assistant Charges a été modifié après cette sortie : les sources et les documents ne sont plus présentés ; reconfirmez dans l’Assistant Charges.");
  if (detail.reconciliation && !detail.reconciliation.reconciled && detail.categories.length > 0) {
    notes.push("Le détail par nature ne reconstitue pas exactement ce total ; aucun montant n’est ajouté pour le combler.");
  }
  const decisions = [...date.decisions, ...detail.open.map(openText)];
  // One source of truth: what "Ce qui reste à régler" lists. The confirmed output keeps its amount; only the user-facing status changes.
  const remaining = decisions.length + notes.length;
  const summary = total.state === "unknown"
    ? "Charges non renseignées : aucune sortie de l’Assistant Charges n’est enregistrée pour cet exercice."
    : total.state === "unconfirmed"
      ? "Ces charges sont enregistrées mais ne sont plus confirmées : à revoir."
      : total.state === "stale"
        ? "Ces charges ont été confirmées, puis le parcours a été modifié : à revoir."
        : remaining > 0 ? "Certaines informations restent à renseigner avant de finaliser vos charges." : "Vos charges sont complètes pour cet exercice.";

  const coverageNotes = detail.nothingPaidFamilies.length > 0
    ? [`Vous avez indiqué n’avoir rien payé : ${detail.nothingPaidFamilies.map(family => family.label).join(", ")}.`] : [];

  return {
    state: "known", year: detail.year, propertyId: detail.propertyId, title: detail.label, address: detail.address, support: detail.support,
    headline: withCompleteness(headlineOf(total, detail.year), remaining), headlineTitle, summary,
    rows: detail.categories.map(category => rowView(category, total)),
    secondary: secondaryOf(detail),
    notRetained: detail.notRetained.map(item => ({
      label: item.label, value: euros(item.amount),
      reason: item.reason === "financing_overlap" ? "déjà compté dans Financement" : "écarté par vous",
    })),
    coverageNotes,
    serviceDateLine: date.line, entry,
    todo: { decisions, notes },
    pieces: detail.documents.map(doc => ({ name: doc.label, state: PIECE_STATE[doc.status] ?? "unknown" })),
    unsupportedNotice: null,
    action,
  };
}

/**
 * Rubrique-level state, derived from the same view as the hero (its status label, itself derived from "Ce qui reste à
 * régler"): "Complet" only for a confirmed output with nothing left to settle. Multi-property keeps the existing state.
 */
export function chargesRubrique(view: ChargesView, existing: { summary: string; complete: boolean }): RubriqueView {
  if (view.state !== "known" || !view.headline) return { summary: existing.summary, tone: existing.complete ? "ok" : "attention" };
  switch (view.headline.stateLabel) {
    case "Confirmé": return { summary: "Charges classées", tone: "ok" };
    case "À confirmer": return { summary: "Charges à confirmer", tone: "attention" };
    case "À revoir": return { summary: "Charges à revoir", tone: "attention" };
    default: return { summary: "Charges à compléter", tone: "attention" };
  }
}
