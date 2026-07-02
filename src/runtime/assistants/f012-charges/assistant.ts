import {
  buildCategoryInventory,
  computeChargesExercice,
} from "../../capabilities/f012/compute-charges-exercice";
import type { CoproLigneInput } from "../../capabilities/f012/compute-copro-deductible";
import { mapChoixToNature } from "../../capabilities/f012/qualify-travail";
import type { NatureIntervention } from "../../capabilities/f012/types";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import { explainCharges } from "../../presentation/explain-charges";
import { validateCharges } from "../../capabilities/f012/validate-charges";
import {
  createInitialF012State,
  type F012Action,
  type F012AssistantTurn,
  type F012CategoryId,
  type F012Deps,
  type F012Message,
  type F012State,
  type F012TravauxDraft,
} from "./types";

const PROFILAGE_SUGGESTIONS = [
  { id: "profil_submit", label: "Valider le profil (démo)" },
];

const QUALIFICATION_SUGGESTIONS = [
  { id: "reparation_identique", label: "Remplacé ou réparé à l'identique" },
  { id: "amelioration", label: "Amélioré par rapport à avant" },
  { id: "mixte", label: "Les deux à la fois (même facture)" },
  { id: "incertain", label: "Je ne suis pas certain" },
];

function profilagePrompt(): F012Message {
  return {
    role: "assistant",
    content:
      "Avant de collecter vos charges, quelques questions rapides :\n\n" +
      "• Bien en copropriété ?\n" +
      "• Géré par une agence ?\n" +
      "• Travaux ou réparations cette année ?\n" +
      "• Périodes de vacance ?\n" +
      "• Expert-comptable ou logiciel ?\n\n" +
      "Répondez via le formulaire ci-dessous.",
    suggestions: PROFILAGE_SUGGESTIONS,
  };
}

function categoryLabel(id: F012CategoryId): string {
  const labels: Record<F012CategoryId, string> = {
    taxe_fonciere: "Taxe foncière",
    assurance_pno: "Assurance PNO",
    assurance_gli: "Assurance GLI",
    copropriete: "Charges de copropriété",
    honoraires_gestion: "Honoraires de gestion",
    travaux: "Travaux et réparations",
    honoraires_comptable: "Honoraires comptables",
    frais_bancaires: "Frais bancaires",
    divers: "Charges diverses",
  };
  return labels[id];
}

function categoryPrompt(categoryId: F012CategoryId): F012Message {
  switch (categoryId) {
    case "taxe_fonciere":
      return {
        role: "assistant",
        content: "Quel montant de taxe foncière avez-vous réglé pour cet exercice ?",
      };
    case "assurance_pno":
      return {
        role: "assistant",
        content: "Quel est le montant annuel de votre assurance PNO ?",
      };
    case "assurance_gli":
      return {
        role: "assistant",
        content: "Quel est le montant annuel de votre assurance GLI (loyers impayés) ?",
      };
    case "copropriete":
      return {
        role: "assistant",
        content:
          "Indiquez les montants du décompte syndic : provisions courantes, régularisation, " +
          "fonds de travaux ALUR et éventuels appels de fonds gros travaux.",
      };
    case "honoraires_gestion":
      return {
        role: "assistant",
        content: "Quels sont vos honoraires de gestion et frais d'état des lieux pour l'année ?",
      };
    case "travaux":
      return {
        role: "assistant",
        content:
          "Décrivez une dépense de travaux (description + montant). " +
          "Nous la qualifierons ensemble — réparation ou amélioration.",
        suggestions: [{ id: "finish_travaux", label: "Passer à la catégorie suivante" }],
      };
    case "honoraires_comptable":
      return {
        role: "assistant",
        content: "Quel montant d'honoraires comptables ou d'abonnement logiciel ?",
      };
    case "frais_bancaires":
      return {
        role: "assistant",
        content: "Des frais bancaires liés au compte du bien ? (optionnel — 0 pour passer)",
      };
    case "divers":
      return {
        role: "assistant",
        content: "D'autres dépenses à ajouter ? (optionnel)",
        suggestions: [{ id: "skip_category", label: "Non, continuer" }],
      };
    default:
      return { role: "assistant", content: "Catégorie suivante." };
  }
}

function choixToNature(choix: string): NatureIntervention {
  const mapped = mapChoixToNature(choix as Parameters<typeof mapChoixToNature>[0]);
  if (mapped === "mixte") return "entretien";
  return mapped;
}

export class F012ChargesAssistant {
  constructor(
    private readonly ctx: RuntimeContext,
    private readonly deps: F012Deps = {},
  ) {}

  start(): F012AssistantTurn {
    return {
      state: createInitialF012State(),
      messages: [profilagePrompt()],
      completed: false,
    };
  }

  async handle(state: F012State, action: F012Action): Promise<F012AssistantTurn> {
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
        messages.push({
          role: "user",
          content:
            `Copropriété : ${action.copropriete ? "oui" : "non"} — ` +
            `Agence : ${action.agence ? "oui" : "non"} — ` +
            `Travaux : ${action.travaux ? "oui" : "non"}`,
        });
        const first = inventory[0];
        if (!first) {
          return this.buildReview(state, profil, inventory, messages);
        }
        messages.push({
          role: "assistant",
          content: `Votre inventaire comporte ${inventory.length} catégories. Commençons par : ${categoryLabel(first)}.`,
        });
        messages.push(categoryPrompt(first));
        return {
          state: {
            ...state,
            profil,
            categoryInventory: inventory,
            currentCategoryIndex: 0,
            step: "category_collect",
          },
          messages,
          completed: false,
        };
      }

      case "skip_category":
        return this.advanceCategory(state, messages, { skipped: true });

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
          userContent: `Assurance PNO : ${action.montant.toLocaleString("fr-FR")} €`,
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

      case "submit_divers":
        if (action.montant <= 0) return this.advanceCategory(state, messages, { skipped: true });
        return this.afterCategoryInput(state, messages, {
          diversItem: { id: `divers-${Date.now()}`, description: action.description, montant: action.montant },
          fieldKey: action.description,
          source: action.source,
          userContent: `${action.description} : ${action.montant.toLocaleString("fr-FR")} €`,
        });

      case "start_travaux":
        messages.push({
          role: "assistant",
          content: "Décrivez la dépense (ex. « remplacement chauffe-eau ») et son montant.",
        });
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
        messages.push({
          role: "assistant",
          content:
            "Cette dépense a-t-elle remis le bien dans son état antérieur, ou l'a-t-elle amélioré ?",
          suggestions: QUALIFICATION_SUGGESTIONS,
        });
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
        if (!state.pendingTravaux?.description || !state.pendingTravaux.montant) {
          return { state, messages, completed: false };
        }
        messages.push({ role: "user", content: QUALIFICATION_SUGGESTIONS.find((s) => s.id === action.choix)?.label ?? action.choix });

        if (action.choix === "mixte") {
          messages.push({
            role: "assistant",
            content: "Pouvez-vous estimer la part remise en état (€) ?",
          });
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

        const draft: F012TravauxDraft = {
          id: state.pendingTravaux.id!,
          description: state.pendingTravaux.description,
          montant: state.pendingTravaux.montant,
          choix: action.choix,
          natureIntervention: choixToNature(action.choix),
        };
        const travaux = [...state.collected.travaux, draft];
        const preview = this.compute(state, { ...state.collected, travaux });
        messages.push({
          role: "assistant",
          content: this.travauxPreviewMessage(draft, preview),
          suggestions: [
            { id: "start_travaux", label: "Ajouter une autre dépense" },
            { id: "finish_travaux", label: "Terminer les travaux" },
          ],
        });
        return {
          state: {
            ...state,
            collected: { ...state.collected, travaux },
            pendingTravaux: undefined,
            travauxSubStep: undefined,
          },
          messages,
          completed: false,
          event: draft.natureIntervention !== "entretien" ? "COMPOSANT_NOUVEAU" : undefined,
        };
      }

      case "submit_travaux_split": {
        if (!state.pendingTravaux?.description || !state.pendingTravaux.montant) {
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
        const travaux = [...state.collected.travaux, draft];
        messages.push({
          role: "user",
          content: `Part réparation : ${action.montantReparation.toLocaleString("fr-FR")} €`,
        });
        messages.push({
          role: "assistant",
          content: this.travauxPreviewMessage(draft, this.compute(state, { ...state.collected, travaux })),
          suggestions: [
            { id: "start_travaux", label: "Ajouter une autre dépense" },
            { id: "finish_travaux", label: "Terminer les travaux" },
          ],
        });
        return {
          state: {
            ...state,
            collected: { ...state.collected, travaux },
            pendingTravaux: undefined,
            travauxSubStep: undefined,
          },
          messages,
          completed: false,
          event: "COMPOSANT_NOUVEAU",
        };
      }

      case "finish_travaux_category":
        return this.advanceCategory(state, messages, { skipped: false });

      case "confirm_completeness": {
        messages.push({
          role: "user",
          content: action.hasOther ? "Oui, j'ai d'autres dépenses" : "Non, c'est complet",
        });
        return this.buildReview(state, state.profil!, state.categoryInventory, messages);
      }

      case "confirm_all": {
        messages.push({ role: "user", content: "Oui, je valide" });
        const result = this.buildResult(state);
        messages.push({ role: "assistant", content: result.explanation });
        messages.push({
          role: "assistant",
          content: "Vos charges sont enregistrées. Vous pouvez passer à l'étape suivante.",
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
      diversItem?: { id: string; description: string; montant: number };
      fieldKey: string;
      source?: import("../../contracts/FieldSource").FieldSource;
      userContent: string;
    },
  ): F012AssistantTurn {
    messages.push({ role: "user", content: input.userContent });
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

    const fieldSources = { ...state.fieldSources };
    if (input.source) fieldSources[input.fieldKey] = input.source;

    const preview = this.compute(state, collected);
    if (input.coproLignes?.some((l) => l.type === "fonds_travaux")) {
      messages.push({
        role: "assistant",
        content:
          "Le fonds de travaux ALUR n'est pas déductible l'année du versement — " +
          "c'est une épargne forcée, déductible quand les travaux seront réalisés.",
      });
    }

    messages.push({
      role: "assistant",
      content: `Total charges déductibles à ce stade : ${Math.round(preview.charges.totalDeductible).toLocaleString("fr-FR")} €`,
    });

    return this.advanceCategory(
      { ...state, collected, fieldSources },
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

    if (!nextId) {
      messages.push({
        role: "assistant",
        content: "Avez-vous des dépenses que nous n'avons pas encore abordées ?",
        suggestions: [
          { id: "completeness_no", label: "Non, c'est complet" },
          { id: "completeness_yes", label: "Oui, j'en ai d'autres" },
        ],
      });
      return {
        state: {
          ...state,
          collected: { ...state.collected, skippedCategories: skipped },
          step: "completeness",
          currentCategoryIndex: nextIndex,
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
    messages.push(categoryPrompt(nextId));

    return {
      state: {
        ...state,
        collected: { ...state.collected, skippedCategories: skipped },
        currentCategoryIndex: nextIndex,
        step: "category_collect",
      },
      messages,
      completed: false,
      event: "CHARGES_PARTIELLE",
    };
  }

  private buildReview(
    state: F012State,
    profil: NonNullable<F012State["profil"]>,
    inventory: F012CategoryId[],
    messages: F012Message[],
  ): F012AssistantTurn {
    const result = this.buildResult({ ...state, profil, categoryInventory: inventory });
    messages.push({ role: "assistant", content: result.explanation });
    messages.push({
      role: "assistant",
      content: "Ces montants vous conviennent-ils ?",
      suggestions: [{ id: "confirm_all", label: "Oui, je valide" }],
    });
    return {
      state: { ...state, profil, categoryInventory: inventory, result, step: "aggregate_review" },
      messages,
      completed: false,
    };
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
    return {
      charges: computed.charges,
      explanation: explain.explanation,
      immobilisationNotes: explain.immobilisationNotes,
      anomalies: [...computed.anomalies, ...validation.anomalies],
      composantsNouveaux: computed.charges.composantsNouveaux,
    };
  }

  private compute(state: F012State, collected: F012State["collected"]) {
    const travaux = collected.travaux.map((t) => ({
      id: t.id,
      description: t.description,
      montant: t.montant,
      natureIntervention: t.natureIntervention ?? "entretien",
      montantReparation: t.montantReparation,
      source: state.fieldSources[`travaux-${t.id}`],
    }));

    return computeChargesExercice({
      exerciceFiscal: this.ctx.fiscalYear,
      dateMiseEnService: this.deps.dateMiseEnService ?? `${this.ctx.fiscalYear}-06-01`,
      taxeFonciere: collected.taxeFonciere,
      assurancePno: collected.assurancePno,
      assuranceGli: collected.assuranceGli,
      coproLignes: collected.coproLignes,
      honorairesGestion: collected.honorairesGestion,
      fraisEtatDesLieux: collected.fraisEtatDesLieux,
      honorairesComptable: collected.honorairesComptable,
      fraisBancaires: collected.fraisBancaires,
      divers: collected.divers,
      travaux,
      fieldSources: state.fieldSources,
    });
  }
}

export { createInitialF012State };
export type {
  F012Action,
  F012AssistantTurn,
  F012CategoryId,
  F012Deps,
  F012Message,
  F012Result,
  F012State,
  F012Step,
  F012Suggestion,
} from "./types";
