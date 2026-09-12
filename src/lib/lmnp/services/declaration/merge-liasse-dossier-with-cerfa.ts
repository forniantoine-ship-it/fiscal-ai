/**
 * Fusion mécanique : pages documentaires + PDF Cerfa déjà produit.
 *
 * Architecture :
 *   renderLiasseDossierPdf()  →  documentaryPdfBytes
 *   /api/lmnp/declaration/cerfa-pdf (inchangé)  →  cerfaPdfBytes
 *   mergeLiasseDossierWithCerfa()  →  liasse-fiscale-lmnp-{année}.pdf
 *
 * Ce module ne connaît ni la fiscalité, ni les cases Cerfa, ni la RFS.
 * Il copie les pages telles quelles via pdf-lib (`copyPages` / `addPage`) —
 * les mêmes primitives que la route Cerfa utilise déjà pour assembler les
 * 6 formulaires. Aucun recalcul, aucune retouche du fond officiel.
 *
 * SHA-256 du PDF Cerfa complet : non comparable après fusion. `copyPages`
 * réécrit les références d'objets et `PDFDocument.save()` fixe
 * `ModificationDate` (constat déjà documenté dans
 * `cerfa-pdf/route.test.ts`). L'invariant utile est le contenu de chaque
 * page Cerfa (texte dessiné + dimensions), pas l'octet du conteneur.
 */

import { PDFDocument } from "pdf-lib";

export function liasseFiscalePdfFileName(exercice: number): string {
  return `liasse-fiscale-lmnp-${exercice}.pdf`;
}

function copyPdfBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export async function mergeLiasseDossierWithCerfa(
  documentaryPdfBytes: Uint8Array,
  cerfaPdfBytes: Uint8Array,
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  // Copie défensive : `PDFDocument.load` peut réécrire le buffer en place
  // (en-tête binaire des gabarits DGFiP). La fusion ne doit jamais muter
  // les bytes Cerfa fournis par l'appelant.
  const documentary = await PDFDocument.load(copyPdfBytes(documentaryPdfBytes));
  const cerfa = await PDFDocument.load(copyPdfBytes(cerfaPdfBytes));

  const documentaryPages = await merged.copyPages(documentary, documentary.getPageIndices());
  for (const page of documentaryPages) merged.addPage(page);

  const cerfaPages = await merged.copyPages(cerfa, cerfa.getPageIndices());
  for (const page of cerfaPages) merged.addPage(page);

  return merged.save();
}
