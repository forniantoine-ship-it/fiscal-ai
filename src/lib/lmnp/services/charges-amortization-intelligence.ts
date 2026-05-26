import type {
  AmortissementComponent,
  AmortissementFromChargesItem,
  ChargesAmortizationSuggestion,
  ChargesAmortizationSuggestionStatus,
  ChargesCategoryData,
  ChargesExpenseLine,
  ExpenseCategory,
} from "../types";

export type ExpenseWorkType =
  | "operating_charge"
  | "light_maintenance"
  | "durable_improvement"
  | "furniture"
  | "equipment";

export type AmortizationCandidateAssessment = {
  eligible: boolean;
  workType: ExpenseWorkType;
  amortCategory: string;
  durationYears: number;
  natureSummary: string;
};

const ALWAYS_CHARGE_CATEGORIES = new Set<ExpenseCategory>([
  "property_tax",
  "insurance",
  "condo",
  "management_fees",
]);

const OPERATING_CHARGE_LABEL =
  /internet|edf|gdf|engie|cfe|eau|abonnement|comptab|syndic|taxe|fonci|assurance|loyer|gestion|honoraire|frais\s+banc|plateforme/i;

const LIGHT_MAINTENANCE_LABEL =
  /retouche|touche[-\s]?up|petit\s+trav|reparation\s+simple|réparation\s+simple|debouchage|joint|entretien\s+courant|révision\s+annuelle/i;

const DURABLE_IMPROVEMENT_LABEL =
  /réfection|refection|rénovation|renovation|agencement|parquet|carrelage|climatisation|clim\b|fenêtre|fenetre|chaudière|chaudiere|isolation|structure|salle\s+de\s+bain|sanitaire|douche|wc|faïence|faience|menuiserie|électricité\s+générale|plomberie\s+complète/i;

const FURNITURE_LABEL =
  /cuisine\s+équip|cuisine\s+equip|mobilier|canapé|canape|lit\b|armoire|ikea|but\b|meuble|ameublement|électroménager|electromenager|lave[-\s]?linge|four\s+encastr|hotte/i;

const EQUIPMENT_LABEL =
  /climatiseur|pompe\s+à\s+chaleur|vmc|chauffe[-\s]?eau|ballon|alarme\s+installée|domotique/i;

/** Internal contextual signal only — never surfaced as a rule in UX. */
function amountSupportsDurableNature(amount: number, workType: ExpenseWorkType): boolean {
  if (workType === "operating_charge" || workType === "light_maintenance") return false;
  return amount >= 600;
}

export function assessExpenseAmortizationCandidate(
  line: Pick<ChargesExpenseLine, "label" | "amount">,
  expenseCategory: ExpenseCategory,
): AmortizationCandidateAssessment | null {
  if (ALWAYS_CHARGE_CATEGORIES.has(expenseCategory)) {
    return {
      eligible: false,
      workType: "operating_charge",
      amortCategory: "",
      durationYears: 0,
      natureSummary: "Charge d'exploitation récurrente",
    };
  }

  const text = line.label.toLowerCase();

  if (OPERATING_CHARGE_LABEL.test(text)) {
    return {
      eligible: false,
      workType: "operating_charge",
      amortCategory: "",
      durationYears: 0,
      natureSummary: "Charge courante liée au bien",
    };
  }

  if (LIGHT_MAINTENANCE_LABEL.test(text)) {
    return {
      eligible: false,
      workType: "light_maintenance",
      amortCategory: "",
      durationYears: 0,
      natureSummary: "Entretien léger — charge déductible",
    };
  }

  if (FURNITURE_LABEL.test(text)) {
    const isKitchen = /cuisine/i.test(text);
    return {
      eligible: true,
      workType: "furniture",
      amortCategory: isKitchen ? "Cuisine" : "Mobilier",
      durationYears: isKitchen ? 10 : 7,
      natureSummary: isKitchen
        ? "Équipement de cuisine durable"
        : "Mobilier et ameublement durable",
    };
  }

  if (EQUIPMENT_LABEL.test(text)) {
    return {
      eligible: true,
      workType: "equipment",
      amortCategory: "Électroménager",
      durationYears: 7,
      natureSummary: "Équipement durable installé dans le bien",
    };
  }

  if (DURABLE_IMPROVEMENT_LABEL.test(text) || expenseCategory === "works_deductible") {
    const structural = /structure|isolation|façade|facade|toiture|gros/i.test(text);
    return {
      eligible: true,
      workType: "durable_improvement",
      amortCategory: "Travaux",
      durationYears: structural ? 15 : 10,
      natureSummary: structural
        ? "Amélioration durable du bien"
        : "Travaux d'amélioration durables",
    };
  }

  if (expenseCategory === "other" && amountSupportsDurableNature(line.amount, "durable_improvement")) {
    return null;
  }

  return null;
}

export function buildSuggestionFromLine(
  line: ChargesExpenseLine,
  category: ExpenseCategory,
  status: ChargesAmortizationSuggestionStatus = "pending",
): ChargesAmortizationSuggestion | null {
  const assessment = assessExpenseAmortizationCandidate(line, category);
  if (!assessment?.eligible) return null;

  return {
    id: `suggestion-${line.id}`,
    expenseLineId: line.id,
    label: line.label,
    amount: line.amount,
    propertyLabel: line.propertyLabel,
    amortCategory: assessment.amortCategory,
    durationYears: assessment.durationYears,
    natureSummary: assessment.natureSummary,
    workType: assessment.workType,
    status,
    decidedAt: status !== "pending" ? new Date().toISOString() : undefined,
    transferredAt: status === "transferred" ? new Date().toISOString() : undefined,
  };
}

export function buildAmortizationSuggestionsFromCategories(
  categories: ChargesCategoryData[],
  existingDecisions: ChargesAmortizationSuggestion[] = [],
): ChargesAmortizationSuggestion[] {
  const decisionByLine = new Map(
    existingDecisions.map((item) => [item.expenseLineId, item]),
  );

  const detected: ChargesAmortizationSuggestion[] = [];

  for (const cat of categories) {
    for (const expenseLine of cat.lines) {
      const prior = decisionByLine.get(expenseLine.id);
      if (prior) {
        detected.push(prior);
        continue;
      }

      const suggestion = buildSuggestionFromLine(expenseLine, cat.category);
      if (suggestion) detected.push(suggestion);
    }
  }

  return detected;
}

export function pendingAmortizationSuggestions(
  suggestions: ChargesAmortizationSuggestion[],
): ChargesAmortizationSuggestion[] {
  return suggestions.filter((item) => item.status === "pending");
}

export function mergeSuggestionsIntoDecisions(
  current: ChargesAmortizationSuggestion[] | undefined,
  nextDetected: ChargesAmortizationSuggestion[],
): ChargesAmortizationSuggestion[] {
  const byLine = new Map((current ?? []).map((item) => [item.expenseLineId, item]));

  for (const item of nextDetected) {
    const existing = byLine.get(item.expenseLineId);
    if (existing) {
      byLine.set(item.expenseLineId, {
        ...item,
        status: existing.status,
        decidedAt: existing.decidedAt,
        transferredAt: existing.transferredAt,
      });
    } else {
      byLine.set(item.expenseLineId, item);
    }
  }

  return [...byLine.values()];
}

export function suggestionToFromChargesItem(
  suggestion: ChargesAmortizationSuggestion,
  transferredAt: string,
): AmortissementFromChargesItem {
  return {
    id: `from-charges-${suggestion.id}`,
    suggestionId: suggestion.id,
    expenseLineId: suggestion.expenseLineId,
    label: suggestion.label,
    category: suggestion.amortCategory,
    amount: suggestion.amount,
    durationYears: suggestion.durationYears,
    propertyLabel: suggestion.propertyLabel,
    transferredAt,
  };
}

export function suggestionToAmortissementComponent(
  suggestion: ChargesAmortizationSuggestion,
): AmortissementComponent {
  const annualAmortization =
    suggestion.durationYears > 0
      ? Math.round(suggestion.amount / suggestion.durationYears)
      : 0;

  return {
    id: `charges-${suggestion.expenseLineId}`,
    label: suggestion.label,
    category: suggestion.amortCategory,
    ventilationPercent: 0,
    amount: suggestion.amount,
    durationYears: suggestion.durationYears,
    annualAmortization,
    allocation: "immobilisation",
    practicedAmortization: annualAmortization,
    vnc: suggestion.amount,
    remainingYears: suggestion.durationYears,
    source: "charges",
  };
}
