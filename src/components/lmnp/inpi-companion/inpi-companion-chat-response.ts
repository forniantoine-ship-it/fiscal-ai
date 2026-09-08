/**
 * Compagnon INPI — réponses conversationnelles déterministes (Phase 4.5.3).
 *
 * Pure : classifieur 4.5.1 + contexte 4.5.1 → texte affichable. Aucun I/O,
 * aucune mutation, aucun LLM, aucun store. `orientation` décrit seulement
 * vers quel contrôle DU PANEL pointer — jamais une action exécutable.
 */

import type { InpiCompanionChatContext, InpiCompanionNextAction } from "./inpi-companion-chat-context";
import type { InpiCompanionIntent } from "./inpi-companion-chat-intent";
import { buildInpiCompanionChatSuggestions } from "./inpi-companion-chat-suggestions";
import type { InpiCompanionFieldKey, InpiCompanionMode } from "@/runtime/assistants/inpi-companion/types";

export type InpiCompanionChatOrientation =
  | "stay_on_step"
  | "use_panel_buttons"
  | "open_official_via_companion"
  | "paste_inpi_message";

export type InpiCompanionChatReply = {
  text: string;
  orientation?: InpiCompanionChatOrientation;
};

export type BuildInpiCompanionChatReplyInput = {
  message: string;
  intent: InpiCompanionIntent;
  context: InpiCompanionChatContext;
};

/** Copy d'étape déjà utilisée par le Panel — recopiée ici pour ne pas extraire InpiCompanionPanel (gelé). */
const FIELD_EXPLANATIONS: Record<InpiCompanionFieldKey, string> = {
  identite: "L'INPI vous demandera de confirmer votre identité en tant qu'exploitant.",
  activite:
    "D'après votre dossier, nous pensons que votre activité correspond à de la location meublée. Vérifiez que cela correspond bien à votre situation.",
  date_debut: "C'est la date d'immatriculation, distincte de la date de première mise en location.",
  etablissement: "L'adresse de l'établissement INPI n'est pas toujours la même que l'adresse du bien loué.",
  siren_siret:
    "Cette valeur provient d'un document ou d'une saisie précédente — elle n'est pas vérifiée en direct auprès de l'INPI.",
  regime: "Fiscal AI accompagne uniquement le régime réel simplifié.",
  domiciliation:
    "Le choix de l'adresse de domiciliation de votre entreprise vous appartient — nous ne pouvons pas le déterminer à votre place.",
  documents: "Voici ce que nous savons déjà de votre dossier documentaire.",
};

const MODE_LABEL: Record<InpiCompanionMode, string> = {
  diagnostic: "faire le point sur votre situation INPI",
  creation: "préparer votre démarche",
  poursuite: "poursuivre la préparation déjà commencée ici",
  attente: "attendre le traitement de l'envoi que vous avez indiqué",
  regularisation: "vous aider à comprendre une demande de l'INPI",
  verification: "vérifier les informations d'une activité déjà enregistrée",
};

const NEXT_ACTION_HINT: Record<InpiCompanionNextAction, string> = {
  confirm_field: "Confirmez l'information affichée dans le Compagnon, juste au-dessus.",
  resolve_conflict: "Utilisez les boutons du Compagnon pour indiquer quelle information retenir.",
  provide_missing_field: "Renseignez ou décidez cette information dans le Compagnon, juste au-dessus.",
  review_summary: "Vérifiez le récapitulatif affiché dans le Compagnon.",
  open_official_inpi:
    "Quand vous serez prêt, ouvrez le Guichet unique depuis le bouton du Compagnon — pas depuis ce chat.",
  resume: "Reprenez l'accompagnement depuis les boutons du Compagnon.",
  wait: "Pour l'instant, il n'y a rien à déposer ici : nous attendons le traitement ou votre numéro.",
  explain: "Suivez les indications affichées dans le Compagnon, juste au-dessus.",
};

function normalize(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function currentStepPhrase(context: InpiCompanionChatContext): string {
  return context.currentQuestion?.label ?? "l'étape affichée au-dessus";
}

function resolveHelpField(message: string, context: InpiCompanionChatContext): InpiCompanionFieldKey | undefined {
  const n = normalize(message);
  if (n.includes("siren") || n.includes("siret")) return "siren_siret";
  if (n.includes("domiciliation") || n.includes("domicilier")) return "domiciliation";
  if (n.includes("etablissement")) return "etablissement";
  if (n.includes("date de debut") || n.includes("debut d'activite") || n.includes("immatriculation")) {
    return "date_debut";
  }
  if (n.includes("regime")) return "regime";
  if (n.includes("identite") || n.includes("exploitant")) return "identite";
  if (n.includes("document")) return "documents";
  if (n.includes("activite")) return "activite";
  if (context.currentQuestion?.field) return context.currentQuestion.field;
  if (context.step !== "synthese") return context.step;
  return undefined;
}

function isDoingFormalityForUser(message: string): boolean {
  const n = normalize(message);
  if (n.includes("a ma place")) return true;
  if (n.includes("faites-la pour moi") || n.includes("faites la pour moi")) return true;
  if (n.includes("faire la demarche pour moi") || n.includes("faites la demarche")) return true;
  if (!n.includes("pour moi")) return false;
  return n.includes("demarche") || n.includes("inpi") || n.includes("formalite") || n.includes("guichet");
}

function replyRegularization(): InpiCompanionChatReply {
  return {
    orientation: "paste_inpi_message",
    text:
      "L'INPI vous demande probablement une correction ou un complément, sur son site. Fiscal AI ne voit pas ce message et n'interroge pas l'INPI. Lisez-le directement sur le Guichet unique, puis copiez-le dans le champ prévu du Compagnon si vous souhaitez qu'on vous aide plus tard à le lire. À cette étape, nous n'interprétons pas le contenu de cette demande.",
  };
}

function replyScreenDivergence(context: InpiCompanionChatContext): InpiCompanionChatReply {
  return {
    orientation: "open_official_via_companion",
    text:
      `L'écran du site INPI peut différer de ce que Fiscal AI vous prépare ici — nous accompagnons, nous ne sommes pas l'INPI. Basez-vous sur ce que le site officiel affiche, puis revenez au Compagnon. Pour l'instant, l'étape de préparation est : ${currentStepPhrase(context)}. Ouvrez le Guichet unique depuis le bouton du Compagnon, pas depuis ce chat.`,
  };
}

function replyConflict(context: InpiCompanionChatContext): InpiCompanionChatReply {
  const conflict = context.conflicts[0];
  const values = conflict
    ? ` Dans votre dossier : « ${conflict.previousValue} ». Dans le document : « ${conflict.newValue} ».`
    : "";
  return {
    orientation: "use_panel_buttons",
    text:
      `Deux informations différentes ont été trouvées.${values} C'est à vous de choisir, avec les boutons déjà affichés dans le Compagnon. Fiscal AI ne peut pas dire laquelle est officiellement correcte auprès de l'INPI.`,
  };
}

function replyLost(context: InpiCompanionChatContext): InpiCompanionChatReply {
  const orientation: InpiCompanionChatReply["orientation"] =
    context.nextAction === "resolve_conflict" || context.nextAction === "resume"
      ? "use_panel_buttons"
      : "stay_on_step";
  const question = context.currentQuestion
    ? `L'étape actuelle est : ${context.currentQuestion.label}. ${context.currentQuestion.reason}`
    : `Vous êtes dans le Compagnon pour ${MODE_LABEL[context.mode]}.`;
  return {
    orientation,
    text: `Pas d'inquiétude, nous avançons étape par étape. ${question} ${NEXT_ACTION_HINT[context.nextAction]}`,
  };
}

function replyResume(context: InpiCompanionChatContext): InpiCompanionChatReply {
  const local = `Dans Fiscal AI, votre accompagnement local sert à ${MODE_LABEL[context.mode]} (étape : ${currentStepPhrase(context)}). Cela décrit où vous en êtes DANS le Compagnon — pas ce que l'INPI a réellement traité.`;
  const official =
    context.dossierInpiStatus === "submitted"
      ? " Vous avez indiqué que la démarche a été envoyée : elle est donc en attente de traitement. Cela ne veut pas dire que l'INPI l'a déjà enregistrée."
      : context.dossierInpiStatus === "registered"
        ? " Vous avez indiqué que votre activité est déjà enregistrée. C'est une information déclarée dans Fiscal AI, pas une vérification en direct auprès de l'INPI."
        : context.dossierInpiStatus === undefined
          ? " Nous n'avons pas encore de statut INPI déclaré dans votre dossier."
          : "";
  return {
    orientation: "use_panel_buttons",
    text: `${local}${official} ${NEXT_ACTION_HINT[context.nextAction]}`,
  };
}

function replyUnknownStatus(context: InpiCompanionChatContext): InpiCompanionChatReply {
  const unknownNote =
    context.dossierInpiStatus === undefined
      ? " L'absence d'information ici n'est pas une preuve de non-immatriculation — ce n'est pas la même chose qu'une démarche « pas encore commencée »."
      : "";
  return {
    orientation: "use_panel_buttons",
    text:
      `Fiscal AI ne peut pas interroger le RNE en temps réel, ni confirmer à votre place si vous avez déjà un SIREN.${unknownNote} Vous pouvez vérifier un Kbis, un avis d'imposition ou un document d'activité, puis utiliser les choix du Compagnon (Diagnostic) pour indiquer où vous en êtes.`,
  };
}

function replyAlreadyRegistered(context: InpiCompanionChatContext): InpiCompanionChatReply {
  const value = context.knownValues.siren_siret ?? context.proposedValues.siren_siret;
  const cited = value
    ? ` Dans votre dossier Fiscal AI, nous avons ${value}.`
    : " Nous n'avons pas encore de numéro SIREN/SIRET dans votre dossier Fiscal AI.";
  const proposedNote =
    !context.knownValues.siren_siret && context.proposedValues.siren_siret
      ? " C'est une information présente dans le dossier, à confirmer — pas une validation officielle de l'INPI."
      : "";
  return {
    orientation: "use_panel_buttons",
    text:
      `Si votre activité est déjà enregistrée, indiquez-le via les contrôles du Compagnon (Diagnostic ou Vérification).${cited}${proposedNote} Nous ne pouvons pas vérifier ce numéro auprès de l'INPI.`,
  };
}

function replyMultiProperty(): InpiCompanionChatReply {
  return {
    orientation: "stay_on_step",
    text:
      "Avoir plusieurs logements ne signifie pas automatiquement plusieurs établissements INPI. Fiscal AI ne peut pas choisir à votre place quel bien correspond à l'adresse d'établissement demandée par l'INPI — cette correspondance vous appartient.",
  };
}

function replyOutOfScope(message: string): InpiCompanionChatReply {
  if (isDoingFormalityForUser(message)) {
    return {
      orientation: "open_official_via_companion",
      text:
        "Fiscal AI prépare et explique votre dossier, mais ne dépose pas la formalité à votre place. C'est vous qui officialisez la démarche sur le Guichet unique, via le bouton du Compagnon.",
    };
  }
  return {
    orientation: "stay_on_step",
    text:
      "Cette question relève du parcours fiscal (assistants et Validation), pas de ce Compagnon. Ici, je vous aide uniquement à préparer la démarche INPI. Continuez l'étape affichée au-dessus quand vous le souhaitez.",
  };
}

function replyFieldHelp(message: string, context: InpiCompanionChatContext): InpiCompanionChatReply {
  const field = resolveHelpField(message, context);
  if (!field) {
    return {
      orientation: "stay_on_step",
      text:
        `Cette étape est un récapitulatif avant d'ouvrir le site officiel. ${NEXT_ACTION_HINT.open_official_inpi}`,
    };
  }
  const proposed = context.proposedValues[field];
  const known = context.knownValues[field];
  const valueNote = known
    ? ` Dans votre dossier Fiscal AI, la valeur confirmée ici est : ${known}.`
    : proposed
      ? ` Dans votre dossier Fiscal AI, une valeur proposée (à confirmer) est : ${proposed}. Ce n'est pas une donnée vérifiée auprès de l'INPI.`
      : "";
  return {
    orientation: "stay_on_step",
    text: `${FIELD_EXPLANATIONS[field]}${valueNote} Vous pouvez continuer l'étape affichée au-dessus.`,
  };
}

function replyFreeQuestion(context: InpiCompanionChatContext): InpiCompanionChatReply {
  const subjects = buildInpiCompanionChatSuggestions(context);
  const subjectLine =
    subjects.length > 0 ? ` Je peux vous aider par exemple sur : ${subjects.join(" ; ")}.` : "";
  return {
    orientation: "stay_on_step",
    text:
      `Je ne suis pas sûr de comprendre cette question précise. L'étape actuelle est : ${currentStepPhrase(context)}.${subjectLine} Vous pouvez poursuivre l'étape affichée au-dessus quand vous voulez.`,
  };
}

export function buildInpiCompanionChatReply(input: BuildInpiCompanionChatReplyInput): InpiCompanionChatReply {
  const { message, intent, context } = input;
  switch (intent) {
    case "regularization":
      return replyRegularization();
    case "screen_divergence":
      return replyScreenDivergence(context);
    case "conflict":
      return replyConflict(context);
    case "lost":
      return replyLost(context);
    case "resume":
      return replyResume(context);
    case "unknown_status":
      return replyUnknownStatus(context);
    case "already_registered":
      return replyAlreadyRegistered(context);
    case "multi_property":
      return replyMultiProperty();
    case "out_of_scope":
      return replyOutOfScope(message);
    case "field_help":
      return replyFieldHelp(message, context);
    case "free_question":
      return replyFreeQuestion(context);
  }
}
