import type { RecettesExerciceResult } from "../capabilities/f013/types";

/**
 * Couche présentation — synthèse F-013 (Explanation Engine).
 */
export type ExplainRevenusInput = {
  recettes: RecettesExerciceResult;
  exerciceFiscal: number;
};

export type ExplainRevenusOutput = {
  explanation: string;
  ancrageMessage?: string;
  decalageMessage?: string;
};

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export function explainRevenus(input: ExplainRevenusInput): ExplainRevenusOutput {
  const { recettes } = input;
  const lines: string[] = [];

  if (recettes.revenuTheorique && recettes.revenuTheorique.montantAttendu > 0) {
    lines.push(
      `Sur la base de votre bail (loyer : ${fmtEur(recettes.revenuTheorique.loyerMensuel)}/mois), ` +
        `votre activité de location meublée sur ${input.exerciceFiscal} ` +
        `représentait un revenu théorique de ${fmtEur(recettes.revenuTheorique.montantAttendu)}.`,
    );
  }

  const detailParts: string[] = [];
  if (recettes.loyersEncaisses > 0) {
    detailParts.push(`${fmtEur(recettes.loyersEncaisses)} de loyers encaissés`);
  }
  if (recettes.ajustementsJanDec !== 0) {
    detailParts.push(
      `${recettes.ajustementsJanDec > 0 ? "+" : ""}${fmtEur(recettes.ajustementsJanDec)} ajustement janvier/décembre`,
    );
  }
  if (recettes.indemnitesAssurance > 0) {
    detailParts.push(`${fmtEur(recettes.indemnitesAssurance)} d'indemnités assurance`);
  }
  if (recettes.recettesPlateforme > 0) {
    detailParts.push(`${fmtEur(recettes.recettesPlateforme)} de revenus plateforme`);
  }

  lines.push(
    `Total recettes déclarables pour ${input.exerciceFiscal} : ${fmtEur(recettes.totalRecettes)}.` +
      (detailParts.length ? ` Détail : ${detailParts.join(", ")}.` : ""),
  );

  let decalageMessage: string | undefined;
  if (recettes.ajustementsJanDec !== 0) {
    decalageMessage =
      "En déclaration LMNP, ce qui compte c'est la date à laquelle vous avez reçu l'argent — " +
      "pas la période que ce loyer couvre.\n\n" +
      "Le loyer de décembre 2023 payé en janvier 2024 : c'est une recette 2024.\n" +
      "Le loyer de décembre 2024 payé en janvier 2025 : c'est une recette 2025.\n\n" +
      "Nous avons ajusté votre total en conséquence.";
  }

  return {
    explanation: lines.join("\n\n"),
    ancrageMessage: recettes.revenuTheorique
      ? `Revenu théorique : ${fmtEur(recettes.revenuTheorique.montantAttendu)}`
      : undefined,
    decalageMessage,
  };
}

export const EXP_F013_DEPOT_GARANTIE =
  "Le dépôt de garantie que vous avez reçu à l'entrée du locataire " +
  "n'est pas un revenu — il vous a été confié temporairement et doit " +
  "être restitué à la fin du bail. Il n'entre donc pas dans vos recettes " +
  "de l'exercice, même si vous l'avez bien encaissé cette année-là.";

export const EXP_F013_IMPAYE =
  "Un loyer que votre locataire n'a pas payé n'est pas une recette — " +
  "vous ne l'avez pas encaissé. Il ne figure donc pas dans vos revenus.\n\n" +
  "Si vous obtenez un remboursement ultérieur (via un jugement ou une assurance), " +
  "il sera à déclarer l'année où vous le percevrez effectivement.";

export const EXP_F013_VACANCE_LONGUE =
  "Une vacance longue n'est pas un problème en soi — " +
  "mais l'administration peut s'interroger si vous avez déduit des charges " +
  "pendant cette période sans pouvoir justifier que vous cherchiez " +
  "activement un locataire.\n\n" +
  "Conserver une trace de vos démarches (annonces, mandats, correspondances) " +
  "est la meilleure protection en cas de contrôle.";

export const EXP_F013_PLATEFORME_NET =
  "Airbnb et Booking vous versent le loyer après avoir prélevé leur commission. " +
  "Ce que vous avez reçu sur votre compte, c'est le montant net.\n\n" +
  "Vous pouvez déclarer ce montant net — c'est la pratique la plus simple. " +
  "Si vous préférez déclarer le montant brut (ce que les voyageurs ont payé), " +
  "la commission devient alors une charge déductible que nous ajoutons à votre dossier.";
