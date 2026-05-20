import type { DocumentAnalysisResult } from "../ocr/map-to-extractions";
import type { LmnpDocument } from "../types";
import type { LmnpAction } from "../store/reducer";
import { analyzeDocument } from "./document-analysis";
import { OcrClientError, requestDocumentOcr } from "./ocr-client";
import { fileToVisionImages } from "./pdf-to-images";

export async function runBulkDocumentAnalysis(params: {
  documents: LmnpDocument[];
  documentIds: string[];
  getFile: (documentId: string) => File | undefined;
  dispatch: (action: LmnpAction) => void;
}): Promise<{ succeeded: number; failed: number }> {
  const { documents, documentIds, getFile, dispatch } = params;
  let succeeded = 0;
  let failed = 0;

  for (const docId of documentIds) {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) continue;

    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: docId, status: "processing" });

    try {
      const file = getFile(docId);
      if (!file) {
        throw new Error("Fichier introuvable dans le navigateur. Réimportez le document.");
      }

      const result = await analyzeDocumentWithVision(doc, file);
      dispatch({ type: "APPLY_DOCUMENT_ANALYSIS", documentId: docId, result });
      succeeded++;
    } catch (err) {
      console.error("[runBulkDocumentAnalysis]", doc.fileName, err);
      dispatch({ type: "DOCUMENT_SET_STATUS", documentId: docId, status: "failed" });
      failed++;
    }
  }

  return { succeeded, failed };
}

async function analyzeDocumentWithVision(
  doc: LmnpDocument,
  file: File,
): Promise<DocumentAnalysisResult> {
  try {
    const images = await fileToVisionImages(file);
    const remote = await requestDocumentOcr(images, {
      fileName: doc.fileName,
      userCategory: doc.category,
      fiscalYearId: doc.fiscalYearId,
      documentId: doc.id,
    });
    return remote;
  } catch (err) {
    if (err instanceof OcrClientError && err.status === 503) {
      return heuristicFallback(doc);
    }
    throw err;
  }
}

function heuristicFallback(doc: LmnpDocument): DocumentAnalysisResult {
  const mock = analyzeDocument(doc, doc.category);
  return {
    documentType: mock.documentType,
    category: mock.category,
    extractions: mock.extractions,
  };
}
