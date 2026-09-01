import { computeFinancementExercice } from "../../capabilities/f011/compute-financement-exercice";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import type { FieldSource } from "../../contracts/FieldSource";
import { explainFinancement } from "../../presentation/explain-financement";
import {
  applyCreditPrefillToLoan,
  F011_PREFILL_FIELD_KEYS,
  type F011PrefillConflict,
  type F011PrefillFieldKey,
} from "@/lib/lmnp/services/f011/credit-bridge";
import { resolveNextF011LoanStepAfterReview } from "./resolve-next-f011-loan-step";
import { reconcileFieldSourcesWithPendingLoan } from "@/lib/lmnp/services/f011/f011-field-sources";
import {
  createInitialF011State,
  shouldResumeF011,
  toF011PersistedState,
  type F011Action,
  type F011AssistantTurn,
  type F011Deps,
  type F011HistorySnapshot,
  type F011LoanDraft,
  type F011Message,
  type F011PersistedState,
  type F011Result,
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

const LOAN_SOURCE_SUGGESTIONS: F011Suggestion[] = [
  { id: "source_document", label: "Oui, j'ai le tableau" },
  { id: "source_manual", label: "Non, je vais le renseigner" },
];

const LOAN_TYPE_SUGGESTIONS: F011Suggestion[] = [
  { id: "amortissable", label: "Amortissable" },
  { id: "in_fine", label: "In fine" },
];

const INSURANCE_SUGGESTIONS: F011Suggestion[] = [
  { id: "assurance_bancaire", label: "Bancaire (intégrée aux mensualités)" },
  { id: "assurance_externe", label: "Externe (déléguée)" },
];

const GUARANTEE_SUGGESTIONS: F011Suggestion[] = [
  { id: "garantie_caution", label: "Caution (Crédit Logement, CAMCA...)" },
  { id: "garantie_hypotheque_ippd", label: "Hypothèque ou IPPD" },
  { id: "garantie_aucune", label: "Aucune" },
  { id: "garantie_autre", label: "Autre / je ne sais pas" },
];

const FEES_SUGGESTIONS: F011Suggestion[] = [
  { id: "fees_oui", label: "Oui" },
  { id: "fees_non", label: "Non" },
];

const IRA_SUGGESTIONS: F011Suggestion[] = [
  { id: "ira_oui", label: "Oui" },
  { id: "ira_non", label: "Non" },
];

const NOMBRE_PRETS_PROMPT: F011Message = {
  role: "assistant",
  content: "Combien de prêts couvrent ce bien sur cet exercice ?",
  suggestions: COUNT_SUGGESTIONS,
};

/** Cycle 5 — libellés humains des champs pontés (credit-bridge.ts), pour la revue et les conflits. */
const FIELD_LABELS: Record<F011PrefillFieldKey, string> = {
  typePret: "Type de prêt",
  capitalInitial: "Capital emprunté",
  tauxNominal: "Taux nominal",
  dureeMois: "Durée",
  datePremiereMensualite: "Date de première mensualité",
  assuranceAnnuelle: "Assurance annuelle",
  fraisDossier: "Frais de dossier",
};

function formatPrefillValue(key: F011PrefillFieldKey, value: unknown): string {
  switch (key) {
    case "typePret":
      return value === "in_fine" ? "In fine" : "Amortissable";
    case "capitalInitial":
    case "assuranceAnnuelle":
    case "fraisDossier":
      return `${Math.round(Number(value)).toLocaleString("fr-FR")} €`;
    case "tauxNominal":
      return `${(Number(value) * 100).toFixed(2)} %`;
    case "dureeMois":
      return `${value} mois`;
    default:
      return String(value);
  }
}

/** Cycle 6 §11 — libellés humains de `FieldSource`, pour afficher la provenance d'un conflit. */
const FIELD_SOURCE_LABELS: Partial<Record<FieldSource, string>> = {
  extracted: "extrait d'un document",
  manual: "saisi manuellement",
  user_correction: "corrigé manuellement",
};

function describeSource(source: FieldSource | undefined): string {
  return source ? (FIELD_SOURCE_LABELS[source] ?? "renseigné") : "renseigné";
}

/**
 * Cycle 6 §11 — classe la provenance d'un champ pontable après une réponse
 * manuelle. Une valeur déjà `extracted` que l'utilisateur n'a pas changée le
 * reste (simple confirmation, pas une nouvelle saisie) ; changée, elle devient
 * une correction explicite (`user_correction`, même vocabulaire que F-010).
 * Sinon toujours `manual` — la provenance n'est jamais fabriquée.
 */
function classifyManualSource(
  fieldSources: Partial<Record<string, FieldSource>>,
  field: F011PrefillFieldKey,
  previousValue: unknown,
  newValue: unknown,
): FieldSource {
  const previous = fieldSources[field];
  if (previous === "extracted" || previous === "user_correction") {
    return previousValue === newValue ? previous : "user_correction";
  }
  return "manual";
}

/**
 * Correctif Cycle 9 — même vocabulaire de provenance que `classifyManualSource`
 * (extracted / manual / user_correction), mais pour `commissionCaution` : ce
 * champ n'entre jamais dans `F011_PREFILL_FIELD_KEYS` (la nature de la
 * garantie n'est jamais déduite à l'extraction — voir `credit-bridge.ts`),
 * donc `fieldSources.commissionCaution` n'est jamais pré-posé comme
 * "extracted" avant que l'utilisateur choisisse "Caution". La comparaison se
 * fait directement contre le montant vu dans le document
 * (`detectedGuaranteeFees`), jamais contre `fieldSources`.
 */
function classifyGuaranteeAmountSource(
  detectedGuaranteeFees: number | undefined,
  submittedValue: number | undefined,
): FieldSource {
  if (detectedGuaranteeFees === undefined) return "manual";
  return submittedValue === detectedGuaranteeFees ? "extracted" : "user_correction";
}

function presencePrompt(): F011Message {
  return {
    role: "assistant",
    content:
      "Avez-vous financé ce bien avec un crédit ? " +
      "Seule la partie intérêts de vos mensualités est déductible — pas le capital remboursé.",
    suggestions: PRESENCE_SUGGESTIONS,
  };
}

function blockedMissingDatePrompt(): F011Message {
  return {
    role: "assistant",
    content:
      "Il me manque la date de mise en service de votre bien pour isoler correctement les intérêts déductibles " +
      "(les intérêts payés avant cette date ne sont jamais déductibles). " +
      "Complétez d'abord l'étape Activité, puis revenez ici — je ne peux pas deviner cette date.",
  };
}

function loanSourceChoicePrompt(index: number, total: number): F011Message {
  return {
    role: "assistant",
    content:
      (total > 1 ? `Prêt ${index + 1} sur ${total}. ` : "") +
      "Avez-vous le tableau d'amortissement de ce prêt ? Les deux façons de répondre donnent un résultat " +
      "de précision identique — c'est vous qui choisissez.",
    suggestions: LOAN_SOURCE_SUGGESTIONS,
  };
}

function uploadPrompt(): F011Message {
  return {
    role: "assistant",
    content: "Importez le tableau d'amortissement ou l'offre de prêt (PDF ou image).",
  };
}

function analyzingPrompt(): F011Message {
  return { role: "assistant", content: "Analyse du document en cours..." };
}

function loanTypePrompt(index: number, total: number): F011Message {
  return {
    role: "assistant",
    content:
      (total > 1 ? `Prêt ${index + 1} sur ${total}. ` : "") +
      "Ce prêt est-il amortissable (mensualités = capital + intérêts) ou in fine " +
      "(vous ne remboursez que les intérêts, le capital en une fois à l'échéance) ?",
    suggestions: LOAN_TYPE_SUGGESTIONS,
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

function promptAfterLoanCoreReview(
  step: ReturnType<typeof resolveNextF011LoanStepAfterReview>,
  index: number,
  total: number,
): F011Message {
  if (step === "loan_type") return loanTypePrompt(index, total);
  if (step === "loan_collect") return loanPrompt(index, total);
  return insurancePrompt();
}

function insurancePrompt(): F011Message {
  return {
    role: "assistant",
    content:
      "Ce prêt est-il assorti d'une assurance emprunteur bancaire (intégrée à vos mensualités) " +
      "ou externe (délégation d'assurance) ?",
    suggestions: INSURANCE_SUGGESTIONS,
  };
}

/**
 * Correctif assurance bancaire — le message doit refléter l'état réel du
 * prêt, jamais une hypothèse fixe. Si un montant est déjà connu (extrait
 * d'un document, ou déjà saisi), il est annoncé et retenu ; sinon seulement,
 * l'impossibilité de l'isoler est expliquée.
 */
function insuranceBancaireAckPrompt(assuranceAnnuelle: number | undefined, source: FieldSource | undefined): F011Message {
  if (assuranceAnnuelle !== undefined) {
    const montant = `${Math.round(assuranceAnnuelle).toLocaleString("fr-FR")} € par an`;
    const origine = source === "extracted" ? "extrait de votre document" : "déjà renseigné";
    return {
      role: "assistant",
      content: `Assurance bancaire notée. Le montant ${origine} (${montant}) est retenu comme charge déductible.`,
    };
  }
  return {
    role: "assistant",
    content:
      "Assurance bancaire notée. Sans tableau d'amortissement importé, je ne peux pas isoler son montant " +
      "des mensualités — elle n'est donc pas comptée séparément ici pour cet exercice.",
  };
}

/**
 * Correctif Cycle 9 — annonce un montant de frais de garantie déjà vu dans
 * le document (`detectedGuaranteeFees`), sans jamais en déduire la nature :
 * la question reste posée dans tous les cas, seul le montant est prérempli
 * si l'utilisateur choisit "Caution" (voir `set_guarantee`).
 */
function guaranteePrompt(detectedGuaranteeFees: number | undefined): F011Message {
  const found =
    detectedGuaranteeFees !== undefined
      ? `J'ai trouvé ${Math.round(detectedGuaranteeFees).toLocaleString("fr-FR")} € de frais de garantie dans votre document.\n\n`
      : "";
  return {
    role: "assistant",
    content: `${found}Quelle garantie avez-vous fournie pour ce prêt ?`,
    suggestions: GUARANTEE_SUGGESTIONS,
  };
}

function guaranteeHypothequeAckPrompt(): F011Message {
  return {
    role: "assistant",
    content:
      "Les frais de garantie hypothécaire ou IPPD ne sont pas une charge déductible de cet exercice — " +
      "ils s'intègrent au prix de revient du bien (Assistant Logement). Cette intégration n'est pas encore " +
      "disponible dans Fiscal AI : je ne demande donc pas de montant ici pour éviter un double comptage.",
  };
}

function feesPrompt(fiscalYear: number): F011Message {
  return {
    role: "assistant",
    content: `Ce prêt a-t-il été souscrit au cours de l'exercice ${fiscalYear} ?`,
    suggestions: FEES_SUGGESTIONS,
  };
}

function iraPrompt(fiscalYear: number): F011Message {
  return {
    role: "assistant",
    content: `Avez-vous remboursé une partie du capital par anticipation au cours de l'exercice ${fiscalYear} ?`,
    suggestions: IRA_SUGGESTIONS,
  };
}

function resumeAckPrompt(persisted: F011PersistedState): F011Message {
  const count = persisted.loans.length;
  if (count === 0) {
    return { role: "assistant", content: "Reprenons là où vous en étiez." };
  }
  return {
    role: "assistant",
    content:
      `Reprenons là où vous en étiez — ${count === 1 ? "1 prêt déjà validé" : `${count} prêts déjà validés`} ` +
      "pour cet exercice.",
  };
}

/**
 * Cycle 3 — photo de l'état quitté, pour que GO_BACK restaure exactement ce
 * qui existait avant la transition (jamais une approximation dérivée du
 * seul nom d'étape). Utilisé par `advance`, point de passage unique de
 * toute transition mutante. Cycle 5 : inclut aussi l'analyse/la revue
 * documentaire en cours, pour qu'un retour en arrière ne perde jamais un
 * document déjà importé ou une revue déjà entamée.
 */
function snapshotState(state: F011State): F011HistorySnapshot {
  return {
    step: state.step,
    presenceEmprunt: state.presenceEmprunt,
    nombrePrets: state.nombrePrets,
    currentLoanIndex: state.currentLoanIndex,
    loans: state.loans,
    pendingLoan: state.pendingLoan,
    analyzingDocumentId: state.analyzingDocumentId,
    pendingExtraction: state.pendingExtraction,
    extractionConflicts: state.extractionConflicts,
  };
}

/**
 * Pousse l'étape quittée sur la pile d'historique et applique le patch —
 * point de passage unique de toute transition (Cycle 3), pour que GO_BACK
 * fonctionne uniformément, y compris à la frontière prêt N → prêt N-1.
 * Miroir de `advance()` (F010).
 */
function advance(state: F011State, patch: Partial<F011State>, nextStep: F011State["step"]): F011State {
  return {
    ...state,
    ...patch,
    step: nextStep,
    history: [...(state.history ?? []), snapshotState(state)],
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

  /**
   * Cycle 2 — reconstruit l'état conversationnel depuis un `F011PersistedState`
   * et redemande exactement l'écran où l'utilisateur en était. Ne rejoue jamais
   * un résultat calculé persisté : le recalcule à partir des prêts déjà saisis
   * (`loan_review`, `aggregate_review`). Ne contourne jamais la précondition
   * `dateMiseEnService` du Cycle 1 — un blocage persisté reste un blocage tant
   * que la date n'est pas connue.
   */
  resume(persisted: F011PersistedState): F011AssistantTurn {
    const baseState: F011State = {
      step: persisted.step,
      presenceEmprunt: persisted.presenceEmprunt,
      nombrePrets: persisted.nombrePrets,
      currentLoanIndex: persisted.currentLoanIndex,
      loans: persisted.loans,
      pendingLoan: persisted.pendingLoan,
      fieldSources: persisted.fieldSources,
      history: persisted.history,
      analyzingDocumentId: persisted.analyzingDocumentId,
      pendingExtraction: persisted.pendingExtraction,
      extractionConflicts: persisted.extractionConflicts,
      detectedGuaranteeFees: persisted.detectedGuaranteeFees,
      loanFormGeneration: persisted.loanFormGeneration ?? 0,
    };

    if (baseState.step === "blocked_missing_date") {
      if (!this.deps.dateMiseEnService) {
        return { state: baseState, messages: [blockedMissingDatePrompt()], completed: false, event: "FINANCEMENT_BLOQUE" };
      }
      // La précondition s'est résolue depuis (F-009 complété entretemps) — on ne
      // reste jamais bloqué artificiellement, mais on la revérifie, on ne la
      // contourne pas.
      const advanced: F011State = { ...baseState, step: "nombre_prets" };
      return {
        state: advanced,
        messages: [resumeAckPrompt(persisted), NOMBRE_PRETS_PROMPT],
        completed: false,
      };
    }

    const reentry = this.buildReentryTurn(baseState);
    return {
      state: reentry.state,
      messages: [resumeAckPrompt(persisted), ...reentry.messages],
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
            state: advance(
              state,
              {
                presenceEmprunt: false,
                result: { charges: emptyCharges(this.ctx.fiscalYear), explanation: "", anomalies: [], skipped: true },
              },
              "skipped",
            ),
            messages,
            completed: true,
            event: "FINANCEMENT_SKIP",
          };
        }

        if (!this.deps.dateMiseEnService) {
          messages.push(blockedMissingDatePrompt());
          return {
            state: advance(state, { presenceEmprunt: true }, "blocked_missing_date"),
            messages,
            completed: false,
            event: "FINANCEMENT_BLOQUE",
          };
        }

        messages.push(NOMBRE_PRETS_PROMPT);
        return {
          state: advance(state, { presenceEmprunt: true }, "nombre_prets"),
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
        messages.push(loanSourceChoicePrompt(0, count));
        return {
          state: advance(
            state,
            {
              nombrePrets: count,
              currentLoanIndex: 0,
              pendingLoan: {},
              // Correctif Cycle 11 — même bug que GO_BACK (voir plus bas) :
              // `pendingLoan` repart vide mais `fieldSources` restait
              // jusqu'ici inchangé, laissant des provenances "extracted"
              // périmées survivre à un changement de nombre de prêts.
              fieldSources: reconcileFieldSourcesWithPendingLoan(state.fieldSources, {}),
              // Correctif Cycle 10 — relance la collecte au prêt 0 : sans ce
              // compteur, un retour en arrière jusqu'ici puis un nouveau choix
              // retomberait sur le même `currentLoanIndex` qu'une tentative de
              // prêt 1 déjà abandonnée, et le panel croirait à tort qu'il
              // s'agit du même prêt (voir `resolveLoanFormAction`).
              loanFormGeneration: state.loanFormGeneration + 1,
            },
            "loan_source_choice",
          ),
          messages,
          completed: false,
        };
      }

      case "choose_loan_source": {
        if (action.source === "document") {
          messages.push({ role: "user", content: "Oui, j'ai le tableau" });
          messages.push(uploadPrompt());
          // Cycle 6 §4 — "Importer un autre document" (appelé aussi depuis
          // `loan_review_extraction`) ouvre un vrai nouveau cycle d'analyse :
          // l'extraction précédente ne doit plus être ré-affichée telle quelle,
          // mais `pendingLoan`/`fieldSources` (les données déjà confirmées)
          // restent intacts — seul le patch est vidé, jamais leur contenu.
          return {
            state: advance(state, { pendingExtraction: undefined, extractionConflicts: undefined }, "loan_upload"),
            messages,
            completed: false,
          };
        }
        messages.push({ role: "user", content: "Non, je vais le renseigner" });
        const total = state.nombrePrets ?? 1;
        messages.push(loanTypePrompt(state.currentLoanIndex, total));
        return { state: advance(state, {}, "loan_type"), messages, completed: false };
      }

      case "upload_document": {
        messages.push({ role: "user", content: "Document envoyé." });
        messages.push(analyzingPrompt());
        return {
          state: advance(state, { analyzingDocumentId: action.documentId }, "loan_analyzing"),
          messages,
          completed: false,
        };
      }

      case "analysis_success": {
        const application = applyCreditPrefillToLoan(state.pendingLoan, action.prefill);
        const mergedPendingLoan = { ...state.pendingLoan, ...application.patch };
        // Chaque champ effectivement appliqué (jamais un champ en conflit, qui
        // reste sous la provenance de la valeur déjà là tant qu'il n'est pas résolu).
        const mergedFieldSources: Partial<Record<string, FieldSource>> = { ...state.fieldSources };
        for (const key of Object.keys(application.patch) as F011PrefillFieldKey[]) {
          mergedFieldSources[key] = "extracted";
        }
        // Correctif Cycle 9 — un montant `guaranteeFees` vu dans le document
        // reste en `unmapped` (nature jamais déduite, voir credit-bridge.ts),
        // mais on le conserve à part pour l'annoncer à la question garantie.
        // Un second document sans ce champ ne doit jamais effacer un montant
        // déjà vu par un premier document du même prêt.
        const detectedGuaranteeFeesFromDoc = action.prefill.unmapped.find(
          (u): u is typeof u & { value: number } => u.field === "guaranteeFees" && typeof u.value === "number",
        )?.value;
        const nextDetectedGuaranteeFees = detectedGuaranteeFeesFromDoc ?? state.detectedGuaranteeFees;
        messages.push(this.buildReviewExtractionMessage(mergedPendingLoan, mergedFieldSources, application.conflicts));
        return {
          state: advance(
            state,
            {
              pendingLoan: mergedPendingLoan,
              fieldSources: mergedFieldSources,
              pendingExtraction: { documentId: action.documentId, prefill: action.prefill },
              extractionConflicts: application.conflicts,
              analyzingDocumentId: undefined,
              detectedGuaranteeFees: nextDetectedGuaranteeFees,
            },
            "loan_review_extraction",
          ),
          messages,
          completed: false,
        };
      }

      case "analysis_failed": {
        messages.push({
          role: "assistant",
          content:
            "L'analyse du document a échoué — je n'ai pas pu en extraire d'informations exploitables. " +
            "Vous pouvez réessayer avec un autre fichier, ou renseigner ce prêt manuellement.",
          suggestions: [
            { id: "retry_analysis", label: "Réessayer" },
            { id: "source_manual", label: "Renseigner manuellement" },
          ],
        });
        return {
          state: advance(state, { analyzingDocumentId: undefined }, "loan_upload"),
          messages,
          completed: false,
        };
      }

      case "retry_analysis": {
        messages.push({ role: "user", content: "Réessayer" });
        messages.push(uploadPrompt());
        return {
          state: advance(state, { analyzingDocumentId: undefined }, "loan_upload"),
          messages,
          completed: false,
        };
      }

      case "resolve_conflict": {
        const conflicts = state.extractionConflicts ?? [];
        const target = conflicts.find((c) => c.field === action.field);
        if (!target) return { state, messages, completed: false };

        messages.push({
          role: "user",
          content:
            action.choice === "use_document"
              ? `Utiliser le document (${FIELD_LABELS[action.field]})`
              : `Garder ma réponse (${FIELD_LABELS[action.field]})`,
        });
        const remainingConflicts = conflicts.filter((c) => c.field !== action.field);
        const pendingLoan =
          action.choice === "use_document"
            ? { ...state.pendingLoan, [action.field]: target.incomingValue }
            : state.pendingLoan;
        // "use_document" : la dernière décision de l'utilisateur est d'adopter
        // la valeur du document → provenance "extracted". "keep_existing" : il
        // réaffirme explicitement sa réponse face à une proposition contraire →
        // "user_correction", jamais silencieusement laissée à son ancienne
        // provenance (§11 : la provenance finale suit la dernière décision réelle).
        const fieldSources: Partial<Record<string, FieldSource>> = {
          ...state.fieldSources,
          [action.field]: action.choice === "use_document" ? "extracted" : "user_correction",
        };
        messages.push(this.buildReviewExtractionMessage(pendingLoan ?? {}, fieldSources, remainingConflicts));
        return {
          state: advance(state, { pendingLoan, fieldSources, extractionConflicts: remainingConflicts }, "loan_review_extraction"),
          messages,
          completed: false,
        };
      }

      case "confirm_extraction": {
        if ((state.extractionConflicts?.length ?? 0) > 0) {
          return { state, messages, completed: false };
        }
        messages.push({ role: "user", content: "Continuer" });
        const total = state.nombrePrets ?? 1;
        const nextStep = resolveNextF011LoanStepAfterReview(state.pendingLoan);
        messages.push(promptAfterLoanCoreReview(nextStep, state.currentLoanIndex, total));
        return {
          state: advance(state, { pendingExtraction: undefined, extractionConflicts: undefined }, nextStep),
          messages,
          completed: false,
        };
      }

      case "set_loan_type": {
        messages.push({
          role: "user",
          content: action.typePret === "amortissable" ? "Amortissable" : "In fine",
        });
        const total = state.nombrePrets ?? 1;
        const typePretSource = classifyManualSource(
          state.fieldSources,
          "typePret",
          state.pendingLoan?.typePret,
          action.typePret,
        );
        const pendingLoan = { ...state.pendingLoan, typePret: action.typePret };
        const nextStep = resolveNextF011LoanStepAfterReview(pendingLoan);
        messages.push(promptAfterLoanCoreReview(nextStep, state.currentLoanIndex, total));
        return {
          // Merge — ne jamais perdre un pré-remplissage venu de "Modifier ce prêt" ou d'un document.
          state: advance(
            state,
            {
              pendingLoan,
              fieldSources: { ...state.fieldSources, typePret: typePretSource },
            },
            nextStep,
          ),
          messages,
          completed: false,
        };
      }

      case "submit_loan_terms": {
        messages.push({
          role: "user",
          content:
            `${action.capitalInitial.toLocaleString("fr-FR")} € — ${(action.tauxNominal * 100).toFixed(2)} % — ` +
            `${action.dureeMois} mois — 1ère mensualité ${action.datePremiereMensualite}`,
        });
        messages.push(insurancePrompt());
        const submittedValues: Record<string, unknown> = {
          capitalInitial: action.capitalInitial,
          tauxNominal: action.tauxNominal,
          dureeMois: action.dureeMois,
          datePremiereMensualite: action.datePremiereMensualite,
        };
        const nextFieldSources: Partial<Record<string, FieldSource>> = { ...state.fieldSources };
        for (const key of Object.keys(submittedValues) as F011PrefillFieldKey[]) {
          nextFieldSources[key] = classifyManualSource(
            state.fieldSources,
            key,
            state.pendingLoan?.[key as keyof F011LoanDraft],
            submittedValues[key],
          );
        }
        return {
          state: advance(
            state,
            {
              pendingLoan: {
                ...state.pendingLoan,
                capitalInitial: action.capitalInitial,
                tauxNominal: action.tauxNominal,
                dureeMois: action.dureeMois,
                datePremiereMensualite: action.datePremiereMensualite,
              },
              fieldSources: nextFieldSources,
            },
            "loan_insurance",
          ),
          messages,
          completed: false,
        };
      }

      case "set_insurance": {
        messages.push({
          role: "user",
          content:
            action.assuranceType === "externe"
              ? `Externe — ${action.assuranceAnnuelle ? `${action.assuranceAnnuelle.toLocaleString("fr-FR")} € / an` : "montant non précisé"}`
              : "Bancaire",
        });
        // Correctif assurance bancaire — "Bancaire" ne doit jamais écraser un
        // montant déjà connu (extrait d'un document ou déjà saisi) : le KS
        // (F-011 §"Type d'assurance") prévoit explicitement l'extraction
        // automatique pour ce cas. Seul "externe" fait porter le montant par
        // l'action elle-même (saisie dédiée) ; "bancaire" reprend tel quel
        // ce qui est déjà dans `pendingLoan`, sans jamais rien inventer.
        const nextAssuranceAnnuelle =
          action.assuranceType === "externe" ? action.assuranceAnnuelle : state.pendingLoan?.assuranceAnnuelle;
        if (action.assuranceType === "bancaire") {
          messages.push(insuranceBancaireAckPrompt(nextAssuranceAnnuelle, state.fieldSources.assuranceAnnuelle));
        }
        messages.push(guaranteePrompt(state.detectedGuaranteeFees));
        const nextFieldSources = { ...state.fieldSources };
        if (action.assuranceType === "externe") {
          if (nextAssuranceAnnuelle !== undefined) {
            nextFieldSources.assuranceAnnuelle = classifyManualSource(
              state.fieldSources,
              "assuranceAnnuelle",
              state.pendingLoan?.assuranceAnnuelle,
              nextAssuranceAnnuelle,
            );
          } else {
            // Le champ redevient absent (montant externe non précisé) — sa
            // provenance ne doit pas rester figée sur "extracted".
            delete nextFieldSources.assuranceAnnuelle;
          }
        }
        // "bancaire" : la valeur ne change pas, donc sa provenance non plus —
        // jamais touchée ici (ni effacée, ni reclassée).
        return {
          state: advance(
            state,
            {
              pendingLoan: {
                ...state.pendingLoan,
                assuranceType: action.assuranceType,
                assuranceAnnuelle: nextAssuranceAnnuelle,
              },
              fieldSources: nextFieldSources,
            },
            "loan_guarantee",
          ),
          messages,
          completed: false,
        };
      }

      case "set_guarantee": {
        messages.push({
          role: "user",
          content:
            action.typeGarantie === "caution"
              ? `Caution — ${action.commissionCaution ? `${action.commissionCaution.toLocaleString("fr-FR")} €` : "montant non précisé"}`
              : action.typeGarantie === "hypotheque_ippd"
                ? "Hypothèque ou IPPD"
                : action.typeGarantie === "autre"
                  ? "Autre / je ne sais pas"
                  : "Aucune",
        });
        if (action.typeGarantie === "hypotheque_ippd") {
          messages.push(guaranteeHypothequeAckPrompt());
        }
        messages.push(feesPrompt(this.ctx.fiscalYear));
        const nextCommissionCaution = action.typeGarantie === "caution" ? action.commissionCaution : undefined;
        const nextGuaranteeFieldSources = { ...state.fieldSources };
        if (nextCommissionCaution !== undefined) {
          // Correctif Cycle 9 — même vocabulaire que les autres champs
          // (extracted/manual/user_correction), calculé contre le montant vu
          // dans le document plutôt que contre `fieldSources` (jamais
          // pré-posé ici, la nature de la garantie n'étant jamais déduite).
          nextGuaranteeFieldSources.commissionCaution = classifyGuaranteeAmountSource(
            state.detectedGuaranteeFees,
            nextCommissionCaution,
          );
        } else {
          delete nextGuaranteeFieldSources.commissionCaution;
        }
        return {
          state: advance(
            state,
            {
              pendingLoan: {
                ...state.pendingLoan,
                typeGarantie: action.typeGarantie,
                commissionCaution: nextCommissionCaution,
              },
              fieldSources: nextGuaranteeFieldSources,
            },
            "loan_fees",
          ),
          messages,
          completed: false,
        };
      }

      case "set_fees": {
        messages.push({
          role: "user",
          content: action.souscritCetExercice
            ? `Souscrit cette année — frais de dossier : ${action.fraisDossier ? `${action.fraisDossier.toLocaleString("fr-FR")} €` : "aucun"}`
            : "Pas souscrit cette année",
        });
        messages.push(iraPrompt(this.ctx.fiscalYear));
        const nextFraisDossier = action.souscritCetExercice ? action.fraisDossier : undefined;
        const nextFeesFieldSources = { ...state.fieldSources };
        if (nextFraisDossier !== undefined) {
          nextFeesFieldSources.fraisDossier = classifyManualSource(
            state.fieldSources,
            "fraisDossier",
            state.pendingLoan?.fraisDossier,
            nextFraisDossier,
          );
        } else {
          delete nextFeesFieldSources.fraisDossier;
        }
        return {
          state: advance(
            state,
            {
              pendingLoan: {
                ...state.pendingLoan,
                souscritCetExercice: action.souscritCetExercice,
                fraisDossier: nextFraisDossier,
              },
              fieldSources: nextFeesFieldSources,
            },
            "loan_ira",
          ),
          messages,
          completed: false,
        };
      }

      case "set_ira": {
        messages.push({
          role: "user",
          content: action.remboursementAnticipe
            ? `Oui — IRA : ${action.montant ? `${action.montant.toLocaleString("fr-FR")} €` : "montant non précisé"}`
            : "Non",
        });

        const draft = this.buildLoanDraft(state, action.remboursementAnticipe, action.montant);
        messages.push(this.buildLoanPreviewMessage(state.loans, draft));
        return {
          state: advance(state, { pendingLoan: draft }, "loan_review"),
          messages,
          completed: false,
        };
      }

      case "confirm_loan": {
        if (!state.pendingLoan) return { state, messages, completed: false };
        messages.push({ role: "user", content: "Valider ce prêt" });
        const loans = [...state.loans, state.pendingLoan as F011LoanDraft];
        const targetCount = state.nombrePrets ?? 1;

        if (loans.length < targetCount) {
          const nextIndex = loans.length;
          messages.push(loanSourceChoicePrompt(nextIndex, targetCount));
          return {
            state: advance(
              state,
              // Cycle 6 §11 — `fieldSources` ne décrit que le prêt en cours de
              // saisie (F011LoanDraft ne porte pas sa propre provenance par
              // champ). Sans ce reset, un champ "extracted" du prêt N reste
              // dans la map et fausse la classification du prêt N+1 (une
              // saisie manuelle neuve serait vue comme une "correction").
              // Correctif Cycle 9 — même raison : un montant de garantie vu
              // pour le prêt N ne doit jamais être proposé pour le prêt N+1.
              { loans, pendingLoan: {}, fieldSources: {}, currentLoanIndex: nextIndex, detectedGuaranteeFees: undefined },
              "loan_source_choice",
            ),
            messages,
            completed: false,
            event: "PRET_CONFIGURE",
          };
        }

        const { result, messages: reviewMessages } = this.buildAggregateReviewMessages(loans);
        messages.push(...reviewMessages);
        return {
          state: advance(
            state,
            { loans, pendingLoan: undefined, result, detectedGuaranteeFees: undefined },
            "aggregate_review",
          ),
          messages,
          completed: false,
          event: "PRET_CONFIGURE",
        };
      }

      case "edit_loan": {
        const target = state.loans.find((l) => l.pretId === action.pretId);
        if (!target) return { state, messages, completed: false };
        messages.push({ role: "user", content: "Modifier ce prêt" });
        const remainingLoans = state.loans.filter((l) => l.pretId !== action.pretId);
        const total = state.nombrePrets ?? state.loans.length;
        messages.push(loanTypePrompt(remainingLoans.length, total));
        return {
          state: advance(
            state,
            {
              loans: remainingLoans,
              currentLoanIndex: remainingLoans.length,
              pendingLoan: { ...target },
              // Cycle 6 §11 — même raison que confirm_loan : le prêt confirmé
              // ne porte pas sa provenance par champ, donc on ne peut pas la
              // restaurer. Repartir de {} plutôt que de garder la map d'un
              // autre prêt (jamais fabriquer une provenance qu'on n'a pas).
              fieldSources: {},
              result: undefined,
              // Correctif Cycle 9 — même raison : un montant de garantie
              // détecté pour un autre prêt ne doit jamais s'appliquer ici.
              detectedGuaranteeFees: undefined,
            },
            "loan_type",
          ),
          messages,
          completed: false,
        };
      }

      case "confirm_all": {
        messages.push({ role: "user", content: "Oui, je valide" });
        messages.push({
          role: "assistant",
          content: "Votre financement est enregistré. Nous pouvons passer à l'étape suivante.",
        });
        return {
          state: advance(state, {}, "complete"),
          messages,
          completed: true,
          event: "FINANCEMENT_TERMINE",
        };
      }

      case "go_back": {
        const history = state.history ?? [];
        if (history.length === 0) {
          return { state, messages, completed: false };
        }

        const previous = history[history.length - 1]!;
        const restored: F011State = {
          ...state,
          step: previous.step,
          presenceEmprunt: previous.presenceEmprunt,
          nombrePrets: previous.nombrePrets,
          currentLoanIndex: previous.currentLoanIndex,
          loans: previous.loans,
          pendingLoan: previous.pendingLoan,
          // Correctif Cycle 11 — `fieldSources` ne fait jamais partie du
          // snapshot d'historique (voir `F011HistorySnapshot`) : sans cette
          // réconciliation, un retour assez profond pour vider `pendingLoan`
          // laisserait `fieldSources` prétendre à tort qu'un champ redevenu
          // inconnu est encore "extracted", et une saisie manuelle fraîche
          // serait alors classée "user_correction" par `classifyManualSource`.
          // Ne touche jamais un champ dont `pendingLoan` porte encore une
          // valeur réelle — jamais de correction d'une provenance valide.
          fieldSources: reconcileFieldSourcesWithPendingLoan(state.fieldSources, previous.pendingLoan),
          analyzingDocumentId: previous.analyzingDocumentId,
          pendingExtraction: previous.pendingExtraction,
          extractionConflicts: previous.extractionConflicts,
          result: undefined,
          history: history.slice(0, -1),
        };

        messages.push({ role: "user", content: "← Précédent" });
        const reentry = this.buildReentryTurn(restored);
        messages.push(...reentry.messages);
        return { state: reentry.state, messages, completed: false };
      }

      default:
        return { state, messages, completed: false };
    }
  }

  /**
   * Correctif Cycle 10 — `pretId` doit être stable pour un prêt en cours
   * d'édition : `edit_loan` place l'identifiant d'origine dans
   * `pendingLoan.pretId` ([edit_loan]), donc on le réutilise ici tel quel.
   * `currentLoanIndex` ne sert à en fabriquer un nouveau QUE pour un prêt
   * réellement neuf (`pendingLoan.pretId` absent) — jamais pour un prêt
   * existant, `currentLoanIndex` étant recalculé par `edit_loan` en fonction
   * de la position dans `remainingLoans` et pouvant coïncider avec l'index
   * (donc l'identifiant généré) d'un autre prêt déjà présent dans `loans[]`.
   */
  private buildLoanDraft(
    state: F011State,
    remboursementAnticipe: boolean,
    iraMontant?: number,
  ): F011LoanDraft {
    return {
      pretId: state.pendingLoan?.pretId ?? `pret-${state.currentLoanIndex + 1}`,
      typePret: state.pendingLoan?.typePret ?? "amortissable",
      capitalInitial: state.pendingLoan?.capitalInitial ?? 0,
      tauxNominal: state.pendingLoan?.tauxNominal ?? 0,
      dureeMois: state.pendingLoan?.dureeMois ?? 0,
      datePremiereMensualite: state.pendingLoan?.datePremiereMensualite ?? `${this.ctx.fiscalYear}-01-01`,
      assuranceType: state.pendingLoan?.assuranceType,
      assuranceAnnuelle: state.pendingLoan?.assuranceAnnuelle,
      typeGarantie: state.pendingLoan?.typeGarantie,
      commissionCaution: state.pendingLoan?.commissionCaution,
      souscritCetExercice: state.pendingLoan?.souscritCetExercice,
      fraisDossier: state.pendingLoan?.fraisDossier,
      remboursementAnticipeCetExercice: remboursementAnticipe,
      iraMontant: remboursementAnticipe ? iraMontant : undefined,
    };
  }

  /** Utilisé par `set_ira` (première fois), `resume` et `go_back` (reprise sur `loan_review`) — jamais divergent. */
  private buildLoanPreviewMessage(loans: F011LoanDraft[], draft: F011LoanDraft): F011Message {
    const preview = this.computeForLoans([...loans, draft]);
    const pretPreview = preview.charges.prets.at(-1);
    return {
      role: "assistant",
      content:
        `Intérêts déductibles de l'exercice : ${Math.round(pretPreview?.interetsEmpruntExercice ?? 0).toLocaleString("fr-FR")} €\n` +
        `dont pré-exploitation (non déductibles) : ${Math.round(pretPreview?.interetsPreExploitation ?? 0).toLocaleString("fr-FR")} €\n` +
        `Assurance déductible : ${Math.round(pretPreview?.assuranceEmpruntExercice ?? 0).toLocaleString("fr-FR")} €\n` +
        `Frais de dossier déductibles : ${Math.round(pretPreview?.fraisDossierDeductibles ?? 0).toLocaleString("fr-FR")} €\n` +
        `Garantie déductible : ${Math.round(pretPreview?.garantieDeductible ?? 0).toLocaleString("fr-FR")} €\n` +
        `IRA déductible : ${Math.round(pretPreview?.iraDeductible ?? 0).toLocaleString("fr-FR")} €\n` +
        `Capital remboursé (non déductible) : ${Math.round(pretPreview?.capitalRembourseExercice ?? 0).toLocaleString("fr-FR")} €\n` +
        `CRD au 31/12 : ${Math.round(pretPreview?.capitalRestantDu31_12 ?? 0).toLocaleString("fr-FR")} €`,
      suggestions: [{ id: "confirm_loan", label: "Valider ce prêt" }],
    };
  }

  /**
   * Écran `aggregate_review` — toujours recalculé depuis les prêts fournis,
   * jamais depuis un résultat mis en cache (Cycle 3 #3). Propose une
   * correction par prêt (Cycle 3 #2), jamais seulement sa confirmation.
   */
  private buildAggregateReviewMessages(loans: F011LoanDraft[]): { result: F011Result; messages: F011Message[] } {
    const result = this.buildResult(loans);
    const editSuggestions: F011Suggestion[] = loans.map((loan, index) => ({
      id: `edit_loan:${loan.pretId}`,
      label: `Modifier le prêt ${index + 1}`,
    }));
    return {
      result,
      messages: [
        { role: "assistant", content: result.explanation },
        {
          role: "assistant",
          content: "Ces montants vous conviennent-ils ?",
          suggestions: [{ id: "confirm_all", label: "Oui, je valide" }, ...editSuggestions],
        },
      ],
    };
  }

  /**
   * Écran `loan_review_extraction` (Cycle 5, revu Cycle 6 §1/§8) — montre
   * l'état courant du prêt en cours de saisie (valeur + provenance), et les
   * conflits restants avec une réponse déjà connue. Jamais un champ absent
   * affiché comme s'il existait (§4/§5) : seuls les champs `!== undefined`
   * dans `pendingLoan` apparaissent, et seuls ceux dont la source est
   * `"extracted"` sont annoncés comme venant du document (un champ confirmé
   * puis corrigé manuellement ne doit pas rester étiqueté "extrait"). Utilisé
   * par `analysis_success`, `resolve_conflict`, et par `buildReentryTurn`
   * (resume/go_back) — une seule implémentation, jamais divergente.
   */
  private buildReviewExtractionMessage(
    pendingLoan: Partial<F011LoanDraft>,
    fieldSources: Partial<Record<string, FieldSource>>,
    conflicts: F011PrefillConflict[],
  ): F011Message {
    const conflictFields = new Set(conflicts.map((c) => c.field));
    const foundLines = F011_PREFILL_FIELD_KEYS.filter(
      (key) => !conflictFields.has(key) && pendingLoan[key] !== undefined && fieldSources[key] === "extracted",
    ).map((key) => `${FIELD_LABELS[key]} : ${formatPrefillValue(key, pendingLoan[key])} (extrait du document)`);

    if (conflicts.length === 0) {
      return {
        role: "assistant",
        content:
          foundLines.length > 0
            ? `Voici ce que j'ai trouvé dans votre document :\n${foundLines.join("\n")}`
            : "Le document n'a permis d'extraire aucune donnée exploitable pour ce prêt — je vais vous poser les questions manuellement.",
        suggestions: [
          // Cycle 6 §8 — "Tout confirmer" seulement quand il y a effectivement
          // quelque chose à confirmer ; sinon on ne fait qu'enchaîner ("Continuer").
          { id: "confirm_extraction", label: foundLines.length > 0 ? "Tout confirmer" : "Continuer" },
          // Document → document (Cycle 5 §Q) : réutilise `choose_loan_source`
          // (patch vide) plutôt que GO_BACK — GO_BACK défait la fusion de CE
          // document et perdrait ses champs ; ici on en ajoute un second par-dessus.
          { id: "source_document", label: "Importer un autre document pour ce prêt" },
        ],
      };
    }

    const conflictLines = conflicts.map(
      (c) =>
        `${FIELD_LABELS[c.field]} : vous aviez indiqué ${formatPrefillValue(c.field, c.existingValue)} ` +
        `(${describeSource(fieldSources[c.field])}), le document indique ${formatPrefillValue(c.field, c.incomingValue)}.`,
    );
    const conflictSuggestions: F011Suggestion[] = conflicts.flatMap((c) => [
      { id: `keep_existing:${c.field}`, label: `Garder ma réponse (${FIELD_LABELS[c.field]})` },
      { id: `use_document:${c.field}`, label: `Utiliser le document (${FIELD_LABELS[c.field]})` },
    ]);
    return {
      role: "assistant",
      content:
        (foundLines.length > 0 ? `Voici ce que j'ai trouvé dans votre document :\n${foundLines.join("\n")}\n\n` : "") +
        `Certaines valeurs diffèrent de ce que vous aviez déjà indiqué :\n${conflictLines.join("\n")}`,
      suggestions: conflictSuggestions,
    };
  }

  /**
   * Reconstruit le message à afficher pour un état donné (déjà positionné au
   * bon `step`) — utilisé par `resume` (reprise après refresh) et `go_back`
   * (navigation arrière en session), pour qu'une même étape produise
   * toujours exactement la même relance, jamais deux implémentations qui
   * divergent (Cycle 3 #1 : "un seul mécanisme").
   */
  private buildReentryTurn(state: F011State): { state: F011State; messages: F011Message[] } {
    const total = state.nombrePrets ?? 1;

    if (state.step === "blocked_missing_date") {
      return { state, messages: [blockedMissingDatePrompt()] };
    }

    if (state.step === "loan_review" && state.pendingLoan) {
      const draft = state.pendingLoan as F011LoanDraft;
      return { state, messages: [this.buildLoanPreviewMessage(state.loans, draft)] };
    }

    if (state.step === "aggregate_review") {
      const { result, messages } = this.buildAggregateReviewMessages(state.loans);
      return { state: { ...state, result }, messages };
    }

    if (state.step === "loan_review_extraction") {
      return {
        state,
        messages: [
          this.buildReviewExtractionMessage(state.pendingLoan ?? {}, state.fieldSources, state.extractionConflicts ?? []),
        ],
      };
    }

    const stepPrompt: Partial<Record<F011State["step"], F011Message>> = {
      presence_emprunt: presencePrompt(),
      nombre_prets: NOMBRE_PRETS_PROMPT,
      loan_source_choice: loanSourceChoicePrompt(state.currentLoanIndex, total),
      loan_upload: uploadPrompt(),
      loan_analyzing: analyzingPrompt(),
      loan_type: loanTypePrompt(state.currentLoanIndex, total),
      loan_collect: loanPrompt(state.currentLoanIndex, total),
      loan_insurance: insurancePrompt(),
      loan_guarantee: guaranteePrompt(state.detectedGuaranteeFees),
      loan_fees: feesPrompt(this.ctx.fiscalYear),
      loan_ira: iraPrompt(this.ctx.fiscalYear),
    };

    const prompt = stepPrompt[state.step];
    return { state, messages: prompt ? [prompt] : [] };
  }

  private computeForLoans(loans: F011LoanDraft[]) {
    const dateMiseEnService = this.deps.dateMiseEnService;
    if (!dateMiseEnService) {
      throw new Error(
        "F011: dateMiseEnService requis pour calculer les charges de financement — précondition F-009 non satisfaite.",
      );
    }
    return computeFinancementExercice({
      exerciceFiscal: this.ctx.fiscalYear,
      dateMiseEnService,
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
        fraisDossier: loan.fraisDossier,
        garantieDeductible: loan.typeGarantie === "caution" ? loan.commissionCaution : undefined,
        iraDeductible: loan.remboursementAnticipeCetExercice ? loan.iraMontant : undefined,
        anneeSouscription: loan.souscritCetExercice ? this.ctx.fiscalYear : undefined,
      })),
    });
  }

  private buildResult(loans: F011LoanDraft[]): F011Result {
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

export {
  resolveNextMissingF011Field,
  resolveNextF011LoanStepAfterReview,
  F011_CORE_LOAN_FIELD_ORDER,
} from "./resolve-next-f011-loan-step";
export { createInitialF011State, toF011PersistedState, shouldResumeF011 };
export type {
  F011Action,
  F011AssistantTurn,
  F011Deps,
  F011HistorySnapshot,
  F011LoanDraft,
  F011Message,
  F011PendingExtraction,
  F011PersistedState,
  F011Result,
  F011State,
  F011Step,
  F011Suggestion,
  TypeGarantie,
} from "./types";
