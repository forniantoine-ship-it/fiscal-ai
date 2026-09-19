/**
 * Payment V1 — une seule source de vérité pour le prix : 149 € TTC par exercice
 * fiscal. Importée par l'affichage (landing, tunnel de validation) ET par le
 * serveur (montant réellement facturé par Stripe) : aucune divergence possible.
 * Jamais un prix venant du client.
 */
export const GENERATION_PRICE_TTC = 149;
export const GENERATION_PRICE_CENTS = GENERATION_PRICE_TTC * 100;
export const PAYMENT_CURRENCY = "eur";
