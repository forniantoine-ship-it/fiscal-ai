/**
 * F012 V2 document-first — Phase 3, upload réel pour les familles
 * "assurances" / "gestion" / "syndic" (mêmes contraintes que
 * `f012-impots-document-upload.ts`, Phase 2, dont ce fichier reprend
 * exactement l'architecture injectable pour rester testable sans réseau).
 *
 * Réutilise EXACTEMENT la même extraction déjà en production
 * (`proposalsFromAssuranceCorpus`, `proposalsFromGestionCorpus`,
 * `proposalsFromCoproCorpus` — inchangés) — seul le documentId change : un
 * VRAI `LmnpDocument.id` (upload Supabase réel) au lieu de l'id synthétique
 * `f012-doc-${file.name}-${file.size}` utilisé jusqu'ici par le chemin
 * `analyzePaperFile` (panel). Ne produit jamais d'`Expense` directement — la
 * revue interactive reste `ChargeProposal[]` / `DocumentReviewForm` /
 * `receive_document_proposals` / `commit_document_review`, inchangée
 * (§1 de la mission : aucune nouvelle UI).
 */

import { supabase } from "@/lib/supabase";
import { uploadFilesForUser } from "@/lib/uploadDocument";
import { extractPdfTextClient } from "@/lib/lmnp/services/activite-ocr-text";
import { proposalsFromAssuranceCorpus } from "@/runtime/assistants/f012-charges/proposals-from-assurance";
import { proposalsFromGestionCorpus } from "@/runtime/assistants/f012-charges/proposals-from-gestion";
import { proposalsFromCoproCorpus } from "@/runtime/assistants/f012-charges/proposals-from-copro";
import type { ChargeProposal, DocumentaryFamilyId } from "@/runtime/assistants/f012-charges/charge-proposal";

/** Même catégorie documentaire que `ChargesDocumentStep.tsx`/`f012-impots-document-upload.ts` — un seul référentiel, jamais un second. */
export const DOCUMENTARY_REVIEW_UPLOAD_CATEGORY = "charges" as const;

export type AnalyzeDocumentaryReviewResult =
  | { status: "not_authenticated" }
  | { status: "upload_failed" }
  | { status: "extraction_failed"; documentId: string; uploadedFile: File; storagePath: string }
  | { status: "success"; documentId: string; uploadedFile: File; storagePath: string; proposals: ChargeProposal[] };

export type AnalyzeDocumentaryReviewDeps = {
  /** Défaut : `supabase.auth.getUser()` — remplaçable en test, jamais un second client. */
  getAuthenticatedUserId?: () => Promise<string | null>;
  /** Défaut : `uploadFilesForUser` — même pipeline Storage + table `documents` que tous les autres écrans. */
  uploadFiles?: (files: File[], userId: string) => Promise<{ files: File[]; documentIds: string[]; filePaths: string[] }>;
  /** Défaut : même extraction texte que `analyzePaperFile`/`analyzeImpotsDocument` — aucune nouvelle extraction. */
  extractText?: (file: File) => Promise<string>;
};

async function defaultGetAuthenticatedUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function defaultExtractText(file: File): Promise<string> {
  if (file.type === "text/plain" || file.name.endsWith(".txt")) {
    return file.text();
  }
  try {
    return await extractPdfTextClient(file);
  } catch {
    return "";
  }
}

function proposalsForFamily(
  familyId: DocumentaryFamilyId,
  corpus: string,
  documentId: string,
  fiscalYear: number,
): ChargeProposal[] {
  switch (familyId) {
    case "assurances":
      return proposalsFromAssuranceCorpus({ corpus, documentId, fiscalYear });
    case "gestion":
      return proposalsFromGestionCorpus({ corpus, documentId, fiscalYear });
    case "syndic":
      return proposalsFromCoproCorpus({ corpus, documentId, fiscalYear });
    case "impots":
      // Jamais appelée pour "impots" — chemin séparé, `analyzeImpotsDocument` (Phase 2).
      return [];
  }
}

/**
 * Fichier réel choisi par l'utilisateur → upload réel (Supabase Storage +
 * table `documents`) → `LmnpDocument.id` réel → extraction existante →
 * `ChargeProposal[]` (familles "assurances"/"gestion"/"syndic" uniquement).
 *
 * Mêmes garanties de failure-safety que `analyzeImpotsDocument` : pas d'auth
 * → aucun upload tenté ; upload échoué → aucune proposition prétendument
 * liée à un document qui n'existe pas ; extraction en échec → document réel
 * conservé (traçable pour REMOVE_DOCUMENT) mais aucune proposition fabriquée.
 */
export async function analyzeDocumentaryReview(
  file: File,
  familyId: DocumentaryFamilyId,
  fiscalYear: number,
  deps: AnalyzeDocumentaryReviewDeps = {},
): Promise<AnalyzeDocumentaryReviewResult> {
  const getAuthenticatedUserId = deps.getAuthenticatedUserId ?? defaultGetAuthenticatedUserId;
  const uploadFiles = deps.uploadFiles ?? uploadFilesForUser;
  const extractText = deps.extractText ?? defaultExtractText;

  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "not_authenticated" };

  const { files: uploadedFiles, documentIds, filePaths } = await uploadFiles([file], userId);
  if (uploadedFiles.length === 0 || documentIds.length === 0 || filePaths.length === 0) {
    return { status: "upload_failed" };
  }
  const documentId = documentIds[0]!;
  const uploadedFile = uploadedFiles[0]!;
  const storagePath = filePaths[0]!;

  let text: string;
  try {
    text = await extractText(uploadedFile);
  } catch {
    return { status: "extraction_failed", documentId, uploadedFile, storagePath };
  }

  const proposals = proposalsForFamily(familyId, text, documentId, fiscalYear);
  return { status: "success", documentId, uploadedFile, storagePath, proposals };
}
