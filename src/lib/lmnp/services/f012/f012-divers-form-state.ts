import type { F012Action } from "@/runtime";

/**
 * Cycle 4A (F-012) — le bouton "Continuer" du formulaire "Charges diverses"
 * ne dispatchait que `skip_category`, jamais `submit_divers` : toute saisie
 * (description + montant) était jetée silencieusement (dead-end identifié
 * dans l'audit initial). Décision de soumission extraite en pur, mêmes
 * règles que les champs "Montant" des autres catégories (`parseAmount`,
 * virgule décimale acceptée) — aucun harnais de test composant React dans ce
 * dépôt (pas de `@testing-library/react`, aucun `.test.tsx`), donc testée
 * ici plutôt que par rendu du panel, comme les helpers F-011 existants
 * (`f011-loan-form-state.ts`).
 */
export function resolveDiversSubmitAction(input: {
  description: string;
  montant: string;
}): F012Action | null {
  const description = input.description.trim();
  const montant = Number(input.montant.replace(",", "."));
  if (!description || !Number.isFinite(montant)) return null;
  return { type: "submit_divers", description, montant };
}
