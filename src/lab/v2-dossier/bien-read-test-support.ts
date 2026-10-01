/**
 * R2A — dossiers mono représentatifs (F010 → F014 produits par les assistants RÉELS, via les fabriques V3 existantes)
 * et photographie complète des read models V3 d'un bien. Sert à la parité legacy mono ↔ dossier scopé
 * (`draft.biens`) et à la comparaison avant / après le cutover de lecture.
 */
import "./test-public-env";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { amortizedWithWorks } from "./amortization-test-support";
import { buildV3AmortizationDetail } from "./amortization-detail-read-model";
import { resolveF014Plan } from "./amortization-plan-seam";
import { buildV3ChargesDetail } from "./charges-detail-read-model";
import { completeCharges, persistCharges, F009_CONFIRMED_AT } from "./charges-test-support";
import { buildV3FinancingDetail } from "./financing-detail-read-model";
import { confirmLoanFromDocument, documentRow, newAssistant, startLoans, workspaceFromState } from "./financing-test-support";
import { buildV3HousingDetail } from "./housing-detail-read-model";
import { SERVICE_DATE, confirmedState, docRow, stateOf, workspaceOf } from "./housing-test-support";
import { resolveV3PropertyServiceDate } from "./property-service-date";
import { buildV3DossierDetailReadModel } from "./read-model";
import { buildV3RevenueDetail } from "./revenue-detail-read-model";
import { conversationalConfirmed, persistConversational } from "./revenue-test-support";
import { buildV3UserActionReadModel } from "./user-action-read-model";

const withDate = { draft: { dateMiseEnService: SERVICE_DATE, inpiConfirmedAt: F009_CONFIRMED_AT } };

/** Un dossier mono réel par domaine F010 → F014 (le domaine nommé y est confirmé par son assistant réel). */
export async function representativeMonoWorkspaces(): Promise<Record<"f010" | "f011" | "f012" | "f013" | "f014", PersistedWorkspace>> {
  const loanAssistant = newAssistant();
  return {
    f010: workspaceOf(await confirmedState({ documents: [docRow("doc-acte", "Acte.pdf")] })),
    f011: workspaceFromState(
      await confirmLoanFromDocument(loanAssistant, await startLoans(loanAssistant, 1), "doc-1"),
      [documentRow("doc-1", "Tableau réel.pdf")],
    ),
    f012: workspaceOf(persistCharges(stateOf(withDate), await completeCharges())),
    f013: workspaceOf(persistConversational(stateOf(withDate), await conversationalConfirmed())),
    f014: workspaceOf(await amortizedWithWorks()),
  };
}

/** Toutes les lectures V3 d'un bien, sérialisées telles quelles (aucun champ exclu). */
export function v3ReadSnapshot(workspace: PersistedWorkspace, propertyId: string): unknown {
  return JSON.parse(JSON.stringify({
    housing: buildV3HousingDetail(workspace, propertyId),
    financing: buildV3FinancingDetail(workspace),
    charges: buildV3ChargesDetail(workspace, propertyId),
    revenue: buildV3RevenueDetail(workspace, propertyId),
    amortization: buildV3AmortizationDetail(workspace, propertyId),
    f014Plan: resolveF014Plan(workspace, propertyId),
    serviceDate: resolveV3PropertyServiceDate(workspace, propertyId),
    dossier: buildV3DossierDetailReadModel(workspace),
    userActions: buildV3UserActionReadModel(workspace),
  }));
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Comparaison entre DEUX exécutions uniquement : les fabriques horodatent au temps réel. */
export function withoutTimestamps(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, item) =>
    key.endsWith("At") && typeof item === "string" && ISO_TIMESTAMP.test(item) ? undefined : item));
}
