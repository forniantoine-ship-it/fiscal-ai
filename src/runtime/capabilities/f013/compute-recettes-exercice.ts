import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import { applyDecalageJanDec } from "./apply-decalage-jan-dec";
import { computeRevenuTheorique } from "./compute-revenu-theorique";
import { reconcileRevenus } from "./reconcile-revenus";
import type {
  LigneRecette,
  PeriodeLocation,
  RecettesExerciceResult,
  VacancePeriode,
} from "./types";
import { round2 } from "./types";
import { validateRevenus } from "./validate-revenus";

/**
 * Composition explicite F-013 (TRF-REV-01, TRF-REV-02, SAV-028) — ADR-003.
 */
export type ComputeRecettesExerciceInput = {
  exerciceFiscal: number;
  dateMiseEnService: string;
  modeCollecte?: boolean;
  loyerMensuel?: number;
  provisionChargesMensuelle?: number;
  periodes?: PeriodeLocation[];
  vacances?: VacancePeriode[];
  montantDeclare: number;
  janvierEncaisseDecPrecedent?: boolean;
  decembreEncaisseJanvierSuivant?: boolean;
  indemnitesAssurance?: number;
  recettesPlateforme?: number;
  fieldSources?: Partial<Record<string, FieldSource>>;
};

export type ComputeRecettesExerciceOutput = {
  recettes: RecettesExerciceResult;
  reconciliation?: ReturnType<typeof reconcileRevenus>;
  anomalies: Anomaly[];
};

function src(
  fieldSources: Partial<Record<string, FieldSource>> | undefined,
  key: string,
): FieldSource {
  return fieldSources?.[key] ?? "manual";
}

export function computeRecettesExercice(
  input: ComputeRecettesExerciceInput,
): ComputeRecettesExerciceOutput {
  const anomalies: Anomaly[] = [];
  const lignes: LigneRecette[] = [];

  let revenuTheoriqueResult: ReturnType<typeof computeRevenuTheorique> | undefined;
  let reconciliation: ReturnType<typeof reconcileRevenus> | undefined;
  let montantLoyers = input.montantDeclare;

  if (!input.modeCollecte) {
    revenuTheoriqueResult = computeRevenuTheorique({
      exerciceFiscal: input.exerciceFiscal,
      dateMiseEnService: input.dateMiseEnService,
      loyerMensuel: input.loyerMensuel,
      provisionChargesMensuelle: input.provisionChargesMensuelle,
      periodes: input.periodes,
      vacances: input.vacances,
    });
    anomalies.push(...revenuTheoriqueResult.anomalies);

    reconciliation = reconcileRevenus({
      revenuTheorique: revenuTheoriqueResult.revenuTheorique.montantAttendu,
      revenuDeclare: input.montantDeclare,
    });
    anomalies.push(...reconciliation.anomalies);

    const decalage = applyDecalageJanDec({
      montantDeclare: input.montantDeclare,
      loyerMensuel: revenuTheoriqueResult.revenuTheorique.loyerMensuel,
      janvierEncaisseDecPrecedent: input.janvierEncaisseDecPrecedent,
      decembreEncaisseJanvierSuivant: input.decembreEncaisseJanvierSuivant,
    });
    anomalies.push(...decalage.anomalies);
    montantLoyers = decalage.montantAjuste;

    if (decalage.ajustement !== 0) {
      lignes.push({
        id: "ajustement-jan-dec",
        source: "ajustement_jan_dec",
        description: "Ajustement décalage janvier/décembre",
        montant: decalage.ajustement,
        statutEncaissement: "ajuste",
        origineSav: ["SAV-028"],
        fieldSource: "derived",
      });
    }
  } else {
    montantLoyers = input.montantDeclare;
  }

  if (montantLoyers > 0) {
    lignes.push({
      id: "loyers-base",
      source: "loyers",
      description: "Loyers encaissés",
      montant: montantLoyers,
      statutEncaissement: "encaisse",
      origineSav: ["SAV-028"],
      fieldSource: src(input.fieldSources, "revenu_declare"),
    });
  }

  const indemnites = round2(input.indemnitesAssurance ?? 0);
  if (indemnites > 0) {
    lignes.push({
      id: "indemnites-assurance",
      source: "indemnites",
      description: "Indemnités assurance (GLI/VISALE)",
      montant: indemnites,
      statutEncaissement: "encaisse",
      origineSav: ["SAV-028", "SAV-REV-04"],
      fieldSource: src(input.fieldSources, "indemnites"),
    });
  }

  const plateforme = round2(input.recettesPlateforme ?? 0);
  if (plateforme > 0) {
    lignes.push({
      id: "recettes-plateforme",
      source: "plateforme",
      description: "Revenus plateforme (net versé)",
      montant: plateforme,
      statutEncaissement: "encaisse",
      origineSav: ["SAV-REV-03"],
      fieldSource: src(input.fieldSources, "plateforme"),
    });
  }

  const totalRecettes = round2(montantLoyers + indemnites + plateforme);
  const moisLocation =
    revenuTheoriqueResult?.revenuTheorique.moisLocationEffectifs ?? 0;

  const validation = validateRevenus({
    exerciceFiscal: input.exerciceFiscal,
    dateMiseEnService: input.dateMiseEnService,
    totalRecettes,
    loyerMensuel: input.loyerMensuel ?? revenuTheoriqueResult?.revenuTheorique.loyerMensuel,
    moisLocationEffectifs: moisLocation,
    vacances: input.vacances,
    revenuTheorique: revenuTheoriqueResult?.revenuTheorique.montantAttendu,
  });
  anomalies.push(...validation.anomalies);

  return {
    recettes: {
      exerciceFiscal: input.exerciceFiscal,
      totalRecettes,
      loyersEncaisses: montantLoyers,
      indemnitesAssurance: indemnites,
      recettesPlateforme: plateforme,
      ajustementsJanDec: lignes.find((l) => l.source === "ajustement_jan_dec")?.montant ?? 0,
      moisLocationEffectifs: moisLocation,
      lignes,
      revenuTheorique: revenuTheoriqueResult?.revenuTheorique,
      deltaExplique: reconciliation?.ecart ?? 0,
    },
    reconciliation,
    anomalies,
  };
}
