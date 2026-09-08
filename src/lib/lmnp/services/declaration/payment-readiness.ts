import type { DeclarationGenerationGate } from "./declaration-generation-gate";

/**
 * P1 — Découplage paiement / génération Cerfa (SIREN/SIRET pas encore
 * obtenu via l'INPI).
 *
 * Le Generation Gate (declaration-generation-gate.ts, INCHANGÉ) reste
 * l'unique juge de ce qui est réellement générable : `gate.canGenerate`
 * n'est jamais recalculé ni contourné ici. Cette fonction répond à une
 * question strictement différente et plus étroite : le dossier peut-il être
 * PAYÉ alors même que le CERFA n'est pas encore générable, quand l'unique
 * cause du blocage est l'identité INPI (SIREN/SIRET) ?
 *
 * `identite.siret` est le seul champ ignoré ici — c'est le champ exact
 * produit par validate-liasse-inputs.ts (inchangé) quand
 * `!identite.siren && !identite.siret`. Confirmé par audit : siren/siret
 * n'entrent jamais dans FiscalEngineOutput (F-006) ni dans aucun calcul
 * fiscal — ils ne servent qu'à l'identification du déclarant sur le CERFA
 * final (F-007/RFS). Aucun autre champ n'est ajouté à cette liste sans
 * revue explicite : `identite.denomination` (nom/prénom manquant),
 * `dateMiseEnService` et toute anomalie de calcul (F-006/F-007) restent
 * bloquantes pour le paiement, exactement comme pour la génération.
 */
const PAYMENT_IGNORABLE_ANOMALY_FIELDS: ReadonlySet<string> = new Set(["identite.siret"]);

type GateForReadiness = Pick<DeclarationGenerationGate, "snapshot" | "blockingAnomalies">;

/**
 * true si le dossier fiscal est prêt hors identité INPI : toutes les étapes
 * sont complètes, ce n'est pas un dossier multi-bien, et les seules
 * anomalies bloquantes restantes (s'il y en a) relèvent exclusivement de
 * l'identité INPI/SIREN-SIRET. Toute autre anomalie (fiscale, patrimoniale,
 * dates manquantes...) fait retourner `false`, comme pour `canGenerate`.
 */
export function resolveDossierReadyForPaymentWithoutCerfa(gate: GateForReadiness): boolean {
  if (!gate.snapshot.isComplete || gate.snapshot.isMultiProperty) return false;

  const nonInpiBlockingAnomalies = gate.blockingAnomalies.filter(
    (anomaly) => !PAYMENT_IGNORABLE_ANOMALY_FIELDS.has(anomaly.field ?? ""),
  );

  return nonInpiBlockingAnomalies.length === 0;
}

/**
 * Décide si l'écran doit proposer le paiement "sans génération immédiate".
 * Combine la disponibilité fiscale ci-dessus avec les deux garde-fous
 * d'affichage : jamais si déjà payé (pas de second paiement), jamais hors
 * de la phase "idle" (paiement/génération déjà en cours).
 */
export function canOfferPaymentWithoutCerfa(input: {
  gate: GateForReadiness;
  paid: boolean;
  phaseIsIdle: boolean;
}): boolean {
  if (input.paid || !input.phaseIsIdle) return false;
  return resolveDossierReadyForPaymentWithoutCerfa(input.gate);
}

/**
 * P1 — INPI sur Validation. true quand le bloc rouge d'anomalies bloquantes
 * ne doit PLUS être présenté comme une "erreur fiscale" : il existe bien des
 * anomalies bloquantes, mais elles relèvent EXCLUSIVEMENT de l'identité
 * INPI/SIREN-SIRET (mêmes règles que `resolveDossierReadyForPaymentWithoutCerfa`
 * ci-dessus — jamais une seconde liste divergente). Réutilisée par
 * ValidationDocumentStep.tsx pour choisir entre le bloc rouge existant
 * (inchangé, toute vraie anomalie fiscale reste rouge et bloquante) et un
 * bloc orange informatif "Votre démarche INPI reste à finaliser". Ne
 * modifie jamais `gate.blockingAnomalies` ni `gate.canGenerate` — lecture
 * seule du gate, inchangé.
 */
export function isBlockingAnomaliesInpiOnly(gate: GateForReadiness): boolean {
  return gate.blockingAnomalies.length > 0 && resolveDossierReadyForPaymentWithoutCerfa(gate);
}
