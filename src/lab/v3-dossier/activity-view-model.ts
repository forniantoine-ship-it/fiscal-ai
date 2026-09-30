/**
 * R15.3 — pure presentation adapter: `V3ActivityDetail` (F009 data structured by the read model) → what the V3 Activité
 * components display. No calculation, no fixture, no fallback value: every string is a stored value, a F009 label, or a
 * neutral sentence about what is (not) available.
 */
import type { V3ActivityDecision, V3ActivityDetail, V3ActivityFact, V3ActivityState } from "@/lab/v2-dossier/activity-detail-read-model";
import type { F009QuestionStep } from "@/runtime/assistants/f009-activite/types";
import type { PieceView } from "./financing-view-model";

export type ActivityAction = { label: string; href: string };

export const REVIEW_IN_F009_LABEL = "Revoir dans l’Assistant Activité";

const QUESTION_LABELS: Record<F009QuestionStep, string> = {
  identifier: "SIRET ou SIREN",
  identity: "Nom et prénom de l’exploitant",
  address: "Adresse de l’activité",
  activity_date: "Date de début d’activité",
  service_date: "Date de mise en service",
};

export type ActivityFactView = {
  id: string;
  label: string;
  value: string;
  /** null = provenance unavailable: nothing is claimed. */
  source: { label: string; document?: string } | null;
  stateLabel: "À confirmer" | "Saisi" | "Extrait" | "Retenu";
  tone: "ok" | "attention";
};

export type ActivityView = {
  state: V3ActivityState;
  year: number;
  confirmed: boolean;
  /** « Ce que ça donne » — a short statement of the real state, never a fiscal result. */
  summary: string;
  facts: ActivityFactView[];
  /** « Ce qui reste à régler » */
  todo: { questions: string[]; decisions: string[] };
  pieces: PieceView[];
  action: ActivityAction | null;
};

function factView(fact: V3ActivityFact): ActivityFactView {
  const { origin } = fact;
  const source: ActivityFactView["source"] = origin.kind === "manual" ? { label: "Saisi par vous" }
    : origin.kind === "extracted" ? { label: origin.document ? "Document du dossier" : "Extrait d’un document", ...(origin.document ? { document: origin.document.label } : {}) }
      : null;
  // A value not yet confirmed is never presented as retained.
  const stateLabel: ActivityFactView["stateLabel"] = fact.status === "to_confirm" ? "À confirmer"
    : origin.kind === "manual" ? "Saisi" : origin.kind === "extracted" ? "Extrait" : "Retenu";
  return { id: fact.id, label: fact.label, value: fact.value, source, stateLabel, tone: fact.status === "to_confirm" ? "attention" : "ok" };
}

function decisionText(decision: V3ActivityDecision): string {
  switch (decision.kind) {
    case "conflict": return `${decision.label} · information différente : « ${decision.confirmedValue} » dans votre dossier, « ${decision.newValue} » dans le document.`;
    case "siret_ambiguous": return "Plusieurs établissements sont possibles : choisissez celui de votre activité.";
    case "dates_ambiguous": return "Plusieurs dates de début d’activité ont été trouvées : choisissez la bonne.";
  }
}

const PIECE_STATE: Record<string, PieceView["state"]> = { analyzed: "done", uploaded: "reading", processing: "reading", failed: "failed" };

function buildSummary(detail: V3ActivityDetail): string {
  if (detail.state === "unsupported") return "Ce dossier concerne plusieurs biens : l’activité n’est pas présentée ici.";
  const open = detail.remaining.length + detail.decisions.length;
  if (detail.confirmed) {
    return open === 0
      ? "Votre activité est confirmée dans votre dossier."
      : "Votre activité est confirmée, mais des informations restent à compléter.";
  }
  return detail.facts.length > 0
    ? "Votre activité n’est pas encore confirmée : les informations ci-dessous restent à confirmer."
    : "Aucune information d’activité n’est encore enregistrée pour ce dossier.";
}

export function buildActivityView(detail: V3ActivityDetail, action: ActivityAction | null): ActivityView {
  return {
    state: detail.state,
    year: detail.year,
    confirmed: detail.confirmed,
    summary: buildSummary(detail),
    facts: detail.facts.map(factView),
    todo: { questions: detail.remaining.map(step => QUESTION_LABELS[step]), decisions: detail.decisions.map(decisionText) },
    pieces: detail.documents.map(doc => ({ name: doc.label, state: PIECE_STATE[doc.status] ?? "unknown" })),
    action,
  };
}
