/**
 * MB-MULTI-UX-1 — messages utilisateur des motifs de la garde de domaine. Module PUR : AUCUNE règle métier ici, uniquement la
 * traduction d'un code stable (`multi-property-domain.ts`) en texte. La source de vérité reste la garde.
 */
import { MULTI_PROPERTY_DOMAIN_REASON_CODES as C, type MultiPropertyDomainReason, type MultiPropertyDomainReasonCode } from "./multi-property-domain";

/** Où l'utilisateur peut agir : l'attestation d'activité, le bien concerné, ses documents, ou nulle part (hors périmètre). */
export type MultiPropertyReasonAction = "attestation" | "property" | "documents" | "none";

const MESSAGES: Readonly<Record<MultiPropertyDomainReasonCode, { text: string; action: MultiPropertyReasonAction }>> = {
  [C.fewerThanTwoProperties]: { text: "Le dossier doit comporter au moins deux biens pour être traité comme un dossier multi-biens.", action: "property" },
  [C.regimeNotSupported]: { text: "Seul le régime réel simplifié est pris en charge pour plusieurs biens.", action: "none" },
  [C.lmpNotSupported]: { text: "Une activité de loueur en meublé professionnel n'est pas prise en charge pour plusieurs biens.", action: "none" },
  [C.ssiNotSupported]: { text: "Votre situation (cotisations sociales des indépendants) est hors du périmètre pris en charge pour plusieurs biens.", action: "none" },
  [C.indirectHoldingNotSupported]: { text: "Une détention non directe des logements (société, indivision) est hors du périmètre pris en charge pour plusieurs biens.", action: "none" },
  [C.notFirstYear]: { text: "Plusieurs biens ne sont pris en charge que pour une première année de déclaration.", action: "none" },
  [C.takeoverNotSupported]: { text: "La reprise d'un historique externe n'est pas prise en charge pour plusieurs biens.", action: "none" },
  [C.openingNotSupported]: { text: "Une ouverture d'exercice (reprise ou continuité) n'est pas prise en charge pour plusieurs biens.", action: "none" },
  [C.priorDeficitNotSupported]: { text: "Un déficit antérieur n'est pas pris en charge pour plusieurs biens.", action: "none" },
  [C.historicalArdNotSupported]: { text: "Des amortissements différés d'exercices antérieurs ne sont pas pris en charge pour plusieurs biens.", action: "none" },
  [C.allocation39cNotSupported]: { text: "Les amortissements de l'exercice dépassent le résultat déductible : leur répartition entre biens n'est pas prise en charge.", action: "none" },
  [C.commonChargesNotSupported]: { text: "Les charges communes à plusieurs biens ne sont pas prises en charge : chaque charge doit se rattacher à un seul bien.", action: "none" },
  [C.sharedLoanNotSupported]: { text: "Un prêt partagé entre plusieurs biens n'est pas pris en charge : un prêt se rattache à un seul bien.", action: "property" },
  [C.serviceDateMissing]: { text: "La date de mise en service de ce bien est manquante ou incohérente.", action: "property" },
  [C.unattributedDocument]: { text: "Un document n'est rattaché à aucun bien : attribuez-le à un bien.", action: "documents" },
  [C.ssiAttestationMissing]: { text: "Confirmez que votre activité reste dans le régime LMNP pris en charge.", action: "attestation" },
  [C.directHoldingAttestationMissing]: { text: "Confirmez que vos logements sont détenus directement.", action: "attestation" },
  [C.commonChargesAttestationMissing]: { text: "Confirmez qu'aucune charge n'est commune à plusieurs biens.", action: "attestation" },
  [C.domainUnverifiable]: { text: "Une information nécessaire à la vérification du dossier n'est pas disponible.", action: "none" },
};

export type MultiPropertyReasonView = {
  code: MultiPropertyDomainReasonCode;
  propertyId?: string;
  /** Nom du bien concerné lorsque le motif est localisable (jamais « bien 1 »). */
  propertyLabel?: string;
  message: string;
  action: MultiPropertyReasonAction;
};

export function describeMultiPropertyDomainReason(
  reason: MultiPropertyDomainReason,
  properties: ReadonlyArray<{ id: string; label?: string }> = [],
): MultiPropertyReasonView {
  const entry = MESSAGES[reason.code];
  const propertyLabel = reason.propertyId === undefined ? undefined : properties.find((property) => property.id === reason.propertyId)?.label;
  return {
    code: reason.code,
    ...(reason.propertyId !== undefined ? { propertyId: reason.propertyId } : {}),
    ...(propertyLabel ? { propertyLabel } : {}),
    message: entry.text,
    action: entry.action,
  };
}

/** Motifs sans doublon, dans l'ordre de la garde. */
export function describeMultiPropertyDomainReasons(
  reasons: readonly MultiPropertyDomainReason[],
  properties: ReadonlyArray<{ id: string; label?: string }> = [],
): MultiPropertyReasonView[] {
  const seen = new Set<string>();
  const views: MultiPropertyReasonView[] = [];
  for (const reason of reasons) {
    const key = `${reason.code}|${reason.propertyId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    views.push(describeMultiPropertyDomainReason(reason, properties));
  }
  return views;
}
