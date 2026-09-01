import { computeRecettesExercice, type Anomaly, type FieldSource } from "@/runtime";

import { monthKeyForTransaction } from "./revenue-aggregation";
import type { RevenueGptSession, RevenusAssistantOutput } from "../types";

export type BuildRevenusAssistantResult = {
  revenusAssistant: RevenusAssistantOutput;
  anomalies: Anomaly[];
};

/**
 * Catégories dont un montant négatif doit être signalé, jamais ignoré
 * (Cycle 15A, élargi Cycle 17 à toutes les catégories réellement comptées
 * comme recette par le switch ci-dessous — reimbursement/caf_subsidy/unknown
 * en manquaient, incohérence trouvée à la relecture).
 */
const REVENUE_CATEGORIES_WITH_SIGN_WARNING = new Set([
  "rent",
  "platform_payout",
  "insurance_indemnity",
  "additional_income",
  "reimbursement",
  "caf_subsidy",
  "unknown",
]);

/**
 * Transforme une session d'upload (grille + transactions déjà extraites et
 * correctement rattachées à l'exercice, feuille et nature — Cycle 15A) en
 * `RevenusAssistantOutput`, exactement la forme que produit déjà
 * `F013RevenusAssistantPanel` côté conversationnel.
 *
 * Réutilise `computeRecettesExercice()` en `modeCollecte: true` — aucune
 * nouvelle logique fiscale : ce mode existait déjà pour le cas "plateforme
 * pure" de l'assistant conversationnel. Les dates réelles par transaction
 * (déjà correctement filtrées par exercice via monthKeyForTransaction avant
 * même d'arriver ici, au niveau de la grille) rendent inutile l'approximation
 * Jan/Déc de l'assistant conversationnel, qui n'a de sens qu'en l'absence de
 * dates individuelles.
 */
function sessionHasUserEditedGrid(session: RevenueGptSession): boolean {
  return session.properties.some((property) => property.gridUserEdited);
}

/**
 * Cycle 23 — quand l'utilisateur a corrigé la grille, la grille confirmée
 * est la source de vérité (même contrat que `sessionToExtractionData` /
 * `gridSummary`). Les transactions brutes peuvent encore porter un second
 * import (fichier identique renommé) que l'utilisateur a déjà retiré de la
 * grille : les relire ici ferait diverger F-006 / case AB de l'écran.
 */
function totalsFromEditedGrid(session: RevenueGptSession): {
  loyersEtAutres: number;
  recettesPlateforme: number;
} {
  let loyersEtAutres = 0;
  let recettesPlateforme = 0;
  for (const property of session.properties) {
    for (const row of property.rows) {
      loyersEtAutres += row.loyers;
      recettesPlateforme += row.autresRevenus;
    }
  }
  return { loyersEtAutres, recettesPlateforme };
}

export function buildRevenusAssistantFromSession(
  session: RevenueGptSession,
  fiscalYear: number,
  dateMiseEnService?: string,
): BuildRevenusAssistantResult {
  let loyersEtAutres = 0;
  let recettesPlateforme = 0;
  let indemnitesAssurance = 0;
  const anomalies: Anomaly[] = [];
  const useEditedGrid = sessionHasUserEditedGrid(session);

  if (useEditedGrid) {
    const fromGrid = totalsFromEditedGrid(session);
    loyersEtAutres = fromGrid.loyersEtAutres;
    recettesPlateforme = fromGrid.recettesPlateforme;
  }

  if (!useEditedGrid) {
    for (const property of session.properties) {
      for (const transaction of property.transactions ?? []) {
      const isRevenueNature = REVENUE_CATEGORIES_WITH_SIGN_WARNING.has(transaction.category);

      // Cycle 20 — chemin GPT/OCR : le prompt impose "amount toujours positif
      // (valeur absolue)" à GPT, donc une régularisation/remboursement AU SEIN
      // d'une recette y est représentée par direction=debit + montant positif
      // (jamais un montant négatif en direction=credit, contrairement au
      // chemin Excel/structuré). Ignorer purement ce débit — comme le faisait
      // l'ancien filtre `direction !== "credit"` — fait disparaître la
      // régularisation SANS réduire la recette : celle-ci reste gonflée à tort
      // du montant complet. Vérifié par un appel GPT réel (Cycle 20) : une
      // ligne "Régularisation GLI trop perçu -120€" n'était même pas renvoyée
      // par GPT ; si elle l'avait été comme debit positif, elle aurait été
      // silencieusement exclue ici. Un débit hors catégorie de revenu (charges,
      // frais, dépôt...) reste, lui, toujours exclu — comportement inchangé.
      if (transaction.direction === "debit" && !isRevenueNature) continue;
      if (transaction.direction !== "credit" && transaction.direction !== "debit") continue;

      // Même règle d'attribution que la grille (Cycle 15A) : une date réelle hors
      // exercice exclut définitivement la transaction, jamais de repli qui la
      // réinjecterait dans l'exercice demandé.
      const monthKey = monthKeyForTransaction(transaction, fiscalYear);
      if (!monthKey) continue;

      const amount =
        transaction.direction === "debit" ? -Math.abs(transaction.amount) : transaction.amount;

      if (amount < 0 && isRevenueNature) {
        anomalies.push({
          severity: "warning",
          message:
            `Montant négatif détecté dans une ligne de revenu importée ` +
            `(${transaction.label ?? transaction.description}, ${amount} €, ${monthKey}) — ` +
            "pris en compte comme ajustement négatif, à vérifier avant validation.",
          field: "revenu_document",
        });
      }

      switch (transaction.category) {
        case "platform_payout":
          recettesPlateforme += amount;
          break;
        case "insurance_indemnity":
          indemnitesAssurance += amount;
          break;
        case "rent":
        case "additional_income":
        case "reimbursement":
        case "caf_subsidy":
        case "unknown":
          // Pas de bucket dédié dans computeRecettesExercice() pour ces natures
          // (remboursement de charges, CAF...) — portée assumée du Cycle 15A :
          // comptées dans la base recette, sans ligne détaillée séparée.
          loyersEtAutres += amount;
          break;
        default:
          // deposit / internal_transfer / owner_contribution / owner_transfer /
          // charges / fee : jamais une recette.
          break;
      }
    }
  }
  }

  const fieldSources: Partial<Record<string, FieldSource>> = {
    revenu_declare: useEditedGrid ? "manual" : "extracted",
    plateforme: useEditedGrid ? "manual" : "extracted",
    indemnites: useEditedGrid ? "manual" : "extracted",
  };

  const computed = computeRecettesExercice({
    exerciceFiscal: fiscalYear,
    dateMiseEnService: dateMiseEnService ?? `${fiscalYear}-01-01`,
    modeCollecte: true,
    montantDeclare: loyersEtAutres,
    recettesPlateforme,
    indemnitesAssurance,
    fieldSources,
  });

  return {
    revenusAssistant: {
      exerciceFiscal: computed.recettes.exerciceFiscal,
      totalRecettes: computed.recettes.totalRecettes,
      loyersEncaisses: computed.recettes.loyersEncaisses,
      indemnitesAssurance: computed.recettes.indemnitesAssurance,
      recettesPlateforme: computed.recettes.recettesPlateforme,
      ajustementsJanDec: computed.recettes.ajustementsJanDec,
      moisLocationEffectifs: computed.recettes.moisLocationEffectifs,
      revenuTheorique: computed.recettes.revenuTheorique?.montantAttendu,
      fieldSources,
      computedAt: new Date().toISOString(),
    },
    anomalies: [...anomalies, ...computed.anomalies],
  };
}
