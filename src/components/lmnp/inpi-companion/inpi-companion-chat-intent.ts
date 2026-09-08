/**
 * Compagnon INPI — classifieur d'intentions conversationnelles (Phase 4.5.1).
 *
 * 100 % déterministe : mots-clés + contexte déjà calculé (mode, conflits).
 * Aucun appel LLM, aucune interprétation "intelligente" du langage naturel.
 * `free_question` est le repli assumé — future porte d'entrée d'une couche
 * conversationnelle (Phase 4.5.3+), jamais construite ici.
 *
 * Ordre de priorité GELÉ (documenté en Phase 4.5.1, §8) — ne pas réordonner
 * sans revalidation produit : une régularisation ou une divergence d'écran
 * doivent toujours l'emporter sur une lecture générique "aide sur un champ".
 */

import type { InpiCompanionChatContext } from "./inpi-companion-chat-context";

export type InpiCompanionIntent =
  | "regularization"
  | "screen_divergence"
  | "conflict"
  | "lost"
  | "resume"
  | "unknown_status"
  | "already_registered"
  | "multi_property"
  | "out_of_scope"
  | "field_help"
  | "free_question";

/** Contexte minimal requis par le classifieur — jamais le contexte complet par obligation, seulement ce qui sert réellement à la classification. */
export type InpiCompanionIntentContext = Pick<InpiCompanionChatContext, "mode" | "conflicts">;

function normalize(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function matchesAny(normalized: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => normalized.includes(pattern));
}

const REGULARIZATION_PATTERNS = [
  "regularisation",
  "regulariser",
  "corriger mon dossier",
  "demande de correction",
  "demande une correction",
  "demande de complement",
  "message de l'inpi",
  "message recu de l'inpi",
  // Motif exact : ne doit PAS matcher « me demande autre chose » (screen_divergence).
  "demande quelque chose",
] as const;

const SCREEN_DIVERGENCE_PATTERNS = [
  "pas la meme chose",
  "ecran est different",
  "ecran different",
  "mon ecran",
  "ecran inpi",
  "je n'ai pas cette rubrique",
  "je n'ai pas cette option",
  "chez moi le bouton",
  "ca ne correspond pas",
  "je ne vois pas ca",
  "je ne trouve pas cette rubrique",
  "me demande autre chose",
  "demande autre chose",
  "differe de votre explication",
] as const;

const CONFLICT_PATTERNS = [
  "differe",
  "different de celui",
  "deux valeurs",
  "deux informations",
  "lequel dois-je",
  "laquelle dois-je",
  "quelle est la bonne",
  "quelle valeur",
  // Volontairement ancrés SIREN/SIRET — jamais un « ne correspond pas » générique
  // qui capturerait « mon écran INPI ne correspond pas » (screen_divergence).
  "siren ne correspond",
  "siret ne correspond",
] as const;

const LOST_PATTERNS = [
  "je suis perdu",
  "completement perdu",
  "je ne sais plus quoi faire",
  "je ne sais pas quoi faire",
  "je ne sais plus ou",
  "qu'est-ce qu'il me reste",
  "qu'est ce qu'il me reste",
] as const;

const RESUME_PATTERNS = [
  "je veux reprendre",
  "reprendre mon dossier",
  "reprendre mon accompagnement",
  "ou en etais-je",
  "ou j'en etais",
  "continuer mon dossier",
  "j'ai commence ma demarche",
  "j'ai envoye ma demande",
] as const;

const UNKNOWN_STATUS_PATTERNS = [
  "je ne sais pas si je suis",
  "je ne sais pas si j'ai un siren",
  "je ne sais pas si j'ai un siret",
  "je ne sais pas si mon activite",
  "comment savoir si j'ai un siren",
  "comment savoir si je suis",
] as const;

const ALREADY_REGISTERED_PATTERNS = [
  "j'ai deja mon siren",
  "j'ai deja un siret",
  "j'ai deja un siren",
  "mon activite est deja declaree",
  "je suis deja enregistre",
  "je suis deja inscrit",
  "j'ai deja fait ma demarche",
] as const;

const MULTI_PROPERTY_PATTERNS = [
  "plusieurs biens",
  "plusieurs logements",
  "plusieurs appartements",
  "deux biens",
  "deux logements",
] as const;

const OUT_OF_SCOPE_PATTERNS = [
  "impot",
  "declaration fiscale",
  "calcul d'impot",
  "amortissement",
  "comptabilite",
  "credit d'impot",
  "reduction d'impot",
  " tva",
  "a ma place",
  "faites-la pour moi",
  "faites la pour moi",
  "faire la demarche pour moi",
  "faites la demarche",
] as const;

const FIELD_HELP_PATTERNS = [
  "c'est quoi",
  "que dois-je mettre",
  "qu'est-ce que je dois",
  "qu'est ce que je dois",
  "je ne comprends pas cette",
  "que signifie",
  "a quoi correspond",
  "a quoi sert",
] as const;

/** « pour moi » n'est hors périmètre que s'il s'agit clairement de faire la démarche INPI à la place du client — jamais un « pour moi » isolé. */
function isDoingFormalityForUser(normalized: string): boolean {
  if (!normalized.includes("pour moi")) return false;
  return (
    normalized.includes("demarche") ||
    normalized.includes("inpi") ||
    normalized.includes("formalite") ||
    normalized.includes("guichet")
  );
}

/**
 * Classification 100 % déterministe, ordre de priorité fixe (§8) :
 * regularization → screen_divergence → conflict → lost → resume →
 * unknown_status → already_registered → multi_property → out_of_scope →
 * field_help → free_question (repli).
 *
 * `context` n'est utilisé que pour deux signaux explicitement autorisés par
 * l'audit (§9) : le mode courant (regularization) et la présence d'un
 * conflit déjà calculé par le moteur (conflict) — jamais pour deviner autre
 * chose sur le dossier.
 */
export function classifyInpiCompanionIntent(
  message: string,
  context: InpiCompanionIntentContext,
): InpiCompanionIntent {
  const normalized = normalize(message);

  if (context.mode === "regularisation" || matchesAny(normalized, REGULARIZATION_PATTERNS)) {
    return "regularization";
  }
  if (matchesAny(normalized, SCREEN_DIVERGENCE_PATTERNS)) {
    return "screen_divergence";
  }
  if (context.conflicts.length > 0 || matchesAny(normalized, CONFLICT_PATTERNS)) {
    return "conflict";
  }
  if (matchesAny(normalized, LOST_PATTERNS)) {
    return "lost";
  }
  if (matchesAny(normalized, RESUME_PATTERNS)) {
    return "resume";
  }
  if (matchesAny(normalized, UNKNOWN_STATUS_PATTERNS)) {
    return "unknown_status";
  }
  if (matchesAny(normalized, ALREADY_REGISTERED_PATTERNS)) {
    return "already_registered";
  }
  if (matchesAny(normalized, MULTI_PROPERTY_PATTERNS)) {
    return "multi_property";
  }
  if (matchesAny(normalized, OUT_OF_SCOPE_PATTERNS) || isDoingFormalityForUser(normalized)) {
    return "out_of_scope";
  }
  if (matchesAny(normalized, FIELD_HELP_PATTERNS)) {
    return "field_help";
  }
  return "free_question";
}
