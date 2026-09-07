/**
 * P1-3 — Vertical slice 2033-C-SD / millésime 2026.
 *
 * Chaîne unique :
 *   FiscalRepresentation (RFS)
 *     → map2033CFromRfs()  [mapper fiscal existant, inchangé]
 *     → CerfaCase[]
 *     → generateCerfaLiassePdf()  [registre + gate + renderer, aucune règle fiscale]
 *     → PDF final immuable + métadonnées de versionnement.
 *
 * Ce module ne recalcule JAMAIS la fiscalité. Il ne décide JAMAIS quelles
 * cases existent — seulement comment les transmettre au renderer. Même
 * patron exact que `generate-cerfa-2033b.ts`.
 *
 * Aucun filtre de scope (contrairement à 2033-A/`isAuthorized2033ASliceCase`) :
 * `map2033CFromRfs()` ne produit JAMAIS que les 8 cases déjà calibrées dans
 * `registry/2033-c/2026.ts` (426/476/490/492/496/570/572/576) — vérifié par
 * lecture complète du mapper (Cycle 54-58 : toute autre case du formulaire
 * — ventilation par catégorie 400-486/500-566, diminutions 494/574, Cadre
 * III — est explicitement écartée dans `casesNonAlimentees`, jamais ajoutée
 * à `cases[]`). Un filtre de scope serait donc redondant avec le registre
 * lui-même — même situation que 2033-B (`generate-cerfa-2033b.ts`, sans
 * filtre), pas celle de 2033-A (dont le mapper PEUT produire des cases hors
 * périmètre autorisé).
 */
import { createHash } from "node:crypto";
import { map2033CFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033c";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { Form2033C } from "@/runtime/capabilities/rfs/projection/map-2033c";
import { generateCerfaLiassePdf } from "./generator/render-cerfa-liasse";
import { createGeneratedLiassePdf, type GeneratedLiassePdf } from "./versioning";
import type { CerfaFormId, GateViolation, LiasseGenerationResult, Millesime, RenderManifestEntry } from "./types";

export const CERFA_2033C_FORM_ID = "2033-C-SD" as const satisfies CerfaFormId;
export const CERFA_2033C_MILLESIME: Millesime = 2026;

export type Cerfa2033CGenerationSuccess = {
  status: "generated";
  pdfBytes: Uint8Array;
  sha256: string;
  pageCount: number;
  sizeBytes: number;
  millesime: Millesime;
  form: typeof CERFA_2033C_FORM_ID;
  form2033C: Form2033C;
  manifest: RenderManifestEntry[];
  generatedRecord: GeneratedLiassePdf;
};

export type Cerfa2033CGenerationResult =
  | Cerfa2033CGenerationSuccess
  | {
      status: "blocked";
      form2033C: Form2033C;
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
 * Produit le Cerfa 2033-C-SD 2026 à partir d'une RFS déjà calculée.
 * Aucune lecture d'assistant, aucun appel à produceFiscalResult().
 */
export async function generateCerfa2033CFromRfs(input: {
  rfs: FiscalRepresentation;
  declarationVersionId: string;
  generatedAt?: string;
}): Promise<Cerfa2033CGenerationResult> {
  const form2033C = map2033CFromRfs(input.rfs);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const pdfResult: LiasseGenerationResult = await generateCerfaLiassePdf({
    millesime: CERFA_2033C_MILLESIME,
    forms: [{ form: CERFA_2033C_FORM_ID, cases: form2033C.cases }],
  });

  if (pdfResult.status === "blocked") {
    return { status: "blocked", form2033C, violations: pdfResult.violations };
  }

  const pageCount = await countPdfPages(pdfResult.pdfBytes);

  return {
    status: "generated",
    pdfBytes: pdfResult.pdfBytes,
    sha256: sha256Hex(pdfResult.pdfBytes),
    pageCount,
    sizeBytes: pdfResult.pdfBytes.length,
    millesime: CERFA_2033C_MILLESIME,
    form: CERFA_2033C_FORM_ID,
    form2033C,
    manifest: pdfResult.manifest,
    generatedRecord: createGeneratedLiassePdf({
      id: crypto.randomUUID(),
      declarationVersionId: input.declarationVersionId,
      millesime: CERFA_2033C_MILLESIME,
      forms: [CERFA_2033C_FORM_ID],
      generatedAt,
      renderManifest: pdfResult.manifest,
    }),
  };
}
