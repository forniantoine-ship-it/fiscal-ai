/**
 * P1-PDF-01 — Vertical slice 2033-B-SD / millésime 2026.
 *
 * Chaîne unique :
 *   FiscalRepresentation (RFS)
 *     → map2033BFromRfs()  [mapper fiscal existant, inchangé]
 *     → CerfaCase[]
 *     → generateCerfaLiassePdf()  [registre + gate + renderer, aucune règle fiscale]
 *     → PDF final immuable + métadonnées de versionnement.
 *
 * Ce module ne recalcule JAMAIS la fiscalité. Il ne décide JAMAIS quelles
 * cases existent — seulement comment les transmettre au renderer.
 */
import { createHash } from "node:crypto";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { Form2033B } from "@/runtime/capabilities/rfs/projection/map-2033b";
import { generateCerfaLiassePdf } from "./generator/render-cerfa-liasse";
import { createGeneratedLiassePdf, type GeneratedLiassePdf } from "./versioning";
import type { CerfaFormId, GateViolation, LiasseGenerationResult, Millesime, RenderManifestEntry } from "./types";

export const CERFA_2033B_FORM_ID = "2033-B-SD" as const satisfies CerfaFormId;
export const CERFA_2033B_MILLESIME: Millesime = 2026;

export type Cerfa2033BGenerationSuccess = {
  status: "generated";
  pdfBytes: Uint8Array;
  sha256: string;
  pageCount: number;
  sizeBytes: number;
  millesime: Millesime;
  form: typeof CERFA_2033B_FORM_ID;
  form2033B: Form2033B;
  manifest: RenderManifestEntry[];
  generatedRecord: GeneratedLiassePdf;
};

export type Cerfa2033BGenerationResult =
  | Cerfa2033BGenerationSuccess
  | {
      status: "blocked";
      form2033B: Form2033B;
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
 * Produit le Cerfa 2033-B-SD 2026 à partir d'une RFS déjà calculée.
 * Aucune lecture d'assistant, aucun appel à produceFiscalResult().
 */
export async function generateCerfa2033BFromRfs(input: {
  rfs: FiscalRepresentation;
  declarationVersionId: string;
  generatedAt?: string;
}): Promise<Cerfa2033BGenerationResult> {
  const form2033B = map2033BFromRfs(input.rfs);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const pdfResult: LiasseGenerationResult = await generateCerfaLiassePdf({
    millesime: CERFA_2033B_MILLESIME,
    forms: [{ form: CERFA_2033B_FORM_ID, cases: form2033B.cases }],
  });

  if (pdfResult.status === "blocked") {
    return { status: "blocked", form2033B, violations: pdfResult.violations };
  }

  const pageCount = await countPdfPages(pdfResult.pdfBytes);

  return {
    status: "generated",
    pdfBytes: pdfResult.pdfBytes,
    sha256: sha256Hex(pdfResult.pdfBytes),
    pageCount,
    sizeBytes: pdfResult.pdfBytes.length,
    millesime: CERFA_2033B_MILLESIME,
    form: CERFA_2033B_FORM_ID,
    form2033B,
    manifest: pdfResult.manifest,
    generatedRecord: createGeneratedLiassePdf({
      id: crypto.randomUUID(),
      declarationVersionId: input.declarationVersionId,
      millesime: CERFA_2033B_MILLESIME,
      forms: [CERFA_2033B_FORM_ID],
      generatedAt,
      renderManifest: pdfResult.manifest,
    }),
  };
}
