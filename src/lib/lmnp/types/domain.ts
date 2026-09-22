import type { RevenueSupervisionStatus } from "./revenue-supervision";
import type { FieldKey, LedgerDomain } from "./field-keys";
import type { NormalizedValue } from "./values";

export type FiscalRegime = "micro-bic" | "reel";

export type FiscalYearStatus =
  | "draft"
  | "collecting_documents"
  | "analyzing"
  | "pending_validation"
  | "ready_to_close"
  | "closed";

export type DocumentCategory =
  | "bail"
  | "revenus"
  | "charges"
  | "amortissement"
  | "emprunt"
  | "autre";

export type DocumentType =
  | "lease_contract"
  | "rent_receipt"
  | "rent_bank_statement"
  | "bank_statement"
  | "property_tax"
  | "insurance_invoice"
  | "condo_charges"
  | "works_invoice"
  | "furniture_invoice"
  | "loan_interest_certificate"
  | "loan_schedule"
  | "notary_deed"
  | "unknown";

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "analyzed"
  | "failed";

export type ValidationStatus =
  | "pending"
  | "approved"
  | "corrected"
  | "ignored"
  | "needs_document";

export type AlertSeverity = "blocking" | "warning" | "info";

export type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export type AlertCode =
  | "A01_LOW_CONFIDENCE"
  | "A04_REQUIRED_DOCUMENT_MISSING"
  | "A05_LOAN_INTEREST_WITHOUT_CERTIFICATE"
  | "A06_UNRESOLVED_CONFLICT"
  | "A07_PENDING_REQUIRED_VALIDATION"
  | "A08_DOCUMENT_INCONSISTENCY"
  | "A11_REQUIRED_FIELD_EMPTY";

export type ConfidenceBand = "high" | "medium" | "low";

export type ExpenseCategory =
  | "property_tax"
  | "insurance"
  | "condo"
  | "works_deductible"
  | "management_fees"
  | "other";

export type PropertyType =
  | "appartement"
  | "maison"
  | "meuble-tourisme"
  | "chambre-hote"
  | "non-classe";

export interface PropertyBackgroundExtraction {
  acquisitionPrice?: number;
  notaryFees?: number;
  furnitureAmount?: number;
  coproReferences?: string;
  amortizationHints?: string;
  creditHints?: string;
}

export type LoanDeferralType = "total" | "partial" | "franchise" | "none";

export interface LoanProfile {
  id: string;
  bank: string;
  loanType: string;
  borrowedAmount: number;
  rate: number;
  durationMonths: number;
  monthlyPayment: number;
  insurance: number;
  deferralType?: LoanDeferralType;
  deferralMonths?: number;
  fees: number;
  /** One-time guarantee costs (e.g. caution, hypothèque). */
  loanGuaranteeFees?: number;
  /** One-time bank application / dossier fees at loan origination. */
  loanApplicationFees?: number;
  /**
   * Fait canonique tri-état, jamais déduit : ce prêt a-t-il été souscrit
   * pendant l'exercice fiscal courant ? Gate la déductibilité de
   * `loanApplicationFees`/`loanGuaranteeFees`
   * (`compute-financement-exercice.ts` : `anneeSouscription === exerciceFiscal`).
   * `undefined` = non répondu — jamais traité comme "oui" ni "non" (voir
   * `excludedLoanIdsFromFinancing()`). Même champ que
   * `F011LoanDraft.souscritCetExercice` (F-011) — un seul concept, jamais
   * une seconde représentation par canal.
   */
  souscritCetExercice?: boolean;
  startDate: string;
  firstPaymentDate: string;
  remainingCapital: number;
  isWorksLoan?: boolean;
}

export interface LoanInstallment {
  date: string;
  totalPayment: number;
  principal: number;
  interest: number;
  insurance: number;
  fees: number;
  comment?: string;
}

export interface CreditFinancingSummary {
  fiscalYearLabel: string;
  annualInterest: number;
  annualInsurance: number;
  /** @deprecated Ambiguous aggregate — prefer annualInterest + annualInsurance. */
  annualFinancingCharges?: number;
  remainingCapital: number;
}

export interface CreditFinancingData {
  loans: LoanProfile[];
  summary: CreditFinancingSummary;
  installments: LoanInstallment[];
}

export type AmortissementAllocation = "charge-immediate" | "immobilisation" | "non-amortizable";

export interface AmortissementComponent {
  id: string;
  label: string;
  category: string;
  ventilationPercent: number;
  amount: number;
  durationYears: number;
  annualAmortization: number;
  allocation: AmortissementAllocation;
  practicedAmortization?: number;
  vnc?: number;
  remainingYears?: number;
  source?: "continuity" | "travaux" | "mobilier" | "dossier" | "charges";
}

export interface AmortissementVentilationData {
  components: AmortissementComponent[];
  summary: {
    componentCount: number;
    travauxTotal: number;
    mobilierTotal: number;
    averageDurationYears: number;
  };
}

export interface RevenusMonthlyEntry {
  month: string;
  monthKey?: string;
  collectedAmount: number;
  detectedFees?: number;
  events?: RevenueEvent[];
  missing?: boolean;
}

export type RevenueEventCategory =
  | "rent"
  | "platform_payout"
  | "insurance_indemnity"
  | "charges"
  | "fee"
  | "refund"
  | "unknown";

export type RevenueEventRecurrence = "monthly" | "annual" | "one_shot" | null;

export interface RevenueEvent {
  id: string;
  date: string | null;
  amount: number;
  category: RevenueEventCategory;
  sourceDocumentId?: string;
  sourceType?: string;
  label?: string;
  confidence?: number;
  recurrence?: RevenueEventRecurrence;
  mergedFromIds?: string[];
  deduplicated?: boolean;
}

export interface RevenusPropertyData {
  id: string;
  label: string;
  propertyId?: string;
  events: RevenueEvent[];
  annualRevenue: number;
  rentCount: number;
  detectedFees: number;
  months: RevenusMonthlyEntry[];
  hasSecurityDeposit?: boolean;
  incomplete?: boolean;
  missingMonths?: string[];
  deduplicatedCount?: number;
  annualTotalHint?: number | null;
}

export interface RevenusExtractionData {
  properties: RevenusPropertyData[];
  events?: RevenueEvent[];
  summary: {
    totalRevenue: number;
    rentCount: number;
    totalFees: number;
    hasSecurityDeposit: boolean;
    eventCount?: number;
    missingMonthCount?: number;
    deduplicatedCount?: number;
    lowConfidenceCount?: number;
  };
  deduplicationNotes?: string[];
}

export type RevenueMonthlyGridRow = {
  monthKey: string;
  month: string;
  loyers: number;
  autresRevenus: number;
  charges: number;
};

export type RevenueTransactionDirection = "credit" | "debit";

export type RevenueLineKind = "atomic" | "total" | "subtotal" | "balance" | "summary";

export type RevenueRawLineSourceType =
  | "bank_statement"
  | "excel"
  | "rent_receipt"
  | "attestation"
  | "platform_export";

export type RevenueTransactionCategory =
  | "rent"
  | "additional_income"
  | "deposit"
  | "caf_subsidy"
  | "reimbursement"
  | "internal_transfer"
  | "owner_contribution"
  | "owner_transfer"
  | "platform_payout"
  | "insurance_indemnity"
  | "charges"
  | "fee"
  | "unknown";

/** Atomic line extracted from a document — never a document total. */
export interface RevenueRawLine {
  id?: string;
  date?: string | null;
  label?: string;
  amount: number;
  direction: RevenueTransactionDirection;
  sourceDocumentId: string;
  sourceType: RevenueRawLineSourceType | string;
  /** Original upload filename — part of batch identity for deduplication (Cycle 15B/17). */
  sourceFileName?: string;
  confidence: number;
  accountContext?: string;
  counterparty?: string;
  lineKind?: RevenueLineKind;
  explicitlyMarkedAsRent?: boolean;
  /** Column header from a structured table (e.g. "Loyer", "Complément"). */
  sourceColumnHeader?: string;
  structuredTable?: boolean;
  monthLabel?: string;
}

export interface RevenueTransaction {
  id: string;
  date: string | null;
  description: string;
  label?: string;
  amount: number;
  direction: RevenueTransactionDirection;
  category: RevenueTransactionCategory;
  confidence?: number;
  accountContext?: string;
  counterparty?: string;
  clusterId?: string;
  recurrenceScore?: number;
  userValidated?: boolean;
  lineKind?: RevenueLineKind;
  explicitlyMarkedAsRent?: boolean;
  sourceDocumentId?: string;
  sourceType?: string;
  deduplicated?: boolean;
  mergedFromIds?: string[];
  /** Mapped deterministically from a structured table column header. */
  structuredMapping?: boolean;
  /** Month row label from structured tables (e.g. "Avril") when date is missing. */
  monthLabel?: string;
}

export type RevenuePropertySession = {
  id: string;
  label: string;
  propertyId?: string;
  rows: RevenueMonthlyGridRow[];
  transactions?: RevenueTransaction[];
  lowConfidenceTransactions?: RevenueTransaction[];
  isolatedTransactions?: RevenueTransaction[];
  /** When true, AI aggregation must not overwrite user-edited grid rows. */
  gridUserEdited?: boolean;
  /** Per-document content fingerprints for cross-upload deduplication (Cycle 15B/17). */
  mergedBatches?: Array<{ documentId: string; hash: string }>;
};

export type RevenueGptSession = {
  properties: RevenuePropertySession[];
  mode?: "upload" | "manual";
  ui?: {
    expandedPropertyIds?: string[];
  };
  meta?: {
    deduplicatedCount?: number;
    hasSecurityDeposit?: boolean;
    lowConfidenceCount?: number;
    transactionCount?: number;
    gridSource?: "ocr_lines" | "mock_lines" | "persisted_session" | "user_manual";
    extractionSupervision?: RevenueSupervisionStatus;
    extractionPipelineId?: string;
  };
  /** Legacy raw events — not used for grid rendering. */
  events?: RevenueEvent[];
};

export type ChargesExpenseSource = "upload" | "credit" | "revenus" | "amortissement";

export interface ChargesExpenseLine {
  id: string;
  label: string;
  amount: number;
  vatAmount?: number;
  date?: string;
  propertyLabel?: string;
  recoverable: boolean;
  recurring?: boolean;
  source?: ChargesExpenseSource;
}

export type ChargesAmortizationSuggestionStatus = "pending" | "transferred" | "kept_as_charge";

export type ChargesAmortizationWorkType =
  | "operating_charge"
  | "light_maintenance"
  | "durable_improvement"
  | "furniture"
  | "equipment";

export interface ChargesAmortizationSuggestion {
  id: string;
  expenseLineId: string;
  label: string;
  amount: number;
  propertyLabel?: string;
  amortCategory: string;
  durationYears: number;
  natureSummary: string;
  workType: ChargesAmortizationWorkType;
  status: ChargesAmortizationSuggestionStatus;
  decidedAt?: string;
  transferredAt?: string;
}

export interface AmortissementFromChargesItem {
  id: string;
  suggestionId: string;
  expenseLineId: string;
  label: string;
  category: string;
  amount: number;
  durationYears: number;
  propertyLabel?: string;
  transferredAt: string;
}

export interface ChargesCategoryData {
  id: string;
  category: ExpenseCategory;
  label: string;
  annualTotal: number;
  propertyId?: string;
  propertyLabel?: string;
  lines: ChargesExpenseLine[];
  recurring?: boolean;
}

export interface ChargesExtractionData {
  categories: ChargesCategoryData[];
  recoveredFromOtherSteps: number;
  amortizationSuggestions: ChargesAmortizationSuggestion[];
  summary: {
    totalCharges: number;
    categoryCount: number;
    recoverableTotal: number;
    nonRecoverableTotal: number;
  };
}

export interface Property {
  id: string;
  label: string;
  address: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  propertyType?: PropertyType;
  coproperty?: boolean;
  surface?: number;
  acquisitionDate?: string;
  status?: string;
  notaryDocumentId?: string;
  /**
   * P3-SOCLE-CYCLE-FISCAL — P0-1 — base stable F-010, extraite une fois de
   * `LogementAmortissementOutput` pour survivre au-delà d'un seul exercice
   * (`domain.ts`/`fiscal-year-cycle.ts`). `undefined` tant qu'aucun exercice
   * n'a encore produit de plan d'amortissement pour ce bien.
   */
  amortissementBase?: import("./dossier").PropertyAmortissementBase;
}

export type JourneyStepId =
  | "documents"
  | "analysis"
  | "validation"
  | "dossier"
  | "generate"
  | "payment"
  | "transmission";

export type JourneyStepStatus = "completed" | "active" | "locked";

export interface JourneyStepView {
  id: JourneyStepId;
  title: string;
  description: string;
  href: string;
  cta: string;
  status: JourneyStepStatus;
  stepNumber: number;
}

export interface LmnpJourney {
  steps: JourneyStepView[];
  currentStepId: JourneyStepId;
  currentStepIndex: number;
  totalSteps: number;
  percentComplete: number;
  isComplete: boolean;
}

export type AssistantInsightTone = "ai" | "success" | "pending";

export interface AssistantInsight {
  id: string;
  tone: AssistantInsightTone;
  text: string;
}

export interface AssistantBrief {
  headline: string;
  insights: AssistantInsight[];
}

export interface FiscalYear {
  id: string;
  year: number;
  status: FiscalYearStatus;
  regime: FiscalRegime;
  regimeConfirmedAt?: string;
  declarationGeneratedAt?: string;
  paidAt?: string;
  transmittedAt?: string;
  propertyIds: string[];
  createdAt: string;
  updatedAt: string;
  /**
   * P3-SOCLE-CYCLE-FISCAL — P0-1 — identité du Dossier auquel appartient cet
   * exercice. `undefined` pour un `FiscalYear` créé avant ce chantier, tant
   * que la migration (`fiscal-year-cycle.ts`) ne l'a pas rattaché.
   */
  dossierId?: string;
  /**
   * Exercice immédiatement précédent du MÊME dossier — jamais présumé,
   * toujours revérifié à la lecture (dossierId, adjacence stricte, statut
   * clos, closure exploitable) par `resolveStocksOuverture()`. `null` pour
   * le premier exercice connu d'un dossier (jamais fabriqué).
   */
  previousFiscalYearId?: string | null;
  /**
   * Historique append-only des clôtures de CET exercice — jamais un champ
   * `closure` unique remplacé en place (D1 : correction autorisée mais
   * versionnée, aucun snapshot déjà consommé par N+1 ne doit être réécrit).
   * Toujours utiliser `latestClosure()`/`appendClosure()`
   * (`fiscal-year-cycle.ts`), jamais une écriture directe de ce tableau.
   */
  closures?: import("./dossier").FiscalYearClosure[];
  /**
   * P1-1 — stocks d'ouverture résolus depuis la clôture de l'exercice
   * précédent (`resolveStocksOuverture()`), persistés une seule fois au
   * moment de la création de CET exercice — jamais recalculés ensuite.
   * Volontairement distinct de `declarationDraft.fiscalResult` (miroir de la
   * dernière génération du MÊME exercice, jamais un vecteur de continuité
   * inter-exercices — cf. `run-declaration-generation.ts`). `undefined` si
   * aucune continuité n'était disponible à la création (premier exercice,
   * dossier différent, exercice précédent non clos, etc.) — jamais une
   * valeur inventée.
   */
  stocksOuverture?: {
    sourceClosureId: string;
    stocks: FiscalEngineOutput["stocks"];
  };
  /**
   * Lot 5 — ouvertures comptables immobilisations (brut / cumul clôture N),
   * résolues depuis `FiscalYearClosure.immobilisationsComptables` à la
   * création de N+1. Distinct de `stocksOuverture` (stock fiscal art. 39 C).
   */
  immobilisationsOuverture?: {
    sourceClosureId: string;
    brut: number;
    amortissementsCumules: number;
    vnc: number;
  };
  /**
   * G1-P1 — miroir exact de `stocksOuverture` ci-dessus, pour la continuité
   * patrimoniale (compte exploitant / RAN) plutôt que les stocks fiscaux.
   * Résolu par `resolvePatrimoineOuvertureNPlusUn()`, persisté une seule fois
   * à la création de CET exercice — jamais recalculé ensuite, jamais injecté
   * dans `declarationDraft.bilanPatrimonial` (qui reste vierge à chaque
   * nouvel exercice, cf. `createNextDeclarationDraft()`). `undefined` si
   * aucune continuité n'était disponible (premier exercice, dossier
   * différent, exercice précédent non clos, intake patrimonial de N jamais
   * renseigné, etc.) — jamais une valeur inventée.
   */
  patrimoineOuverture?: {
    sourceClosureId: string;
    ouvertureCompteExploitant: number;
    ran: { situation: import("@/runtime/capabilities/bilan/types").RanSituation; valeur?: number };
  };
  /**
   * P0 launch safety — raison exacte (`resolveStocksOuverture()`) pour
   * laquelle `stocksOuverture` n'a pas pu être résolu à la création de CET
   * exercice. Jusqu'ici jetée : F-006 traitait alors l'absence comme « aucun
   * déficit, aucun amortissement reporté ». Jamais une valeur fiscale ;
   * lue uniquement par `resolvePriorHistoryEligibility()`.
   */
  stocksOuvertureUnavailableReason?: string;
  /**
   * P0 launch safety — réponse explicite du client sur l'antériorité LMNP au
   * réel POUR CET exercice, persistée avec l'exercice (jamais un état React
   * seul). Jamais une preuve de continuité native : voir
   * `resolvePriorHistoryEligibility()`.
   */
  priorHistoryDeclaration?: {
    status: PriorHistoryDeclarationStatus;
    declaredAt: string;
  };
  /**
   * Lot 5.1 — réponses d'exception reprise externe (persistées pour reprise
   * navigateur). Pas de candidates / 4E / OCR intermédiaires.
   */
  externalTakeoverReviewAnswers?: import("../services/takeover/review-answers").TakeoverReviewAnswers;
  /**
   * Lot 5.1 — Opening externe finale validée uniquement.
   * Écriture exclusive via `persistExternalTakeoverOpening` (garde 4F.2).
   */
  externalTakeoverOpening?: {
    sourceRef: string;
    opening: import("../services/fiscal-year-opening/types").FiscalYearOpening;
  };
}

/**
 * P0 launch safety — situation déclarée par le client :
 *  - FIRST_REAL_YEAR   : première déclaration LMNP au régime réel ;
 *  - FISCAL_AI_PREVIOUS: exercice précédent déjà réalisé avec Fiscal AI ;
 *  - EXTERNAL_HISTORY  : comptabilité réelle antérieure hors Fiscal AI.
 */
export type PriorHistoryDeclarationStatus =
  | "FIRST_REAL_YEAR"
  | "FISCAL_AI_PREVIOUS"
  | "EXTERNAL_HISTORY";

export interface CoOwner {
  id: string;
  name: string;
  percentage: number;
}

export type LmnpActivityType = "LMNP" | "LMP";

/** Sortie durable de F-010 (Assistant Logement) — consommée par F-006/F-012. */
export interface LogementAmortissementOutput {
  /**
   * Lot 4 — millésime de l'exercice pour lequel ce plan a été confirmé.
   * Optionnel pour compatibilité des dossiers antérieurs ; absence = impossible
   * de prouver l'appartenance à l'exercice actif (year-safety fail-closed).
   */
  exerciceFiscal?: number;
  prixRevient: number;
  /**
   * JUG-001 : frais d'acquisition en déduction immédiate (TRF-0001) — 0 si
   * intégrés au prix de revient. Optionnel pour ne pas casser les fixtures/
   * dossiers antérieurs à ce champ ; F-006 le traite comme 0 si absent.
   */
  fraisEnCharges?: number;
  valeurTerrain: number;
  valeurBati: number;
  baseAmortissableBati: number;
  montantMobilier: number;
  dotationAnnuelle: number;
  dureeMoyenneAnnees: number;
  prorataRatio: number;
  plan: import("@/runtime").AmortissementPlan;
  /** Provenance de chaque Field (extrait / estimé / saisi / choix de Jugement). */
  fieldSources: Partial<Record<string, import("@/runtime").FieldSource>>;
  computedAt: string;
}

/** Sortie durable de F-011 (Assistant Financement) — consommée par F-006/F-012. */
export interface FinancementChargesOutput {
  exerciceFiscal: number;
  totalInteretsEmprunt: number;
  totalInteretsPreExploitation: number;
  totalAssurance: number;
  /**
   * P0-A — transport pur depuis ChargesFinancementExercice.totalAssurancePreExploitation
   * (F-011), jamais recalculé ici. Optionnel, symétrique à totalInteretsPreExploitation
   * qui reste requis pour compatibilité ascendante avec les dossiers déjà persistés.
   */
  totalAssurancePreExploitation?: number;
  totalCapitalRembourse: number;
  totalChargesFinancementExercice: number;
  prets: import("@/runtime").PretFinancementExercice[];
  fieldSources: Partial<Record<string, import("@/runtime").FieldSource>>;
  computedAt: string;
  /**
   * NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — identifiants des prêts
   * confirmés par l'utilisateur mais exclus du calcul faute de date de
   * première mensualité connue (`mapCreditFinancingToFinancementCharges`).
   * Sans ce champ, un dossier historique confirmé avant le correctif UI
   * n'a aucun moyen de rester visible/actionnable : l'exclusion disparaissait
   * silencieusement dès la confirmation Tunnel A. Optionnel pour rester
   * compatible avec les dossiers déjà persistés (absence = aucune exclusion
   * connue, jamais une exclusion inventée).
   */
  excludedLoanIds?: string[];
}

/** Sortie durable de F-012 (Assistant Charges) — consommée par F-006/F-010. */
export interface ChargesAssistantOutput {
  exerciceFiscal: number;
  totalDeductible: number;
  totalNonDeductible: number;
  totalAmortissable: number;
  totalPreExploitation: number;
  parCategorie: Partial<Record<string, number>>;
  /**
   * A1 — ventilations par catégorie de `totalPreExploitation` / `totalNonDeductible`
   * (F-012, transport pur jusqu'à F-006 puis la RFS). Optionnelles : absentes des
   * dossiers persistés avant A1 — jamais reconstituées, les cases 242/244 de la
   * 2033-B restent alors non alimentées tant que F-012 n'a pas été reconfirmé.
   */
  parCategoriePreExploitation?: Partial<Record<string, number>>;
  parCategorieNonDeductible?: Partial<Record<string, number>>;
  /**
   * Recouvrement F-011 / F-012 de l'assurance emprunteur (F-012, voir assurance-recouvrement.ts) : `reference` = assurance
   * de l'année établie par F-011 AU MOMENT du calcul ; `recouvert` neutralisé dans F-012 ; `reliquat` traité normalement.
   * Persisté pour DÉTECTER une péremption (F-011 modifié depuis) — jamais pour recalculer.
   */
  recouvrementAssuranceF011?: {
    reference: number;
    periodeCompatible: boolean;
    recouvert: number;
    reliquat: number;
  };
  /**
   * Recouvrement F-011 / F-012 des frais de dossier (enveloppe séparée) — même contrat de péremption.
   */
  recouvrementFraisDossierF011?: {
    reference: number;
    periodeCompatible: boolean;
    recouvert: number;
    reliquat: number;
  };
  composantsNouveaux: import("@/runtime").ComposantNouveau[];
  fieldSources: Partial<Record<string, import("@/runtime").FieldSource>>;
  computedAt: string;
}

/** Sortie durable de F-014 (Assistant Amortissements) — consommée par F-006. */
export interface AmortissementAssistantOutput {
  exerciceFiscal: number;
  totalDotations: number;
  status: "validated" | "contested";
  planVersion: string;
  profil: "PROF-001" | "PROF-002" | "PROF-003";
  validatedAt: string;
  anneeValidationInitiale?: number;
}

/** Sortie durable de F-007 (Liasse Engine) — représentation documentaire partielle. */
export interface LiasseEngineOutput {
  exercice: number;
  form2031Generated: boolean;
  caseCount: number;
  cases: import("@/runtime/capabilities/f007/types").CerfaCase[];
  formulairesManquants: string[];
  trace: {
    ksArtifacts: string[];
    generatedAt: string;
    sourceFiscalResultAt: string;
  };
  generatedAt: string;
}

/** Sortie durable de F-006 (Fiscal Engine) — consommée par F-007. */
export interface FiscalEngineOutput {
  exercice: number;
  resultatFiscal: number;
  resultatAvantAmort: number;
  totalRecettes: number;
  totalCharges: number;
  /**
   * P0-3b — transport pur de `FiscalResult.charges.chargesPreExploitation`
   * (A+B+C, TRF-0025/TRF-0030) jusqu'à l'écran de validation, pour que
   * `buildValidationFiscalDisplay()` puisse présenter une formation du
   * résultat honnête (Recettes − charges exercice − charges pré-exploitation
   * = résultat avant amortissement). Optionnel — comme les champs
   * équivalents déjà introduits sur `FiscalResult`/`FinancementFiscalInput`
   * — pour ne pas casser les constructions manuelles historiques de ce type
   * (ex. `F006FiscalEnginePanel.tsx`).
   */
  chargesPreExploitation?: number;
  amortDeduct: number;
  /** STOCK FINAL d'amortissements non déduits — ≠ mouvement annuel. */
  amortReporte: number;
  /**
   * MOUVEMENT ANNUEL : amortissements N comptabilisés mais non déduits N
   * (`round2(amortCalcule − amortDeduct)`). Optionnel pour les drafts
   * antérieurs à G10 ; source de la case 2033-B 318 lorsqu'il est présent.
   */
  amortNonDeduitExercice?: number;
  deficitNouveau: number;
  stocks: {
    deficits: { millesime: number; montant: number }[];
    amortissementsReportes: number;
    deficitsExpires?: { millesime: number; montant: number }[];
  };
  trace: {
    ksArtifacts: string[];
    computedAt: string;
    journal: { trf: string; label: string; value: number | string }[];
  };
  computedAt: string;
}

/** Sortie durable de F-013 (Assistant Revenus) — consommée par F-006. */
export interface RevenusAssistantOutput {
  exerciceFiscal: number;
  totalRecettes: number;
  loyersEncaisses: number;
  indemnitesAssurance: number;
  recettesPlateforme: number;
  ajustementsJanDec: number;
  moisLocationEffectifs: number;
  revenuTheorique?: number;
  fieldSources: Partial<Record<string, import("@/runtime").FieldSource>>;
  computedAt: string;
  /**
   * NEXT-1 (REV-P0-03) — anomalies F-013 (TRF-REV-01/02) transportées jusqu'à
   * la persistence : sans ce champ, une anomalie `error`/`fatal` calculée par
   * `computeRecettesExercice` disparaissait avant `validateFiscalInputs`
   * (F-006), qui ne pouvait donc jamais la bloquer. Champ optionnel pour
   * rester compatible avec les états déjà persistés avant ce correctif
   * (absence = aucune anomalie connue, jamais une anomalie inventée).
   */
  anomalies?: import("@/runtime").Anomaly[];
}

/**
 * P0 — ENT-008, entité thin et stable. Aujourd'hui une Declaration par
 * FiscalYear (mono-exercice) ; ce n'est pas une contrainte irréversible au-delà
 * de ce palier — juste le modèle opérationnel actuel.
 */
export interface Declaration {
  id: string;
  fiscalYearId: string;
  currentVersionId?: string;
  createdAt: string;
}

/**
 * P0 — snapshot immuable d'une génération persistée (ENT-008 Level 2).
 * Append-only : une nouvelle génération ajoute une version, n'en réécrit jamais
 * une existante. Les 4 artefacts doivent provenir d'un seul et même appel à
 * runDeclarationGeneration() — jamais de fiscalResultFromDraft() (chemin
 * secondaire F-007, structurellement incomplet) comme source du snapshot.
 */
export interface DeclarationVersion {
  readonly id: string;
  readonly declarationId: string;
  readonly versionNumber: number;
  readonly generatedAt: string;
  readonly fiscalResult: FiscalEngineOutput;
  readonly liasseResult: LiasseEngineOutput;
  readonly rfs: import("@/runtime/capabilities/rfs/types").FiscalRepresentation;
  readonly liasseRfs: import("@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs").LiasseFromRfs;
}

export interface DeclarationDraft {
  completedSteps: string[];
  documentStepsCompleted?: string[];
  journeyStartedAt?: string;
  siren?: string;
  siret?: string;
  exploitantFirstName?: string;
  exploitantLastName?: string;
  exploitantEmail?: string;
  exploitantTelephone?: string;
  personalAddress?: string;
  personalCity?: string;
  personalPostalCode?: string;
  /** @deprecated Use personalAddress — kept for hydration of older workspaces */
  entrepreneurAddress?: string;
  entrepreneurCity?: string;
  entrepreneurPostalCode?: string;
  establishmentAddress?: string;
  establishmentCity?: string;
  establishmentPostalCode?: string;
  activityStartDate?: string;
  /** Date de première mise en location effective — F-009. */
  dateMiseEnService?: string;
  activityType?: LmnpActivityType;
  indivision?: boolean;
  coOwners?: CoOwner[];
  inpiDocumentId?: string;
  /** Set when the INPI document's status transitions to "processing" — staleness anchor for resolveActiviteDocumentState. */
  inpiExtractionStartedAt?: string;
  /** Set after first GPT prefill — blocks automatic re-extraction on hydration. */
  inpiGptPrefillAppliedAt?: string;
  /** Per-field locks: user edits always win over GPT re-prefill. */
  activiteUserValidatedFields?: Partial<Record<string, boolean>>;
  /** Per-field INPI provenance — EXTRACTED / MISSING / PROPOSED + origin. */
  activiteFieldProvenance?: Partial<
    Record<string, import("@/lib/lmnp/services/activite-field-provenance").ActiviteFieldProvenance>
  >;
  /** Inter-document merge store — snapshots, ledgers, history. */
  activiteFieldStore?: import("@/lib/lmnp/services/activite-field-store").ActiviteFieldStore;
  /**
   * Cross-tunnel governed field store — canonical metadata per extracted field.
   * @see GovernedFieldMetadata in @/lib/documents/types/governed-field
   */
  governedFields?: Record<string, import("@/lib/documents/types/governed-field").GovernedFieldMetadata>;
  /**
   * F009 session/resume state only — step, path, collected values, confirmations,
   * documentId of an in-flight analysis. NOT a second source of truth for business
   * data (siret/dates above remain authoritative once the assistant completes).
   */
  activiteAssistantState?: import("@/runtime/assistants/f009-activite/types").F009PersistedState;
  /**
   * F010 session/resume state — step, collected values, review, pending extraction.
   * NOT authoritative for business data once the assistant completes (logementAmortissement).
   */
  logementAssistantState?: import("@/runtime/assistants/f010-logement/types").F010PersistedState;
  /**
   * F011 session/resume state — step, loans, pending extraction, GO_BACK history.
   * NOT authoritative for business data once the assistant completes (financementCharges).
   */
  financementAssistantState?: import("@/runtime/assistants/f011-financement/types").F011PersistedState;
  /**
   * F012 session/resume state — step, category progress, collected charges, document review.
   * NOT authoritative for business data once the assistant completes (chargesAssistant).
   */
  chargesAssistantState?: import("@/runtime/assistants/f012-charges/types").F012PersistedState;
  /**
   * Compagnon INPI — progression du client dans l'accompagnement CFA
   * (étape, historique, confirmations/conflits locaux au Compagnon).
   * NOT une donnée métier : distinct de `Dossier.inpiStatus` (situation INPI
   * déclarée, Dossier-level, cf. ADR-010) et de toute valeur déjà présente
   * ailleurs sur `DeclarationDraft` (siret, activityStartDate, adresses...).
   * @see InpiCompanionPersistedState
   */
  inpiCompanionState?: import("@/runtime/assistants/inpi-companion/types").InpiCompanionPersistedState;
  inpiConfirmedAt?: string;
  logementDocumentId?: string;
  logementConfirmedAt?: string;
  /** In-progress logement form — restored passively on tunnel navigation. */
  logementWorkspaceForm?: import("@/lib/lmnp/services/logement-profile").LogementFormValues;
  propertyBackgroundExtraction?: PropertyBackgroundExtraction;
  /** Plan d'amortissement produit par l'Assistant Logement (F-010). */
  logementAmortissement?: LogementAmortissementOutput;
  /** Charges de financement produites par l'Assistant Financement (F-011). */
  financementCharges?: FinancementChargesOutput;
  /** Charges d'exploitation produites par l'Assistant Charges (F-012). */
  chargesAssistant?: ChargesAssistantOutput;
  /** Recettes locatives produites par l'Assistant Revenus (F-013). */
  revenusAssistant?: RevenusAssistantOutput;
  /** Validation du plan d'amortissement produite par l'Assistant Amortissements (F-014). */
  amortissementAssistant?: AmortissementAssistantOutput;
  /** Résultat fiscal produit par le Fiscal Engine (F-006). */
  fiscalResult?: FiscalEngineOutput;
  fiscalResultConfirmedAt?: string;
  /** Représentation liasse produite par le Liasse Engine (F-007). */
  liasseResult?: LiasseEngineOutput;
  liasseGeneratedAt?: string;
  /** Représentation fiscale structurée (RFS) — alimente exports liasse et synthèse client. */
  rfs?: import("@/runtime/capabilities/rfs/types").FiscalRepresentation;
  /**
   * Formulaires complémentaires (2031-bis, 2033-A/B/C) assemblés depuis la RFS —
   * même calcul que `rfs` ci-dessus, aucun second appel à produceFiscalResult().
   * Champ additif : `liasseResult` (F-007, 2031-SD) reste la source du 2031-SD.
   */
  liasseRfs?: import("@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs").LiasseFromRfs;
  /**
   * G1-P0 — saisie patrimoniale collectée par l'intake minimal (case 2033-A
   * Amortissements-Provisions/tiers/compte exploitant/RAN/subventions, voir
   * audit P1-PDF-02-G/G1). Absent tant que l'utilisateur n'a pas répondu au
   * routage NATIF/REPRISE (`buildBilanPatrimonial()`,
   * `services/declaration/patrimonial-intake.ts`) — jamais un objet partiel
   * fabriqué par défaut. Transmis tel quel en 4e argument de
   * `runDeclarationGeneration()` ET de l'aperçu du gate
   * (`declaration-generation-gate.ts`), jamais reconstruit séparément.
   * Ne couvre PAS la continuité N→N+1 (G1-P1, hors périmètre) : l'ouverture
   * du compte exploitant et le RAN d'une reprise restent une saisie manuelle
   * de cet écran, jamais dérivés d'une `FiscalYearClosure`.
   */
  bilanPatrimonial?: import("@/runtime/capabilities/bilan/types").BilanInputs;
  /**
   * Dispense de bilan 2033-A (CGI, art. 302 septies A bis, VI) — saisie
   * brute uniquement : `caReferenceN1Declaree` (chiffre d'affaires HT de
   * l'année civile précédente, saisi UNIQUEMENT quand `dateMiseEnService` ne
   * permet pas de prouver que l'activité n'existait pas en N-1 — voir
   * `resolveCaReferenceN1Fact()`) et `decision` (choix du client entre
   * FILE_2033A et USE_DISPENSE, jamais un choix fait par le produit à sa
   * place). L'éligibilité elle-même n'est jamais persistée ici — toujours
   * recalculée par `resolveDispense2033AEligibilite()` à partir de ce fait et
   * de l'exercice courant (`dispense-2033a.ts`), jamais une valeur figée qui
   * survivrait à un changement de triennium. Transmis tel quel en 5e
   * argument de `runDeclarationGeneration()` ET de l'aperçu du gate
   * (`declaration-generation-gate.ts`), même doctrine que `bilanPatrimonial`
   * ci-dessus.
   */
  dispense2033A?: {
    caReferenceN1Declaree?: number;
    decision?: import("@/runtime/capabilities/rfs/dispense-2033a").Dispense2033ADecision;
  };
  /**
   * P0 — Declaration (thin, stable) : une par FiscalYear aujourd'hui (mono-exercice).
   * Coexiste avec fiscalResult/liasseResult/rfs/liasseRfs ci-dessus, qui restent
   * le miroir de la version courante pour compatibilité — l'historique fait foi.
   */
  declaration?: Declaration;
  /** P0 — historique append-only des générations persistées. Jamais réécrit ni tronqué. */
  declarationVersions?: DeclarationVersion[];
  creditDocumentId?: string;
  creditConfirmedAt?: string;
  creditDeclaredNoneAt?: string;
  creditFinancing?: CreditFinancingData;
  /** In-progress credit form — restored passively on tunnel navigation. */
  creditWorkspaceForm?: import("@/lib/lmnp/services/credit-profile").CreditFormValues;
  /** Persisted GPT extraction session (amortization + loan offer) — no rerun on navigation. */
  creditGptSession?: import("@/lib/lmnp/services/credit-gpt-ui-prefill").CreditExtractionSession;
  /** Fields manually edited by the user — preserved over GPT re-hydration. */
  creditUserValidatedFields?: Partial<Record<string, boolean>>;
  amortissementExistingActivity?: boolean;
  amortissementContinuityDocumentIds?: string[];
  amortissementTravauxDocumentIds?: string[];
  amortissementMobilierDocumentIds?: string[];
  amortissementConfirmedAt?: string;
  /**
   * Snapshot of amortissement-category document ids present when the
   * ventilation was confirmed — same pattern as chargesDocumentIds /
   * creditDocumentId. Coarse (confirmation-level, not per-component): lets
   * REMOVE_DOCUMENT invalidate amortissementConfirmedAt when a contributor
   * is deleted, without a document↔component link that doesn't exist today.
   */
  amortissementDocumentIds?: string[];
  amortissementVentilation?: AmortissementVentilationData;
  /** Real extraction results persisted after runBulkDocumentExtraction — replaces mock invoices on remount. */
  amortissementExtractedInvoices?: import("@/lib/lmnp/services/amortissement-profile").ExtractedInvoice[];
  revenusDocumentIds?: string[];
  revenusConfirmedAt?: string;
  revenusExtraction?: RevenusExtractionData;
  revenueGptSession?: RevenueGptSession;
  chargesDocumentIds?: string[];
  chargesConfirmedAt?: string;
  /** User opted in to import charges from Crédit / Revenus / Amortissements. */
  chargesCrossStepRecoveryEnabled?: boolean;
  chargesExtraction?: ChargesExtractionData;
  chargesAmortizationDecisions?: ChargesAmortizationSuggestion[];
  amortissementFromCharges?: AmortissementFromChargesItem[];
  usagesPersonnelsConfirmed?: boolean;
  baremeCarburantConfirmed?: boolean;
  regimeSocial?: string;
  tvaRegime?: string;
  signedAt?: string;
}

export interface DocumentOcrMeta {
  documentTypeConfidence: number;
  amountPeriod: "monthly" | "annual" | "one_time" | "unknown";
  amountKind: "ttc" | "ht" | "unknown";
  warnings: string[];
  inconsistencies: { code: string; severity: "warning" | "info"; message: string }[];
  fieldsDetected: number;
  fieldsRejected: number;
  trustedForAutoSync: boolean;
  usedHeuristicFallback: boolean;
}

export interface LmnpDocument {
  id: string;
  fiscalYearId: string;
  /**
   * Calendar fiscal year of origin (Lot 2). Written at upload; survives
   * cross-device. Distinct from `fiscalYearId` (UUID of the FiscalYear record).
   */
  fiscalYear?: number;
  /**
   * annual_evidence = exercice-scoped justificatif;
   * durable_reference = historical reuse of the same Storage blob.
   */
  documentRole?: "annual_evidence" | "durable_reference";
  propertyId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: DocumentCategory;
  documentType: DocumentType;
  status: DocumentStatus;
  uploadedAt: string;
  /** Supabase Storage path when the document was uploaded remotely. */
  storagePath?: string;
  /** True when restored from Supabase without a local IndexedDB blob. */
  remoteRestored?: boolean;
  /**
   * True when this document has real server-side artifacts (Storage object,
   * extracted_document_data rows) that a local-only removal would silently
   * leave behind. Set from UPLOAD_DOCUMENTS' isSupabaseDocumentId (proof the
   * id is a real documents.id, not just "a documentId was provided" — a
   * producer may legitimately pass a locally generated id it needs
   * synchronously with no Supabase artifact behind it at all), or explicitly
   * by reconciliation when a document is rebuilt from a confirmed Supabase
   * row. Never inferred from filename or other heuristics.
   */
  hasSupabaseArtifacts?: boolean;
  ocrMeta?: DocumentOcrMeta;
  /**
   * Full text corpus captured at analysis time (embedded PDF + OCR fields).
   * Used by deterministic charge parsers (insurance / copro) at extraction rebuild.
   */
  chargeParserCorpus?: string;
}

export type OcrFieldKey =
  | "totalAmount"
  | "vatAmount"
  | "supplierName"
  | "invoiceDate"
  | "address";

export interface OcrFieldRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Extraction {
  id: string;
  documentId: string;
  fiscalYearId: string;
  fieldKey: FieldKey;
  /** Override label shown in ValidationItem (e.g. TVA, date). */
  displayLabel?: string;
  rawValue: string;
  normalizedValue: NormalizedValue;
  confidence: number;
  validationItemId?: string;
  status: "pending_validation" | "linked" | "superseded" | "discarded";
  /** Source OCR field for preview highlighting. */
  ocrFieldKey?: OcrFieldKey;
  region?: OcrFieldRegion;
  warnings?: string[];
}

export interface ValidationItem {
  id: string;
  fiscalYearId: string;
  propertyId?: string;
  fieldKey: FieldKey;
  label: string;
  proposedValue: NormalizedValue;
  finalValue?: NormalizedValue;
  status: ValidationStatus;
  isRequired: boolean;
  extractionIds: string[];
  documentId?: string;
  documentFileName?: string;
  confidence: number;
  ledgerEntryId?: string;
  reviewedAt?: string;
  correctionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type LedgerOrigin =
  | "ai_validated"
  | "ai_auto_synced"
  | "ai_extracted"
  | "manual_edit"
  | "manual";

export interface LedgerEntry {
  id: string;
  fiscalYearId: string;
  propertyId?: string;
  domain: LedgerDomain;
  fieldKey: FieldKey;
  value: NormalizedValue;
  expenseCategory?: ExpenseCategory;
  validationItemId: string;
  sourceDocumentIds: string[];
  sourceDocumentType?: DocumentType;
  origin: LedgerOrigin;
  status: "active" | "voided";
  version: number;
  label?: string;
  editNote?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Alert {
  id: string;
  fiscalYearId: string;
  code: AlertCode;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  fieldKey?: FieldKey;
  documentId?: string;
  validationItemId?: string;
  primaryActionLabel?: string;
  primaryActionHref?: string;
}

export interface UserConfidenceScore {
  score: number;
  level: "starting" | "building" | "advancing" | "almost_ready" | "ready";
  pillars: {
    documents: number;
    validations: number;
    coherence: number;
    tabs: number;
  };
  nextActionLabel: string;
  nextActionHref: string;
}

export interface NextAction {
  title: string;
  description: string;
  href: string;
  cta: string;
  estimatedMinutes?: number;
}

export interface LmnpWorkspace {
  fiscalYear: FiscalYear;
  properties: Property[];
  documents: LmnpDocument[];
  extractions: Extraction[];
  validationItems: ValidationItem[];
  ledgerEntries: LedgerEntry[];
  alerts: Alert[];
  confidence: UserConfidenceScore;
  journey: LmnpJourney;
  assistant: AssistantBrief;
  nextAction: NextAction;
  pendingValidationCount: number;
  blockingAlertCount: number;
  canClose: boolean;
  openAlertCount: number;
  warningAlertCount: number;
  validatedFieldCount: number;
  autoSyncedFieldCount: number;
  manuallyValidatedFieldCount: number;
  fullyValidatedDocumentCount: number;
  analyzedDocumentCount: number;
}
