import type { Anomaly } from "../../contracts/Anomaly";
import { computeInFineInterests } from "./compute-in-fine-interests";
import { extractInterestsExercice } from "./extract-interests-exercice";
import { generateLoanSchedule } from "./generate-loan-schedule";
import { isolatePreExploitationInterests } from "./isolate-pre-exploitation-interests";
import type { ChargesFinancementExercice, EcheanceMensuelle, PretFinancementExercice, TypePret } from "./types";
import { round2 } from "./types";
import { validateFinancement } from "./validate-financement";

/**
 * Composition explicite F-011 (TRF-0016, TRF-0022, TRF-0023) — ADR-003.
 */
export type PretInput = {
  pretId: string;
  typePret: TypePret;
  capitalInitial: number;
  tauxNominal: number;
  dureeMois: number;
  datePremiereMensualite: string;
  /** Échéancier importé — prioritaire sur la génération. */
  echeances?: EcheanceMensuelle[];
  assuranceAnnuelle?: number;
  assuranceType?: "bancaire" | "externe";
  fraisDossier?: number;
  garantieDeductible?: number;
  iraDeductible?: number;
  /** Frais déductibles uniquement l'année de souscription. */
  anneeSouscription?: number;
};

export type ComputeFinancementExerciceInput = {
  exerciceFiscal: number;
  dateMiseEnService: string;
  prets: PretInput[];
  prixRevient?: number;
};

export type ComputeFinancementExerciceOutput = {
  charges: ChargesFinancementExercice;
  anomalies: Anomaly[];
};

function applyExternalInsurance(
  echeances: EcheanceMensuelle[],
  assuranceAnnuelle: number,
  exerciceFiscal: number,
): EcheanceMensuelle[] {
  if (!assuranceAnnuelle) return echeances;
  const monthly = round2(assuranceAnnuelle / 12);
  return echeances.map((row) => {
    if (new Date(row.date).getFullYear() !== exerciceFiscal) return row;
    return {
      ...row,
      assurance: row.assurance + monthly,
      mensualite: round2(row.mensualite + monthly),
    };
  });
}

function resolveEcheances(pret: PretInput, exerciceFiscal: number): EcheanceMensuelle[] {
  if (pret.echeances?.length) {
    return pret.echeances;
  }

  if (pret.typePret === "in_fine") {
    return computeInFineInterests({
      capitalInitial: pret.capitalInitial,
      tauxNominal: pret.tauxNominal,
      exerciceFiscal,
      datePremiereMensualite: pret.datePremiereMensualite,
      dureeMois: pret.dureeMois,
      assuranceAnnuelle: pret.assuranceType === "externe" ? pret.assuranceAnnuelle : 0,
    }).echeances;
  }

  const generated = generateLoanSchedule({
    capitalInitial: pret.capitalInitial,
    tauxNominal: pret.tauxNominal,
    dureeMois: pret.dureeMois,
    datePremiereMensualite: pret.datePremiereMensualite,
  }).echeances;

  if (pret.assuranceType === "externe" && pret.assuranceAnnuelle) {
    return applyExternalInsurance(generated, pret.assuranceAnnuelle, exerciceFiscal);
  }

  return generated;
}

function computePret(
  pret: PretInput,
  input: ComputeFinancementExerciceInput,
  anomalies: Anomaly[],
): PretFinancementExercice {
  const echeances = resolveEcheances(pret, input.exerciceFiscal);
  const extracted = extractInterestsExercice({
    echeances,
    exerciceFiscal: input.exerciceFiscal,
  });
  anomalies.push(...extracted.anomalies);

  const isolated = isolatePreExploitationInterests({
    echeances,
    exerciceFiscal: input.exerciceFiscal,
    dateMiseEnService: input.dateMiseEnService,
  });

  const validation = validateFinancement({
    capitalInitial: pret.capitalInitial,
    tauxNominal: pret.tauxNominal,
    interetsDeductibles: isolated.interetsDeductiblesExercice,
    prixRevient: input.prixRevient,
  });
  anomalies.push(...validation.anomalies);

  const souscriptionExercice =
    pret.anneeSouscription === undefined ||
    pret.anneeSouscription === input.exerciceFiscal;

  return {
    pretId: pret.pretId,
    typePret: pret.typePret,
    interetsEmpruntExercice: isolated.interetsDeductiblesExercice,
    interetsPreExploitation: isolated.interetsPreExploitation,
    assuranceEmpruntExercice: isolated.assuranceDeductibleExercice,
    capitalRembourseExercice: extracted.capitalRembourseExercice,
    capitalRestantDu31_12: extracted.capitalRestantDu31_12,
    fraisDossierDeductibles: souscriptionExercice ? round2(pret.fraisDossier ?? 0) : 0,
    garantieDeductible: souscriptionExercice ? round2(pret.garantieDeductible ?? 0) : 0,
    iraDeductible: round2(pret.iraDeductible ?? 0),
  };
}

export function computeFinancementExercice(
  input: ComputeFinancementExerciceInput,
): ComputeFinancementExerciceOutput {
  const anomalies: Anomaly[] = [];
  const prets = input.prets.map((pret) => computePret(pret, input, anomalies));

  const totalInteretsEmprunt = round2(
    prets.reduce((acc, p) => acc + p.interetsEmpruntExercice, 0),
  );
  const totalInteretsPreExploitation = round2(
    prets.reduce((acc, p) => acc + p.interetsPreExploitation, 0),
  );
  const totalAssurance = round2(prets.reduce((acc, p) => acc + p.assuranceEmpruntExercice, 0));
  const totalCapitalRembourse = round2(
    prets.reduce((acc, p) => acc + p.capitalRembourseExercice, 0),
  );

  const totalChargesFinancementExercice = round2(
    totalInteretsEmprunt +
      totalAssurance +
      prets.reduce((acc, p) => acc + p.fraisDossierDeductibles + p.garantieDeductible + p.iraDeductible, 0),
  );

  return {
    charges: {
      exerciceFiscal: input.exerciceFiscal,
      prets,
      totalInteretsEmprunt,
      totalInteretsPreExploitation,
      totalAssurance,
      totalCapitalRembourse,
      totalChargesFinancementExercice,
    },
    anomalies,
  };
}
