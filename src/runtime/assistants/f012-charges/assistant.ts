import {
  buildCategoryInventory,
  computeChargesExercice,
} from "../../capabilities/f012/compute-charges-exercice";
import type { CoproLigneInput } from "../../capabilities/f012/compute-copro-deductible";
import { detectFinancementOverlap } from "../../capabilities/f012/detect-financement-overlap";
import { mapChoixToNature } from "../../capabilities/f012/qualify-travail";
import type { NatureIntervention } from "../../capabilities/f012/types";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import { explainCharges } from "../../presentation/explain-charges";
import { validateCharges } from "../../capabilities/f012/validate-charges";
import { familyIdForCategory, type ChargeFamilyId } from "../../capabilities/f012/charge";
import { incompleteCoverages } from "../../capabilities/f012/family-coverage";
import {
  applyAssurancesReview,
  applyGestionReview,
  applyImpotsReview,
  applySyndicReview,
  decideProposalGroup,
  isDocumentAlreadyAnalyzed,
  reconcileReviewConflicts,
  resolveDocumentConflict,
} from "./apply-document-review";
import {
  isDocumentaryFamily,
  missingDocumentFieldMessage,
  paperInviteMessage,
  type ChargeProposal,
  type DocumentAmountConflict,
} from "./charge-proposal";
import {
  canConfirmAll,
  confirmAllProposals,
  conflictMessage,
  everydayProposalNote,
  everydayProposalTitle,
  hasBlockingPendingDecisions,
  hasMissingRecordableAmount,
  reviewRecap,
  reviewRecapMessage,
} from "./document-review-decisions";
import {
  FAMILY_CARD_TITLES,
  FAMILY_TO_CATEGORIES,
  assuranceCreditAlreadyHandledNote,
  buildFamilyInventory,
  completenessSuggestions,
  coverageCompletenessPrompt,
  familyActionLabels,
  familyCardPhrase,
  familyCardPrompt,
  familyUnknownHelp,
  firstIncompleteFamilyIndex,
  foreignFamilyLockMessage,
  nextFamilyIndexToVisit,
  paperReservedMessage,
} from "./family-ux";
import {
  chargesDeclaredRecordedMessage,
  reviewConfirmContent,
  unresolvedCoverageAnomalies,
  unresolvedFamilyLabels,
  visibleWarningText,
} from "./completeness-honesty";
import { collectedToChargeRegistry } from "./collected-to-registry";
import {
  applyFamilyExpenses,
  ensureFamilyInInventories,
  structuredAssuranceExpenses,
  structuredAutresExpenses,
  structuredGestionExpenses,
  structuredImpotsExpenses,
  structuredSyndicExpenses,
} from "./family-expense-apply";
import {
  detectFamilySignals,
  inferFamilyFromFiletText,
  isAmbiguousAmountText,
  parseFamilyExpenseMentionsBounded,
  type ParsedExpense,
} from "./family-expense-parse";
import {
  markSlotNudge,
  maybeOfferSlotNudge,
  slotNudgePrompt,
  syncFilledSlotNudges,
} from "./slot-nudge";
import {
  clearFamilyCoverageIntent,
  clearFamilyCoverageIntents,
  markFamilyNone,
  markFamilyReviewedEmpty,
  markFamilyUnknown,
} from "./family-coverage-intents";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import {
  createInitialF012State,
  hasBlockingAnomaly,
  shouldResumeF012,
  snapshotF012State,
  toF012PersistedState,
  type F012Action,
  type F012AssistantTurn,
  type F012CategoryId,
  type F012Deps,
  type F012Message,
  type F012PersistedState,
  type F012State,
  type F012TravauxDraft,
} from "./types";
import {
  amountPaidLabel,
  amountWhereToLook,
  categoryLabel,
  categoryQuestion,
  fondsTravauxExplanation,
  incompleteCoverageResume,
  profilagePrompt as profilageCopy,
  resumeAck,
  travauxIncertainAck,
  travauxQualificationPrompt as travauxQualificationCopy,
  unknownCategoryHelp,
} from "./ux-copy";

const PROFILAGE_SUGGESTIONS = [
  { id: "profil_submit", label: "Valider le profil (démo)" },
];

const QUALIFICATION_SUGGESTIONS = [
  { id: "reparation_identique", label: "Remplacé ou réparé à l'identique" },
  { id: "amelioration", label: "Amélioré par rapport à avant" },
  { id: "mixte", label: "Les deux à la fois (même facture)" },
  { id: "incertain", label: "Je ne suis pas certain" },
];

const UNKNOWN_AND_SKIP: F012Message["suggestions"] = [
  { id: "unknown_category", label: "Je ne sais pas" },
  { id: "skip_category", label: "Passer" },
];

function profilagePrompt(year: number, knownCopropriete?: boolean): F012Message {
  return {
    role: "assistant",
    content: profilageCopy(year, { copropriete: knownCopropriete }),
    suggestions: PROFILAGE_SUGGESTIONS,
  };
}

function categoryPrompt(categoryId: F012CategoryId, year: number): F012Message {
  const where = amountWhereToLook(categoryId);
  const amountLine =
    categoryId === "divers" || categoryId === "travaux"
      ? ""
      : `\n\n${amountPaidLabel(year)}${where ? `\n${where}` : ""}`;

  switch (categoryId) {
    case "travaux":
      return {
        role: "assistant",
        content:
          `${categoryQuestion(categoryId, year)}\n\n` +
          `${amountPaidLabel(year)}\n` +
          `${where ?? ""}`,
        suggestions: [
          { id: "unknown_category", label: "Je ne sais pas" },
          { id: "finish_travaux", label: "Passer" },
        ],
      };
    case "divers":
      return {
        role: "assistant",
        content: categoryQuestion(categoryId, year),
        suggestions: [
          { id: "unknown_category", label: "Je ne sais pas" },
          { id: "skip_category", label: "Non, continuer" },
        ],
      };
    default:
      return {
        role: "assistant",
        content: `${categoryQuestion(categoryId, year)}${amountLine}`,
        suggestions: UNKNOWN_AND_SKIP,
      };
  }
}

function travauxDescriptionPrompt(): F012Message {
  return {
    role: "assistant",
    content: "Décrivez la dépense (ex. « remplacement chauffe-eau ») et son montant.",
  };
}

function travauxQualificationPrompt(): F012Message {
  return {
    role: "assistant",
    content: travauxQualificationCopy(),
    suggestions: QUALIFICATION_SUGGESTIONS,
  };
}

function travauxSplitPrompt(): F012Message {
  return { role: "assistant", content: "Pouvez-vous estimer la part remise en état (€) ?" };
}

function confirmAllPrompt(unresolvedLabels: string[] = []): F012Message {
  const suggestions: Array<{ id: string; label: string }> = [];
  if (unresolvedLabels.length > 0) {
    suggestions.push({
      id: "revisit_incomplete",
      label: "Revenir sur les informations à clarifier",
    });
  }
  suggestions.push({ id: "confirm_all", label: "Oui, je valide" });
  return {
    role: "assistant",
    content: reviewConfirmContent(unresolvedLabels),
    suggestions,
  };
}

/** Cycle 2 — miroir de `resumeAckPrompt` (F-011) : compte les catégories déjà renseignées. */
function resumeAckPrompt(persisted: F012PersistedState, year: number): F012Message {
  return { role: "assistant", content: resumeAck(year, persisted.currentCategoryIndex) };
}

function familiesTouchedByCategoryInput(input: {
  taxeFonciere?: number;
  assurancePno?: number;
  assuranceGli?: number;
  coproLignes?: CoproLigneInput[];
  honorairesGestion?: number;
  fraisEtatDesLieux?: number;
  honorairesComptable?: number;
  fraisBancaires?: number;
  diversItem?: unknown;
}): ChargeFamilyId[] {
  const ids: ChargeFamilyId[] = [];
  if (input.taxeFonciere !== undefined) ids.push("impots");
  if (input.assurancePno !== undefined || input.assuranceGli !== undefined) ids.push("assurances");
  if (input.coproLignes) ids.push("syndic");
  if (
    input.honorairesGestion !== undefined ||
    input.fraisEtatDesLieux !== undefined ||
    input.honorairesComptable !== undefined
  ) {
    ids.push("gestion");
  }
  if (input.fraisBancaires !== undefined || input.diversItem) ids.push("autres");
  return ids;
}

function choixToNature(choix: string): NatureIntervention | undefined {
  const mapped = mapChoixToNature(choix as Parameters<typeof mapChoixToNature>[0]);
  if (mapped === "mixte") return "entretien";
  return mapped ?? undefined;
}

export class F012ChargesAssistant {
  constructor(
    private readonly ctx: RuntimeContext,
    private readonly deps: F012Deps = {},
  ) {}

  start(): F012AssistantTurn {
    return {
      state: createInitialF012State(),
      messages: [profilagePrompt(this.ctx.fiscalYear, this.deps.knownCopropriete)],
      completed: false,
    };
  }

  /**
   * Cycle 2 — reconstruit l'état conversationnel depuis un `F012PersistedState`
   * et redemande exactement l'écran où l'utilisateur en était. Ne rejoue jamais
   * un résultat calculé persisté : `aggregate_review` recalcule via `buildResult`
   * à partir des charges déjà saisies (`collected`). Miroir de
   * `F011FinancementAssistant.resume`.
   */
  resume(persisted: F012PersistedState): F012AssistantTurn {
    const baseState: F012State = {
      step: persisted.step,
      profil: persisted.profil,
      categoryInventory: persisted.categoryInventory,
      currentCategoryIndex: persisted.currentCategoryIndex,
      collected: persisted.collected,
      pendingTravaux: persisted.pendingTravaux,
      queuedTravaux: persisted.queuedTravaux,
      pendingFamilyFreeText: persisted.pendingFamilyFreeText,
      pendingSlotNudge: persisted.pendingSlotNudge,
      travauxSubStep: persisted.travauxSubStep,
      fieldSources: persisted.fieldSources,
      history: persisted.history,
      familyInventory: persisted.familyInventory,
      currentFamilyIndex: persisted.currentFamilyIndex,
      familyPhase: persisted.familyPhase,
      documentReview: persisted.documentReview,
      analyzedDocumentIds: persisted.analyzedDocumentIds,
    };

    const reentry = this.buildReentryTurn(baseState);
    const incomplete = this.incompleteResumeMessage(baseState);
    return {
      state: reentry.state,
      messages: [
        resumeAckPrompt(persisted, this.ctx.fiscalYear),
        ...(incomplete ? [incomplete] : []),
        ...reentry.messages,
      ],
      completed: false,
    };
  }

  /**
   * Cycle 4E — GO_BACK. Point d'entrée public unique : instrumente `dispatch`
   * (le state machine inchangé) pour empiler un `F012HistorySnapshot` chaque
   * fois qu'une vraie transition a lieu, sans toucher aux ~15 points de
   * retour individuels du switch. Fonctionne parce que chaque case qui
   * transitionne réellement construit un nouvel objet d'état (`{...state, ...}`),
   * alors que chaque garde/no-op déjà existant (montant absent, capital de
   * prêt refusé, "Terminer" pendant qualification/split…) renvoie
   * systématiquement la même référence `state` — l'égalité de référence
   * suffit donc à distinguer une transition d'un no-op. `restart` reste
   * délibérément en dehors de ce mécanisme : toujours destructif, jamais
   * d'historique conservé.
   */
  async handle(state: F012State, action: F012Action): Promise<F012AssistantTurn> {
    if (action.type === "go_back") return this.handleGoBack(state);

    const current = this.skipPendingNudgeIfContinuing(state, action);
    const turn = await this.dispatch(current, action);
    if (action.type === "restart" || turn.state === state) return turn;

    return {
      ...turn,
      state: { ...turn.state, history: [...(state.history ?? []), snapshotF012State(state)] },
    };
  }

  /**
   * Cycle 13A — une relance ne bloque pas les tests/parcours qui enchaînent
   * déjà l'action suivante. Continuer sans répondre = declined, une seule fois.
   */
  private skipPendingNudgeIfContinuing(state: F012State, action: F012Action): F012State {
    const pending = state.pendingSlotNudge;
    if (!pending) return state;
    if (action.type === "respond_slot_nudge" || action.type === "restart") return state;
    if (pending === "gli" && (action.type === "submit_family_assurance" || action.type === "submit_assurance_gli")) {
      return { ...state, pendingSlotNudge: undefined };
    }
    if (
      pending === "comptable" &&
      (action.type === "submit_family_gestion" || action.type === "submit_comptable")
    ) {
      return { ...state, pendingSlotNudge: undefined };
    }
    const declined: F012State = {
      ...state,
      pendingSlotNudge: undefined,
      familyPhase: state.familyPhase === "slot_nudge" ? "card" : state.familyPhase,
      collected: markSlotNudge(state.collected, pending, "declined"),
    };
    return this.advancePastCurrentFamily(declined, []).state;
  }

  /**
   * Cycle 4E — restaure exactement l'état quitté (jamais un résultat en
   * cache : `buildReentryTurn` recalcule toujours `aggregate_review`).
   * `collected`/`fieldSources` proviennent du même snapshot atomique — pas
   * de réconciliation de provenance après coup nécessaire (contrairement à
   * F-011, dont `pendingLoan` et `fieldSources` peuvent diverger sur un
   * prêt en cours de saisie multi-champs).
   */
  private handleGoBack(state: F012State): F012AssistantTurn {
    const history = state.history ?? [];
    if (history.length === 0) {
      return { state, messages: [], completed: false };
    }

    const previous = history[history.length - 1]!;
    const restored: F012State = {
      ...state,
      step: previous.step,
      profil: previous.profil,
      categoryInventory: previous.categoryInventory,
      currentCategoryIndex: previous.currentCategoryIndex,
      collected: previous.collected,
      pendingTravaux: previous.pendingTravaux,
      queuedTravaux: previous.queuedTravaux,
      pendingFamilyFreeText: previous.pendingFamilyFreeText,
      pendingSlotNudge: previous.pendingSlotNudge,
      travauxSubStep: previous.travauxSubStep,
      fieldSources: previous.fieldSources,
      familyInventory: previous.familyInventory,
      currentFamilyIndex: previous.currentFamilyIndex,
      familyPhase: previous.familyPhase,
      documentReview: previous.documentReview,
      analyzedDocumentIds: previous.analyzedDocumentIds,
      result: undefined,
      history: history.slice(0, -1),
    };

    const messages: F012Message[] = [{ role: "user", content: "← Précédent" }];
    const reentry = this.buildReentryTurn(restored);
    messages.push(...reentry.messages);
    return { state: reentry.state, messages, completed: false };
  }

  private async dispatch(state: F012State, action: F012Action): Promise<F012AssistantTurn> {
    const messages: F012Message[] = [];

    switch (action.type) {
      case "restart":
        return this.start();

      case "submit_profilage": {
        const profil = {
          copropriete: action.copropriete,
          agence: action.agence,
          travaux: action.travaux,
          vacance: action.vacance,
          comptable: action.comptable,
        };
        const inventory = buildCategoryInventory(profil) as F012CategoryId[];
        const familyInventory = buildFamilyInventory(profil);
        messages.push({
          role: "user",
          content:
            `Syndic : ${action.copropriete ? "oui" : "non"} — ` +
            `Agence / comptable / logiciel : ${action.agence || action.comptable ? "oui" : "non"} — ` +
            `Travaux : ${action.travaux ? "oui" : "non"}`,
        });
        const first = inventory[0];
        if (!first) {
          return this.buildReview(state, profil, inventory, messages);
        }
        const firstFamily = familyInventory[0];
        messages.push({
          role: "assistant",
          content: firstFamily
            ? `Nous allons passer en revue ${familyInventory.length} sujets. Commençons par : ${FAMILY_CARD_TITLES[firstFamily]}.`
            : `Commençons par : ${categoryLabel(first)}.`,
        });
        if (firstFamily) {
          messages.push(this.familyCardMessage(firstFamily));
        } else {
          messages.push(categoryPrompt(first, this.ctx.fiscalYear));
        }
        return {
          state: {
            ...state,
            profil,
            categoryInventory: inventory,
            currentCategoryIndex: 0,
            familyInventory,
            currentFamilyIndex: 0,
            familyPhase: "card",
            step: "category_collect",
          },
          messages,
          completed: false,
        };
      }

      case "skip_category":
        return this.advanceCategory(state, messages, { skipped: true });

      case "unknown_category": {
        const currentId = state.categoryInventory[state.currentCategoryIndex];
        if (state.step !== "category_collect" || !currentId) {
          return { state, messages, completed: false };
        }
        const reason = action.reason ?? "unsure";
        messages.push({
          role: "user",
          content: reason === "document_missing" ? "Je n'ai pas le document" : "Je ne sais pas",
        });
        messages.push({
          role: "assistant",
          content: unknownCategoryHelp(currentId, this.ctx.fiscalYear),
          suggestions: [{ id: "skip_category", label: "Passer" }],
        });
        return {
          state: {
            ...state,
            collected: markFamilyUnknown(state.collected, familyIdForCategory(currentId), reason),
          },
          messages,
          completed: false,
        };
      }

      case "none_category": {
        const currentId = state.categoryInventory[state.currentCategoryIndex];
        if (state.step !== "category_collect" || !currentId) {
          return { state, messages, completed: false };
        }
        messages.push({ role: "user", content: "Rien payé cette année" });
        return this.advanceCategory(
          {
            ...state,
            collected: markFamilyNone(state.collected, familyIdForCategory(currentId)),
          },
          messages,
          { skipped: false },
        );
      }

      case "open_family_manual": {
        const familyId = this.currentFamilyId(state);
        if (!familyId) return { state, messages, completed: false };
        if (familyId === "travaux") {
          return this.dispatch({ ...state, familyPhase: "manual" }, { type: "start_travaux" });
        }
        messages.push({ role: "user", content: familyActionLabels(this.ctx.fiscalYear).amount });
        messages.push({
          role: "assistant",
          content: `${amountPaidLabel(this.ctx.fiscalYear)}\n${familyCardPhrase(familyId, this.ctx.fiscalYear)}`,
        });
        return { state: { ...state, familyPhase: "manual" }, messages, completed: false };
      }

      case "open_family_paper": {
        const familyId = this.currentFamilyId(state);
        if (!familyId) return { state, messages, completed: false };
        messages.push({ role: "user", content: familyActionLabels(this.ctx.fiscalYear).paper });
        if (isDocumentaryFamily(familyId)) {
          messages.push({
            role: "assistant",
            content: `${paperInviteMessage(familyId)}\n\nVous pouvez aussi indiquer le montant sans document.`,
          });
          return { state: { ...state, familyPhase: "paper" }, messages, completed: false };
        }
        messages.push({
          role: "assistant",
          content: paperReservedMessage(),
          suggestions: [{ id: "continue_after_unknown", label: "Continuer" }],
        });
        return {
          state: {
            ...state,
            familyPhase: "paper",
            collected: markFamilyUnknown(state.collected, familyId, "later"),
          },
          messages,
          completed: false,
        };
      }

      case "receive_document_proposals": {
        if (isDocumentAlreadyAnalyzed(state.analyzedDocumentIds, action.documentId)) {
          messages.push({
            role: "assistant",
            content: "Ce document a déjà été lu. Nous n'avons rien ajouté une seconde fois.",
          });
          return {
            state: {
              ...state,
              familyPhase: "review",
              documentReview: state.documentReview,
            },
            messages,
            completed: false,
          };
        }
        const draftReview = {
          documentId: action.documentId,
          familyId: action.familyId,
          proposals: action.proposals,
          fileName: action.fileName,
        };
        const conflicts = reconcileReviewConflicts({
          collected: state.collected,
          review: draftReview,
          fiscalYear: this.ctx.fiscalYear,
        });
        messages.push({
          role: "assistant",
          content: this.documentReviewMessage(action.proposals, conflicts),
        });
        return {
          state: {
            ...state,
            familyPhase: "review",
            documentReview: { ...draftReview, conflicts },
            analyzedDocumentIds: [...(state.analyzedDocumentIds ?? []), action.documentId],
          },
          messages,
          completed: false,
        };
      }

      case "confirm_proposal":
      case "modify_proposal":
      case "ignore_proposal":
      case "fill_proposal_manual": {
        if (!state.documentReview) return { state, messages, completed: false };
        const decision =
          action.type === "ignore_proposal"
            ? "ignored"
            : action.type === "confirm_proposal"
              ? "confirmed"
              : "modified";
        const amount = action.type === "confirm_proposal" || action.type === "ignore_proposal" ? undefined : action.amount;
        const ignoreReason = action.type === "ignore_proposal" ? action.reason : undefined;
        const proposals = decideProposalGroup(
          state.documentReview.proposals,
          action.proposalId,
          decision,
          amount,
          ignoreReason,
        );
        const review = { ...state.documentReview, proposals };
        return {
          state: {
            ...state,
            documentReview: {
              ...review,
              conflicts: reconcileReviewConflicts({
                collected: state.collected,
                review,
                fiscalYear: this.ctx.fiscalYear,
              }),
            },
          },
          messages,
          completed: false,
        };
      }

      case "confirm_all_proposals": {
        if (!state.documentReview) return { state, messages, completed: false };
        if (!canConfirmAll(state.documentReview.proposals, state.documentReview.conflicts)) {
          messages.push({
            role: "assistant",
            content: "Certaines lignes restent à vérifier. Je ne peux pas tout confirmer d'un coup.",
          });
          return { state, messages, completed: false };
        }
        const proposals = confirmAllProposals(state.documentReview.proposals);
        return {
          state: { ...state, documentReview: { ...state.documentReview, proposals } },
          messages,
          completed: false,
        };
      }

      case "resolve_document_conflict": {
        if (!state.documentReview) return { state, messages, completed: false };
        const conflicts = resolveDocumentConflict(
          state.documentReview.conflicts ?? [],
          action.choice,
          action.label,
        );
        return {
          state: { ...state, documentReview: { ...state.documentReview, conflicts } },
          messages,
          completed: false,
        };
      }

      case "commit_document_review": {
        if (!state.documentReview) return { state, messages, completed: false };
        const review = state.documentReview;
        if (hasBlockingPendingDecisions(review.proposals)) {
          messages.push({
            role: "assistant",
            content: "Il reste des lignes à vérifier avant d'enregistrer.",
          });
          return { state, messages, completed: false };
        }
        if (hasMissingRecordableAmount(review.proposals)) {
          messages.push({
            role: "assistant",
            content: missingDocumentFieldMessage(),
          });
          return { state, messages, completed: false };
        }
        const applied =
          review.familyId === "impots"
            ? applyImpotsReview({ collected: state.collected, review, fiscalYear: this.ctx.fiscalYear })
            : review.familyId === "assurances"
              ? applyAssurancesReview({ collected: state.collected, review, fiscalYear: this.ctx.fiscalYear })
              : review.familyId === "gestion"
                ? applyGestionReview({ collected: state.collected, review, fiscalYear: this.ctx.fiscalYear })
                : applySyndicReview({ collected: state.collected, review });
        if (applied.outcome === "blocked_conflict") {
          const open = (review.conflicts ?? []).find(
            (conflict) => conflict.choice !== "keep_existing" && conflict.choice !== "use_document",
          );
          messages.push({
            role: "assistant",
            content: open ? conflictMessage(open) : "Deux montants différents : choisissez lequel garder.",
          });
          return { state, messages, completed: false };
        }
        if (applied.outcome === "out_of_year") {
          messages.push({
            role: "assistant",
            content: "Ce paiement n'appartient pas à cet exercice. Je n'inscris pas de montant.",
          });
          return { state, messages, completed: false };
        }
        if (applied.outcome === "all_ignored") {
          messages.push({ role: "user", content: "Lignes non comptées" });
          return this.advancePastCurrentFamily(
            {
              ...state,
              collected: markFamilyReviewedEmpty(applied.collected, review.familyId),
              familyPhase: "card",
              documentReview: undefined,
            },
            messages,
          );
        }
        if (applied.outcome === "missing" || !applied.wroteCharge) {
          messages.push({
            role: "assistant",
            content: missingDocumentFieldMessage(),
          });
          return { state, messages, completed: false };
        }
        const collected = clearFamilyCoverageIntents(applied.collected, [review.familyId]);
        const next = {
          ...state,
          collected,
          fieldSources: {
            ...state.fieldSources,
            ...(review.familyId === "impots"
              ? { taxe_fonciere: applied.provenance ?? "extracted" }
              : review.familyId === "assurances"
                ? {
                    ...(applied.collected.assurancePno !== undefined
                      ? { assurance_pno: applied.provenance ?? "extracted" }
                      : {}),
                    ...(applied.collected.assuranceGli !== undefined
                      ? { assurance_gli: applied.provenance ?? "extracted" }
                      : {}),
                  }
                : review.familyId === "gestion"
                  ? {
                      ...(applied.collected.honorairesGestion !== undefined ||
                      applied.collected.fraisEtatDesLieux !== undefined
                        ? { honoraires_gestion: applied.provenance ?? "extracted" }
                        : {}),
                      ...(applied.collected.honorairesComptable !== undefined
                        ? { honoraires_comptable: applied.provenance ?? "extracted" }
                        : {}),
                    }
                  : { copropriete: applied.provenance ?? "extracted" }),
          },
          familyPhase: "card" as const,
          documentReview: undefined,
        };
        messages.push({ role: "user", content: "Lignes confirmées" });
        return this.previewAndAdvanceFamily(next, messages);
      }

      case "unknown_family": {
        const familyId = this.currentFamilyId(state);
        if (!familyId) return { state, messages, completed: false };
        const reason = action.reason ?? "unsure";
        messages.push({ role: "user", content: familyActionLabels(this.ctx.fiscalYear).unknown });
        messages.push({
          role: "assistant",
          content: familyUnknownHelp(familyId, this.ctx.fiscalYear),
          suggestions: [{ id: "continue_after_unknown", label: "Continuer" }],
        });
        return {
          state: {
            ...state,
            familyPhase: "unknown_help",
            collected: markFamilyUnknown(state.collected, familyId, reason),
          },
          messages,
          completed: false,
        };
      }

      case "none_family": {
        const familyId = this.currentFamilyId(state);
        if (!familyId) return { state, messages, completed: false };
        messages.push({ role: "user", content: `Rien payé en ${this.ctx.fiscalYear}` });
        return this.advancePastCurrentFamily(
          {
            ...state,
            collected: markFamilyNone(clearFamilyCoverageIntent(state.collected, familyId), familyId),
          },
          messages,
        );
      }

      case "continue_after_unknown": {
        const familyId = this.currentFamilyId(state);
        if (familyId && state.familyPhase === "paper" && isDocumentaryFamily(familyId)) {
          return this.advancePastCurrentFamily(
            { ...state, collected: markFamilyUnknown(state.collected, familyId, "later") },
            messages,
          );
        }
        return this.advancePastCurrentFamily(state, messages);
      }

      case "revisit_incomplete":
      case "revisit_family": {
        return this.handleRevisitFamily(
          state,
          messages,
          action.type === "revisit_family" ? action.familyId : undefined,
          action.type === "revisit_family"
            ? { freeText: action.freeText ?? state.pendingFamilyFreeText }
            : undefined,
        );
      }

      case "submit_family_impots": {
        return this.commitFamilyExpenses(state, messages, {
          familyId: "impots",
          parsed: structuredImpotsExpenses(action),
          paidAt: action.paidAt,
          freeText: action.freeText,
          userContent:
            action.taxeFonciere && action.taxeFonciere > 0
              ? `Taxe foncière : ${action.taxeFonciere.toLocaleString("fr-FR")} €`
              : "Impôts du logement",
        });
      }

      case "submit_family_syndic": {
        const turn = this.commitFamilyExpenses(state, messages, {
          familyId: "syndic",
          parsed: structuredSyndicExpenses(action),
          paidAt: action.paidAt,
          freeText: action.freeText,
          userContent: `Syndic : ${(action.montantPaye ?? 0).toLocaleString("fr-FR")} €`,
        });
        if (
          turn.state.collected.coproLignes.some((ligne) => ligne.type === "fonds_travaux") &&
          !state.collected.coproLignes.some((ligne) => ligne.type === "fonds_travaux")
        ) {
          turn.messages.push({ role: "assistant", content: fondsTravauxExplanation() });
        }
        return turn;
      }

      case "submit_family_assurance": {
        return this.commitFamilyExpenses(state, messages, {
          familyId: "assurances",
          parsed: structuredAssuranceExpenses(action),
          paidAt: action.paidAt,
          freeText: action.freeText,
          userContent: "Assurance du logement",
        });
      }

      case "submit_family_gestion": {
        const description = action.description?.trim() ?? "";
        if (description) {
          const overlap = detectFinancementOverlap({
            description,
            montant: action.honorairesGestion ?? action.honorairesComptable ?? 0,
            financementCharges: this.deps.financementCharges,
          });
          const creditFee = /frais.{0,40}(cr[eé]dit|pr[eê]t|emprunt|financement)/i.test(description);
          if (overlap.kind !== "none" || creditFee) {
            messages.push({
              role: "user",
              content: `${description} : ${(action.honorairesGestion ?? action.honorairesComptable ?? 0).toLocaleString("fr-FR")} €`,
            });
            messages.push({
              role: "assistant",
              content: "Cette dépense concerne votre prêt. Elle est déjà prise en compte dans Financement.",
            });
            return { state, messages, completed: false };
          }
        }
        const parsed = structuredGestionExpenses(action);
        return this.commitFamilyExpenses(state, messages, {
          familyId: "gestion",
          parsed,
          paidAt: action.paidAt,
          freeText: action.freeText,
          userContent: "Agence / comptable enregistré",
        });
      }

      case "submit_family_autres": {
        return this.commitFamilyExpenses(state, messages, {
          familyId: "autres",
          parsed: structuredAutresExpenses(action),
          paidAt: action.paidAt,
          freeText: action.freeText,
          userContent: "Autres dépenses enregistrées",
        });
      }

      case "submit_taxe_fonciere":
        return this.afterCategoryInput(state, messages, {
          taxeFonciere: action.montant,
          fieldKey: "taxe_fonciere",
          source: action.source,
          userContent: `Taxe foncière : ${action.montant.toLocaleString("fr-FR")} €`,
        });

      case "submit_assurance_pno":
        return this.afterCategoryInput(state, messages, {
          assurancePno: action.montant,
          fieldKey: "assurance_pno",
          source: action.source,
          userContent: `Assurance du logement : ${action.montant.toLocaleString("fr-FR")} €`,
        });

      case "submit_assurance_gli":
        return this.afterCategoryInput(state, messages, {
          assuranceGli: action.montant,
          fieldKey: "assurance_gli",
          source: action.source,
          userContent: `Assurance GLI : ${action.montant.toLocaleString("fr-FR")} €`,
        });

      case "submit_copro":
        return this.afterCategoryInput(state, messages, {
          coproLignes: action.lignes,
          fieldKey: "copropriete",
          source: action.source,
          userContent: "Charges copropriété saisies",
        });

      case "submit_gestion":
        return this.afterCategoryInput(state, messages, {
          honorairesGestion: action.honorairesGestion,
          fraisEtatDesLieux: action.fraisEtatDesLieux,
          fieldKey: "honoraires_gestion",
          source: action.source,
          userContent: `Gestion : ${action.honorairesGestion.toLocaleString("fr-FR")} €`,
        });

      case "submit_comptable":
        return this.afterCategoryInput(state, messages, {
          honorairesComptable: action.montant,
          fieldKey: "honoraires_comptable",
          source: action.source,
          userContent: `Comptable : ${action.montant.toLocaleString("fr-FR")} €`,
        });

      case "submit_frais_bancaires":
        return this.afterCategoryInput(state, messages, {
          fraisBancaires: action.montant,
          fieldKey: "frais_bancaires",
          source: action.source,
          userContent:
            action.montant > 0
              ? `Frais bancaires : ${action.montant.toLocaleString("fr-FR")} €`
              : "Pas de frais bancaires",
        });

      case "submit_divers": {
        if (action.montant <= 0) return this.advanceCategory(state, messages, { skipped: true });

        const userContent = `${action.description} : ${action.montant.toLocaleString("fr-FR")} €`;
        messages.push({ role: "user", content: userContent });

        const overlap = detectFinancementOverlap({
          description: action.description,
          montant: action.montant,
          financementCharges: this.deps.financementCharges,
        });

        if (overlap.kind === "capital_pret") {
          // Cycle 3 (AX-009) — erreur bloquante : jamais acceptée comme charge,
          // jamais silencieusement ignorée. L'utilisateur reste sur la même
          // catégorie, libre de corriger ou de passer à autre chose.
          messages.push({ role: "assistant", content: overlap.message });
          return { state, messages, completed: false };
        }

        if (overlap.kind === "assurance_emprunteur") {
          // Cycle 3 — alerte de doublon (KS F-012) : jamais bloquant, jamais
          // supprimé silencieusement — la ligne reste visible dans le
          // récapitulatif, simplement exclue du total déductible plus bas.
          messages.push({ role: "assistant", content: overlap.message });
        }

        return this.afterCategoryInput(state, messages, {
          diversItem: {
            id: `divers-${state.collected.divers.length + 1}`,
            description: action.description,
            montant: action.montant,
            financementOverlap: overlap.kind === "assurance_emprunteur" ? "assurance_emprunteur" : undefined,
          },
          fieldKey: action.description,
          source: action.source,
          userContent,
          skipUserEcho: true,
        });
      }

      case "start_travaux":
        messages.push(travauxDescriptionPrompt());
        return {
          state: { ...state, travauxSubStep: "description", pendingTravaux: {} },
          messages,
          completed: false,
        };

      case "submit_travaux_description": {
        messages.push({
          role: "user",
          content: `${action.description} — ${action.montant.toLocaleString("fr-FR")} €`,
        });
        messages.push(travauxQualificationPrompt());
        return {
          state: {
            ...state,
            pendingTravaux: {
              id: `travaux-${state.collected.travaux.length + 1}`,
              description: action.description,
              montant: action.montant,
            },
            travauxSubStep: "qualification",
          },
          messages,
          completed: false,
        };
      }

      case "submit_travaux_qualification": {
        if (!state.pendingTravaux?.description || state.pendingTravaux.montant === undefined) {
          // Correctif Cycle 4B1 — `!montant` traitait un montant de 0 comme
          // absent ; 0 est une valeur présente (ex. dépense entièrement
          // remboursée), seule l'absence réelle du champ doit bloquer ici.
          return { state, messages, completed: false };
        }
        messages.push({ role: "user", content: QUALIFICATION_SUGGESTIONS.find((s) => s.id === action.choix)?.label ?? action.choix });

        if (action.choix === "mixte") {
          messages.push(travauxSplitPrompt());
          return {
            state: {
              ...state,
              pendingTravaux: { ...state.pendingTravaux, choix: action.choix },
              travauxSubStep: "split",
            },
            messages,
            completed: false,
          };
        }

        const natureIntervention = choixToNature(action.choix);
        const draft: F012TravauxDraft = {
          id: state.pendingTravaux.id!,
          description: state.pendingTravaux.description,
          montant: state.pendingTravaux.montant,
          choix: action.choix,
          ...(natureIntervention ? { natureIntervention } : {}),
        };
        const collected = clearFamilyCoverageIntents(
          { ...state.collected, travaux: [...state.collected.travaux, draft] },
          ["travaux"],
        );
        return this.afterTravauxRecorded(state, messages, collected, draft, {
          event:
            draft.natureIntervention !== undefined && draft.natureIntervention !== "entretien"
              ? "COMPOSANT_NOUVEAU"
              : undefined,
        });
      }

      case "submit_travaux_split": {
        if (!state.pendingTravaux?.description || state.pendingTravaux.montant === undefined) {
          // Correctif Cycle 4B1 — `!montant` traitait un montant de 0 comme
          // absent ; 0 est une valeur présente (ex. dépense entièrement
          // remboursée), seule l'absence réelle du champ doit bloquer ici.
          return { state, messages, completed: false };
        }
        const draft: F012TravauxDraft = {
          id: state.pendingTravaux.id!,
          description: state.pendingTravaux.description,
          montant: state.pendingTravaux.montant,
          choix: "mixte",
          natureIntervention: "entretien",
          montantReparation: action.montantReparation,
        };
        const collected = clearFamilyCoverageIntents(
          { ...state.collected, travaux: [...state.collected.travaux, draft] },
          ["travaux"],
        );
        messages.push({
          role: "user",
          content: `Part réparation : ${action.montantReparation.toLocaleString("fr-FR")} €`,
        });
        return this.afterTravauxRecorded(state, messages, collected, draft, { event: "COMPOSANT_NOUVEAU" });
      }

      case "finish_travaux_category": {
        if (state.travauxSubStep === "qualification" || state.travauxSubStep === "split") {
          const reentry = this.buildReentryTurn(state);
          return { state: reentry.state, messages: [...messages, ...reentry.messages], completed: false };
        }
        if (this.currentFamilyId(state) === "travaux") {
          return this.advancePastCurrentFamily(state, messages);
        }
        return this.advanceCategory(state, messages, { skipped: false });
      }

      case "respond_slot_nudge": {
        if (state.pendingSlotNudge !== action.slot) {
          return { state, messages, completed: false };
        }
        messages.push({
          role: "user",
          content: action.accepted
            ? action.montant && action.montant > 0
              ? `${action.montant.toLocaleString("fr-FR")} €`
              : "Oui"
            : "Non",
        });
        if (!action.accepted) {
          return this.previewAndAdvanceFamily(
            {
              ...state,
              pendingSlotNudge: undefined,
              familyPhase: "card",
              collected: markSlotNudge(state.collected, action.slot, "declined"),
            },
            messages,
          );
        }
        if (action.montant === undefined || !(action.montant > 0)) {
          messages.push({
            role: "assistant",
            content: amountPaidLabel(this.ctx.fiscalYear),
          });
          return { state, messages, completed: false };
        }
        const familyId = action.slot === "gli" ? "assurances" : "gestion";
        const parsed: ParsedExpense[] =
          action.slot === "gli"
            ? [{ amount: action.montant, description: "Loyers impayés", kind: "assurance_gli" }]
            : [{ amount: action.montant, description: "Comptable ou logiciel", kind: "honoraires_comptable" }];
        const applied = applyFamilyExpenses({
          collected: state.collected,
          familyId,
          exercise: this.ctx.fiscalYear,
          parsed,
          financementCharges: this.deps.financementCharges,
        });
        const collected = markSlotNudge(syncFilledSlotNudges(applied.collected), action.slot, "filled");
        return this.previewAndAdvanceFamily(
          {
            ...state,
            collected,
            pendingSlotNudge: undefined,
            familyPhase: "card",
          },
          messages,
        );
      }

      case "confirm_completeness": {
        messages.push({
          role: "user",
          content: action.hasOther
            ? action.freeText?.trim()
              ? action.freeText.trim()
              : "Oui, j'ai d'autres dépenses"
            : "Non, rien d'autre à ajouter",
        });

        if (action.hasOther) {
          const freeText = action.freeText?.trim();
          if (!freeText && !action.familyId) {
            messages.push(this.completenessMessage(state, {
              extra:
                "Décrivez la dépense, ou choisissez ci-dessous. Nous n'ouvrons pas une catégorie au hasard.",
            }));
            return { state: { ...state, step: "completeness" }, messages, completed: false };
          }
          if (freeText) {
            const signals = detectFamilySignals(freeText);
            if (signals.length > 1) {
              messages.push(this.completenessMessage(
                { ...state, pendingFamilyFreeText: freeText },
                {
                  extra: foreignFamilyLockMessage("cette étape", signals.map((id) => FAMILY_CARD_TITLES[id])),
                  extraFamilies: signals,
                },
              ));
              return {
                state: { ...state, step: "completeness", pendingFamilyFreeText: freeText },
                messages,
                completed: false,
              };
            }
          }
          const familyPath =
            (state.familyInventory?.length ?? 0) > 0 &&
            (state.currentFamilyIndex ?? 0) >= (state.familyInventory?.length ?? 0);
          if (familyPath || action.familyId || freeText) {
            const familyId =
              action.familyId ??
              (freeText ? inferFamilyFromFiletText(freeText) : "autres");
            return this.handleRevisitFamily(state, messages, familyId, {
              skipUserEcho: true,
              freeText,
            });
          }
          messages.push(this.completenessMessage(state, {
            extra: "Décrivez la dépense, ou choisissez ci-dessous.",
          }));
          return { state: { ...state, step: "completeness" }, messages, completed: false };
        }

        return this.buildReview(state, state.profil!, state.categoryInventory, messages);
      }

      case "confirm_all": {
        messages.push({ role: "user", content: "Oui, je valide" });
        const result = this.buildResult(state);

        if (!result.chargesCoherentes) {
          // Cycle 4D — une anomalie réellement bloquante (fatal/error)
          // empêche CHARGES_TERMINE. Un simple warning n'entre jamais dans
          // cette branche (chargesCoherentes ne regarde que fatal/error) —
          // aucune régression sur les avertissements déjà tolérés par la KS.
          messages.push({
            role: "assistant",
            content:
              "Certains points doivent être corrigés avant de valider vos charges : " +
              result.anomalies
                .filter((a) => a.severity === "fatal" || a.severity === "error")
                .map((a) => a.message)
                .join(" "),
          });
          return { state: { ...state, result }, messages, completed: false };
        }

        messages.push({ role: "assistant", content: result.explanation });
        const unresolved = unresolvedFamilyLabels(
          this.registryOf(state).familyCoverage,
        );
        const warnings = visibleWarningText(result.anomalies);
        if (warnings) {
          messages.push({ role: "assistant", content: warnings });
        }
        messages.push({
          role: "assistant",
          content: chargesDeclaredRecordedMessage(unresolved),
        });
        return {
          state: { ...state, step: "complete", result },
          messages,
          completed: true,
          event: "CHARGES_TERMINE",
        };
      }

      default:
        return { state, messages, completed: false };
    }
  }

  private travauxPreviewMessage(
    draft: F012TravauxDraft,
    preview: ReturnType<typeof this.compute>,
  ): string {
    if (draft.montantReparation !== undefined) {
      const immo = draft.montant - draft.montantReparation;
      return (
        `€${draft.montantReparation.toLocaleString("fr-FR")} en charge déductible, ` +
        `€${immo.toLocaleString("fr-FR")} à amortir.`
      );
    }
    if (!draft.natureIntervention) {
      return travauxIncertainAck();
    }
    if (draft.natureIntervention === "entretien") {
      return `Qualifié en charge déductible : ${draft.montant.toLocaleString("fr-FR")} €.`;
    }
    const comp = preview.charges.composantsNouveaux.at(-1);
    if (comp) {
      return (
        `Qualifié en amélioration — amorti sur ${comp.dureeAnnees} ans ` +
        `(${comp.dotationAnnuelle.toLocaleString("fr-FR")} €/an).`
      );
    }
    return "Dépense enregistrée.";
  }

  private afterCategoryInput(
    state: F012State,
    messages: F012Message[],
    input: {
      taxeFonciere?: number;
      assurancePno?: number;
      assuranceGli?: number;
      coproLignes?: CoproLigneInput[];
      honorairesGestion?: number;
      fraisEtatDesLieux?: number;
      honorairesComptable?: number;
      fraisBancaires?: number;
      diversItem?: { id: string; description: string; montant: number; financementOverlap?: "assurance_emprunteur" };
      fieldKey: string;
      source?: import("../../contracts/FieldSource").FieldSource;
      userContent: string;
      /** Cycle 3 — l'appelant a déjà poussé l'écho utilisateur (ex. pour intercaler une alerte avant). */
      skipUserEcho?: boolean;
    },
  ): F012AssistantTurn {
    if (!input.skipUserEcho) messages.push({ role: "user", content: input.userContent });
    const collected = { ...state.collected };
    if (input.taxeFonciere !== undefined) collected.taxeFonciere = input.taxeFonciere;
    if (input.assurancePno !== undefined) collected.assurancePno = input.assurancePno;
    if (input.assuranceGli !== undefined) collected.assuranceGli = input.assuranceGli;
    if (input.coproLignes) collected.coproLignes = input.coproLignes;
    if (input.honorairesGestion !== undefined) collected.honorairesGestion = input.honorairesGestion;
    if (input.fraisEtatDesLieux !== undefined) collected.fraisEtatDesLieux = input.fraisEtatDesLieux;
    if (input.honorairesComptable !== undefined) collected.honorairesComptable = input.honorairesComptable;
    if (input.fraisBancaires !== undefined) collected.fraisBancaires = input.fraisBancaires;
    if (input.diversItem) collected.divers = [...collected.divers, input.diversItem];

    const touchedFamilies = familiesTouchedByCategoryInput(input);
    const collectedWithCoverage = clearFamilyCoverageIntents(collected, touchedFamilies);

    const fieldSources = { ...state.fieldSources };
    if (input.source) fieldSources[input.fieldKey] = input.source;

    const preview = this.compute(state, collectedWithCoverage);
    if (input.coproLignes?.some((l) => l.type === "fonds_travaux")) {
      messages.push({
        role: "assistant",
        content:
          fondsTravauxExplanation(),
      });
    }

    messages.push({
      role: "assistant",
      content: `Total charges déductibles à ce stade : ${Math.round(preview.charges.totalDeductible).toLocaleString("fr-FR")} €`,
    });

    return this.advanceCategory(
      { ...state, collected: collectedWithCoverage, fieldSources },
      messages,
      { skipped: false },
    );
  }

  private advanceCategory(
    state: F012State,
    messages: F012Message[],
    opts: { skipped: boolean },
  ): F012AssistantTurn {
    const currentId = state.categoryInventory[state.currentCategoryIndex];
    const skipped = opts.skipped
      ? [...state.collected.skippedCategories, currentId].filter(Boolean) as F012CategoryId[]
      : state.collected.skippedCategories;

    const nextIndex = state.currentCategoryIndex + 1;
    const nextId = state.categoryInventory[nextIndex];

    const nextFamilyId = nextId ? familyIdForCategory(nextId) : undefined;
    const nextFamilyIndex =
      nextFamilyId && state.familyInventory
        ? state.familyInventory.indexOf(nextFamilyId)
        : state.currentFamilyIndex;

    if (!nextId) {
      messages.push(this.completenessMessage({ ...state, collected: { ...state.collected, skippedCategories: skipped } }));
      return {
        state: {
          ...state,
          collected: { ...state.collected, skippedCategories: skipped },
          step: "completeness",
          currentCategoryIndex: nextIndex,
          currentFamilyIndex: nextFamilyIndex,
        },
        messages,
        completed: false,
        event: "CHARGES_PARTIELLE",
      };
    }

    messages.push({
      role: "assistant",
      content: `Catégorie suivante : ${categoryLabel(nextId)}.`,
    });
    messages.push(categoryPrompt(nextId, this.ctx.fiscalYear));

    return {
      state: {
        ...state,
        collected: { ...state.collected, skippedCategories: skipped },
        currentCategoryIndex: nextIndex,
        currentFamilyIndex:
          nextFamilyIndex !== undefined && nextFamilyIndex >= 0 ? nextFamilyIndex : state.currentFamilyIndex,
        step: "category_collect",
      },
      messages,
      completed: false,
      event: "CHARGES_PARTIELLE",
    };
  }

  /**
   * Cycle 2 — reconstruit le message d'écran pour un état repris, sans jamais
   * rejouer un résultat calculé persisté. Miroir de `buildReentryTurn` (F-011) :
   * mêmes libellés que le flux en direct (factorisés en fonctions partagées)
   * pour qu'une reprise soit indiscernable d'un tour normal.
   */
  private buildReentryTurn(state: F012State): { state: F012State; messages: F012Message[] } {
    if (state.step === "aggregate_review") {
      const result = this.buildResult(state);
      const unresolved = unresolvedFamilyLabels(this.registryOf(state).familyCoverage);
      const warnings = visibleWarningText(result.anomalies);
      return {
        state: { ...state, result },
        messages: [
          {
            role: "assistant",
            content: [result.explanation, warnings].filter(Boolean).join("\n\n"),
          },
          confirmAllPrompt(unresolved),
        ],
      };
    }

    if (state.step === "completeness") {
      return { state, messages: [this.completenessMessage(state)] };
    }

    if (state.step === "category_collect") {
      if (state.familyPhase === "review" && state.documentReview) {
        return {
          state,
          messages: [
            {
              role: "assistant",
              content: this.documentReviewMessage(
                state.documentReview.proposals,
                state.documentReview.conflicts,
              ),
            },
          ],
        };
      }
      if (state.familyPhase === "paper") {
        const familyId = this.currentFamilyId(state);
        if (familyId && isDocumentaryFamily(familyId)) {
          return {
            state,
            messages: [
              {
                role: "assistant",
                content: `${paperInviteMessage(familyId)}\n\nVous pouvez aussi indiquer le montant sans document.`,
              },
            ],
          };
        }
        return {
          state,
          messages: [
            {
              role: "assistant",
              content: paperReservedMessage(),
              suggestions: [{ id: "continue_after_unknown", label: "Continuer" }],
            },
          ],
        };
      }
      if (state.familyPhase === "slot_nudge" && state.pendingSlotNudge) {
        return {
          state,
          messages: [
            {
              role: "assistant",
              content: slotNudgePrompt(state.pendingSlotNudge, this.ctx.fiscalYear),
              suggestions: [
                { id: "slot_nudge_yes", label: "Oui" },
                { id: "slot_nudge_no", label: "Non" },
              ],
            },
          ],
        };
      }
      if (state.familyPhase === "unknown_help") {
        const familyId = this.currentFamilyId(state);
        return {
          state,
          messages: familyId
            ? [
                {
                  role: "assistant",
                  content: familyUnknownHelp(familyId, this.ctx.fiscalYear),
                  suggestions: [{ id: "continue_after_unknown", label: "Continuer" }],
                },
              ]
            : [],
        };
      }
      const currentId = state.categoryInventory[state.currentCategoryIndex];
      if (currentId === "travaux") {
        if (state.travauxSubStep === "qualification" && state.pendingTravaux?.description) {
          return { state, messages: [travauxQualificationPrompt()] };
        }
        if (state.travauxSubStep === "split") {
          return { state, messages: [travauxSplitPrompt()] };
        }
        if (state.travauxSubStep === "description") {
          return { state, messages: [travauxDescriptionPrompt()] };
        }
      }
      if (currentId) {
        const familyId = this.currentFamilyId(state);
        if (state.familyPhase === "card" && familyId) {
          return { state, messages: [this.familyCardMessage(familyId)] };
        }
        return { state, messages: [categoryPrompt(currentId, this.ctx.fiscalYear)] };
      }
      return { state, messages: [] };
    }

    // "profilage" — défensif : shouldResumeF012 exclut normalement ce cas.
    return { state, messages: [profilagePrompt(this.ctx.fiscalYear, this.deps.knownCopropriete)] };
  }

  private buildReview(
    state: F012State,
    profil: NonNullable<F012State["profil"]>,
    inventory: F012CategoryId[],
    messages: F012Message[],
  ): F012AssistantTurn {
    const result = this.buildResult({ ...state, profil, categoryInventory: inventory });
    const unresolved = unresolvedFamilyLabels(
      this.registryOf({ ...state, profil, categoryInventory: inventory }).familyCoverage,
    );
    const warnings = visibleWarningText(result.anomalies);
    messages.push({
      role: "assistant",
      content: [result.explanation, warnings].filter(Boolean).join("\n\n"),
    });
    messages.push(confirmAllPrompt(unresolved));
    return {
      state: { ...state, profil, categoryInventory: inventory, result, step: "aggregate_review" },
      messages,
      completed: false,
    };
  }

  private registryOf(state: F012State) {
    return collectedToChargeRegistry({
      collected: state.collected,
      profil: state.profil,
      categoryInventory: state.categoryInventory,
      fieldSources: state.fieldSources,
      exercise: this.ctx.fiscalYear,
    });
  }

  private buildResult(state: F012State) {
    const computed = this.compute(state, state.collected);
    const validation = validateCharges({
      profil: state.profil ?? {
        copropriete: false,
        agence: false,
        travaux: false,
        vacance: false,
        comptable: false,
      },
      renseigne: {
        taxeFonciere: state.collected.taxeFonciere !== undefined,
        assurancePno: state.collected.assurancePno !== undefined,
        copropriete: state.collected.coproLignes.length > 0,
        honorairesGestion: state.collected.honorairesGestion !== undefined,
        travaux: state.collected.travaux.length > 0,
      },
      totalDeductible: computed.charges.totalDeductible,
    });
    const explain = explainCharges({ charges: computed.charges });
    const coverageAnomalies = unresolvedCoverageAnomalies(this.registryOf(state).familyCoverage);
    const anomalies = [...computed.anomalies, ...validation.anomalies, ...coverageAnomalies];
    return {
      charges: computed.charges,
      explanation: explain.explanation,
      immobilisationNotes: explain.immobilisationNotes,
      anomalies,
      // Cycle 4D — mêmes sévérités que `validateCharges`, étendues à
      // l'ensemble des anomalies (y compris celles de `computeChargesExercice`,
      // ex. travaux >5000€) : un seul calcul de cohérence, jamais un second
      // système de validation.
      chargesCoherentes: !hasBlockingAnomaly(anomalies),
      composantsNouveaux: computed.charges.composantsNouveaux,
    };
  }

  private currentFamilyId(state: F012State): ChargeFamilyId | undefined {
    if (state.familyInventory && state.currentFamilyIndex !== undefined) {
      return state.familyInventory[state.currentFamilyIndex];
    }
    const currentId = state.categoryInventory[state.currentCategoryIndex];
    return currentId ? familyIdForCategory(currentId) : undefined;
  }

  private documentReviewMessage(proposals: ChargeProposal[], conflicts?: DocumentAmountConflict[]): string {
    if (proposals.length === 0) return missingDocumentFieldMessage();
    const lines = proposals.map((proposal) => {
      const amount =
        proposal.amount !== undefined ? `${proposal.amount.toLocaleString("fr-FR")} €` : "montant à renseigner";
      const note = everydayProposalNote(proposal);
      return `• ${everydayProposalTitle(proposal)} : ${amount}${note ? `\n  ${note}` : ""}`;
    });
    const recap = reviewRecapMessage(reviewRecap(proposals));
    const openConflict = (conflicts ?? []).find(
      (conflict) => conflict.choice !== "keep_existing" && conflict.choice !== "use_document",
    );
    return (
      `Voici ce que j'ai trouvé dans votre document. Rien n'est encore inscrit.\n\n` +
      `${lines.join("\n")}\n\n${recap}` +
      (openConflict ? `\n\n${conflictMessage(openConflict)}` : "")
    );
  }

  private familyCardMessage(familyId: ChargeFamilyId): F012Message {
    const year = this.ctx.fiscalYear;
    const labels = familyActionLabels(year);
    const creditNote =
      familyId === "assurances" && this.deps.financementCharges
        ? `\n\n${assuranceCreditAlreadyHandledNote()}`
        : "";
    return {
      role: "assistant",
      content: `${familyCardPrompt(familyId, year)}${creditNote}`,
      suggestions: [
        { id: "open_family_paper", label: labels.paper },
        { id: "open_family_manual", label: labels.amount },
        { id: "none_family", label: labels.none },
        { id: "unknown_family", label: labels.unknown },
      ],
    };
  }

  private completenessMessage(
    state: F012State,
    opts?: { extra?: string; extraFamilies?: ChargeFamilyId[] },
  ): F012Message {
    const registry = collectedToChargeRegistry({
      collected: state.collected,
      profil: state.profil,
      categoryInventory: state.categoryInventory,
      fieldSources: state.fieldSources,
      exercise: this.ctx.fiscalYear,
    });
    const suggestions = completenessSuggestions(registry.familyCoverage, {
      collected: state.collected,
      profil: state.profil,
      detectedFamilyIds: opts?.extraFamilies,
    });
    return {
      role: "assistant",
      content: [opts?.extra, coverageCompletenessPrompt(this.ctx.fiscalYear, registry.familyCoverage)]
        .filter(Boolean)
        .join("\n\n"),
      suggestions,
    };
  }

  private commitFamilyExpenses(
    state: F012State,
    messages: F012Message[],
    input: {
      familyId: ChargeFamilyId;
      parsed: ReturnType<typeof parseFamilyExpenseMentionsBounded>["items"];
      paidAt?: string;
      userContent: string;
      freeText?: string;
    },
  ): F012AssistantTurn {
    messages.push({ role: "user", content: input.userContent });
    const freeText = input.freeText?.trim();
    if (freeText && isAmbiguousAmountText(freeText)) {
      messages.push({
        role: "assistant",
        content:
          "Plusieurs montants sont possibles. Indiquez le montant réellement payé — nous n'inscrivons pas un chiffre incertain.",
      });
      return {
        state: { ...state, pendingFamilyFreeText: freeText },
        messages,
        completed: false,
      };
    }
    const bounded = freeText
      ? parseFamilyExpenseMentionsBounded(freeText, input.familyId)
      : { items: [] as ParsedExpense[], foreignFamilies: [] as ChargeFamilyId[] };
    const foreign = bounded.foreignFamilies;
    if (foreign.length > 0) {
      messages.push({
        role: "assistant",
        content: foreignFamilyLockMessage(
          FAMILY_CARD_TITLES[input.familyId],
          foreign.map((id) => FAMILY_CARD_TITLES[id]),
        ),
      });
    }
    const parsed = [...input.parsed, ...bounded.items];
    const applied = applyFamilyExpenses({
      collected: state.collected,
      familyId: input.familyId,
      exercise: this.ctx.fiscalYear,
      parsed,
      paidAt: input.paidAt,
      financementCharges: this.deps.financementCharges,
    });
    const collected = syncFilledSlotNudges(applied.collected);
    const nextState: F012State = {
      ...state,
      collected,
      pendingFamilyFreeText: foreign.length > 0 ? freeText : undefined,
    };
    if (applied.blocked) {
      const message =
        applied.blocked.kind === "assurance_emprunteur" && input.familyId === "assurances"
          ? "Cette assurance concerne votre prêt. Elle est déjà prise en compte dans Financement."
          : applied.blocked.message;
      messages.push({ role: "assistant", content: message });
    }
    if (applied.overlapMessage && !applied.blocked) {
      messages.push({ role: "assistant", content: applied.overlapMessage });
    }
    if (applied.pendingQualification && applied.pendingQualification.length > 0) {
      return this.openTravauxQualification(nextState, messages, applied.pendingQualification);
    }
    if (applied.blocked && !applied.wrote) {
      return { state: applied.wrote ? nextState : state, messages, completed: false };
    }
    if (applied.blocked && applied.wrote) {
      return { state: nextState, messages, completed: false };
    }
    if (!applied.wrote) {
      if (foreign.length > 0) {
        return {
          state: { ...state, pendingFamilyFreeText: freeText },
          messages,
          completed: false,
        };
      }
      messages.push({
        role: "assistant",
        content:
          "Indiquez un montant réellement payé, ou dites que vous n'avez rien payé. Nous n'inscrivons pas 0 €.",
      });
      return { state, messages, completed: false };
    }
    const nudge = maybeOfferSlotNudge(input.familyId, collected);
    if (nudge) {
      const withNudge = markSlotNudge(collected, nudge, "offered");
      messages.push({
        role: "assistant",
        content: slotNudgePrompt(nudge, this.ctx.fiscalYear),
        suggestions: [
          { id: "slot_nudge_yes", label: "Oui" },
          { id: "slot_nudge_no", label: "Non" },
        ],
      });
      return {
        state: {
          ...nextState,
          collected: withNudge,
          pendingSlotNudge: nudge,
          familyPhase: "slot_nudge",
        },
        messages,
        completed: false,
        event: "CHARGES_PARTIELLE",
      };
    }
    return this.previewAndAdvanceFamily(nextState, messages);
  }

  private openTravauxQualification(
    state: F012State,
    messages: F012Message[],
    items: ParsedExpense[],
  ): F012AssistantTurn {
    const [first, ...rest] = items;
    if (!first) return { state, messages, completed: false };
    const ensured = ensureFamilyInInventories(
      state.familyInventory ?? [],
      state.categoryInventory,
      "travaux",
    );
    const targetIndex = ensured.familyInventory.indexOf("travaux");
    const nextCatIndex = ensured.categoryInventory.findIndex((categoryId) =>
      FAMILY_TO_CATEGORIES.travaux.includes(categoryId),
    );
    messages.push(travauxQualificationPrompt());
    return {
      state: {
        ...state,
        categoryInventory: ensured.categoryInventory,
        familyInventory: ensured.familyInventory,
        step: "category_collect",
        currentFamilyIndex: targetIndex >= 0 ? targetIndex : state.currentFamilyIndex,
        currentCategoryIndex: nextCatIndex >= 0 ? nextCatIndex : state.currentCategoryIndex,
        familyPhase: "manual",
        travauxSubStep: "qualification",
        pendingTravaux: {
          id: `travaux-${state.collected.travaux.length + 1}`,
          description: first.description,
          montant: first.amount,
        },
        queuedTravaux: rest.map((row) => ({ description: row.description, montant: row.amount })),
      },
      messages,
      completed: false,
    };
  }

  private afterTravauxRecorded(
    state: F012State,
    messages: F012Message[],
    collected: F012State["collected"],
    draft: F012TravauxDraft,
    opts?: { event?: F012AssistantTurn["event"] },
  ): F012AssistantTurn {
    const queue = state.queuedTravaux ?? [];
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      messages.push(travauxQualificationPrompt());
      return {
        state: {
          ...state,
          collected,
          familyPhase: "manual",
          travauxSubStep: "qualification",
          pendingTravaux: {
            id: `travaux-${collected.travaux.length + 1}`,
            description: next!.description,
            montant: next!.montant,
          },
          queuedTravaux: rest,
        },
        messages,
        completed: false,
        event: opts?.event,
      };
    }
    messages.push({
      role: "assistant",
      content:
        draft.choix === "incertain"
          ? travauxIncertainAck()
          : this.travauxPreviewMessage(draft, this.compute(state, collected)),
      suggestions: [
        { id: "start_travaux", label: "Ajouter une autre dépense" },
        { id: "finish_travaux", label: "Terminer les travaux" },
      ],
    });
    return {
      state: {
        ...state,
        collected,
        pendingTravaux: undefined,
        queuedTravaux: undefined,
        travauxSubStep: undefined,
      },
      messages,
      completed: false,
      event: opts?.event,
    };
  }

  private handleRevisitFamily(
    state: F012State,
    messages: F012Message[],
    requestedFamilyId?: ChargeFamilyId,
    opts?: { skipUserEcho?: boolean; freeText?: string },
  ): F012AssistantTurn {
    const familyInventory = state.familyInventory ?? [];
    if (familyInventory.length === 0 && !requestedFamilyId) return { state, messages, completed: false };
    const registry = collectedToChargeRegistry({
      collected: state.collected,
      profil: state.profil,
      categoryInventory: state.categoryInventory,
      fieldSources: state.fieldSources,
      exercise: this.ctx.fiscalYear,
    });
    const targetFamily =
      requestedFamilyId ??
      (firstIncompleteFamilyIndex(familyInventory, registry.familyCoverage) >= 0
        ? familyInventory[firstIncompleteFamilyIndex(familyInventory, registry.familyCoverage)]
        : undefined);
    if (!targetFamily) return { state, messages, completed: false };
    const ensured = ensureFamilyInInventories(
      familyInventory.length > 0 ? familyInventory : [...(state.familyInventory ?? [])],
      state.categoryInventory,
      targetFamily,
    );
    const targetIndex = ensured.familyInventory.indexOf(targetFamily);
    const familyId = targetIndex >= 0 ? ensured.familyInventory[targetIndex] : undefined;
    if (!familyId) return { state, messages, completed: false };
    const nextCatIndex = ensured.categoryInventory.findIndex((categoryId) =>
      FAMILY_TO_CATEGORIES[familyId].includes(categoryId),
    );
    if (!opts?.skipUserEcho) {
      messages.push({ role: "user", content: `Revenir sur ${FAMILY_CARD_TITLES[familyId]}` });
    }
    const coverage = registry.familyCoverage.find((row) => row.familyId === familyId)?.status;
    const freeText = opts?.freeText?.trim();
    const goManual =
      familyId !== "travaux" &&
      (Boolean(freeText) ||
        coverage === "captured" ||
        coverage === "none" ||
        coverage === "reviewed_empty");
    const opened: F012State = {
      ...state,
      categoryInventory: ensured.categoryInventory,
      familyInventory: ensured.familyInventory,
      step: "category_collect",
      currentFamilyIndex: targetIndex,
      currentCategoryIndex: nextCatIndex >= 0 ? nextCatIndex : state.currentCategoryIndex,
      familyPhase: goManual ? "manual" : "card",
      pendingFamilyFreeText: freeText,
      pendingSlotNudge: undefined,
    };
    if (familyId === "travaux") {
      if (freeText && isAmbiguousAmountText(freeText)) {
        messages.push(travauxDescriptionPrompt());
        messages.push({
          role: "assistant",
          content:
            "Plusieurs montants sont possibles. Indiquez le montant réellement payé — nous n'inscrivons pas un chiffre incertain.",
        });
        return {
          state: {
            ...opened,
            familyPhase: "manual",
            travauxSubStep: "description",
            pendingTravaux: {},
          },
          messages,
          completed: false,
        };
      }
      if (freeText) {
        const parsed = parseFamilyExpenseMentionsBounded(freeText, "travaux").items;
        if (parsed.length > 0) {
          return this.openTravauxQualification(opened, messages, parsed);
        }
      }
      messages.push(travauxDescriptionPrompt());
      return {
        state: {
          ...opened,
          familyPhase: "manual",
          travauxSubStep: "description",
          pendingTravaux: {},
        },
        messages,
        completed: false,
      };
    }
    if (opened.familyPhase === "manual") {
      messages.push({
        role: "assistant",
        content: `${amountPaidLabel(this.ctx.fiscalYear)}\n${familyCardPhrase(familyId, this.ctx.fiscalYear)}`,
      });
      return { state: opened, messages, completed: false };
    }
    messages.push(this.familyCardMessage(familyId));
    return { state: opened, messages, completed: false };
  }

  private previewAndAdvanceFamily(state: F012State, messages: F012Message[]): F012AssistantTurn {
    const preview = this.compute(state, state.collected);
    messages.push({
      role: "assistant",
      content: `Total charges déductibles à ce stade : ${Math.round(preview.charges.totalDeductible).toLocaleString("fr-FR")} €`,
    });
    return this.advancePastCurrentFamily(state, messages);
  }

  private categoryIsFilled(collected: F012State["collected"], categoryId: F012CategoryId): boolean {
    switch (categoryId) {
      case "taxe_fonciere":
        return collected.taxeFonciere !== undefined;
      case "assurance_pno":
        return collected.assurancePno !== undefined;
      case "assurance_gli":
        return collected.assuranceGli !== undefined;
      case "copropriete":
        return collected.coproLignes.length > 0;
      case "honoraires_gestion":
        return collected.honorairesGestion !== undefined;
      case "honoraires_comptable":
        return collected.honorairesComptable !== undefined;
      case "travaux":
        return collected.travaux.length > 0;
      case "frais_bancaires":
        return collected.fraisBancaires !== undefined;
      case "divers":
        return collected.divers.length > 0;
    }
  }

  private advancePastCurrentFamily(state: F012State, messages: F012Message[]): F012AssistantTurn {
    const familyId = this.currentFamilyId(state);
    const inventory = state.categoryInventory;
    let index = state.currentCategoryIndex;
    const skipped = [...state.collected.skippedCategories];

    if (familyId) {
      while (index < inventory.length && FAMILY_TO_CATEGORIES[familyId].includes(inventory[index]!)) {
        const categoryId = inventory[index]!;
        if (!this.categoryIsFilled(state.collected, categoryId) && !skipped.includes(categoryId)) {
          skipped.push(categoryId);
        }
        index += 1;
      }
    } else {
      index += 1;
    }

    const collected = { ...state.collected, skippedCategories: skipped };
    const registry = collectedToChargeRegistry({
      collected,
      profil: state.profil,
      categoryInventory: inventory,
      fieldSources: state.fieldSources,
      exercise: this.ctx.fiscalYear,
    });
    const nextFamilyIndex = nextFamilyIndexToVisit(
      state.familyInventory ?? [],
      state.currentFamilyIndex ?? 0,
      registry.familyCoverage,
    );
    const nextFamily =
      nextFamilyIndex >= 0 ? state.familyInventory?.[nextFamilyIndex] : undefined;

    if (!nextFamily) {
      messages.push(this.completenessMessage({ ...state, collected }));
      return {
        state: {
          ...state,
          collected,
          step: "completeness",
          currentCategoryIndex: index,
          currentFamilyIndex: (state.familyInventory?.length ?? 0),
          familyPhase: "card",
        },
        messages,
        completed: false,
        event: "CHARGES_PARTIELLE",
      };
    }

    const nextCatIndex = inventory.findIndex((categoryId) =>
      FAMILY_TO_CATEGORIES[nextFamily].includes(categoryId),
    );
    messages.push(this.familyCardMessage(nextFamily));
    return {
      state: {
        ...state,
        collected,
        step: "category_collect",
        currentCategoryIndex: nextCatIndex >= 0 ? nextCatIndex : index,
        currentFamilyIndex: nextFamilyIndex,
        familyPhase: "card",
      },
      messages,
      completed: false,
      event: "CHARGES_PARTIELLE",
    };
  }

  private incompleteResumeMessage(state: F012State): F012Message | undefined {
    const registry = collectedToChargeRegistry({
      collected: state.collected,
      profil: state.profil,
      categoryInventory: state.categoryInventory,
      fieldSources: state.fieldSources,
      exercise: this.ctx.fiscalYear,
    });
    const text = incompleteCoverageResume(
      incompleteCoverages(registry.familyCoverage).map((coverage) => FAMILY_CARD_TITLES[coverage.familyId]),
    );
    if (!text) return undefined;
    return { role: "assistant", content: text };
  }

  /**
   * Cycle 5 — `collected` reste le chemin d'écriture ; le registry est la
   * projection métier. `computeChargesExercice` n'est pas réécrit : il reçoit
   * le même contrat via `chargeRegistryToComputeInput`.
   */
  private compute(state: F012State, collected: F012State["collected"]) {
    const registry = collectedToChargeRegistry({
      collected,
      profil: state.profil,
      categoryInventory: state.categoryInventory,
      fieldSources: state.fieldSources,
      exercise: this.ctx.fiscalYear,
    });
    return computeChargesExercice(
      chargeRegistryToComputeInput(registry, {
        dateMiseEnService: this.deps.dateMiseEnService ?? `${this.ctx.fiscalYear}-06-01`,
        fieldSources: state.fieldSources,
      }),
    );
  }
}

export { collectedToChargeRegistry, toF012PersistedStateWithRegistry } from "./collected-to-registry";
export { chargeRegistryToComputeInput } from "./registry-to-compute-input";
export {
  clearFamilyCoverageIntent,
  clearFamilyCoverageIntents,
  markFamilyNone,
  markFamilyReviewedEmpty,
  markFamilyUnknown,
} from "./family-coverage-intents";
export { createInitialF012State, toF012PersistedState, shouldResumeF012, hasBlockingAnomaly };
export type { ChargeProposal, DocumentaryFamilyId, F012DocumentReview } from "./charge-proposal";
export {
  isDocumentaryFamily,
  missingDocumentFieldMessage,
  paperInviteMessage,
} from "./charge-proposal";
export { proposalsFromTaxeFonciereCorpus } from "./proposals-from-taxe-fonciere";
export { coproProposalDiagnostics, proposalsFromCoproCorpus } from "./proposals-from-copro";
export { assuranceProposalDiagnostics, proposalsFromAssuranceCorpus } from "./proposals-from-assurance";
export type {
  F012Action,
  F012AssistantTurn,
  F012CategoryId,
  F012Deps,
  F012FamilyPhase,
  F012HistorySnapshot,
  F012Message,
  F012PersistedState,
  F012Result,
  F012State,
  F012Step,
  F012Suggestion,
} from "./types";
