/**
 * R15.8 — pure presentation adapter: `V3AmortizationDetail` (F014 data for ONE property) → what the V3 Amortissements
 * components display. No calculation, no fixture, no fallback: every amount is a persisted F014 value or a line of the
 * F014 plan, only formatted. The headline is `amortissementAssistant.totalDotations` as persisted; this layer never sums
 * lines, never derives a fiscally deducted amount, and never shows the draft total under a takeover.
 */
import { formatActivityDate } from "@/lab/v2-dossier/activity-detail-read-model";
import type { V3AmortizationDetail, V3AmortizationLine, V3AmortizationLineSource } from "@/lab/v2-dossier/amortization-detail-read-model";
import type { F014PlanUnavailableReason } from "@/lab/v2-dossier/amortization-plan-seam";
import type { V3PropertyServiceDate } from "@/lab/v2-dossier/property-service-date";
import type { V3PropertyScopeReason } from "@/lab/v2-dossier/v3-property-scope";
import type { RubriqueView } from "./financing-view-model";
import { NOT_SUPPORTED_YET } from "./housing-view-model";

export type AmortizationAction = { label: string; href: string };

export const REVIEW_IN_F014_LABEL = "Revoir dans l’Assistant Amortissements";

export const FISCAL_DEDUCTION_NOTE = "Le montant fiscalement déduit est déterminé lors du calcul de votre déclaration.";
export const NO_DOCUMENT_NOTE = "Aucun document n’est directement rattaché au calcul d’amortissement.";

export type AmortizationRowView = {
  id: string;
  label: string;
  /** Composants F012 : « à partir du … ». */
  note: string | null;
  base: string;
  duration: string;
  dotation: string;
  /** null = origin not demonstrable: nothing is claimed. */
  source: { label: string } | null;
  stateLabel: "Calculé" | "À confirmer";
  tone: "ok" | "attention";
};

export type AmortizationHeadline = {
  title: string;
  /** null = no amount is presented (takeover). */
  value: string | null;
  kind: "unknown" | "unconfirmed" | "stale" | "known_amount" | "takeover";
  caption: string;
  stateLabel: "Non renseigné" | "À confirmer" | "À revoir" | "À compléter" | "Confirmé" | "Reprise comptable";
  /** Shown only next to an amount. */
  fiscalNote: string | null;
};

export type AmortizationView =
  | { state: "scope_unresolved"; year: number; message: string; action: null }
  | {
      state: "known";
      year: number;
      propertyId: string;
      title: string;
      address: string | null;
      support: "full" | "facts_only";
      /** null in multi-property: nothing is attributable. */
      headline: AmortizationHeadline | null;
      summary: string;
      profile: string | null;
      rows: AmortizationRowView[];
      /** « Terrain — non amorti » : displayed apart from the depreciated lines. */
      land: { label: string; value: string; note: string } | null;
      serviceDateLine: string | null;
      takeoverFacts: string[];
      todo: { decisions: string[]; notes: string[] };
      documentsNote: string;
      unsupportedNotice: string | null;
      action: AmortizationAction | null;
    };

const SCOPE_MESSAGES: Record<V3PropertyScopeReason, string> = {
  no_property_id: "Le logement à afficher n’est pas précisé : rien n’est présenté tant qu’il n’est pas identifié de façon sûre.",
  unknown_property: "Ce logement n’existe pas dans le dossier : rien n’est présenté.",
  not_in_fiscal_year: "Ce logement n’est pas rattaché à cet exercice : rien n’est présenté.",
  ambiguous: "Ce logement ne peut pas être identifié de façon unique : rien n’est présenté.",
  no_property: "Aucun logement n’est enregistré pour ce dossier.",
};

const SOURCE_LABEL: Record<V3AmortizationLineSource, string | null> = {
  housing: "Issu du logement",
  charges: "Issu des charges",
  carried_over: "Reporté d’un exercice précédent",
  unspecified: null,
};

const DATE_SOURCE_LABEL: Record<string, string> = {
  draft: "saisie dans l’Activité",
  property_base: "base du logement reportée d’un exercice précédent",
  assistant_in_progress: "Assistant Activité, non confirmée",
};

const TAKEOVER_TEXT = "Le plan d’amortissement est repris à partir de votre historique comptable et sera intégré à la déclaration.";

const euros = (value: number) =>
  `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value)} €`;

type Known = Extract<V3AmortizationDetail, { state: "known" }>;

function headlineOf(detail: Known): AmortizationHeadline | null {
  const { total, year } = detail;
  const title = `Amortissements calculés pour l’exercice ${year}`;
  switch (total.state) {
    case "not_attributable": return null;
    case "takeover": return {
      title: "Amortissements issus de la reprise comptable", value: null, kind: "takeover", caption: TAKEOVER_TEXT,
      stateLabel: "Reprise comptable", fiscalNote: null,
    };
    case "unknown": return {
      title, value: "Non renseigné", kind: "unknown", stateLabel: "Non renseigné", fiscalNote: null,
      caption: `Les amortissements de l’exercice ${year} ne sont pas encore calculés dans le dossier.`,
    };
    case "unconfirmed": return {
      title, value: euros(total.amount), kind: "unconfirmed", stateLabel: "À confirmer", fiscalNote: FISCAL_DEDUCTION_NOTE,
      caption: total.contested
        ? `Dotation calculée pour l’exercice ${year} : vous avez contesté ce plan, il reste à revoir.`
        : `Dernière dotation calculée pour l’exercice ${year} : elle n’est plus confirmée.`,
    };
    case "stale": return {
      title, value: euros(total.amount), kind: "stale", stateLabel: "À revoir", fiscalNote: FISCAL_DEDUCTION_NOTE,
      caption: `Dernière dotation calculée pour l’exercice ${year} : le dossier a changé depuis, à revoir.`,
    };
    case "known_amount": return {
      title, value: euros(total.amount), kind: "known_amount", stateLabel: "Confirmé", fiscalNote: FISCAL_DEDUCTION_NOTE,
      caption: "Dotation calculée pour l’exercice.",
    };
  }
}

/** A technically confirmed output stays « Confirmé » only when nothing is left to settle; otherwise « À compléter » (amount unchanged). */
function withCompleteness(headline: AmortizationHeadline, remaining: number): AmortizationHeadline {
  return headline.kind === "known_amount" && remaining > 0 ? { ...headline, stateLabel: "À compléter" } : headline;
}

function rowView(line: V3AmortizationLine, confirmed: boolean): AmortizationRowView {
  const source = SOURCE_LABEL[line.source];
  return {
    id: line.id,
    label: line.label,
    note: line.startDate ? `à partir du ${formatActivityDate(line.startDate)}` : null,
    base: euros(line.base),
    duration: `${line.durationYears} ans`,
    dotation: euros(line.dotation),
    source: source ? { label: source } : null,
    stateLabel: confirmed ? "Calculé" : "À confirmer",
    tone: confirmed ? "ok" : "attention",
  };
}

function blockText(block: F014PlanUnavailableReason, year: number, serviceDate: V3PropertyServiceDate): string | null {
  switch (block.kind) {
    case "scope": case "not_attributable": return null;
    case "housing_plan_missing": return "Logement · le plan d’amortissement du logement n’est pas encore calculé : complétez l’Assistant Logement.";
    case "housing_plan_other_year": return `Logement · le plan enregistré ne correspond pas à l’exercice ${year} : revoyez-le dans l’Assistant Logement.`;
    case "prorata_invalid": return "Logement · le plan enregistré est incomplet : revoyez-le dans l’Assistant Logement.";
    case "service_date":
      if (block.status === "conflict" && serviceDate.status === "conflict") {
        return `Date de mise en service · deux valeurs différentes : ${serviceDate.candidates.map(candidate => `« ${formatActivityDate(candidate.value)} » (${DATE_SOURCE_LABEL[candidate.source] ?? candidate.source})`).join(" et ")}. Aucune n’est retenue tant que ce n’est pas résolu.`;
      }
      if (block.status === "pending" && serviceDate.status === "pending") {
        return `Date de mise en service · ${formatActivityDate(serviceDate.value)} reste à confirmer dans l’Assistant Activité ; le plan ne peut pas être calculé sans elle.`;
      }
      return "Date de mise en service · à renseigner dans l’Assistant Activité ; le plan d’amortissement ne peut pas être calculé sans elle.";
  }
}

export function buildAmortizationView(detail: V3AmortizationDetail, action: AmortizationAction | null): AmortizationView {
  if (detail.state === "scope_unresolved") {
    // Never a link to F014 without a verified property.
    return { state: "scope_unresolved", year: detail.year, message: SCOPE_MESSAGES[detail.reason], action: null };
  }
  const common = {
    state: "known" as const, year: detail.year, propertyId: detail.propertyId, title: detail.label, address: detail.address,
    support: detail.support, profile: detail.profile, documentsNote: NO_DOCUMENT_NOTE, action,
  };
  const { total } = detail;

  if (total.state === "not_attributable") {
    return {
      ...common, headline: null, rows: [], land: null, serviceDateLine: null, takeoverFacts: [], todo: { decisions: [], notes: [] },
      summary: "Ce dossier concerne plusieurs biens : les amortissements enregistrés ne sont pas attribuables à ce logement.",
      unsupportedNotice: `${NOT_SUPPORTED_YET} : les amortissements de l’Assistant Amortissements ne sont pas attribuables à ce logement lorsque le dossier compte plusieurs biens.`,
    };
  }

  if (total.state === "takeover") {
    const assets = detail.entry.openingAssets;
    const takeoverFacts = [
      ...(assets && assets.attributed > 0 ? [`${assets.attributed} élément(s) de votre historique sont rattachés à ce logement.`] : []),
      ...(assets && assets.unattributed > 0 ? [`${assets.unattributed} élément(s) de votre historique n’ont pas de logement renseigné.`] : []),
    ];
    return {
      ...common, headline: headlineOf(detail), rows: [], land: null, serviceDateLine: null, takeoverFacts,
      todo: { decisions: [], notes: [] }, summary: TAKEOVER_TEXT, unsupportedNotice: null,
    };
  }

  const decisions: string[] = [];
  const notes: string[] = [];
  if (detail.planBlock) {
    const text = blockText(detail.planBlock, detail.year, detail.serviceDate);
    if (text) decisions.push(text);
  }
  if (detail.serviceDate.status === "known" && detail.serviceDate.unconfirmedChange) {
    notes.push(`Date de mise en service · une modification (${formatActivityDate(detail.serviceDate.unconfirmedChange)}) reste à confirmer dans l’Assistant Activité.`);
  }
  if (total.state === "unknown" && !detail.planBlock) {
    decisions.push("Le plan d’amortissement n’est pas encore validé : validez-le dans l’Assistant Amortissements.");
  }
  if (total.state === "unconfirmed") {
    notes.push(total.contested
      ? "Ce plan a été contesté : revoyez-le et revalidez-le dans l’Assistant Amortissements."
      : "Cette sortie n’est plus confirmée : revoyez-la et reconfirmez-la dans l’Assistant Amortissements.");
  }
  if (total.state === "stale") {
    notes.push(detail.planFreshness === "drifted"
      ? "Le logement, les travaux ou la date de mise en service ont changé depuis la validation : le détail du plan n’est pas présenté ; revalidez le plan dans l’Assistant Amortissements."
      : "Le plan ne peut plus être recalculé à partir du dossier : le détail n’est pas présenté ; revalidez-le dans l’Assistant Amortissements.");
  }

  const remaining = decisions.length + notes.length;
  const summary = total.state === "unknown"
    ? "Amortissements non renseignés : aucune sortie de l’Assistant Amortissements n’est enregistrée pour cet exercice."
    : total.state === "unconfirmed"
      ? "Ces amortissements sont enregistrés mais ne sont pas confirmés : à revoir."
      : total.state === "stale"
        ? "Ces amortissements ont été calculés, puis le dossier a changé : à revoir."
        : remaining > 0 ? "Certaines informations restent à renseigner avant de finaliser vos amortissements." : "Vos amortissements sont calculés pour cet exercice.";

  const confirmed = total.state === "known_amount";
  const headline = headlineOf(detail);
  return {
    ...common,
    headline: headline ? withCompleteness(headline, remaining) : null,
    summary,
    rows: detail.lines.map(line => rowView(line, confirmed)),
    land: detail.land ? { label: "Terrain", value: euros(detail.land.amount), note: "Non amorti" } : null,
    serviceDateLine: detail.serviceDate.status === "known" ? `Date de mise en service : ${formatActivityDate(detail.serviceDate.value)}` : null,
    takeoverFacts: [],
    todo: { decisions, notes },
    unsupportedNotice: null,
  };
}

/**
 * Rubrique-level state, derived from the same view as the hero (its status label, itself derived from « Ce qui reste à
 * régler »): « Complet » only for a confirmed output with nothing left to settle. Multi-property keeps the existing state;
 * a takeover keeps the existing tone under an honest label (no amount).
 */
export function amortizationRubrique(view: AmortizationView, existing: { summary: string; complete: boolean }): RubriqueView {
  if (view.state !== "known" || !view.headline) return { summary: existing.summary, tone: existing.complete ? "ok" : "attention" };
  switch (view.headline.stateLabel) {
    case "Reprise comptable": return { summary: "Amortissements issus de la reprise comptable", tone: existing.complete ? "ok" : "attention" };
    case "Confirmé": return { summary: "Amortissements calculés", tone: "ok" };
    case "À confirmer": return { summary: "Amortissements à confirmer", tone: "attention" };
    case "À revoir": return { summary: "Amortissements à revoir", tone: "attention" };
    default: return { summary: "Amortissements à compléter", tone: "attention" };
  }
}
