import type { RuntimeContext } from "../../contracts/RuntimeContext";
import { computeAmortizationPlan } from "../../capabilities/f010/compute-amortization-plan";
import type { TypeBien } from "../../capabilities/f010/types";
import { explainPlan } from "../../presentation/explain-plan";
import type { F010ActePrefill } from "@/lib/lmnp/services/f010/acte-to-assistant";
import {
  createInitialF010State,
  shouldResumeF010,
  toF010PersistedState,
  type F010Action,
  type F010AssistantTurn,
  type F010Deps,
  type F010ExtractionReview,
  type F010ExtractionReviewField,
  type F010FieldKey,
  type F010Message,
  type F010Nature,
  type F010PersistedState,
  type F010Result,
  type F010ReviewFieldKey,
  type F010State,
  type F010Step,
  type F010Suggestion,
} from "./types";

const NATURE_SUGGESTIONS: F010Suggestion[] = [
  { id: "achat", label: "Un achat (ancien ou neuf)" },
  { id: "vefa", label: "Un achat sur plan (VEFA)" },
  { id: "heritage_donation", label: "Un héritage ou une donation" },
  { id: "conversion", label: "Ma résidence transformée en location" },
  { id: "indivision", label: "Un bien détenu à plusieurs" },
  { id: "autre", label: "Autre / je ne sais pas" },
];

const SOURCE_SUGGESTIONS: F010Suggestion[] = [
  { id: "acte", label: "Oui, j'ai mon acte notarié" },
  { id: "partiel", label: "Je l'ai, mais incomplet" },
  { id: "manuel", label: "Non, je saisirai les montants" },
];

function orientationPrompt(): F010Message {
  return {
    role: "assistant",
    content:
      "Décrivons votre logement pour calculer ce qu'il vous fait économiser chaque année. " +
      "Pour commencer : comment avez-vous acquis ce bien ?",
    suggestions: NATURE_SUGGESTIONS,
  };
}

function natureLabel(nature: F010Nature): string {
  return NATURE_SUGGESTIONS.find((s) => s.id === nature)?.label ?? nature;
}

/**
 * Pousse l'étape quittée sur la pile d'historique et applique le patch —
 * point de passage unique de toute transition avant (Cycle 3), pour que
 * GO_BACK fonctionne uniformément. Miroir exact de `advance()` (F009).
 */
function advance(state: F010State, patch: Partial<F010State>, nextStep: F010Step): F010State {
  return {
    ...state,
    ...patch,
    step: nextStep,
    history: [...(state.history ?? []), state.step],
  };
}

/**
 * Étape possédant les champs obligatoires manquants pour calculer le plan
 * (correctif dead-end Cycle 3, contrainte #9) — ou `null` si tout est réuni.
 * Recense un champ par écran, jamais un message générique sans destination.
 */
function resolveF010MissingStep(state: F010State): F010Step | null {
  if (state.prixAcquisition === undefined || state.typeBien === undefined) return "collect_bien";
  if (state.fraisNotaire === undefined || state.choixTraitementFrais === undefined) return "collect_frais";
  return null;
}

function buildF010MissingFieldsMessage(state: F010State, missingStep: F010Step): string {
  const missing: string[] = [];
  if (missingStep === "collect_bien") {
    if (state.prixAcquisition === undefined) missing.push("le prix d'achat");
    if (state.typeBien === undefined) missing.push("le type de bien");
  }
  if (missingStep === "collect_frais") {
    if (state.fraisNotaire === undefined) missing.push("les frais de notaire");
    if (state.choixTraitementFrais === undefined) missing.push("le traitement des frais");
  }
  return `Il manque ${missing.join(" et ")} pour calculer votre plan — revenons les renseigner.`;
}

// ---------------------------------------------------------------------------
// CYCLE 4C1 — review documentaire (review_extraction)
// ---------------------------------------------------------------------------

const F010_REVIEW_FIELD_KEYS: readonly F010ReviewFieldKey[] = [
  "prixAcquisition",
  "dateAcquisition",
  "typeBien",
  "surface",
  "fraisNotaire",
  "adresse",
];

function formatF010ProposedValue(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return String(value);
}

/**
 * Construit une review neuve à partir d'une proposition de document —
 * remplace intégralement toute review précédente (règle anti-fantôme, garde-
 * fou 4 F009/Cycle 3) : jamais de fusion champ à champ entre deux documents.
 * Ne lit ni `state.confirmed` ni les valeurs déjà validées — une proposition
 * est toujours "pending", quel que soit ce qui est déjà confirmé par
 * ailleurs ; c'est la comparaison entre `state[field]` (valeur validée) et
 * `review.fields[field].proposedValue` (nouvelle proposition) qui rend un
 * conflit observable, jamais un statut de review dédié.
 */
function buildF010ExtractionReview(documentId: string, proposal: F010ActePrefill): F010ExtractionReview {
  const fields = {} as Record<F010ReviewFieldKey, F010ExtractionReviewField>;
  for (const field of F010_REVIEW_FIELD_KEYS) {
    const proposedValue = formatF010ProposedValue(proposal[field]);
    fields[field] = {
      proposedValue,
      source: "extracted",
      status: proposedValue === undefined ? "unavailable" : "pending",
    };
  }
  return { documentId, fields };
}

/** Tous les champs de la review sont-ils sortis de l'état "pending" ? */
function isF010ReviewComplete(review: F010ExtractionReview | undefined): boolean {
  if (!review) return true;
  return F010_REVIEW_FIELD_KEYS.every((field) => review.fields[field].status !== "pending");
}

/** Applique une valeur de review (toujours une string) au champ F010State typé correspondant — jamais d'assignation dynamique non typée. */
function applyF010ReviewFieldValue(state: F010State, field: F010ReviewFieldKey, rawValue: string): F010State {
  switch (field) {
    case "prixAcquisition":
      return { ...state, prixAcquisition: Number(rawValue) };
    case "surface":
      return { ...state, surface: Number(rawValue) };
    case "fraisNotaire":
      return { ...state, fraisNotaire: Number(rawValue) };
    case "dateAcquisition":
      return { ...state, dateAcquisition: rawValue };
    case "adresse":
      return { ...state, adresse: rawValue };
    case "typeBien":
      return { ...state, typeBien: rawValue as TypeBien };
  }
}

const F010_MISSING_FIELD_ORDER: readonly F010FieldKey[] = [
  "prixAcquisition",
  "typeBien",
  "dateAcquisition",
  "fraisNotaire",
  "choixTraitementFrais",
  "montantMobilier",
  "ratioTerrain",
];

/**
 * Duplicat volontaire, minimal, de `resolveNextMissingF010Field`
 * (`f010-document-prefill.ts`, Cycle 4A) : le runtime ne doit jamais importer
 * depuis `lib/` (le sens de dépendance établi est lib → runtime, jamais
 * l'inverse — l'importer créerait une dépendance croisée hors périmètre
 * runtime). Gardé strictement synchronisé avec la version lib, couvert par
 * les mêmes règles (7 champs, même ordre, `undefined` = manquant).
 */
function nextMissingF010Field(state: F010State): F010FieldKey | null {
  for (const field of F010_MISSING_FIELD_ORDER) {
    if (state[field] === undefined) return field;
  }
  return null;
}

function stepForF010Field(field: F010FieldKey): F010Step {
  switch (field) {
    case "prixAcquisition":
    case "typeBien":
    case "dateAcquisition":
      return "collect_bien";
    case "fraisNotaire":
    case "choixTraitementFrais":
      return "collect_frais";
    case "montantMobilier":
      return "collect_mobilier";
    case "ratioTerrain":
      return "ventilation";
    default:
      return "collect_bien";
  }
}

/** Libellés des champs de collect_bien pouvant rester manquants après une review documentaire (Cycle 4E2). */
const F010_REVIEW_MISSING_BIEN_LABELS: Partial<Record<F010FieldKey, string>> = {
  prixAcquisition: "le prix d'achat",
  typeBien: "le type de bien",
  dateAcquisition: "la date d'acquisition",
};

/**
 * Message expliquant pourquoi une nouvelle question est posée après la sortie
 * de `review_extraction` (Cycle 4E2, revue §15 finding IMPORTANT #2). Reçoit
 * exactement le champ déjà déterminé par `nextMissingF010Field()` dans
 * `leaveReviewIfComplete` — jamais une seconde liste de champs, jamais une
 * redétermination indépendante. `null` seulement pour les deux champs
 * (`surface`/`adresse`) que `nextMissingF010Field` ne retourne jamais (hors de
 * `F010_MISSING_FIELD_ORDER`) — filet de sécurité typé, jamais atteint.
 */
function buildF010ReviewTransitionMessage(missing: F010FieldKey): F010Message | null {
  switch (missing) {
    case "prixAcquisition":
    case "typeBien":
    case "dateAcquisition":
      return {
        role: "assistant",
        content: `J'ai trouvé les informations principales dans votre acte. Il me manque seulement ${F010_REVIEW_MISSING_BIEN_LABELS[missing]}.`,
      };
    case "fraisNotaire":
      return {
        role: "assistant",
        content:
          "J'ai récupéré les informations principales de votre acte. Il me manque maintenant vos frais de notaire pour poursuivre.",
      };
    case "choixTraitementFrais":
      return {
        role: "assistant",
        content:
          "J'ai toutes les informations de votre acte pour le prix et les frais. Il me reste à savoir comment vous souhaitez traiter ces frais.",
      };
    case "montantMobilier":
      return {
        role: "assistant",
        content:
          "Votre acte ne me permet pas de déterminer le montant du mobilier. Je vais vous poser une dernière question à ce sujet.",
      };
    case "ratioTerrain":
      return {
        role: "assistant",
        content:
          "Il me reste une dernière information pour calculer votre amortissement : la part du prix correspondant au terrain.",
      };
    default:
      return null;
  }
}

/**
 * Message de reprise contextualisé (Cycle 2) — résume ce qui est déjà connu
 * plutôt qu'un générique "recommençons". Miroir de `buildResumeMessage` (F009),
 * sans les branches `analyzing`/`analysis_failed` : ces états n'existent pas
 * dans `F010Step` — leur reprise est gérée par le panel, pas par le runtime.
 */
function buildF010ResumeMessage(persisted: F010PersistedState): F010Message {
  const known: string[] = [];
  if (persisted.prixAcquisition !== undefined) known.push("le prix d'achat");
  if (persisted.dateAcquisition) known.push("la date d'acquisition");
  if (persisted.typeBien) known.push("le type de bien");
  if (persisted.fraisNotaire !== undefined) known.push("les frais de notaire");
  if (persisted.montantMobilier !== undefined) known.push("le mobilier");
  if (persisted.ratioTerrain !== undefined) known.push("la part du terrain");

  if (known.length === 0) {
    return { role: "assistant", content: "Reprenons là où vous en étiez." };
  }
  return {
    role: "assistant",
    content: `Reprenons là où vous en étiez — vous avez déjà renseigné ${known.join(", ")}.`,
  };
}

export class F010LogementAssistant {
  constructor(
    private readonly ctx: RuntimeContext,
    private readonly deps: F010Deps = {},
  ) {}

  start(): F010AssistantTurn {
    return {
      state: createInitialF010State(),
      messages: [orientationPrompt()],
      completed: false,
    };
  }

  /**
   * Cycle 2 — reprend une session persistée exactement où elle a été laissée,
   * jamais l'ORIENTATION de `start()`. Ne reconstruit que l'état conversationnel
   * F010 lui-même : `governedFields`/`propertyBackgroundExtraction`/les
   * documents restent dans `declarationDraft`, jamais dupliqués ici. `result`
   * n'est jamais lu depuis l'état persisté — toujours recalculé (même principe
   * que F009 pour `explanation`/`prorataPercent` : jamais de valeur en cache).
   */
  resume(persisted: F010PersistedState): F010AssistantTurn {
    const state: F010State = {
      step: persisted.step,
      nature: persisted.nature,
      acquisitionSource: persisted.acquisitionSource,
      prixAcquisition: persisted.prixAcquisition,
      natureBien: persisted.natureBien,
      typeBien: persisted.typeBien,
      surface: persisted.surface,
      adresse: persisted.adresse,
      dateAcquisition: persisted.dateAcquisition,
      localisation: persisted.localisation,
      fraisNotaire: persisted.fraisNotaire,
      choixTraitementFrais: persisted.choixTraitementFrais,
      mobilierInclus: persisted.mobilierInclus,
      montantMobilier: persisted.montantMobilier,
      mobilierMode: persisted.mobilierMode,
      ratioTerrain: persisted.ratioTerrain,
      fieldSources: persisted.fieldSources,
      history: persisted.history,
      confirmed: persisted.confirmed,
      review: persisted.review,
    };

    if (state.step === "review_plan") {
      const result = this.computePlan(state);
      if (result) state.result = result;
    }

    return {
      state,
      messages: [buildF010ResumeMessage(persisted)],
      completed: false,
    };
  }

  async handle(state: F010State, action: F010Action): Promise<F010AssistantTurn> {
    const messages: F010Message[] = [];

    switch (action.type) {
      case "restart":
        return this.start();

      case "select_nature": {
        messages.push({ role: "user", content: natureLabel(action.nature) });
        if (action.nature !== "achat") {
          messages.push({
            role: "assistant",
            content:
              "Ce type d'acquisition arrive bientôt. Pour l'instant, l'assistant traite les achats classiques (ancien ou neuf). " +
              "Vous pourrez revenir dès que votre situation sera prise en charge.",
          });
          return {
            state: advance(state, { nature: action.nature }, "coming_soon"),
            messages,
            completed: false,
          };
        }
        messages.push({
          role: "assistant",
          content: "Parfait. Avez-vous votre acte notarié sous la main ?",
          suggestions: SOURCE_SUGGESTIONS,
        });
        return {
          state: advance(state, { nature: action.nature }, "acquisition_source"),
          messages,
          completed: false,
        };
      }

      case "select_source": {
        const label = SOURCE_SUGGESTIONS.find((s) => s.id === action.source)?.label ?? action.source;
        messages.push({ role: "user", content: label });
        messages.push({
          role: "assistant",
          content:
            action.source === "manuel"
              ? "Aucun souci. Indiquez le prix d'achat, le type de bien et la date d'acquisition."
              : "Très bien. Vérifions ensemble le prix d'achat, le type de bien et la date d'acquisition.",
        });
        return {
          state: advance(state, { acquisitionSource: action.source }, "collect_bien"),
          messages,
          completed: false,
        };
      }

      case "submit_bien": {
        const fs = action.fieldSources ?? {};
        messages.push({
          role: "user",
          content: `Prix d'achat : ${action.prixAcquisition.toLocaleString("fr-FR")} €`,
        });
        const next = advance(
          state,
          {
            prixAcquisition: action.prixAcquisition,
            typeBien: action.typeBien,
            // Cycle 4B : jamais un effacement — une valeur déjà connue (dossier
            // repris, ou déjà répondue au moment d'une estimation de frais) est
            // préservée quand l'action ne la fournit pas.
            natureBien: action.natureBien ?? state.natureBien,
            dateAcquisition: action.dateAcquisition,
            surface: action.surface,
            adresse: action.adresse,
            localisation: action.localisation ?? state.localisation,
            fieldSources: {
              ...state.fieldSources,
              prixAcquisition: fs.prixAcquisition ?? "manual",
              typeBien: fs.typeBien ?? "manual",
              dateAcquisition: fs.dateAcquisition ?? "manual",
              ...(action.surface !== undefined ? { surface: fs.surface ?? "manual" } : {}),
            },
            confirmed: {
              ...state.confirmed,
              prixAcquisition: true,
              typeBien: true,
              dateAcquisition: true,
              ...(action.surface !== undefined ? { surface: true } : {}),
            },
          },
          "collect_frais",
        );
        messages.push({
          role: "assistant",
          content:
            "Combien avez-vous payé de frais de notaire ? " +
            "Vous pourrez choisir de les ajouter à la valeur du bien ou de les déduire immédiatement.",
        });
        return { state: next, messages, completed: false };
      }

      case "analysis_success": {
        messages.push({ role: "user", content: "J'ai importé mon acte notarié." });
        const review = buildF010ExtractionReview(action.documentId, action.proposal);
        const staged = advance(state, { review }, "review_extraction");
        const outcome = this.leaveReviewIfComplete(staged);
        if (outcome.state.step === "review_extraction") {
          messages.push({
            role: "assistant",
            content: "J'ai trouvé ces informations dans votre acte. Vérifions-les ensemble.",
          });
        } else if (outcome.state.step === "review_plan") {
          messages.push({
            role: "assistant",
            content: "Tout était déjà connu — voici votre plan d'amortissement.",
          });
        } else if (outcome.message) {
          messages.push(outcome.message);
        }
        return { state: outcome.state, messages, completed: false };
      }

      case "confirm_extracted_field": {
        const entry = state.review?.fields[action.field];
        if (!state.review || !entry || entry.proposedValue === undefined) {
          // Rien à confirmer (champ absent ou déjà traité) — no-op sûr, jamais de plantage.
          return { state, messages, completed: false };
        }
        messages.push({ role: "user", content: `Je confirme : ${entry.proposedValue}` });
        const confirmedState: F010State = {
          ...applyF010ReviewFieldValue(state, action.field, entry.proposedValue),
          review: {
            ...state.review,
            fields: { ...state.review.fields, [action.field]: { ...entry, status: "confirmed" } },
          },
          fieldSources: { ...state.fieldSources, [action.field]: entry.source },
          confirmed: { ...state.confirmed, [action.field]: true },
        };
        const outcome = this.leaveReviewIfComplete(confirmedState);
        if (outcome.message) messages.push(outcome.message);
        return { state: outcome.state, messages, completed: false };
      }

      case "correct_extracted_field": {
        const entry = state.review?.fields[action.field];
        if (!state.review || !entry) {
          return { state, messages, completed: false };
        }
        messages.push({ role: "user", content: action.value });
        const correctedState: F010State = {
          ...applyF010ReviewFieldValue(state, action.field, action.value),
          review: {
            ...state.review,
            fields: { ...state.review.fields, [action.field]: { ...entry, status: "corrected" } },
          },
          // "user_correction" — même provenance que la correction F009 d'un champ déjà proposé.
          fieldSources: { ...state.fieldSources, [action.field]: "user_correction" },
          confirmed: { ...state.confirmed, [action.field]: true },
        };
        const outcome = this.leaveReviewIfComplete(correctedState);
        if (outcome.message) messages.push(outcome.message);
        return { state: outcome.state, messages, completed: false };
      }

      case "submit_frais": {
        const source = action.source ?? "manual";
        messages.push({
          role: "user",
          content:
            `Frais : ${action.fraisNotaire.toLocaleString("fr-FR")} € — ` +
            (action.choixTraitementFrais === "integration"
              ? "ajoutés à la valeur du bien"
              : "déduits immédiatement"),
        });
        const next = advance(
          state,
          {
            fraisNotaire: action.fraisNotaire,
            choixTraitementFrais: action.choixTraitementFrais,
            // Cycle 4B : même règle de préservation qu'à submit_bien.
            natureBien: action.natureBien ?? state.natureBien,
            fieldSources: {
              ...state.fieldSources,
              fraisNotaire: source,
              choixTraitementFrais: "judgment",
            },
            confirmed: { ...state.confirmed, fraisNotaire: true, choixTraitementFrais: true },
          },
          "collect_mobilier",
        );
        messages.push({
          role: "assistant",
          content:
            "Le prix inclut-il du mobilier (cuisine équipée, meubles) ? " +
            "Si oui, indiquez son montant estimé ; sinon, passez cette étape.",
        });
        return { state: next, messages, completed: false };
      }

      case "submit_mobilier": {
        const source = action.source ?? "manual";
        messages.push({
          role: "user",
          content: `Mobilier : ${action.montantMobilier.toLocaleString("fr-FR")} €`,
        });
        const next = advance(
          state,
          {
            mobilierInclus: action.montantMobilier > 0,
            montantMobilier: action.montantMobilier,
            mobilierMode: action.mode,
            fieldSources: { ...state.fieldSources, montantMobilier: source },
            confirmed: { ...state.confirmed, montantMobilier: true },
          },
          "ventilation",
        );
        messages.push(this.ventilationPrompt(next));
        return { state: next, messages, completed: false };
      }

      case "skip_mobilier": {
        messages.push({ role: "user", content: "Pas de mobilier" });
        const next = advance(
          state,
          {
            mobilierInclus: false,
            montantMobilier: 0,
            confirmed: { ...state.confirmed, montantMobilier: true },
          },
          "ventilation",
        );
        messages.push(this.ventilationPrompt(next));
        return { state: next, messages, completed: false };
      }

      case "submit_ventilation": {
        messages.push({
          role: "user",
          content: `Part du terrain : ${Math.round(action.ratioTerrain * 100)} %`,
        });
        const staged: F010State = {
          ...state,
          ratioTerrain: action.ratioTerrain,
          localisation: action.localisation ?? state.localisation,
          fieldSources: { ...state.fieldSources, ratioTerrain: action.source ?? "judgment" },
          confirmed: { ...state.confirmed, ratioTerrain: true },
        };

        // Correctif dead-end (Cycle 3, contrainte #9) : jamais de message générique
        // sans destination — le champ manquant précis est nommé et l'état est
        // redirigé vers l'écran qui permet de le renseigner.
        const missingStep = resolveF010MissingStep(staged);
        if (missingStep) {
          messages.push({
            role: "assistant",
            content: buildF010MissingFieldsMessage(staged, missingStep),
          });
          return { state: advance(staged, {}, missingStep), messages, completed: false };
        }

        const result = this.computePlan(staged);
        const next = advance(staged, { result: result! }, "review_plan");
        messages.push({ role: "assistant", content: result!.explanation });
        if (!result!.planValide) {
          messages.push({
            role: "assistant",
            content:
              "Attention : une incohérence a été détectée dans le calcul. " +
              "Vérifiez les montants saisis avant de confirmer.",
          });
        }
        messages.push({
          role: "assistant",
          content: "Ces éléments vous conviennent-ils ?",
          suggestions: [
            { id: "confirm", label: "Oui, je valide" },
            { id: "restart", label: "Recommencer" },
          ],
        });
        return { state: next, messages, completed: false };
      }

      case "confirm": {
        messages.push({ role: "user", content: "Oui, je valide" });
        messages.push({
          role: "assistant",
          content:
            "Votre logement est enregistré. Nous pouvons passer à l'étape suivante de votre dossier.",
        });
        return { state: advance(state, {}, "complete"), messages, completed: true };
      }

      case "go_back": {
        const history = state.history ?? [];

        if (history.length === 0) {
          // Une session reprise directement en COMPLETE (repli legacy) n'a pas
          // encore d'historique mais doit rester modifiable (miroir garde-fou 1 F009).
          if (state.step === "complete") {
            return { state: { ...state, step: "review_plan" }, messages, completed: false };
          }
          return { state, messages, completed: false };
        }

        const previousStep = history[history.length - 1]!;
        const next: F010State = {
          ...state,
          step: previousStep,
          history: history.slice(0, -1),
        };
        return { state: next, messages, completed: false };
      }

      default:
        return { state, messages, completed: false };
    }
  }

  private ventilationPrompt(state: F010State): F010Message {
    return {
      role: "assistant",
      content:
        "Dernière étape : la part du prix qui correspond au terrain. " +
        (state.typeBien === "maison"
          ? "Pour une maison, elle est généralement plus élevée que pour un appartement."
          : "Pour un appartement, elle est généralement modérée.") +
        " Nous vous proposerons une estimation que vous pourrez ajuster.",
    };
  }

  /**
   * Quitte `review_extraction` UNIQUEMENT si tous les champs revus sont
   * sortis de l'état "pending" (contrainte Cycle 4C1 #6) — jamais parce
   * qu'une proposition existe simplement, jamais un `Object.assign` global.
   * Appelée après `analysis_success` (peut traverser instantanément si la
   * review est déjà complète — ex. tout `unavailable`) et après chaque
   * `confirm_extracted_field`/`correct_extracted_field`.
   *
   * Cycle 4E2 : quand la sortie atterrit sur un écran conversationnel
   * (`collect_bien`/`collect_frais`/`collect_mobilier`/`ventilation`), un
   * message explicatif est renvoyé — construit à partir du MÊME `missing`
   * déjà déterminé ci-dessous, jamais une seconde détermination. `undefined`
   * quand la review reste inchangée (encore incomplète) ou atterrit sur
   * `review_plan` (cas géré séparément par l'appelant `analysis_success`).
   */
  private leaveReviewIfComplete(state: F010State): { state: F010State; message?: F010Message } {
    if (state.step !== "review_extraction") return { state };
    if (!isF010ReviewComplete(state.review)) return { state };

    const missing = nextMissingF010Field(state);
    if (missing === null) {
      const result = this.computePlan(state);
      return { state: advance(state, result ? { result } : {}, "review_plan") };
    }
    const nextState = advance(state, {}, stepForF010Field(missing));
    return { state: nextState, message: buildF010ReviewTransitionMessage(missing) ?? undefined };
  }

  /** Orchestration TRF-0001 → TRF-0014 + explication (couche présentation). */
  private computePlan(state: F010State): F010Result | null {
    if (
      state.prixAcquisition === undefined ||
      state.fraisNotaire === undefined ||
      state.choixTraitementFrais === undefined ||
      state.typeBien === undefined ||
      state.ratioTerrain === undefined
    ) {
      return null;
    }

    const dateDebut = this.deps.dateMiseEnService ?? `${this.ctx.fiscalYear}-01-01`;

    const computed = computeAmortizationPlan({
      prixAcquisition: state.prixAcquisition,
      mobilierInclus: Boolean(state.mobilierInclus),
      montantMobilier: state.montantMobilier,
      fraisNotaire: state.fraisNotaire,
      choixTraitementFrais: state.choixTraitementFrais,
      typeBien: state.typeBien,
      ratioTerrain: state.ratioTerrain,
      mobilierMode: state.mobilierMode ?? "lot",
      dateMiseEnService: dateDebut,
      exerciceFiscal: this.ctx.fiscalYear,
    });

    const explain = explainPlan({ composants: computed.composants });

    return {
      prixRevient: computed.prixRevient,
      montantMobilierIsole: computed.montantMobilierIsole,
      valeurTerrain: computed.valeurTerrain,
      valeurBati: computed.valeurBati,
      baseAmortissableBati: computed.baseAmortissableBati,
      prorataRatio: computed.prorataRatio,
      dotationAnnuelle: explain.dotationAnnuelle,
      dureeMoyenneAnnees: explain.dureeMoyenneAnnees,
      plan: computed.plan,
      planValide: computed.planValide,
      explanation: explain.explanation,
      anomalies: computed.anomalies,
    };
  }
}

export { createInitialF010State, toF010PersistedState, shouldResumeF010 };
export type {
  F010Action,
  F010AcquisitionSource,
  F010AssistantTurn,
  F010Deps,
  F010ExtractionReview,
  F010ExtractionReviewField,
  F010FieldKey,
  F010Message,
  F010Nature,
  F010PersistedState,
  F010Result,
  F010ReviewFieldKey,
  F010ReviewFieldStatus,
  F010State,
  F010Step,
  F010Suggestion,
} from "./types";
