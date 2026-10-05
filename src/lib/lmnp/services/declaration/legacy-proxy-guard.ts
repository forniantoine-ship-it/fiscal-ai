/**
 * INT-4.1 — GARDE du proxy historique (OLD_PROXY) : il ne doit jamais produire un résultat fiscal qui OMET une charge qu'il
 * ne sait pas lire.
 *
 * Les charges d'activité globales (comptabilité, logiciel…) et les avis de CFE sont collectés dans les stores de
 * qualification article 39 C. Le F006 productif actuel (proxy) ne les lit pas : tant qu'il n'est pas remplacé par le moteur
 * exact (INT-5), un dossier qui en porte pour l'exercice est REFUSÉ par la génération productive, plutôt que calculé avec une
 * charge oubliée. Les réponses de qualification de simples natures (PNO, gestion, frais bancaires) ne créent aucune charge :
 * elles ne déclenchent pas ce garde.
 *
 * Module pur ; ne lit que la feuille de persistance du store (aucun adapter, aucun moteur).
 */
import { parseQualificationStore } from "@/lib/lmnp/services/article-39c/qualification-store";

export const LEGACY_PROXY_OMITS_EXACT_CHARGES_CODE = "exact_only_charges_not_supported_by_legacy_proxy";

type DraftLike = {
  article39cQualifications?: unknown;
  article39cActivityQualifications?: unknown;
  biens?: Record<string, { article39cQualifications?: unknown } | undefined>;
} | undefined;

/** Identifiants des enregistrements de charge (activité ou CFE) de l'exercice que le proxy omettrait. */
export function exactOnlyChargeRecordIds(draft: DraftLike, fiscalYear: number): string[] {
  const stores = [draft?.article39cQualifications, draft?.article39cActivityQualifications, ...Object.values(draft?.biens ?? {}).map((b) => b?.article39cQualifications)];
  const ids: string[] = [];
  for (const raw of stores) {
    for (const record of parseQualificationStore(raw)?.records ?? []) {
      if (record.fiscalYear === fiscalYear && (record.recordKind === "ACTIVITY_CHARGE" || record.recordKind === "CFE")) ids.push(record.recordId);
    }
  }
  return ids.sort();
}
