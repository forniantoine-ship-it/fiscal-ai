/**
 * Compagnon INPI — garde LLM (Phase 4.5.4).
 *
 * Pur, sans I/O : décide si un appel serveur est *autorisé* après le
 * classifieur local. Le LLM ne remplace jamais la réponse déterministe
 * (4.5.3) pour les intents métier. Aucun secret, aucun SDK.
 */

import type { InpiCompanionIntent } from "./inpi-companion-chat-intent";

export const INPI_COMPANION_CHAT_LLM_ROUTE = "/api/lmnp/inpi-companion/chat";

const LLM_ALLOWED_INTENTS: ReadonlySet<InpiCompanionIntent> = new Set([
  "free_question",
  "field_help",
]);

export function shouldUseInpiCompanionLlm(intent: InpiCompanionIntent): boolean {
  return LLM_ALLOWED_INTENTS.has(intent);
}
