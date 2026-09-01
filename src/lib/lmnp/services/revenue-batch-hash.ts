import type { RevenueRawLine } from "../types";

/**
 * Empreinte de contenu déterministe pour détecter un document réimporté
 * (même fichier deux fois, ou deux fichiers différents aux transactions
 * identiques) — Cycle 15A/15B. Ne compare jamais deux lignes DANS un même
 * document (celles-là restent toutes conservées, potentiellement deux vraies
 * transactions distinctes) : uniquement le contenu global d'un lot face aux
 * lots déjà traités (même appel — Cycle 15A — ou appels séparés — Cycle 15B).
 *
 * Module dédié et sans dépendance : réutilisé à la fois par
 * revenus-document-pipeline.ts (dédup intra-lot d'upload) et
 * revenue-gpt-ui-prefill.ts (dédup inter-uploads successifs) sans faire
 * hériter ce dernier de la chaîne OCR/vision (qui touche Supabase).
 */
export function canonicalizeLinesForHash(lines: RevenueRawLine[]): string {
  return lines
    .map(
      (line) =>
        // Cycle 15B : le nom de fichier fait partie de l'identité du lot — deux
        // fichiers distincts contenant par coïncidence les mêmes transactions
        // (même date/montant/libellé) ne doivent jamais être fusionnés à tort
        // (Test D). Seul un fichier de même nom ET de même contenu est un doublon.
        `${(line.sourceFileName ?? "").toLowerCase().trim()}|${line.date ?? ""}|${line.amount}|${line.direction}|` +
        `${(line.sourceColumnHeader ?? line.label ?? "").toLowerCase().trim()}`,
    )
    .sort()
    .join(";");
}

export function hashDocumentContent(lines: RevenueRawLine[]): string {
  const canonical = canonicalizeLinesForHash(lines);
  let hash = 0;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = (hash * 31 + canonical.charCodeAt(i)) | 0;
  }
  return `${lines.length}-${canonical.length}-${hash}`;
}
