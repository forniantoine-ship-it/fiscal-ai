/**
 * Business-facing supervision for revenue extraction.
 * Parser outcomes drive truth; users see actionable guidance, not abstract scores.
 */

import type { RevenueRawLine } from "../types";
import type {
  RevenueSupervisionLevel,
  RevenueSupervisionStatus,
} from "../types/revenue-supervision";
import type { RevenuePipelineId } from "./pipelines/revenus/revenue-pipeline-types";

export type { RevenueSupervisionLevel, RevenueSupervisionStatus } from "../types/revenue-supervision";

export function attachRevenueSupervision<T extends { supervision?: RevenueSupervisionStatus }>(
  payload: T,
  supervision: RevenueSupervisionStatus,
): T {
  return { ...payload, supervision };
}

function lowConfidenceLineCount(lines: RevenueRawLine[]): number {
  return lines.filter((line) => line.confidence < 75).length;
}

function ambiguousMonthLabels(lines: RevenueRawLine[]): boolean {
  const labels = lines
    .map((line) => line.monthLabel?.trim().toLowerCase())
    .filter(Boolean) as string[];
  const duplicates = new Set<string>();
  for (const label of labels) {
    if (duplicates.has(label)) return true;
    duplicates.add(label);
  }
  return false;
}

export function buildRevenueSupervision(params: {
  pipelineId: RevenuePipelineId;
  lines: RevenueRawLine[];
  ocrFailure?: boolean;
  structuralError?: string;
  gptUsed?: boolean;
  partialRead?: boolean;
  /** Avertissements additionnels (ex. feuilles Excel non intégrées) — jamais un silence. */
  extraWarnings?: string[];
}): RevenueSupervisionStatus {
  const { pipelineId, lines, ocrFailure, structuralError, gptUsed, partialRead, extraWarnings } = params;

  if (ocrFailure) {
    return {
      level: "red",
      title: "Document illisible",
      message:
        "Nous n'avons pas réussi à lire ce document de façon fiable. Essayez un export Excel ou CSV, un PDF natif (texte sélectionnable), ou une photo plus nette.",
      recoveryHints: [
        "Déposer l'export Excel ou CSV d'origine",
        "Utiliser un PDF exporté depuis votre banque (texte, pas scan)",
        "Recadrer la capture sur la zone du tableau",
      ],
    };
  }

  if (structuralError) {
    return {
      level: "red",
      title: "Structure non reconnue",
      message: structuralError,
      recoveryHints: [
        "Vérifier que le fichier contient un tableau mensuel (mois, loyer, complément)",
        "Réessayer avec le modèle d'export de votre agence ou banque",
      ],
    };
  }

  if (lines.length === 0) {
    const hints =
      pipelineId === "spreadsheet"
        ? [
            "Vérifier que la première ligne contient les en-têtes (Mois, Loyer, Complément…)",
            "Exporter au format .xlsx ou .csv depuis votre outil de suivi",
          ]
        : pipelineId === "vision"
          ? [
              "Déposer l'export Excel d'origine plutôt qu'une capture",
              "Zoomer la capture sur le tableau des loyers",
              "Découper page par page si le PDF est long",
            ]
          : [
              "Ajouter un relevé bancaire ou un export de loyers mensuels",
              "Compléter la grille manuellement si le document est une seule quittance",
            ];

    return {
      level: "red",
      title: "Aucune ligne de loyer détectée",
      message:
        "Aucun flux locatif mensuel n'a pu être extrait de façon déterministe. Merci d'améliorer la source ou de saisir les montants dans la grille.",
      recoveryHints: hints,
    };
  }

  const warnings: string[] = [...(extraWarnings ?? [])];
  const recoveryHints: string[] = [];
  const uncertain = lowConfidenceLineCount(lines);

  if (uncertain > 0) {
    warnings.push(
      `${uncertain} ligne(s) présentent une lecture incertaine — vérifiez les montants avant validation.`,
    );
  }

  if (ambiguousMonthLabels(lines)) {
    warnings.push(
      "Plusieurs lignes semblent ambiguës sur le mois concerné (ex. chevauchement juin / juillet).",
    );
    recoveryHints.push(
      "Comparer avec votre export Excel pour lever l'ambiguïté entre les mois voisins.",
    );
  }

  if (partialRead) {
    warnings.push("Certaines lignes du tableau semblent partiellement illisibles.");
    recoveryHints.push(
      "Téléverser l'export Excel original",
      "Augmenter le zoom sur la capture d'écran",
      "Ajouter la page 2 séparément si le tableau continue",
    );
  }

  if (gptUsed && pipelineId === "vision") {
    warnings.push(
      "Une partie du document a nécessité une lecture assistée — les lignes douteuses ne sont pas inventées automatiquement.",
    );
  }

  if (warnings.length === 0) {
    return {
      level: "green",
      title: "Revenus extraits",
      message: `${lines.length} flux locatif(s) détecté(s). Les montants proviennent d'une lecture structurée du document, sans reconstruction automatique des totaux.`,
      lineCount: lines.length,
    };
  }

  return {
    level: "orange",
    title: "Extraction à vérifier",
    message: `Nous avons détecté ${lines.length} flux, mais certains points méritent votre relecture avant validation.`,
    lineCount: lines.length,
    warnings,
    recoveryHints: recoveryHints.length ? recoveryHints : undefined,
  };
}
