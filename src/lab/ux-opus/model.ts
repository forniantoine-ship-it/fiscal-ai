// Prototype UX isolé — aucune donnée réelle, aucun appel au moteur Fiscal AI.
// Les calculs ci-dessous ne font que simuler les sorties du moteur pour rendre le
// prototype cohérent ; ils suivent l'ordre documenté dans knowledge/ (RAI-014,
// SAV-027, AX-016, AX-017, SAV-007) et ne doivent jamais être réutilisés en production.

export type ScenarioId = "a" | "b" | "c";

export type DomainId =
  | "logement"
  | "financement"
  | "loyers"
  | "depenses"
  | "amortissements"
  | "historique";

export type Provenance =
  | { kind: "read"; docIds: string[] }
  | { kind: "computed"; note?: string }
  | { kind: "answer"; note?: string }
  | { kind: "corrected"; note?: string }
  | { kind: "default"; note: string }
  | { kind: "carried"; from: string }
  | { kind: "estimated"; note: string }
  | { kind: "missing" };

export type Fact = string | number | boolean | null;
export type Facts = Record<string, Fact>;

export type PointKind = "contradiction" | "missing" | "decision" | "optional";

export type PointOption = {
  id: string;
  label: string;
  hint?: string;
  recommended?: boolean;
  set?: Facts;
  input?: {
    kind: "date" | "amount" | "percent";
    key: string;
    min?: number;
    max?: number;
    softMin?: number;
    softMax?: number;
    softWarning?: string;
  };
  addDoc?: string;
  escalate?: string;
  dismiss?: boolean;
};

export type Point = {
  id: string;
  kind: PointKind;
  blocking: boolean;
  domain: DomainId;
  title: string;
  context: string;
  why: string;
  sources?: { label: string; value: string; docId: string }[];
  options: PointOption[];
  deferLabel: string;
  delegate?: { to: string; message: string };
  preview?: (facts: Facts) => string;
};

export type PointStatus = "open" | "answered" | "deferred" | "escalated";

export type PointState = { status: PointStatus; answer?: string };

export type DocFinding = { label: string; value: string };

export type Doc = {
  id: string;
  file: string;
  kind: string;
  year: number;
  hidden?: boolean;
  status: "ok" | "attention" | "info";
  statusNote?: string;
  findings: DocFinding[];
  usedIn: DomainId[];
  pointId?: string;
  paper: { heading: string; lines: { t: string; mark?: string }[] };
};

export type ScenarioState = {
  phase: "start" | "analyzing" | "ready";
  facts: Facts;
  points: Record<string, PointState>;
  addedDocs: string[];
  removedRows: string[];
  generated: boolean;
};

export type Row = {
  id: string;
  label: string;
  sub?: string;
  amount?: number;
  value?: string;
  prov: Provenance;
  pointId?: string;
  removable?: boolean;
  removed?: boolean;
  flag?: "pending" | "gap";
};

export type Sequence = {
  recettes: number;
  charges: number;
  avant: number;
  deficitsStockBefore: number;
  deficitsUsed: number;
  amortYear: number;
  amortUsed: number;
  ardStockBefore: number;
  ardUsed: number;
  result: number;
  newDeficit: number;
  newArd: number;
  ardStockAfter: number;
  deficitsStockAfter: number;
};

export type AutoResolved = { title: string; detail: string; rule: string };

export type DefaultChoice = {
  title: string;
  detail: string;
  rule: string;
  assistant: string;
};

export type Summary = { text: string; status: "ok" | "attention" | "info" };

export type HistoryRow = {
  year: number;
  label: string;
  dotation: number;
  used: number;
  stock: number;
  prov: Provenance;
};

export type View = {
  year: number;
  owner: string;
  property: string;
  propertyShort: string;
  logement: Row[];
  autoResolved: AutoResolved[];
  defaults: DefaultChoice[];
  financement: {
    rows: Row[];
    schedule: { label: string; interest: number; insurance: number }[];
    scheduleNote: string;
  };
  loyers: { rows: Row[]; total: number };
  depenses: { rows: Row[]; total: number };
  amort: {
    baseRows: Row[];
    components: { label: string; share: number; years: number; base: number; year: number }[];
    mobilier: { label: string; base: number; years: number; year: number }[];
    totalYear: number;
    prorataNote: string;
  };
  history: HistoryRow[];
  deficits: { year: number; amount: number; used: number }[];
  seq: Sequence;
  summaries: Record<DomainId, Summary>;
  provisional: boolean;
};

// ─── Calculs de démonstration ────────────────────────────────────────────────

export type LoanSpec = {
  principal: number;
  annualRatePct: number;
  months: number;
  firstDueYear: number;
  firstDueMonth: number;
  monthlyInsurance: number;
};

export type LoanRow = {
  year: number;
  month: number;
  interest: number;
  principal: number;
  remaining: number;
};

export function loanSchedule(spec: LoanSpec): LoanRow[] {
  const r = spec.annualRatePct / 100 / 12;
  const payment = (spec.principal * r) / (1 - Math.pow(1 + r, -spec.months));
  const rows: LoanRow[] = [];
  let remaining = spec.principal;
  let year = spec.firstDueYear;
  let month = spec.firstDueMonth;
  for (let i = 0; i < spec.months; i += 1) {
    const interest = remaining * r;
    const principal = payment - interest;
    remaining -= principal;
    rows.push({ year, month, interest, principal, remaining });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return rows;
}

export function loanYear(spec: LoanSpec, year: number) {
  const rows = loanSchedule(spec).filter((row) => row.year === year);
  const interest = Math.round(rows.reduce((sum, row) => sum + row.interest, 0));
  const insurance = Math.round(rows.length * spec.monthlyInsurance);
  const remaining = rows.length > 0 ? Math.round(rows[rows.length - 1].remaining) : 0;
  return { rows, interest, insurance, remaining, count: rows.length };
}

/** Jours restants dans l'année (convention 30/360) à partir d'une date ISO incluse. */
export function days360ToYearEnd(iso: string): number {
  const [, m, d] = iso.split("-").map(Number);
  const day = Math.min(d, 30);
  return (12 - m) * 30 + (30 - day + 1);
}

/** Grille A — appartement en copropriété (SAV-007, JUG-004, durées JUG-005). */
export const GRID_APARTMENT = [
  { label: "Gros œuvre", share: 0.5, years: 50 },
  { label: "Toiture (quote-part)", share: 0.1, years: 25 },
  { label: "Installations électriques", share: 0.1, years: 25 },
  { label: "Plomberie, sanitaires", share: 0.1, years: 25 },
  { label: "Étanchéité (quote-part)", share: 0.05, years: 15 },
  { label: "Agencements intérieurs", share: 0.15, years: 15 },
];

export function componentsFor(bati: number, prorata: number) {
  return GRID_APARTMENT.map((c) => {
    const base = Math.round(bati * c.share);
    return {
      label: c.label,
      share: c.share,
      years: c.years,
      base,
      year: Math.round((base / c.years) * prorata),
    };
  });
}

/** Ordre d'imputation : déficits antérieurs, amortissement de l'exercice, stock reporté (SAV-027). */
export function fiscalSequence(input: {
  recettes: number;
  charges: number;
  amortYear: number;
  deficitsStock: number;
  ardStock: number;
}): Sequence {
  const avant = input.recettes - input.charges;
  if (avant <= 0) {
    return {
      recettes: input.recettes,
      charges: input.charges,
      avant,
      deficitsStockBefore: input.deficitsStock,
      deficitsUsed: 0,
      amortYear: input.amortYear,
      amortUsed: 0,
      ardStockBefore: input.ardStock,
      ardUsed: 0,
      result: avant,
      newDeficit: -avant,
      newArd: input.amortYear,
      ardStockAfter: input.ardStock + input.amortYear,
      deficitsStockAfter: input.deficitsStock - avant,
    };
  }
  let remaining = avant;
  const deficitsUsed = Math.min(input.deficitsStock, remaining);
  remaining -= deficitsUsed;
  const amortUsed = Math.min(input.amortYear, remaining);
  remaining -= amortUsed;
  const ardUsed = Math.min(input.ardStock, remaining);
  remaining -= ardUsed;
  const newArd = input.amortYear - amortUsed;
  return {
    recettes: input.recettes,
    charges: input.charges,
    avant,
    deficitsStockBefore: input.deficitsStock,
    deficitsUsed,
    amortYear: input.amortYear,
    amortUsed,
    ardStockBefore: input.ardStock,
    ardUsed,
    result: remaining,
    newDeficit: 0,
    newArd,
    ardStockAfter: input.ardStock - ardUsed + newArd,
    deficitsStockAfter: input.deficitsStock - deficitsUsed,
  };
}

export function sumRows(rows: Row[]): number {
  return rows.reduce(
    (sum, row) => (row.removed || row.flag === "gap" ? sum : sum + (row.amount ?? 0)),
    0,
  );
}

const moneyFormat = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function eur(value: number): string {
  return moneyFormat.format(Math.round(value) || 0);
}

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function monthName(m: number): string {
  return MONTHS[m - 1];
}

export function frDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${y}`;
}
