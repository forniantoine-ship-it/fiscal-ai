/**
 * R15 — pure presentation adapter: `V3FinancingDetail` (persisted data, structured by the read model) → what the V3
 * financing components display. No calculation, no fixture, no fallback value: every string shown is either a stored
 * value, a stored label, or a neutral sentence about what is not available.
 */
import type { V3FinancingDetail, V3FinancingState, V3LoanFactOrigin } from "@/lab/v2-dossier/financing-detail-read-model";

export type FinancingAction = { label: string; href: string };

export const REVIEW_IN_F011_LABEL = "Revoir dans l’Assistant Financement";

export type OriginView = { label: string; tone: "ok" | "corrected"; document?: string };

export type LoanFactView = { id: string; label: string; value: string | null; origin?: OriginView };

export type LoanView = {
  id: string;
  label: string;
  facts: LoanFactView[];
  exercise: Array<{ label: string; value: string }>;
  attention: string[];
};

export type ScheduleView =
  | { kind: "table"; caption: string; rows: Array<{ key: string; month: string; mensualite: string; interets: string; assurance: string; capital: string }> }
  | { kind: "neutral"; message: string };

export type PieceView = { name: string; state: "done" | "reading" | "unknown" | "failed" };

export type FinancingView = {
  state: V3FinancingState;
  year: number;
  headline?: { amount: string; caption: string; breakdown: Array<{ amount: string; label: string }>; note?: string };
  loans: LoanView[];
  /** Facts a loan does not carry yet, e.g. "Prêt 1 · Date de première mensualité". */
  missing: string[];
  schedule: ScheduleView;
  pieces: PieceView[];
  action: FinancingAction | null;
};

const euros = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} €`;

function originView(origin: V3LoanFactOrigin | undefined): OriginView | undefined {
  if (!origin) return undefined;
  return {
    label: origin.label,
    tone: origin.source === "user_correction" ? "corrected" : "ok",
    ...(origin.document ? { document: origin.document.label } : {}),
  };
}

const PIECE_STATE: Record<string, PieceView["state"]> = { analyzed: "done", uploaded: "reading", processing: "reading", failed: "failed" };

export function buildFinancingView(detail: V3FinancingDetail, action: FinancingAction | null): FinancingView {
  const loans: LoanView[] = detail.loans.map(loan => {
    const exercise: LoanView["exercise"] = [];
    const data = loan.exercise;
    if (data) {
      if (data.interets !== undefined) exercise.push({ label: "Intérêts d’emprunt", value: euros(data.interets) });
      if (data.assurance !== undefined) exercise.push({ label: "Assurance emprunteur", value: euros(data.assurance) });
      if (data.capitalRembourse !== undefined) exercise.push({ label: "Capital remboursé", value: euros(data.capitalRembourse) });
      if (data.capitalRestantDu !== undefined) exercise.push({ label: `Capital restant dû au 31/12/${detail.year}`, value: euros(data.capitalRestantDu) });
      if (data.interetsPreExploitation) exercise.push({ label: "Intérêts de pré-exploitation (portés à part)", value: euros(data.interetsPreExploitation) });
      if (data.assurancePreExploitation) exercise.push({ label: "Assurance de pré-exploitation (portée à part)", value: euros(data.assurancePreExploitation) });
      if (data.fraisDossier) exercise.push({ label: "Frais de dossier", value: euros(data.fraisDossier) });
      if (data.garantie) exercise.push({ label: "Garantie", value: euros(data.garantie) });
      if (data.ira) exercise.push({ label: "Indemnités de remboursement anticipé (IRA)", value: euros(data.ira) });
    }
    const attention = loan.exclusion.map(cause => `Prêt exclu du calcul : ${cause.label.charAt(0).toLowerCase()}${cause.label.slice(1)}.`);
    if (loan.exclusionUndetermined) attention.push("Prêt exclu du calcul : cause non déterminable à partir des données enregistrées.");
    return {
      id: loan.id,
      label: loan.label,
      facts: loan.facts.map(fact => ({ id: fact.id, label: fact.label, value: fact.value, ...(fact.origin ? { origin: originView(fact.origin) } : {}) })),
      exercise,
      attention,
    };
  });

  const missing = loans.flatMap(loan => loan.facts.filter(fact => fact.value === null).map(fact => `${loan.label} · ${fact.label}`));

  let headline: FinancingView["headline"];
  if (detail.totals) {
    const totals = detail.totals;
    const breakdown = [
      { amount: euros(totals.interets), label: "Intérêts d’emprunt" },
      { amount: euros(totals.assurance), label: "Assurance emprunteur" },
      ...(totals.interetsPreExploitation ? [{ amount: euros(totals.interetsPreExploitation), label: "Intérêts de pré-exploitation · portés à part" }] : []),
      ...(totals.assurancePreExploitation ? [{ amount: euros(totals.assurancePreExploitation), label: "Assurance de pré-exploitation · portée à part" }] : []),
    ];
    const hasLoanLevelCharges = detail.loans.some(loan => Boolean(loan.exercise?.fraisDossier || loan.exercise?.garantie || loan.exercise?.ira));
    headline = {
      amount: euros(totals.total),
      caption: `de charges de financement en ${detail.year}`,
      breakdown,
      ...(hasLoanLevelCharges ? { note: "Les frais, la garantie et les IRA éventuels sont détaillés prêt par prêt." } : {}),
    };
  }

  let schedule: ScheduleView;
  if (detail.schedule.state === "available") {
    schedule = {
      kind: "table",
      caption: `Échéances ${detail.year} du prêt, lues dans l’échéancier importé`,
      rows: detail.schedule.rows.map(row => ({
        key: row.date, month: row.month, mensualite: euros(row.mensualite), interets: euros(row.interets),
        assurance: euros(row.assurance), capital: euros(row.capital),
      })),
    };
  } else {
    schedule = {
      kind: "neutral",
      message: detail.schedule.reason === "absent"
        ? "Aucun échéancier importé n’est enregistré pour ce financement : le détail mois par mois n’est pas affiché."
        : "L’échéancier enregistré ne permet pas d’afficher le détail mois par mois pour cet exercice.",
    };
  }

  return {
    state: detail.state,
    year: detail.year,
    ...(headline ? { headline } : {}),
    loans,
    missing,
    schedule,
    pieces: detail.documents.map(doc => ({ name: doc.label, state: PIECE_STATE[doc.status] ?? "unknown" })),
    action,
  };
}
