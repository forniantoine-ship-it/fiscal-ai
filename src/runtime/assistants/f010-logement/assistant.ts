import type { RuntimeContext } from "../../contracts/RuntimeContext";
import { computeAmortizationPlan } from "../../capabilities/f010/compute-amortization-plan";
import { explainPlan } from "../../presentation/explain-plan";
import {
  createInitialF010State,
  type F010Action,
  type F010AssistantTurn,
  type F010Deps,
  type F010Message,
  type F010Nature,
  type F010Result,
  type F010State,
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
          return { state: { ...state, nature: action.nature, step: "coming_soon" }, messages, completed: false };
        }
        messages.push({
          role: "assistant",
          content: "Parfait. Avez-vous votre acte notarié sous la main ?",
          suggestions: SOURCE_SUGGESTIONS,
        });
        return {
          state: { ...state, nature: action.nature, step: "acquisition_source" },
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
          state: { ...state, acquisitionSource: action.source, step: "collect_bien" },
          messages,
          completed: false,
        };
      }

      case "submit_bien": {
        const source = action.source ?? "manual";
        messages.push({
          role: "user",
          content: `Prix d'achat : ${action.prixAcquisition.toLocaleString("fr-FR")} €`,
        });
        const next: F010State = {
          ...state,
          prixAcquisition: action.prixAcquisition,
          typeBien: action.typeBien,
          natureBien: action.natureBien,
          dateAcquisition: action.dateAcquisition,
          surface: action.surface,
          adresse: action.adresse,
          localisation: action.localisation ?? state.localisation,
          step: "collect_frais",
          fieldSources: {
            ...state.fieldSources,
            prixAcquisition: source,
            typeBien: source,
            dateAcquisition: source,
          },
        };
        messages.push({
          role: "assistant",
          content:
            "Combien avez-vous payé de frais de notaire ? " +
            "Vous pourrez choisir de les ajouter à la valeur du bien ou de les déduire immédiatement.",
        });
        return { state: next, messages, completed: false };
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
        const next: F010State = {
          ...state,
          fraisNotaire: action.fraisNotaire,
          choixTraitementFrais: action.choixTraitementFrais,
          step: "collect_mobilier",
          fieldSources: {
            ...state.fieldSources,
            fraisNotaire: source,
            choixTraitementFrais: "judgment",
          },
        };
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
        const next: F010State = {
          ...state,
          mobilierInclus: action.montantMobilier > 0,
          montantMobilier: action.montantMobilier,
          mobilierMode: action.mode,
          step: "ventilation",
          fieldSources: { ...state.fieldSources, montantMobilier: source },
        };
        messages.push(this.ventilationPrompt(next));
        return { state: next, messages, completed: false };
      }

      case "skip_mobilier": {
        messages.push({ role: "user", content: "Pas de mobilier" });
        const next: F010State = {
          ...state,
          mobilierInclus: false,
          montantMobilier: 0,
          step: "ventilation",
        };
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
        };

        const result = this.computePlan(staged);
        if (!result) {
          messages.push({
            role: "assistant",
            content: "Il me manque des informations pour calculer votre plan. Reprenons depuis le début.",
          });
          return { state: staged, messages, completed: false };
        }

        const next: F010State = { ...staged, result, step: "review_plan" };
        messages.push({ role: "assistant", content: result.explanation });
        if (!result.planValide) {
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
        return { state: { ...state, step: "complete" }, messages, completed: true };
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

export { createInitialF010State };
export type {
  F010Action,
  F010AcquisitionSource,
  F010AssistantTurn,
  F010Deps,
  F010Message,
  F010Nature,
  F010Result,
  F010State,
  F010Step,
  F010Suggestion,
} from "./types";
