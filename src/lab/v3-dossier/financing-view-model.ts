/**
 * R15/R15.2 — pure presentation adapter: `V3FinancingDetail` (persisted data, structured by the read model) → what the V3
 * financing components display. No calculation, no fixture, no fallback value: every string shown is either a stored
 * value, a stored label, or a neutral sentence about what is available / not available.
 */
import type { V3FinancingDetail, V3FinancingState, V3LoanDetail, V3LoanFactOrigin } from "@/lab/v2-dossier/financing-detail-read-model";

export type FinancingAction = { label: string; href: string };

export const REVIEW_IN_F011_LABEL = "Revoir dans l’Assistant Financement";
export const VERIFICATION_TITLE = "Une vérification reste nécessaire";

export type OriginView = { label: string; tone: "ok" | "corrected"; document?: string };

export type LoanFactView = { id: string; label: string; value: string | null; origin?: OriginView };

export type LoanView = {
  id: string;
  label: string;
  facts: LoanFactView[];
  exercise: Array<{ label: string; value: string }>;
  /** Reasons specific to this loan (verification needed, or not yet taken into account). Never "exclu du calcul". */
  notices: string[];
};

export type ScheduleView =
  | { kind: "table"; caption: string; rows: Array<{ key: string; month: string; mensualite: string; interets: string; assurance: string; capital: string }> }
  | { kind: "neutral"; message: string };

export type PieceView = { name: string; state: "done" | "reading" | "unknown" | "failed" };

/** One line of the breakdown; `value` is the persisted number, `amount` its display. */
export type BreakdownLine = { label: string; value: number; amount: string };

export type HeadlineView = {
  amount: string;
  caption: string;
  /** Every component of the persisted total (zero frais / garantie / IRA are simply absent). */
  lines: BreakdownLine[];
  /** "exact": the lines add up to the persisted total to the cent. "unexplained": they do not — nothing is invented. */
  reconciliation: "exact" | "unexplained";
  reconciliationNote?: string;
  /** Charges before the entry into service, followed separately and NOT part of the total above. */
  preExploitation?: { title: string; note: string; lines: BreakdownLine[] };
};

export type VerificationView = {
  title: string;
  paragraphs: string[];
};

export type RubriqueView = { summary: string; tone: "ok" | "attention" };

export type FinancingView = {
  state: V3FinancingState;
  year: number;
  headline?: HeadlineView;
  /** Present when a real data/documentary reason keeps the financing from being reliable for the declaration. */
  verification?: VerificationView;
  loans: LoanView[];
  /** Facts a loan does not carry yet, e.g. "Prêt 1 · Date de première mensualité". */
  missing: string[];
  schedule: ScheduleView;
  pieces: PieceView[];
  action: FinancingAction | null;
};

/** Whole euros stay whole ("500 €"); any amount with cents always shows both decimals ("1 361,60 €"). */
const euros = (value: number) =>
  `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value)} €`;
const line = (label: string, value: number): BreakdownLine => ({ label, value, amount: euros(value) });
const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

function originView(origin: V3LoanFactOrigin | undefined): OriginView | undefined {
  if (!origin) return undefined;
  return {
    label: origin.label,
    tone: origin.source === "user_correction" ? "corrected" : "ok",
    ...(origin.document ? { document: origin.document.label } : {}),
  };
}

const PIECE_STATE: Record<string, PieceView["state"]> = { analyzed: "done", uploaded: "reading", processing: "reading", failed: "failed" };

/** Sentences about ONE loan. A loan whose amounts exist (even by reconstruction) is never described as excluded. */
function loanNotices(loan: V3LoanDetail): string[] {
  if (loan.computed) {
    return loan.blockers.map(cause => {
      switch (cause.code) {
        case "schedule_not_usable": return "Le tableau d’amortissement importé ne permet pas encore de sécuriser l’échéancier de ce prêt pour la déclaration.";
        case "subscription_year_unknown": return "L’année de souscription du prêt n’est pas connue alors que des frais sont renseignés : à confirmer.";
        case "first_payment_date_missing": return "La date de première mensualité du prêt n’est pas connue.";
      }
    });
  }
  const notices = loan.blockers.map(cause => `Ce prêt n’est pas encore pris en compte dans le calcul : ${lowerFirst(cause.label)}.`);
  if (loan.blockersUndetermined) {
    notices.push("Ce prêt n’est pas pris en compte dans le calcul enregistré ; la cause n’est pas déterminable à partir des données enregistrées.");
  }
  return notices;
}

function buildVerification(detail: V3FinancingDetail): VerificationView | undefined {
  const flagged = detail.loans.filter(loan => loan.blockers.length > 0 || loan.blockersUndetermined);
  if (flagged.length === 0) return undefined;
  const paragraphs: string[] = [];
  if (flagged.some(loan => loan.computed && loan.blockers.some(cause => cause.code === "schedule_not_usable"))) {
    // The precise rejection condition is not persisted: none is claimed.
    paragraphs.push("J’ai pu calculer vos charges à partir des caractéristiques de votre prêt, mais votre tableau d’amortissement ne permet pas encore de sécuriser l’échéancier pour la déclaration.");
    paragraphs.push("Ce document devra être remplacé ou complété avant la finalisation de votre déclaration.");
  }
  if (flagged.some(loan => loan.computed && loan.blockers.some(cause => cause.code !== "schedule_not_usable"))) {
    paragraphs.push("Une information du prêt reste à confirmer ou à compléter (détail prêt par prêt ci-dessous).");
  }
  if (flagged.some(loan => !loan.computed)) {
    paragraphs.push("Au moins un prêt n’est pas encore pris en compte dans le calcul (détail prêt par prêt ci-dessous).");
  }
  if (detail.stepStatus === "incomplete") {
    paragraphs.push("Tant que ce point n’est pas réglé, le financement n’est pas prêt pour la déclaration.");
  }
  return { title: VERIFICATION_TITLE, paragraphs };
}

function buildHeadline(detail: V3FinancingDetail): HeadlineView | undefined {
  const totals = detail.totals;
  if (!totals) return undefined;
  const c = totals.components;
  const lines = [
    line("Intérêts d’emprunt", c.interets),
    line("Assurance emprunteur", c.assurance),
    ...(c.fraisDossier ? [line("Frais de dossier", c.fraisDossier)] : []),
    ...(c.garantie ? [line("Garantie", c.garantie)] : []),
    ...(c.ira ? [line("Indemnités de remboursement anticipé (IRA)", c.ira)] : []),
  ];
  const preLines = [
    ...(totals.interetsPreExploitation ? [line("Intérêts de pré-exploitation", totals.interetsPreExploitation)] : []),
    ...(totals.assurancePreExploitation ? [line("Assurance de pré-exploitation", totals.assurancePreExploitation)] : []),
  ];
  return {
    amount: euros(totals.total),
    caption: `de charges de financement en ${detail.year}`,
    lines,
    reconciliation: totals.reconciled ? "exact" : "unexplained",
    ...(totals.reconciled ? {} : {
      reconciliationNote: "Le détail enregistré ne permet pas de reconstituer exactement ce total ; aucun montant n’est ajouté pour le combler.",
    }),
    ...(preLines.length > 0 ? {
      preExploitation: {
        title: "Charges antérieures à la mise en service",
        note: "Ces charges précèdent la mise en service du logement : elles sont traitées séparément et ne sont pas comprises dans le total ci-dessus.",
        lines: preLines,
      },
    } : {}),
  };
}

export function buildFinancingView(detail: V3FinancingDetail, action: FinancingAction | null): FinancingView {
  const loans: LoanView[] = detail.loans.map(loan => {
    const exercise: LoanView["exercise"] = [];
    const data = loan.exercise;
    if (data) {
      if (data.interets !== undefined) exercise.push({ label: "Intérêts d’emprunt", value: euros(data.interets) });
      if (data.assurance !== undefined) exercise.push({ label: "Assurance emprunteur", value: euros(data.assurance) });
      if (data.fraisDossier) exercise.push({ label: "Frais de dossier", value: euros(data.fraisDossier) });
      if (data.garantie) exercise.push({ label: "Garantie", value: euros(data.garantie) });
      if (data.ira) exercise.push({ label: "Indemnités de remboursement anticipé (IRA)", value: euros(data.ira) });
      if (data.capitalRembourse !== undefined) exercise.push({ label: "Capital remboursé", value: euros(data.capitalRembourse) });
      if (data.capitalRestantDu !== undefined) exercise.push({ label: `Capital restant dû au 31/12/${detail.year}`, value: euros(data.capitalRestantDu) });
      if (data.interetsPreExploitation) exercise.push({ label: "Intérêts de pré-exploitation (traités séparément)", value: euros(data.interetsPreExploitation) });
      if (data.assurancePreExploitation) exercise.push({ label: "Assurance de pré-exploitation (traitée séparément)", value: euros(data.assurancePreExploitation) });
    }
    return {
      id: loan.id,
      label: loan.label,
      facts: loan.facts.map(fact => ({ id: fact.id, label: fact.label, value: fact.value, ...(fact.origin ? { origin: originView(fact.origin) } : {}) })),
      exercise,
      notices: loanNotices(loan),
    };
  });

  const missing = loans.flatMap(loan => loan.facts.filter(fact => fact.value === null).map(fact => `${loan.label} · ${fact.label}`));

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

  const headline = buildHeadline(detail);
  const verification = buildVerification(detail);
  return {
    state: detail.state,
    year: detail.year,
    ...(headline ? { headline } : {}),
    ...(verification ? { verification } : {}),
    loans,
    missing,
    schedule,
    pieces: detail.documents.map(doc => ({ name: doc.label, state: PIECE_STATE[doc.status] ?? "unknown" })),
    action,
  };
}

/**
 * Rubrique-level state, reusing existing states only: a result that exists but cannot yet be secured is shown as such,
 * never as excluded; otherwise the existing read-model summary and tone are kept.
 */
export function financingRubrique(view: FinancingView, existing: { summary: string; complete: boolean }): RubriqueView {
  if (view.state === "known" && view.headline && view.verification) {
    return { summary: "Résultat disponible · vérification nécessaire", tone: "attention" };
  }
  return { summary: existing.summary, tone: existing.complete ? "ok" : "attention" };
}
