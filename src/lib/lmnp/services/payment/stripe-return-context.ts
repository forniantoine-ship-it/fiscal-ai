/**
 * MB-MULTI-STRIPE-RETURN-CONTEXT-1 — contexte de NAVIGATION du retour Stripe : (dossier, exercice), rien d'autre. Module PUR.
 *
 * Il identifie le dossier et l'exercice qui ont initié le checkout, pour qu'un utilisateur à plusieurs dossiers revienne sur le bon (le
 * fournisseur retombait sinon sur le dossier par défaut). L'URL n'est JAMAIS une autorité : ni paiement (ligne, session, entitlement et
 * webhook restent (dossier, exercice) côté serveur), ni accès (la porte d'entrée revérifie la propriété du dossier demandé avant de le
 * charger ; la livraison exige l'entitlement serveur). Aucun bien, aucune révision, aucune capacité n'y figure.
 *
 * Repli hérité : un retour sans `dossierId` (session ouverte avant ce contrat, ancien lien) désigne « aucun dossier » — comportement
 * historique inchangé (dossier par défaut du fournisseur), qui ne peut sélectionner aucun dossier non autorisé.
 */
import { isDossierId, readExplicitDossierId } from "@/lib/lmnp/dossier/explicit-dossier-id";

export type StripeReturnContext = {
  checkout: "success" | "cancelled" | null;
  fiscalYear: number | null;
  /** `explicit` : dossier désigné (à revérifier côté propriété) ; `legacy` : aucun ; `invalid` : désigné mais illisible → refus. */
  dossier: { kind: "explicit"; id: string } | { kind: "legacy" } | { kind: "invalid" };
};

/** URLs de succès / d'annulation. `dossierId` n'est ajouté que s'il est un identifiant de dossier valide ; jamais de bien ni de révision. */
export function buildStripeReturnUrls(input: { origin: string; fiscalYear: number; dossierId?: string }): { successUrl: string; cancelUrl: string } {
  const params = new URLSearchParams({ step: "validation", fy: String(input.fiscalYear) });
  if (input.dossierId !== undefined && isDossierId(input.dossierId)) params.set("dossierId", input.dossierId.toLowerCase());
  const base = `${input.origin}/documents?${params.toString()}`;
  return { successUrl: `${base}&checkout=success`, cancelUrl: `${base}&checkout=cancelled` };
}

export function readStripeReturnContext(params: URLSearchParams): StripeReturnContext {
  const outcomes = params.getAll("checkout");
  const checkout = outcomes.length === 1 && (outcomes[0] === "success" || outcomes[0] === "cancelled") ? outcomes[0] : null;
  const years = params.getAll("fy");
  const fiscalYear = years.length === 1 && /^\d{4}$/.test(years[0]!) ? Number(years[0]) : null;
  const dossierId = readExplicitDossierId(params);
  return {
    checkout,
    fiscalYear,
    dossier: dossierId === undefined ? { kind: "legacy" } : dossierId === null ? { kind: "invalid" } : { kind: "explicit", id: dossierId },
  };
}
