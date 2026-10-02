/**
 * Identités de consolidation multi-bien — module SANS dépendance (importable par les documents et annexes sans tirer de
 * moteur fiscal). Les identifiants persistés (`loan-1`…) ne sont jamais réécrits : la clé composite est une identité de
 * transport / consolidation uniquement.
 */

/** Identité d'un prêt dans la consolidation : (propertyId, pretId). Les `pretId` persistés (`loan-1`…) ne sont jamais réécrits. */
export function loanKey(propertyId: string, pretId: string): string {
  return JSON.stringify([propertyId, pretId]);
}
