/**
 * Compagnon INPI — suggestions contextuelles du chat (Phase 4.5.2).
 *
 * Pure, sans React : dérive 2-3 suggestions à partir du `InpiCompanionChatContext`
 * déjà construit (Phase 4.5.1) — ne recalcule rien, ne lit aucune source
 * supplémentaire. Volontairement une courte liste fermée, pas une
 * bibliothèque générique de questions (§11).
 */

import type { InpiCompanionChatContext } from "./inpi-companion-chat-context";

const MAX_SUGGESTIONS = 3;

/**
 * Ordre de priorité : les signaux les plus spécifiques au dossier en cours
 * (conflit, régularisation, étape précise, multi-biens, diagnostic, synthèse)
 * avant le repli générique "Je suis perdu", ajouté uniquement si rien
 * d'autre ne s'applique.
 */
export function buildInpiCompanionChatSuggestions(context: InpiCompanionChatContext): string[] {
  const suggestions: string[] = [];

  if (context.conflicts.length > 0) {
    suggestions.push("Je ne comprends pas cette différence");
  }
  if (context.mode === "regularisation") {
    suggestions.push("Je ne comprends pas le message de l'INPI");
  }
  if (context.step === "siren_siret") {
    suggestions.push("À quoi sert le SIREN ?");
  }
  if (context.isMultiProperty) {
    suggestions.push("J'ai plusieurs logements");
  }
  if (context.mode === "diagnostic") {
    suggestions.push("Je ne sais pas si mon activité est déjà déclarée");
  }
  if (context.step === "synthese") {
    suggestions.push("Je veux vérifier avant d'aller sur l'INPI");
  }

  if (suggestions.length === 0) {
    suggestions.push("Je suis perdu");
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}
