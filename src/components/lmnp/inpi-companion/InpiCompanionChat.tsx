"use client";

/**
 * Compagnon INPI — UI d'aide contextuelle (Phase 4.5.2).
 *
 * Couche UI UNIQUEMENT : ouvre/ferme un panneau d'aide, affiche des
 * suggestions dérivées du contexte déjà construit (Phase 4.5.1), permet une
 * saisie libre, et classe localement l'intention via `classifyInpiCompanionIntent`
 * — à des fins de validation technique du branchement, pas pour produire une
 * réponse métier (Phase 4.5.3). Aucun appel réseau, aucun LLM, aucune
 * persistance : les messages vivent uniquement en `useState` local, perdus à
 * la fermeture/navigation, exactement comme `RegularisationView` (Phase 4.3).
 *
 * Ne modifie jamais `inpiCompanionState`, `Dossier.inpiStatus`, ni aucune
 * donnée métier — ce composant ne reçoit d'ailleurs aucun moyen de le faire
 * (pas de `dispatch`, pas de `updateInpiStatus` dans ses props).
 */

import { useCallback, useState, type KeyboardEvent } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

import type { InpiCompanionChatContext } from "./inpi-companion-chat-context";
import { classifyInpiCompanionIntent } from "./inpi-companion-chat-intent";
import { buildInpiCompanionChatSuggestions } from "./inpi-companion-chat-suggestions";

type LocalChatMessage = {
  role: "user" | "assistant";
  text: string;
};

/** Réponse neutre, non persistée, affichée le temps de la Phase 4.5.2 uniquement — jamais la nomenclature technique de l'intention (§10). */
const PLACEHOLDER_ACKNOWLEDGEMENT =
  "Merci, votre question a bien été prise en compte. Les réponses détaillées seront bientôt disponibles ici.";

export function InpiCompanionChat({ context }: { context: InpiCompanionChatContext }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  const suggestions = buildInpiCompanionChatSuggestions(context);

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Classification locale uniquement — aucune réponse métier générée ici,
      // aucun appel réseau, aucune mutation du dossier. La couche de réponse
      // déterministe arrive en Phase 4.5.3.
      classifyInpiCompanionIntent(trimmed, context);
      setMessages((previous) => [
        ...previous,
        { role: "user", text: trimmed },
        { role: "assistant", text: PLACEHOLDER_ACKNOWLEDGEMENT },
      ]);
      setDraft("");
    },
    [context],
  );

  const handleWrapperKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") setIsOpen(false);
  }, []);

  if (!isOpen) {
    return (
      <Card variant="muted" className="mx-auto max-w-2xl mt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>Besoin d&apos;aide ?</p>
            <p style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>
              Une question sur cette étape ?
            </p>
          </div>
          <Button variant="ghost" onClick={() => setIsOpen(true)}>
            Ouvrir l&apos;aide
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Aide contextuelle du Compagnon INPI"
      className="mx-auto max-w-2xl mt-3"
      onKeyDown={handleWrapperKeyDown}
    >
      <Card>
        <div className="flex items-center justify-between" style={{ marginBottom: spacing.scale[3] }}>
          <p style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>Besoin d&apos;aide ?</p>
          <button
            type="button"
            aria-label="Fermer l'aide"
            onClick={() => setIsOpen(false)}
            style={{
              ...typography.body.desktop,
              color: colors.text.tertiary,
              background: "none",
              border: "none",
              cursor: "pointer",
              lineHeight: 1,
              padding: spacing.scale[1],
              minHeight: "44px",
              minWidth: "44px",
            }}
          >
            ×
          </button>
        </div>

        <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[3] }}>
          Je peux vous aider à comprendre l&apos;étape INPI que vous êtes en train de préparer.
        </p>

        {messages.length === 0 && suggestions.length > 0 ? (
          <div className="flex flex-col gap-2" style={{ marginBottom: spacing.scale[3] }}>
            {suggestions.map((suggestion) => (
              <Button key={suggestion} variant="secondary" onClick={() => submit(suggestion)}>
                {suggestion}
              </Button>
            ))}
          </div>
        ) : null}

        {messages.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing.scale[2],
              marginBottom: spacing.scale[3],
              maxHeight: "240px",
              overflowY: "auto",
            }}
          >
            {messages.map((message, index) => (
              <p
                key={index}
                style={{
                  ...typography.body.desktop,
                  color: message.role === "user" ? colors.text.primary : colors.text.secondary,
                  textAlign: message.role === "user" ? "right" : "left",
                  margin: 0,
                }}
              >
                {message.text}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit(draft);
            }}
            placeholder="Posez votre question…"
            aria-label="Votre question"
            style={{
              ...typography.body.desktop,
              flex: 1,
              minWidth: 0,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.md,
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
            }}
          />
          <Button onClick={() => submit(draft)} disabled={draft.trim().length === 0}>
            Envoyer
          </Button>
        </div>
      </Card>
    </div>
  );
}
