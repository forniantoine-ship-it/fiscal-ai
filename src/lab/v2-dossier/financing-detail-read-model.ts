import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { isAnnualOutputForActiveYear } from "@/lib/lmnp/services/dossier/annual-output-year-safety";
import { buildDossierSteps } from "@/lib/lmnp/services/validation-profile";
import { resolveCreditFinancingLoanEcheances } from "@/lib/lmnp/services/f011/f011-documentary-installments";
import type { LoanProfile } from "@/lib/lmnp/types/domain";
import type { FieldSource } from "@/runtime/contracts/FieldSource";
import type { V3DocumentProcessingStatus, V3DocumentsReadModel } from "./document-read-model";
import {
  LOAN_FACT_PROVENANCE_KEY, V3_LOAN_EXCLUSION_PHRASES, loanExclusionCauses, type V3LoanExclusionCode,
} from "./financing-shared";
import { fieldSourceLabel, known, percent } from "./read-model";
import { resolveV3ActiveBienSource } from "./v3-property-scope";

/**
 * R15 — structured, per-loan projection of the persisted Financement data for the V3 workspace.
 * Pure transport/structuring of `creditFinancing`, `financementCharges` and `LoanProfile.provenance`:
 * nothing is computed, nothing is reconstructed, nothing comes from a fixture. Absent = unknown.
 */
export type V3FinancingState = "known" | "none" | "missing" | "unsupported";

export interface V3LoanFactOrigin {
  source: FieldSource;
  /** "Extrait" / "Saisi" / "Corrigé" … — same vocabulary as the flat read model. */
  label: string;
  /** Only when the real `documentId` still resolves to a document of the dossier. */
  document?: { id: string; label: string };
}

export interface V3LoanFactDetail {
  id: string;
  label: string;
  value: string | null;
  origin?: V3LoanFactOrigin;
}

export interface V3LoanExerciseDetail {
  interets?: number;
  assurance?: number;
  capitalRembourse?: number;
  capitalRestantDu?: number;
  interetsPreExploitation?: number;
  assurancePreExploitation?: number;
  fraisDossier?: number;
  garantie?: number;
  ira?: number;
}

export interface V3LoanDetail {
  id: string;
  /** "Prêt 1", "Prêt 2"… — position in the confirmed list, never a bank name. */
  label: string;
  facts: V3LoanFactDetail[];
  exercise?: V3LoanExerciseDetail;
  /**
   * True when F011 produced amounts for this loan (it is present in the persisted `prets[]`), including by
   * reconstruction from the loan terms. False only when the persisted output carries nothing for it.
   */
  computed: boolean;
  /** Real data/documentary reasons the loan is not (or not yet) reliable for the declaration, re-derived from the stored loan. */
  blockers: { code: V3LoanExclusionCode; label: string }[];
  /** True when the persisted output flags this loan as not calculated although no cause can be re-derived. */
  blockersUndetermined: boolean;
}

export interface V3FinancingTotals {
  /** Persisted `totalChargesFinancementExercice`, transported as is. */
  total: number;
  interets: number;
  assurance: number;
  capitalRembourse: number;
  interetsPreExploitation?: number;
  assurancePreExploitation?: number;
  /**
   * Every component the F011 engine adds into `total` (interets + assurance + frais + garantie + IRA). The last three
   * exist only per loan in the persisted output: they are shown here as the plain sum of those persisted values, never
   * recomputed from loan terms.
   */
  components: { interets: number; assurance: number; fraisDossier: number; garantie: number; ira: number };
  /** True only when the components add up exactly (to the cent) to the persisted `total`. */
  reconciled: boolean;
}

export interface V3ScheduleRow {
  date: string;
  month: string;
  mensualite: number;
  interets: number;
  assurance: number;
  capital: number;
}

export type V3FinancingSchedule =
  | { state: "available"; loanId: string; rows: V3ScheduleRow[] }
  | { state: "unavailable"; reason: "absent" | "not_usable" };

export interface V3FinancingDocument {
  id: string;
  label: string;
  status: V3DocumentProcessingStatus | "unknown";
}

export interface V3FinancingDetail {
  state: V3FinancingState;
  /** Existing dossier step status for the credit rubrique (the same rule the whole dossier uses to allow the declaration). */
  stepStatus: "complete" | "incomplete";
  year: number;
  loans: V3LoanDetail[];
  totals?: V3FinancingTotals;
  schedule: V3FinancingSchedule;
  documents: V3FinancingDocument[];
}

/** Exact euros (cents kept when present): a restitution never rounds a stored amount. */
function exactMoney(value: number | undefined): string | null {
  return typeof value === "number"
    ? `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value)} €`
    : null;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const LOAN_TYPE_LABELS: Record<string, string> = { amortissable: "Amortissable", in_fine: "In fine" };

function monthLabel(date: string): string {
  const match = date.trim().match(/^(\d{4})-(\d{2})-\d{2}/);
  if (!match) return date;
  // Local construction from the printed year/month: independent of the server timezone.
  return capitalise(new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(Number(match[1]), Number(match[2]) - 1, 1)));
}

function yearOf(date: string): number | null {
  const match = date.trim().match(/^(\d{4})-/);
  return match ? Number(match[1]) : null;
}

function buildLoanFacts(loan: LoanProfile, workspace: PersistedWorkspace): V3LoanFactDetail[] {
  const origin = (factKey: string, hasValue: boolean): V3LoanFactOrigin | undefined => {
    const entry = hasValue ? loan.provenance?.[LOAN_FACT_PROVENANCE_KEY[factKey] ?? ""] : undefined;
    const label = fieldSourceLabel(entry?.source);
    if (!entry || !label) return undefined;
    const doc = entry.documentId ? workspace.documents.find(item => item.id === entry.documentId) : undefined;
    return { source: entry.source, label, ...(doc ? { document: { id: doc.id, label: doc.fileName } } : {}) };
  };
  // A confirmed F011 loan with provenance but no entry for the insurance amount never had one: the canonical `0` is a
  // transport default, not a known amount. Older dossiers (no provenance at all) keep their stored value as is.
  const insuranceUnknown = loan.insurance === 0 && loan.provenance !== undefined && loan.provenance.assuranceAnnuelle === undefined;
  const rows: Array<[string, string, string | null, boolean]> = [
    ["loanType", "Type de prêt", known(LOAN_TYPE_LABELS[loan.loanType] ?? loan.loanType), true],
    ["borrowedAmount", "Capital emprunté", exactMoney(loan.borrowedAmount), true],
    ["rate", "Taux", percent(loan.rate), true],
    ["durationMonths", "Durée", typeof loan.durationMonths === "number" ? `${loan.durationMonths} mois` : null, true],
    ["firstPaymentDate", "Date de première mensualité", known(loan.firstPaymentDate), true],
    ["insurance", "Assurance annuelle", insuranceUnknown ? null : exactMoney(loan.insurance), true],
    ["capitalInitialOffre", "Capital initial lu sur l’offre", exactMoney(loan.capitalInitialOffre), loan.capitalInitialOffre !== undefined],
    ["loanApplicationFees", "Frais de dossier", exactMoney(loan.loanApplicationFees), loan.loanApplicationFees !== undefined],
    ["loanGuaranteeFees", "Frais de garantie", exactMoney(loan.loanGuaranteeFees), loan.loanGuaranteeFees !== undefined],
  ];
  return rows.filter(([, , , applicable]) => applicable).map(([key, label, value]) => {
    const factOrigin = origin(key, value !== null);
    return { id: key, label, value, ...(factOrigin ? { origin: factOrigin } : {}) };
  });
}

function processingStatusFor(id: string, documents: V3DocumentsReadModel | undefined): V3FinancingDocument["status"] {
  if (!documents || documents.state !== "known") return "unknown";
  return documents.documents.find(item => item.id === id)?.processingStatus ?? "unknown";
}

const cents = (value: number | undefined) => Math.round((value ?? 0) * 100);

/**
 * Transport of the persisted exercise output. The only operation is adding the persisted per-loan frais / garantie / IRA
 * so that every component of `total` is shown; the sum is then CHECKED against the persisted total and never substituted for it.
 */
function buildTotals(output: NonNullable<PersistedWorkspace["declarationDraft"]>["financementCharges"] & object): V3FinancingTotals {
  const sum = (pick: (pret: (typeof output.prets)[number]) => number | undefined) => output.prets.reduce((acc, pret) => acc + cents(pick(pret)), 0) / 100;
  const components = {
    interets: output.totalInteretsEmprunt, assurance: output.totalAssurance,
    fraisDossier: sum(pret => pret.fraisDossierDeductibles), garantie: sum(pret => pret.garantieDeductible), ira: sum(pret => pret.iraDeductible),
  };
  const reconciled = cents(components.interets) + cents(components.assurance) + cents(components.fraisDossier) +
    cents(components.garantie) + cents(components.ira) === cents(output.totalChargesFinancementExercice);
  return {
    total: output.totalChargesFinancementExercice, interets: output.totalInteretsEmprunt, assurance: output.totalAssurance,
    capitalRembourse: output.totalCapitalRembourse, interetsPreExploitation: output.totalInteretsPreExploitation,
    ...(output.totalAssurancePreExploitation !== undefined ? { assurancePreExploitation: output.totalAssurancePreExploitation } : {}),
    components, reconciled,
  };
}

export function buildV3FinancingDetail(workspace: PersistedWorkspace, documents?: V3DocumentsReadModel, activePropertyId?: string | null): V3FinancingDetail {
  const year = workspace.fiscalYear.year;
  // R2A — F011 is property-scoped: its values come from the single property's BienDraft (legacy mono: the draft itself).
  // MB-MULTI-V3-READMODEL-1 — multi : le bien ACTIF explicite (jamais le premier) ; sans lui, fail-closed.
  const source = resolveV3ActiveBienSource(workspace, activePropertyId);
  const stepDraft = source.kind === "unsupported" || source.kind === "selection_required" ? workspace.declarationDraft : source.draft;
  const stepStatus = buildDossierSteps(stepDraft, year).find(step => step.id === "credit")?.status ?? "incomplete";
  const empty = (state: V3FinancingState): V3FinancingDetail => ({
    state, stepStatus, year, loans: [], schedule: { state: "unavailable", reason: "absent" }, documents: [],
  });
  if (source.kind === "unsupported" || source.kind === "selection_required") return empty("unsupported");

  const draft = source.draft;
  const financing = draft?.creditFinancing;
  const loans = financing?.loans ?? [];
  if (!financing || loans.length === 0) return empty(draft?.creditDeclaredNoneAt ? "none" : "missing");

  // Exercise-scoped F011 output: only trusted for the active fiscal year, same guard as the flat read model.
  const output = isAnnualOutputForActiveYear(draft?.financementCharges, year) ? draft?.financementCharges : undefined;
  const flagged = new Set(output?.excludedLoanIds ?? []);

  const loanDetails: V3LoanDetail[] = loans.map((loan, index) => {
    const pret = output?.prets.find(item => item.pretId === loan.id);
    const causes = loanExclusionCauses(financing, loan, year);
    return {
      id: loan.id,
      label: `Prêt ${index + 1}`,
      facts: buildLoanFacts(loan, workspace),
      ...(pret ? {
        exercise: {
          interets: pret.interetsEmpruntExercice, assurance: pret.assuranceEmpruntExercice,
          capitalRembourse: pret.capitalRembourseExercice, capitalRestantDu: pret.capitalRestantDu31_12,
          interetsPreExploitation: pret.interetsPreExploitation, assurancePreExploitation: pret.assurancePreExploitation,
          fraisDossier: pret.fraisDossierDeductibles, garantie: pret.garantieDeductible, ira: pret.iraDeductible,
        },
      } : {}),
      computed: pret !== undefined,
      blockers: causes.map(code => ({ code, label: capitalise(V3_LOAN_EXCLUSION_PHRASES[code]) })),
      blockersUndetermined: causes.length === 0 && !pret && flagged.has(loan.id),
    };
  });

  const documentIds = [...new Set(loans.flatMap(loan =>
    Object.values(loan.provenance ?? {}).flatMap(entry => entry?.documentId ? [entry.documentId] : [])))];
  const hasLoanProvenance = loans.some(loan => Object.keys(loan.provenance ?? {}).length > 0);
  // Per-loan provenance is authoritative; the dossier-level creditDocumentId is only the fallback for older dossiers.
  const usedIds = hasLoanProvenance ? documentIds : draft?.creditDocumentId ? [draft.creditDocumentId] : [];
  const usedDocuments: V3FinancingDocument[] = usedIds.flatMap(id => {
    const doc = workspace.documents.find(item => item.id === id);
    return doc ? [{ id: doc.id, label: doc.fileName, status: processingStatusFor(doc.id, documents) }] : [];
  });

  // The monthly table exists only when a real documentary schedule is usable — through the F011 resolver itself
  // (one loan only, structural checks): never rebuilt from the loan terms.
  let schedule: V3FinancingSchedule = { state: "unavailable", reason: "absent" };
  if ((financing.installments ?? []).length > 0) {
    const resolution = resolveCreditFinancingLoanEcheances(financing, loans[0]!, year);
    if (resolution.status === "exploitable") {
      const rows = resolution.echeances.filter(row => yearOf(row.date) === year).map((row): V3ScheduleRow => ({
        date: row.date, month: monthLabel(row.date), mensualite: row.mensualite, interets: row.interets,
        assurance: row.assurance, capital: row.capital,
      }));
      schedule = rows.length > 0 ? { state: "available", loanId: loans[0]!.id, rows } : { state: "unavailable", reason: "not_usable" };
    } else if (resolution.status === "non_exploitable") {
      schedule = { state: "unavailable", reason: "not_usable" };
    }
  }

  return {
    state: "known", stepStatus, year, loans: loanDetails,
    ...(output ? { totals: buildTotals(output) } : {}),
    schedule, documents: usedDocuments,
  };
}
