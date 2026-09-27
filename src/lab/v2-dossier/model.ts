export type Scenario = "first" | "takeover" | "inpi";
export type View = "dossier" | "documents" | "declaration";
export type EntryStage = "question" | "unsure" | "confirm" | "organize" | "invite" | "done";
export type ProcessingStep = 0 | 1 | 2 | 3 | 4;
export type Resolution = "date" | "conflict" | "tax";
export type DomainId = "activity" | "home" | "loan" | "income" | "expenses" | "history";

export type DemoDocument = {
  id: string;
  name: string;
  category: string;
  domain: DomainId;
  usedIn?: DomainId[];
  found: string[];
  contribution: string[];
  source: string;
};

export type DemoState = {
  scenario: Scenario;
  view: View;
  entryStage: EntryStage;
  entryChoice: "first" | "takeover" | null;
  entrySource: "question" | "unsure";
  processing: ProcessingStep | null;
  received: boolean;
  manual: boolean;
  availableDate: string;
  conflictChoice: "2026-01-10" | "2026-01-12" | "";
  taxAmount: number | null;
  taxDocumentStep: ProcessingStep | null;
  taxManualEntry: boolean;
  resolution: Resolution | null;
  recalculating: boolean;
  highlightedResult: boolean;
  selectedDocument: string | null;
  selectedDomain: DomainId | null;
  showInpi: boolean;
  siretReceived: boolean;
  takeoverLiasse: boolean;
  takeoverRegister: boolean;
  takeoverIntake: boolean;
};

export const INITIAL_STATE: DemoState = {
  scenario: "first",
  view: "dossier",
  entryStage: "question",
  entryChoice: null,
  entrySource: "question",
  processing: null,
  received: false,
  manual: false,
  availableDate: "",
  conflictChoice: "",
  taxAmount: null,
  taxDocumentStep: null,
  taxManualEntry: false,
  resolution: null,
  recalculating: false,
  highlightedResult: false,
  selectedDocument: null,
  selectedDomain: null,
  showInpi: false,
  siretReceived: false,
  takeoverLiasse: false,
  takeoverRegister: false,
  takeoverIntake: false,
};

export type DemoAction =
  | { type: "scenario"; scenario: Scenario }
  | { type: "entry-unsure" }
  | { type: "entry-choice"; choice: "first" | "takeover" }
  | { type: "entry-stage"; stage: "organize" | "invite" | "done" }
  | { type: "view"; view: View }
  | { type: "receive" }
  | { type: "manual" }
  | { type: "processing"; step: ProcessingStep }
  | { type: "date"; value: string }
  | { type: "conflict"; value: "2026-01-10" | "2026-01-12" }
  | { type: "tax-document-start" }
  | { type: "tax-document-progress"; step: ProcessingStep }
  | { type: "tax-manual" }
  | { type: "tax"; value: number }
  | { type: "settle-resolution" }
  | { type: "recalculated" }
  | { type: "clear-highlight" }
  | { type: "document"; id: string | null }
  | { type: "domain"; id: DomainId | null }
  | { type: "inpi"; show: boolean }
  | { type: "siret-received" }
  | { type: "takeover"; document: "liasse" | "register" }
  | { type: "takeover-intake" };

export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "scenario":
      return { ...INITIAL_STATE, scenario: action.scenario, entryStage: action.scenario === "inpi" ? "done" : "question" };
    case "entry-unsure":
      return { ...state, entryStage: "unsure", entryChoice: null, entrySource: "unsure" };
    case "entry-choice":
      return { ...INITIAL_STATE, scenario: action.choice, entryChoice: action.choice, entryStage: "confirm", entrySource: state.entrySource };
    case "entry-stage":
      return { ...state, entryStage: action.stage };
    case "view":
      return { ...state, view: action.view, selectedDocument: null, selectedDomain: null };
    case "receive":
      return { ...state, received: true, processing: 0, entryStage: "done", view: "dossier" };
    case "manual":
      return { ...state, received: true, manual: true, processing: 4, entryStage: "done", view: "dossier" };
    case "processing":
      return { ...state, processing: action.step };
    case "date":
      return { ...state, availableDate: action.value, resolution: "date" };
    case "conflict":
      return { ...state, conflictChoice: action.value, resolution: "conflict" };
    case "tax-document-start":
      return { ...state, view: "documents", taxDocumentStep: 0, taxManualEntry: false };
    case "tax-document-progress":
      return { ...state, taxDocumentStep: action.step };
    case "tax-manual":
      return { ...state, taxManualEntry: true };
    case "tax":
      return { ...state, taxAmount: action.value, resolution: "tax" };
    case "settle-resolution":
      return { ...state, resolution: null, recalculating: state.resolution === "tax" };
    case "recalculated":
      return { ...state, recalculating: false, highlightedResult: true };
    case "clear-highlight":
      return { ...state, highlightedResult: false };
    case "document":
      return { ...state, selectedDocument: action.id, selectedDomain: null };
    case "domain":
      return { ...state, selectedDomain: action.id, selectedDocument: null };
    case "inpi":
      return { ...state, showInpi: action.show };
    case "siret-received":
      return { ...state, siretReceived: true };
    case "takeover":
      return action.document === "liasse"
        ? { ...state, takeoverLiasse: !state.takeoverLiasse }
        : { ...state, takeoverRegister: !state.takeoverRegister };
    case "takeover-intake":
      return { ...state, takeoverIntake: true };
  }
}

export function pendingCount(state: DemoState): number {
  if (!state.received || state.processing !== 4) return 0;
  return Number(!state.availableDate) + Number(!state.manual && !state.conflictChoice) + Number(state.taxAmount === null);
}

export function nextAction(state: DemoState): "date" | "conflict" | "tax" | null {
  if (!state.availableDate) return "date";
  if (!state.manual && !state.conflictChoice) return "conflict";
  if (state.taxAmount === null) return "tax";
  return null;
}

export function motionDelay(phase: "entry" | "organize" | "document" | "tax-document" | "handoff" | "resolution" | "recalculation", reduced: boolean): number {
  if (reduced) return 100;
  return { entry: 620, organize: 1150, document: 470, "tax-document": 430, handoff: 1250, resolution: 540, recalculation: 950 }[phase];
}

export function illustrativeResult(taxAmount: number) {
  const income = 14400;
  const expenses = 2350 + 2100 + taxAmount;
  const beforeAmortization = income - expenses;
  const amortization = 7000;
  return { income, expenses, beforeAmortization, amortization, fiscal: beforeAmortization - amortization };
}
