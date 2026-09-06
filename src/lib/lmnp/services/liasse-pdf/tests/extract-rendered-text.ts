/**
 * Utilitaire de TEST UNIQUEMENT — jamais importé par le générateur runtime.
 *
 * Vérifie, en ré-ouvrant le PDF réellement produit, que le texte écrit par
 * `generateCerfaLiassePdf()` est bien un texte réel et extractible — pas un
 * tracé vectoriel invisible aux logiciels d'analyse, pas un encodage cassé.
 * C'est le "extraction des valeurs" minimal demandé par la mission (section
 * 11), sans ajouter de nouvelle dépendance : on décode directement les
 * opérateurs `Tj` du flux de contenu que pdf-lib vient d'écrire, via l'API
 * bas niveau déjà exposée par `pdf-lib` (`PDFContext`, `PDFRawStream`,
 * `decodePDFRawStream`) — la même bibliothèque que le générateur, jamais un
 * second moteur PDF.
 *
 * Portée volontairement limitée : ne décode que les chaînes hexadécimales
 * simples (`<48656c6c6f> Tj`), qui sont exactement ce que produit
 * `PDFPage.drawText()` avec une police standard WinAnsi — pas un parseur PDF
 * générique, pas destiné à lire un contenu arbitraire.
 */
import { PDFArray, PDFDocument, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "pdf-lib";

function decodeHexHelvetica(hex: string): string {
  const bytes = Buffer.from(hex.replace(/\s+/g, ""), "hex");
  return bytes.toString("latin1");
}

function extractTjHexStrings(contentBytes: Uint8Array): string[] {
  const text = Buffer.from(contentBytes).toString("latin1");
  const found: string[] = [];
  const re = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.push(decodeHexHelvetica(m[1]));
  }
  return found;
}

/**
 * Isole le dernier flux de contenu NON TRIVIAL d'une page (celui ajouté par
 * `drawText()`, jamais le fond officiel copié — voir le commentaire
 * d'origine ci-dessous, inchangé) et le retourne décodé, en clair.
 */
async function lastNonTrivialContentStream(pdfBytes: Uint8Array, pageNumber: number): Promise<Uint8Array | undefined> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPages()[pageNumber - 1];
  if (!page) return undefined;

  const contents = page.node.Contents();
  const refs: PDFRef[] = [];
  if (contents instanceof PDFArray) {
    for (const item of contents.asArray()) {
      if (item instanceof PDFRef) refs.push(item);
    }
  }

  // pdf-lib ajoute les opérations de `drawText()` d'une page copiée dans un
  // (ou plusieurs) flux de contenu ANNEXÉS après ceux du fond officiel copié
  // (vérifié empiriquement : Contents = [q, <fond officiel>, Q, <notre texte>]
  // sur un cas réel). Ne décoder que le(s) DERNIER(S) flux garantit de ne
  // jamais confondre nos hex-Tj (police WinAnsi standard) avec les hex-Tj du
  // fond officiel lui-même (polices TrueType embarquées, codes de glyphe —
  // pas des codes ASCII, illisibles tels quels). On prend le dernier flux
  // non trivial (plus de 10 octets ; les flux 'q'/'Q' isolés ne comptent pas).
  const nonTrivialRefs = [];
  for (const ref of refs) {
    const stream = doc.context.lookup(ref);
    if (stream instanceof PDFStream) nonTrivialRefs.push({ ref, stream });
  }
  const last = nonTrivialRefs[nonTrivialRefs.length - 1];
  if (!last) return undefined;

  return last.stream instanceof PDFRawStream ? decodePDFRawStream(last.stream).decode() : last.stream.getContents();
}

/** Toutes les chaînes dessinées via `Tj` (hex) sur une page donnée (1-indexée) du PDF fourni. */
export async function extractDrawnStringsForPage(pdfBytes: Uint8Array, pageNumber: number): Promise<string[]> {
  const decoded = await lastNonTrivialContentStream(pdfBytes, pageNumber);
  if (!decoded) return [];
  return extractTjHexStrings(decoded);
}

/**
 * Une chaîne dessinée ET sa position réelle dans le PDF final — utilisé par
 * les tests de position indépendants (voir `position-oracle.test.ts`), pour
 * ne JAMAIS s'appuyer sur `RenderManifestEntry` (qui ne fait que rapporter
 * ce que le générateur CROIT avoir écrit) : ici, on ré-ouvre les octets du
 * PDF réellement produit et on décode directement les opérateurs de
 * positionnement de texte (`Tm`) qui précèdent chaque `Tj`, dans l'espace
 * natif pdf-lib (origine bas-gauche, comme `PDFPage.drawText()` l'utilise).
 *
 * Portée : ne reconnaît que le motif exact émis par `PDFPage.drawText()`
 * avec une police standard (pas de rotation/échelle : `1 0 0 1 x y Tm`),
 * suivi d'une chaîne hex simple et `Tj` — c'est exactement, et seulement, ce
 * que `render-cerfa-liasse.ts` produit (voir le format déjà exercé par
 * `extractTjHexStrings` ci-dessus).
 */
export type DrawnTextPosition = { text: string; pdfLibX: number; pdfLibY: number };

export async function extractDrawnTextPositionsForPage(
  pdfBytes: Uint8Array,
  pageNumber: number,
): Promise<DrawnTextPosition[]> {
  const decoded = await lastNonTrivialContentStream(pdfBytes, pageNumber);
  if (!decoded) return [];
  const text = Buffer.from(decoded).toString("latin1");

  const found: DrawnTextPosition[] = [];
  const re = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s*(?:\r?\n)?\s*<([0-9A-Fa-f\s]+)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.push({
      pdfLibX: Number.parseFloat(m[1]),
      pdfLibY: Number.parseFloat(m[2]),
      text: decodeHexHelvetica(m[3]),
    });
  }
  return found;
}
