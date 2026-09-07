/**
 * P1-6B — Vertical slice 2033-D-SD / millésime 2026.
 *
 * Chaîne unique :
 *   FiscalRepresentation (RFS)
 *     → map2033DFromRfs()  [mapper fiscal existant, inchangé]
 *     → CerfaCase[]  (toujours vide — Form2033D.cases est typé `never[]`)
 *     → generateCerfaLiassePdf()  [registre + gate + renderer, aucune règle fiscale]
 *     → PDF final immuable + métadonnées de versionnement.
 *
 * Même patron exact que `generate-cerfa-2033b.ts`/`generate-cerfa-2033c.ts`.
 *
 * "Néant" volontaire, déjà documenté dans `map-2033d.ts` (P3-LIASSE-1A) :
 * pour un LMNP réel simplifié à l'IR, ce formulaire n'a structurellement
 * aucune case à remplir (provisions non modélisées, amortissements
 * dérogatoires hors périmètre F-006, déficits reportables réservés à l'IS).
 * `Form2033D.cases` est typé `never[]` — jamais conditionnellement vide,
 * TOUJOURS vide, par construction du type lui-même.
 *
 * Ce wrapper ne fabrique AUCUNE case artificielle et n'injecte aucune
 * valeur "Néant" dans les données transmises au renderer : `generateCerfaLiassePdf()`
 * copie déjà correctement la page officielle vierge quand `cases` est vide
 * (vérifié par lecture complète de `render-cerfa-liasse.ts` — la boucle
 * d'écriture par case ne fait simplement rien s'il n'y a aucune case,
 * aucune garde de "minimum une case" n'existe dans le gate ni le renderer).
 * Aucun scope nécessaire (rien à filtrer, `cases` est toujours vide).
 */
import { createHash } from "node:crypto";
import { map2033DFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033d";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { Form2033D } from "@/runtime/capabilities/rfs/projection/map-2033d";
import { generateCerfaLiassePdf } from "./generator/render-cerfa-liasse";
import { createGeneratedLiassePdf, type GeneratedLiassePdf } from "./versioning";
import type { CerfaFormId, GateViolation, LiasseGenerationResult, Millesime, RenderManifestEntry } from "./types";

export const CERFA_2033D_FORM_ID = "2033-D-SD" as const satisfies CerfaFormId;
export const CERFA_2033D_MILLESIME: Millesime = 2026;

export type Cerfa2033DGenerationSuccess = {
  status: "generated";
  pdfBytes: Uint8Array;
  sha256: string;
  pageCount: number;
  sizeBytes: number;
  millesime: Millesime;
  form: typeof CERFA_2033D_FORM_ID;
  form2033D: Form2033D;
  manifest: RenderManifestEntry[];
  generatedRecord: GeneratedLiassePdf;
};

export type Cerfa2033DGenerationResult =
  | Cerfa2033DGenerationSuccess
  | {
      status: "blocked";
      form2033D: Form2033D;
      violations: GateViolation[];
    };

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

/**
 * Produit le Cerfa 2033-D-SD 2026 à partir d'une RFS déjà calculée.
 * Aucune lecture d'assistant, aucun appel à produceFiscalResult().
 */
export async function generateCerfa2033DFromRfs(input: {
  rfs: FiscalRepresentation;
  declarationVersionId: string;
  generatedAt?: string;
}): Promise<Cerfa2033DGenerationResult> {
  const form2033D = map2033DFromRfs(input.rfs);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const pdfResult: LiasseGenerationResult = await generateCerfaLiassePdf({
    millesime: CERFA_2033D_MILLESIME,
    forms: [{ form: CERFA_2033D_FORM_ID, cases: form2033D.cases }],
  });

  if (pdfResult.status === "blocked") {
    return { status: "blocked", form2033D, violations: pdfResult.violations };
  }

  const pageCount = await countPdfPages(pdfResult.pdfBytes);

  return {
    status: "generated",
    pdfBytes: pdfResult.pdfBytes,
    sha256: sha256Hex(pdfResult.pdfBytes),
    pageCount,
    sizeBytes: pdfResult.pdfBytes.length,
    millesime: CERFA_2033D_MILLESIME,
    form: CERFA_2033D_FORM_ID,
    form2033D,
    manifest: pdfResult.manifest,
    generatedRecord: createGeneratedLiassePdf({
      id: crypto.randomUUID(),
      declarationVersionId: input.declarationVersionId,
      millesime: CERFA_2033D_MILLESIME,
      forms: [CERFA_2033D_FORM_ID],
      generatedAt,
      renderManifest: pdfResult.manifest,
    }),
  };
}
