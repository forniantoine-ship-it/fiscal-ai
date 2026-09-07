/**
 * P1-6A — Vertical slice 2031-bis-SD / millésime 2026.
 *
 * Chaîne unique :
 *   FiscalRepresentation (RFS)
 *     → map2031BisFromRfs()  [mapper fiscal existant, inchangé]
 *     → CerfaCase[]
 *     → generateCerfaLiassePdf()  [registre + gate + renderer, aucune règle fiscale]
 *     → PDF final immuable + métadonnées de versionnement.
 *
 * Même patron exact que `generate-cerfa-2033b.ts`/`generate-cerfa-2033c.ts`.
 *
 * ATTENTION (constat d'audit) : `Form2031Bis.formId` vaut littéralement
 * `"2031-Bis-SD"` (majuscule "B", `map-2031-bis.ts`) — une chaîne DIFFÉRENTE
 * du littéral `CerfaFormId` `"2031-bis-SD"` utilisé partout dans ce module
 * (registre, manifeste d'assets, `types.ts`) et déjà employé tel quel par le
 * golden master technique (`{ form: "2031-bis-SD", cases: form2031Bis.cases }`).
 * Ce wrapper utilise donc `CERFA_2031BIS_FORM_ID` (constante locale, comme
 * tous les autres wrappers) pour l'appel à `generateCerfaLiassePdf()` —
 * jamais `form2031Bis.formId`, qui casserait la résolution du registre.
 * `form2031Bis` (avec son `formId` d'origine, inchangé) reste transporté tel
 * quel dans le résultat, à des fins de diagnostic uniquement — jamais
 * réinjecté dans l'appel au renderer.
 *
 * Aucun filtre de scope : `map2031BisFromRfs()` ne produit jamais que 2
 * cases (I_AUTRES_LMNP_BENEFICE, I_AUTRES_LMNP_DEFICIT — vérifié par lecture
 * complète du mapper), exactement les 2 entrées déjà calibrées dans
 * `registry/2031-bis/2026.ts`. Même situation que 2033-B/C.
 */
import { createHash } from "node:crypto";
import { map2031BisFromRfs } from "@/runtime/capabilities/rfs/projection/map-2031-bis";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { Form2031Bis } from "@/runtime/capabilities/rfs/projection/map-2031-bis";
import { generateCerfaLiassePdf } from "./generator/render-cerfa-liasse";
import { createGeneratedLiassePdf, type GeneratedLiassePdf } from "./versioning";
import type { CerfaFormId, GateViolation, LiasseGenerationResult, Millesime, RenderManifestEntry } from "./types";

export const CERFA_2031BIS_FORM_ID = "2031-bis-SD" as const satisfies CerfaFormId;
export const CERFA_2031BIS_MILLESIME: Millesime = 2026;

export type Cerfa2031BisGenerationSuccess = {
  status: "generated";
  pdfBytes: Uint8Array;
  sha256: string;
  pageCount: number;
  sizeBytes: number;
  millesime: Millesime;
  form: typeof CERFA_2031BIS_FORM_ID;
  form2031Bis: Form2031Bis;
  manifest: RenderManifestEntry[];
  generatedRecord: GeneratedLiassePdf;
};

export type Cerfa2031BisGenerationResult =
  | Cerfa2031BisGenerationSuccess
  | {
      status: "blocked";
      form2031Bis: Form2031Bis;
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
 * Produit le Cerfa 2031-bis-SD 2026 à partir d'une RFS déjà calculée.
 * Aucune lecture d'assistant, aucun appel à produceFiscalResult().
 */
export async function generateCerfa2031BisFromRfs(input: {
  rfs: FiscalRepresentation;
  declarationVersionId: string;
  generatedAt?: string;
}): Promise<Cerfa2031BisGenerationResult> {
  const form2031Bis = map2031BisFromRfs(input.rfs);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const pdfResult: LiasseGenerationResult = await generateCerfaLiassePdf({
    millesime: CERFA_2031BIS_MILLESIME,
    forms: [{ form: CERFA_2031BIS_FORM_ID, cases: form2031Bis.cases }],
  });

  if (pdfResult.status === "blocked") {
    return { status: "blocked", form2031Bis, violations: pdfResult.violations };
  }

  const pageCount = await countPdfPages(pdfResult.pdfBytes);

  return {
    status: "generated",
    pdfBytes: pdfResult.pdfBytes,
    sha256: sha256Hex(pdfResult.pdfBytes),
    pageCount,
    sizeBytes: pdfResult.pdfBytes.length,
    millesime: CERFA_2031BIS_MILLESIME,
    form: CERFA_2031BIS_FORM_ID,
    form2031Bis,
    manifest: pdfResult.manifest,
    generatedRecord: createGeneratedLiassePdf({
      id: crypto.randomUUID(),
      declarationVersionId: input.declarationVersionId,
      millesime: CERFA_2031BIS_MILLESIME,
      forms: [CERFA_2031BIS_FORM_ID],
      generatedAt,
      renderManifest: pdfResult.manifest,
    }),
  };
}
