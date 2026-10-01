import type { ReportableExtractionStatus } from "@/lib/lmnp/dossier/document-extraction-status";
import { runF011UploadFlow, type RunF011UploadFlowParams, type RunF011UploadFlowResult } from "./f011-document-analysis";

/**
 * F011-R2 — cycle de vie de `documents.extraction_status` autour du pipeline F011 (`runF011UploadFlow`, exécuté dans le
 * navigateur). Chaque statut correspond à un ÉVÉNEMENT RÉEL :
 *   - processing : l'analyse commence (écrit AVANT l'appel du pipeline, pour qu'aucune écriture ne soit ré-ordonnée après) ;
 *   - completed  : le pipeline a produit un résultat d'extraction (succès ou partiel). Reste vrai si le tableau est ensuite
 *                  refusé par `resolveDocumentaryEcheances` : « extraction réussie » ≠ « échéancier exploitable » ;
 *   - failed     : le pipeline lui-même échoue (rien d'exploitable lu, ou exception).
 * Jamais `failed` pour un motif métier (mois manquant, CRD, F006…) : ces états n'existent pas à cette frontière.
 *
 * Le rapport est BEST-EFFORT : une erreur du rapporteur est absorbée, le résultat F011 est retourné inchangé.
 */
export type ExtractionStatusReporter = (status: ReportableExtractionStatus) => Promise<unknown>;

export type RunF011UploadFlowWithStatusLifecycleParams = RunF011UploadFlowParams & {
  /** Absent (dossier inconnu côté client) : le flux se comporte exactement comme `runF011UploadFlow`. */
  reportStatus?: ExtractionStatusReporter;
};

export async function runF011UploadFlowWithStatusLifecycle(
  params: RunF011UploadFlowWithStatusLifecycleParams,
): Promise<RunF011UploadFlowResult> {
  const { reportStatus, ...flowParams } = params;
  const report = async (status: ReportableExtractionStatus) => {
    if (!reportStatus) return;
    try {
      await reportStatus(status);
    } catch {
      // Best-effort : le statut de cycle de vie n'est jamais une autorité.
    }
  };

  await report("processing");
  let result: RunF011UploadFlowResult;
  try {
    result = await runF011UploadFlow(flowParams);
  } catch (error) {
    await report("failed");
    throw error;
  }
  await report(result.outcome.state === "failed" ? "failed" : "completed");
  return result;
}
