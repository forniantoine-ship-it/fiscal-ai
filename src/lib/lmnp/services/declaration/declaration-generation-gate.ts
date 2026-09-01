import type { Anomaly } from "@/runtime";
import { documentJourneyRoute, LMNP_ROUTES } from "../../routes";
import type { DeclarationDraft, FiscalEngineOutput, Property } from "../../types";
import { runDeclarationGeneration } from "./run-declaration-generation";
import {
  buildValidationDossierSnapshot,
  type MissingDossierItem,
  type ValidationDossierSnapshot,
} from "../validation-profile";

export type DeclarationGenerationGate = {
  snapshot: ValidationDossierSnapshot;
  canCheckout: boolean;
  canRetryAfterPayment: boolean;
  canGenerate: boolean;
  blockingAnomalies: Anomaly[];
  recoveryItems: MissingDossierItem[];
  /**
   * Le FiscalResult (F-006) réellement recalculé par cette porte, dès qu'il est
   * disponible — jamais une estimation séparée. `undefined` uniquement quand
   * F-006/F-007 n'a pas pu être exécuté (dossier incomplet ou anomalie
   * bloquante) : dans ce cas il n'existe aucun résultat fiscal à afficher, pas
   * même approximatif.
   */
  fiscalResult?: FiscalEngineOutput;
};

const RECOVERY_BY_FIELD: Record<string, MissingDossierItem> = {
  dateMiseEnService: {
    id: "activite-date",
    label: "Date de mise en service manquante",
    href: LMNP_ROUTES.activite,
  },
  "identite.siret": {
    id: "activite-siret",
    label: "SIRET ou SIREN manquant",
    href: LMNP_ROUTES.activite,
  },
  "identite.denomination": {
    id: "activite-identite",
    label: "Identité de l'exploitant manquante",
    href: LMNP_ROUTES.activite,
  },
  revenusAssistant: {
    id: "revenus-assistant",
    label: "Recettes non calculées",
    href: LMNP_ROUTES.revenusAssistant,
  },
  "revenusAssistant.exerciceFiscal": {
    id: "revenus-exercice",
    label: "Exercice des recettes incohérent",
    href: LMNP_ROUTES.revenusAssistant,
  },
  chargesAssistant: {
    id: "charges-assistant",
    label: "Charges non calculées",
    href: LMNP_ROUTES.chargesAssistant,
  },
  amortissementAssistant: {
    id: "amortissement-assistant",
    label: "Amortissements non validés",
    href: LMNP_ROUTES.amortissementsAssistant,
  },
  "amortissementAssistant.status": {
    id: "amortissement-status",
    label: "Le plan d'amortissement doit être validé",
    href: LMNP_ROUTES.amortissementsAssistant,
  },
};

function recoveryItemsFromAnomalies(anomalies: Anomaly[]): MissingDossierItem[] {
  const seen = new Set<string>();
  const items: MissingDossierItem[] = [];
  for (const anomaly of anomalies) {
    if (anomaly.severity !== "fatal" && anomaly.severity !== "error") continue;
    const mapped = anomaly.field ? RECOVERY_BY_FIELD[anomaly.field] : undefined;
    const item = mapped ?? {
      id: anomaly.field ?? anomaly.message,
      label: anomaly.message,
      href: documentJourneyRoute("validation"),
    };
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

/**
 * Porte unique entre l'écran de validation et F-006/F-007.
 * Ne change aucune règle fiscale : elle refuse le paiement si la génération
 * serait bloquée, et autorise un nouvel essai si le paiement a déjà été
 * marqué (état coincé historique).
 */
export function resolveDeclarationGenerationGate(input: {
  draft: DeclarationDraft | undefined;
  properties: Property[];
  fiscalYear: number;
  paid: boolean;
  generated: boolean;
}): DeclarationGenerationGate {
  const snapshot = buildValidationDossierSnapshot(input.draft, input.properties, input.fiscalYear);

  if (input.generated) {
    const stored = input.draft?.fiscalResult;
    if (snapshot.isComplete && !snapshot.isMultiProperty) {
      const preview = runDeclarationGeneration(input.draft, input.fiscalYear);
      if (
        preview.status === "generated" &&
        (stored?.totalRecettes !== preview.fiscalResult.totalRecettes ||
          stored?.totalCharges !== preview.fiscalResult.totalCharges ||
          stored?.amortDeduct !== preview.fiscalResult.amortDeduct ||
          stored?.amortReporte !== preview.fiscalResult.amortReporte)
      ) {
        return {
          snapshot,
          canCheckout: false,
          canRetryAfterPayment: true,
          canGenerate: true,
          blockingAnomalies: [],
          recoveryItems: [],
        };
      }
    }

    return {
      snapshot,
      canCheckout: false,
      canRetryAfterPayment: false,
      canGenerate: false,
      blockingAnomalies: [],
      recoveryItems: [],
    };
  }

  if (!snapshot.isComplete || snapshot.isMultiProperty) {
    return {
      snapshot,
      canCheckout: false,
      canRetryAfterPayment: false,
      canGenerate: false,
      blockingAnomalies: [],
      recoveryItems: snapshot.missing,
    };
  }

  const preview = runDeclarationGeneration(input.draft, input.fiscalYear);
  if (preview.status === "blocked") {
    return {
      snapshot,
      canCheckout: false,
      canRetryAfterPayment: false,
      canGenerate: false,
      blockingAnomalies: preview.anomalies,
      recoveryItems: recoveryItemsFromAnomalies(preview.anomalies),
    };
  }

  return {
    snapshot,
    canCheckout: !input.paid,
    canRetryAfterPayment: input.paid,
    canGenerate: true,
    blockingAnomalies: [],
    recoveryItems: [],
    fiscalResult: preview.fiscalResult,
  };
}
