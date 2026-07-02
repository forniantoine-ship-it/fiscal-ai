import { computeFinancementExercice } from "../../capabilities/f011/compute-financement-exercice";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import { explainFinancement } from "../../presentation/explain-financement";
import {
  createInitialF011State,
  type F011Action,
  type F011AssistantTurn,
  type F011Deps,
  type F011LoanDraft,
  type F011Message,
  type F011State,
  type F011Suggestion,
} from "./types";

const PRESENCE_SUGGESTIONS: F011Suggestion[] = [
  { id: "yes", label: "Oui, j'ai un crédit" },
  { id: "no", label: "Non, achat comptant" },
];

const COUNT_SUGGESTIONS: F011Suggestion[] = [
  { id: "1", label: "Un seul prêt" },
  { id: "2", label: "Deux prêts ou plus" },
];

function presencePrompt(): F011Message {
  return {
    role: "assistant",
    content:
      "Avez-vous financé ce bien avec un crédit ? " +
      "Seule la partie intérêts de vos mensualités est déductible — pas le capital remboursé.",
    suggestions: PRESENCE_SUGGESTIONS,
  };
}

function loanPrompt(index: number, total: number): F011Message {
  return {
    role: "assistant",
    content:
      total > 1
        ? `Prêt ${index + 1} sur ${total}. Indiquez le montant emprunté, le taux annuel, la durée en mois et la date de la première mensualité.`
        : "Indiquez le montant emprunté, le taux annuel, la durée en mois et la date de la première mensualité.",
  };
}

export class F011FinancementAssistant {
  constructor(
    private readonly ctx: RuntimeContext,
    private readonly deps: F011Deps = {},
  ) {}

  start(): F011AssistantTurn {
    return {
      state: createInitialF011State(),
      messages: [presencePrompt()],
      completed: false,
    };
  }

  async handle(state: F011State, action: F011Action): Promise<F011AssistantTurn> {
    const messages: F011Message[] = [];

    switch (action.type) {
      case "restart":
        return this.start();

      case "set_presence_emprunt": {
        messages.push({
          role: "user",
          content: action.presence ? "Oui, j'ai un crédit" : "Non, achat comptant",
        });
        if (!action.presence) {
          messages.push({
            role: "assistant",
            content: "Aucune charge de financement pour cet exercice. Vous pouvez passer à l'étape suivante.",
          });
          return {
            state: {
              ...state,
              presenceEmprunt: false,
              step: "skipped",
              result: { charges: emptyCharges(this.ctx.fiscalYear), explanation: "", anomalies: [], skipped: true },
            },
            messages,
            completed: true,
            event: "FINANCEMENT_SKIP",
          };
        }
        messages.push({
          role: "assistant",
          content: "Combien de prêts couvrent ce bien sur cet exercice ?",
          suggestions: COUNT_SUGGESTIONS,
        });
        return {
          state: { ...state, presenceEmprunt: true, step: "nombre_prets" },
          messages,
          completed: false,
        };
      }

      case "set_nombre_prets": {
        messages.push({
          role: "user",
          content: action.count === 1 ? "Un seul prêt" : "Deux prêts ou plus",
        });
        const count = action.count;
        messages.push(loanPrompt(0, count));
        return {
          state: { ...state, nombrePrets: count, step: "loan_collect", currentLoanIndex: 0 },
          messages,
          completed: false,
        };
      }

      case "submit_loan": {
        messages.push({
          role: "user",
          content:
            `${action.capitalInitial.toLocaleString("fr-FR")} € — ${(action.tauxNominal * 100).toFixed(2)} % — ` +
            `${action.dureeMois} mois — 1ère mensualité ${action.datePremiereMensualite}`,
        });
        const draft: F011LoanDraft = {
          pretId: `pret-${state.currentLoanIndex + 1}`,
          typePret: action.typePret,
          capitalInitial: action.capitalInitial,
          tauxNominal: action.tauxNominal,
          dureeMois: action.dureeMois,
          datePremiereMensualite: action.datePremiereMensualite,
          assuranceAnnuelle: action.assuranceAnnuelle,
          assuranceType: action.assuranceType ?? "externe",
        };
        const preview = this.computeForLoans([...state.loans, draft]);
        messages.push({
          role: "assistant",
          content:
            `Intérêts déductibles de l'exercice : ${Math.round(preview.charges.prets.at(-1)?.interetsEmpruntExercice ?? 0).toLocaleString("fr-FR")} €\n` +
            `dont pré-exploitation (non déductibles) : ${Math.round(preview.charges.prets.at(-1)?.interetsPreExploitation ?? 0).toLocaleString("fr-FR")} €\n` +
            `Capital remboursé (non déductible) : ${Math.round(preview.charges.prets.at(-1)?.capitalRembourseExercice ?? 0).toLocaleString("fr-FR")} €\n` +
            `CRD au 31/12 : ${Math.round(preview.charges.prets.at(-1)?.capitalRestantDu31_12 ?? 0).toLocaleString("fr-FR")} €`,
          suggestions: [{ id: "confirm_loan", label: "Valider ce prêt" }],
        });
        return {
          state: { ...state, pendingLoan: draft, step: "loan_review" },
          messages,
          completed: false,
        };
      }

      case "confirm_loan": {
        if (!state.pendingLoan) return { state, messages, completed: false };
        messages.push({ role: "user", content: "Valider ce prêt" });
        const loans = [...state.loans, state.pendingLoan as F011LoanDraft];
        const nextIndex = state.currentLoanIndex + 1;
        const targetCount = state.nombrePrets ?? 1;

        if (nextIndex < targetCount) {
          messages.push(loanPrompt(nextIndex, targetCount));
          return {
            state: {
              ...state,
              loans,
              pendingLoan: undefined,
              currentLoanIndex: nextIndex,
              step: "loan_collect",
            },
            messages,
            completed: false,
            event: "PRET_CONFIGURE",
          };
        }

        const result = this.buildResult(loans);
        messages.push({ role: "assistant", content: result.explanation });
        messages.push({
          role: "assistant",
          content: "Ces montants vous conviennent-ils ?",
          suggestions: [{ id: "confirm_all", label: "Oui, je valide" }],
        });
        return {
          state: { ...state, loans, pendingLoan: undefined, result, step: "aggregate_review" },
          messages,
          completed: false,
          event: "PRET_CONFIGURE",
        };
      }

      case "confirm_all": {
        messages.push({ role: "user", content: "Oui, je valide" });
        messages.push({
          role: "assistant",
          content: "Votre financement est enregistré. Nous pouvons passer à l'étape suivante.",
        });
        return {
          state: { ...state, step: "complete" },
          messages,
          completed: true,
          event: "FINANCEMENT_TERMINE",
        };
      }

      default:
        return { state, messages, completed: false };
    }
  }

  private computeForLoans(loans: F011LoanDraft[]) {
    return computeFinancementExercice({
      exerciceFiscal: this.ctx.fiscalYear,
      dateMiseEnService: this.deps.dateMiseEnService ?? `${this.ctx.fiscalYear}-06-01`,
      prixRevient: this.deps.prixRevient,
      prets: loans.map((loan) => ({
        pretId: loan.pretId,
        typePret: loan.typePret,
        capitalInitial: loan.capitalInitial,
        tauxNominal: loan.tauxNominal,
        dureeMois: loan.dureeMois,
        datePremiereMensualite: loan.datePremiereMensualite,
        assuranceAnnuelle: loan.assuranceAnnuelle,
        assuranceType: loan.assuranceType,
      })),
    });
  }

  private buildResult(loans: F011LoanDraft[]) {
    const computed = this.computeForLoans(loans);
    const explain = explainFinancement({ charges: computed.charges });
    return {
      charges: computed.charges,
      explanation: explain.explanation,
      anomalies: computed.anomalies,
      skipped: false,
    };
  }
}

function emptyCharges(exerciceFiscal: number) {
  return {
    exerciceFiscal,
    prets: [],
    totalInteretsEmprunt: 0,
    totalInteretsPreExploitation: 0,
    totalAssurance: 0,
    totalCapitalRembourse: 0,
    totalChargesFinancementExercice: 0,
  };
}

export { createInitialF011State };
export type {
  F011Action,
  F011AssistantTurn,
  F011Deps,
  F011LoanDraft,
  F011Message,
  F011Result,
  F011State,
  F011Step,
  F011Suggestion,
} from "./types";
