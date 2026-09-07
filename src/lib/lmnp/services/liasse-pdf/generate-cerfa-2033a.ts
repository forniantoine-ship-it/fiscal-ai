/**
 * P1-PDF-02-C — Vertical slice 2033-A-SD / millésime 2026.
 *
 * Chaîne unique :
 *   FiscalRepresentation (RFS)
 *     → map2033AFromRfs()  [mapper fiscal existant, inchangé]
 *     → filtre du slice (8 cases autorisées uniquement)
 *     → generateCerfaLiassePdf()  [registre + gate + renderer, aucune règle fiscale]
 *
 * Ce module ne recalcule JAMAIS la fiscalité. Il ne corrige JAMAIS les
 * divergences connues du mapper (030/086/112). Il refuse simplement de
 * transmettre au renderer une case hors périmètre du slice.
 */
import { createHash } from "node:crypto";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { Form2033A } from "@/runtime/capabilities/rfs/projection/map-2033a";
import { generateCerfaLiassePdf } from "./generator/render-cerfa-liasse";
import { createGeneratedLiassePdf, type GeneratedLiassePdf } from "./versioning";
import { isAuthorized2033ASliceCase } from "./scope/2033-a-2026";
import type { CerfaFormId, GateViolation, LiasseGenerationResult, Millesime, RenderManifestEntry } from "./types";

export const CERFA_2033A_FORM_ID = "2033-A-SD" as const satisfies CerfaFormId;
export const CERFA_2033A_MILLESIME: Millesime = 2026;

export type Cerfa2033AGenerationSuccess = {
  status: "generated";
  pdfBytes: Uint8Array;
  sha256: string;
  pageCount: number;
  sizeBytes: number;
  millesime: Millesime;
  form: typeof CERFA_2033A_FORM_ID;
  form2033A: Form2033A;
  manifest: RenderManifestEntry[];
  generatedRecord: GeneratedLiassePdf;
};

export type Cerfa2033AGenerationResult =
  | Cerfa2033AGenerationSuccess
  | {
      status: "blocked";
      form2033A: Form2033A;
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
 * Produit le Cerfa 2033-A-SD 2026 à partir d'une RFS déjà calculée.
 * Seules les 8 cases du slice sont envoyées au renderer — le mapper peut
 * encore produire 030/086, elles sont écartées ici, jamais dessinées.
 */
export async function generateCerfa2033AFromRfs(input: {
  rfs: FiscalRepresentation;
  declarationVersionId: string;
  generatedAt?: string;
}): Promise<Cerfa2033AGenerationResult> {
  const form2033A = map2033AFromRfs(input.rfs);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sliceCases = form2033A.cases.filter((cerfaCase) => isAuthorized2033ASliceCase(cerfaCase.caseId));

  const pdfResult: LiasseGenerationResult = await generateCerfaLiassePdf({
    millesime: CERFA_2033A_MILLESIME,
    forms: [{ form: CERFA_2033A_FORM_ID, cases: sliceCases }],
  });

  if (pdfResult.status === "blocked") {
    return { status: "blocked", form2033A, violations: pdfResult.violations };
  }

  const pageCount = await countPdfPages(pdfResult.pdfBytes);

  return {
    status: "generated",
    pdfBytes: pdfResult.pdfBytes,
    sha256: sha256Hex(pdfResult.pdfBytes),
    pageCount,
    sizeBytes: pdfResult.pdfBytes.length,
    millesime: CERFA_2033A_MILLESIME,
    form: CERFA_2033A_FORM_ID,
    form2033A,
    manifest: pdfResult.manifest,
    generatedRecord: createGeneratedLiassePdf({
      id: crypto.randomUUID(),
      declarationVersionId: input.declarationVersionId,
      millesime: CERFA_2033A_MILLESIME,
      forms: [CERFA_2033A_FORM_ID],
      generatedAt,
      renderManifest: pdfResult.manifest,
    }),
  };
}
