/**
 * P1-6A — Vertical slice 2031-SD / millésime 2026.
 *
 * Chaîne unique :
 *   FiscalRepresentation (RFS)
 *     → map2031FromRfs()  [adaptateur pur vers assembleForm2031SD(), inchangé]
 *     → CerfaCase[]
 *     → generateCerfaLiassePdf()  [registre + gate + renderer, aucune règle fiscale]
 *     → PDF final immuable + métadonnées de versionnement.
 *
 * Même patron exact que `generate-cerfa-2033b.ts`/`generate-cerfa-2033c.ts`.
 *
 * Aucun filtre de scope : `map2031FromRfs()` → `assembleForm2031SD()` ne
 * produit jamais que 9 cases (A_SIREN, A_DENOMINATION, A_ADRESSE_ENTREPRISE,
 * A_EXERCICE_DEBUT, A_EXERCICE_FIN, D_REGIME_REEL_SIMPLIFIE, C_L1_COL1,
 * C_L1_COL2, I_7A, I_7B — vérifié par lecture complète de
 * `map-2031-identite.ts`/`map-2031-regime.ts`/`map-2031-recapitulation.ts`)
 * — exactement les 9 entrées déjà calibrées dans `registry/2031-sd/2026.ts`.
 * Même situation que 2033-B/C, pas celle de 2033-A.
 *
 * Déjà prouvé au niveau PDF réel par le golden master technique
 * (`tests/golden-master-technical-pipeline.test.ts`, fichier historique
 * protégé, non modifié ici) : ce wrapper n'ajoute aucune capacité nouvelle
 * au moteur, seulement un point d'entrée public RFS→PDF cohérent avec les
 * wrappers 2033-A/B/C.
 */
import { createHash } from "node:crypto";
import { map2031FromRfs } from "@/runtime/capabilities/rfs/projection/map-2031-from-rfs";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { Form2031SD } from "@/runtime/capabilities/f007/types";
import { generateCerfaLiassePdf } from "./generator/render-cerfa-liasse";
import { createGeneratedLiassePdf, type GeneratedLiassePdf } from "./versioning";
import type { CerfaFormId, GateViolation, LiasseGenerationResult, Millesime, RenderManifestEntry } from "./types";

export const CERFA_2031_FORM_ID = "2031-SD" as const satisfies CerfaFormId;
export const CERFA_2031_MILLESIME: Millesime = 2026;

export type Cerfa2031GenerationSuccess = {
  status: "generated";
  pdfBytes: Uint8Array;
  sha256: string;
  pageCount: number;
  sizeBytes: number;
  millesime: Millesime;
  form: typeof CERFA_2031_FORM_ID;
  form2031: Form2031SD;
  manifest: RenderManifestEntry[];
  generatedRecord: GeneratedLiassePdf;
};

export type Cerfa2031GenerationResult =
  | Cerfa2031GenerationSuccess
  | {
      status: "blocked";
      form2031: Form2031SD;
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
 * Produit le Cerfa 2031-SD 2026 à partir d'une RFS déjà calculée.
 * Aucune lecture d'assistant, aucun appel à produceFiscalResult().
 */
export async function generateCerfa2031FromRfs(input: {
  rfs: FiscalRepresentation;
  declarationVersionId: string;
  generatedAt?: string;
}): Promise<Cerfa2031GenerationResult> {
  const form2031 = map2031FromRfs(input.rfs);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const pdfResult: LiasseGenerationResult = await generateCerfaLiassePdf({
    millesime: CERFA_2031_MILLESIME,
    forms: [{ form: CERFA_2031_FORM_ID, cases: form2031.cases }],
  });

  if (pdfResult.status === "blocked") {
    return { status: "blocked", form2031, violations: pdfResult.violations };
  }

  const pageCount = await countPdfPages(pdfResult.pdfBytes);

  return {
    status: "generated",
    pdfBytes: pdfResult.pdfBytes,
    sha256: sha256Hex(pdfResult.pdfBytes),
    pageCount,
    sizeBytes: pdfResult.pdfBytes.length,
    millesime: CERFA_2031_MILLESIME,
    form: CERFA_2031_FORM_ID,
    form2031,
    manifest: pdfResult.manifest,
    generatedRecord: createGeneratedLiassePdf({
      id: crypto.randomUUID(),
      declarationVersionId: input.declarationVersionId,
      millesime: CERFA_2031_MILLESIME,
      forms: [CERFA_2031_FORM_ID],
      generatedAt,
      renderManifest: pdfResult.manifest,
    }),
  };
}
