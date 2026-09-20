/**
 * F012 V2 document-first — Phase 2, fermeture du P1 "upload réel".
 *
 * Orchestration injectable (même patron que `runCreateNextFiscalYear`,
 * `create-next-fiscal-year.ts`) pour que le boundary réseau (auth Supabase +
 * upload) soit testable sans réseau réel, tout en gardant le CODE PRODUIT
 * identique à celui réellement utilisé par le panel : les valeurs par
 * défaut de chaque dépendance sont les fonctions réelles déjà en production
 * (`uploadFilesForUser`, `extractPdfTextClient`) — jamais un second système
 * d'upload/OCR.
 *
 * Réservé à la famille "impots" (taxe foncière) migrée vers `Expense`. Les
 * autres familles documentaires restent sur `analyzePaperFile`/`ChargeProposal`
 * inchangés dans le panel.
 */

import { supabase } from "@/lib/supabase";
import { uploadFilesForUser } from "@/lib/uploadDocument";
import { extractPdfTextClient } from "@/lib/lmnp/services/activite-ocr-text";
import { expensesFromTaxeFonciereCorpus } from "@/runtime/assistants/f012-charges/expense-from-taxe-fonciere";
import type { Expense } from "@/runtime/capabilities/f012/expense";

/** Catégorie documentaire — même valeur que `ChargesDocumentStep.tsx` (`CHARGES_UPLOAD_CATEGORY`) : un seul référentiel de catégories documentaires, jamais un second. */
export const IMPOTS_UPLOAD_CATEGORY = "charges" as const;

export type AnalyzeImpotsDocumentResult =
  | { status: "not_authenticated" }
  | { status: "upload_failed" }
  // Le document a bien été uploadé (Storage + table `documents`, id réel) —
  // seule l'extraction locale échoue. `documentId`/`uploadedFile` restent
  // portés ici pour que l'appelant puisse enregistrer le document réel
  // (UPLOAD_DOCUMENTS) même sans Expense (§3.B de la mission).
  | { status: "extraction_failed"; documentId: string; uploadedFile: File; storagePath: string }
  | { status: "success"; documentId: string; uploadedFile: File; storagePath: string; expenses: Expense[] };

export type AnalyzeImpotsDocumentDeps = {
  /** Défaut : `supabase.auth.getUser()` — remplaçable en test, jamais un second client. */
  getAuthenticatedUserId?: () => Promise<string | null>;
  /** Défaut : `uploadFilesForUser` (`src/lib/uploadDocument.ts`) — même pipeline Storage + table `documents` que tous les autres écrans. */
  uploadFiles?: (files: File[], userId: string) => Promise<{ files: File[]; documentIds: string[]; filePaths: string[] }>;
  /** Défaut : même extraction texte que `analyzePaperFile` (`.txt` direct, sinon `extractPdfTextClient`) — aucune nouvelle extraction. */
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

/**
 * Fichier réel choisi par l'utilisateur → upload réel (Supabase Storage +
 * table `documents`) → `LmnpDocument.id` réel → extraction existante →
 * `Expense[]` (famille "impots" uniquement).
 *
 * §3 Failure safety :
 * - auth absente → `not_authenticated`, AUCUNE Expense, aucun upload tenté.
 * - upload échoue (aucun fichier réellement stocké) → `upload_failed`,
 *   AUCUNE Expense prétendument liée à un document qui n'existe pas.
 * - extraction lève une exception → `extraction_failed` (jamais un montant
 *   fabriqué) ; une extraction qui ne trouve simplement aucun montant N'EST
 *   PAS un échec ici — `expensesFromTaxeFonciereCorpus` produit déjà une
 *   Expense `pending`/`reviewNeeded` dans ce cas (jamais confirmée
 *   automatiquement), donc `status: "success"` reste correct.
 */
export async function analyzeImpotsDocument(
  file: File,
  fiscalYear: number,
  deps: AnalyzeImpotsDocumentDeps = {},
): Promise<AnalyzeImpotsDocumentResult> {
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

  const expenses = expensesFromTaxeFonciereCorpus({ corpus: text, documentId, fiscalYear });
  return { status: "success", documentId, uploadedFile, storagePath, expenses };
}
