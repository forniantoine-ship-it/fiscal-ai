/**
 * Cycle 6 — inventaire situationnel.
 * Ne repose pas une question dont la réponse existe déjà (F-010 copropriété).
 */

import type { ProfilCharges } from "../../capabilities/f012/types";

export type F012KnownFacts = {
  /** Présent seulement si F-010 a déjà tranché. `undefined` = on demande. */
  copropriete?: boolean;
  /** F-011 déjà validé — pas une question de profil, un contexte d'assurance. */
  hasFinancement?: boolean;
};

export type SituationalProfilageQuestionId = "copropriete" | "gestion" | "travaux";

export function situationalProfilageQuestions(
  known: F012KnownFacts,
  year: number,
): Array<{ id: SituationalProfilageQuestionId; label: string }> {
  const questions: Array<{ id: SituationalProfilageQuestionId; label: string }> = [];
  if (known.copropriete === undefined) {
    questions.push({
      id: "copropriete",
      label: "Votre logement est-il géré par un syndic ?",
    });
  }
  questions.push({
    id: "gestion",
    label: "Une agence, un comptable ou un logiciel s'occupe-t-il de ce logement ?",
  });
  questions.push({
    id: "travaux",
    label: `En ${year}, avez-vous fait réparer ou changer quelque chose ?`,
  });
  return questions;
}

export function resolveSituationalProfilage(input: {
  known: F012KnownFacts;
  copropriete?: boolean;
  gestion?: boolean;
  travaux?: boolean;
}): ProfilCharges {
  const copropriete = input.known.copropriete ?? input.copropriete ?? false;
  const gestion = input.gestion ?? false;
  return {
    copropriete,
    agence: gestion,
    comptable: gestion,
    travaux: input.travaux ?? false,
    vacance: false,
  };
}
