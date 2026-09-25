import type { EcheanceMensuelle } from "./types";
import { round2 } from "./types";

/**
 * R1 — échéancier documentaire (tableau d'amortissement importé) → `PretInput.echeances`.
 *
 * KS F-011 « Niveau 2 — Disponibilité du tableau d'amortissement (par prêt) » : tableau complet →
 * import → extraction ligne par ligne → identification de la plage couvrant l'exercice ; tableau
 * perdu → reconstruction depuis 4 inputs. Le tableau, quand il est exploitable, est donc la source
 * prioritaire ; la reconstruction ne vaut que s'il est ABSENT. Un tableau présent mais qui ne permet
 * pas d'établir l'exercice (partiel, lacunaire, CRD non lu…) n'est jamais remplacé silencieusement
 * par la reconstruction : `non_exploitable`, à l'appelant de bloquer (le raccordement « import
 * partiel + reconstruction des segments manquants » du KS n'est pas implémenté).
 *
 * Contrôles purement structurels, sans aucune tolérance chiffrée :
 * - chaque ligne est datée (AAAA-MM-JJ) et porte des montants finis et positifs ;
 * - une échéance par mois, sans trou ni doublon (le moteur de reconstruction est lui aussi mensuel) ;
 * - l'exercice est couvert : le tableau ne commence en cours d'exercice que si (R1.x, VER option 2) sa
 *   première ligne est IMPRIMÉE comme échéance n° 1 ET que le capital d'origine qu'elle implique (CRD
 *   imprimé + capital remboursé) égale le capital lu sur un document DISTINCT (offre / contrat de prêt) —
 *   la date de 1re échéance et le capital préremplis depuis le tableau ne prouvent rien ; il ne s'arrête
 *   en cours d'exercice que si le CRD imprimé y est nul ;
 * - le CRD imprimé sur la dernière échéance ≤ 31/12 est lu (case 156) — jamais recalculé.
 */
export type DocumentaryInstallment = {
  date: string;
  principal: number;
  interest: number;
  insurance: number;
  /** CRD imprimé sur la ligne du tableau — absent si la colonne n'a pas été lue. */
  remainingCapital?: number;
  /** Numéro d'échéance imprimé — absent si la colonne n'a pas été lue. */
  rank?: number;
};

export type DocumentaryEcheancesResolution =
  | { status: "absent" }
  | { status: "exploitable"; echeances: EcheanceMensuelle[] }
  | { status: "non_exploitable"; reason: string };

export type ResolveDocumentaryEcheancesInput = {
  rows: readonly DocumentaryInstallment[] | undefined;
  exerciceFiscal: number;
  /**
   * R1.x (VER option 2) — capital d'origine lu sur un document distinct du tableau (offre / contrat de prêt).
   * Jamais une valeur préremplie ou dérivée du tableau lui-même.
   */
  capitalInitialIndependant?: number;
  /** Assurance déclarée externe (délégation) : le tableau bancaire ne doit alors porter aucune assurance. */
  assuranceExterneDeclaree?: boolean;
};

function monthIndex(dateIso: string): number | null {
  const match = dateIso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return Number(match[1]) * 12 + (month - 1);
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonExploitable(reason: string): DocumentaryEcheancesResolution {
  return { status: "non_exploitable", reason };
}

export function resolveDocumentaryEcheances(input: ResolveDocumentaryEcheancesInput): DocumentaryEcheancesResolution {
  if (!input.rows?.length) return { status: "absent" };

  const parsed: { row: DocumentaryInstallment; month: number }[] = [];
  for (const row of input.rows) {
    const month = monthIndex(row.date);
    const crdOk = row.remainingCapital === undefined || isAmount(row.remainingCapital);
    if (month === null || !isAmount(row.principal) || !isAmount(row.interest) || !isAmount(row.insurance) || !crdOk) {
      return nonExploitable("ligne d'échéance illisible (date ou montant)");
    }
    parsed.push({ row, month });
  }
  parsed.sort((a, b) => a.month - b.month);

  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i]!.month - parsed[i - 1]!.month !== 1) {
      return nonExploitable("échéancier non mensuel, lacunaire ou comportant des doublons");
    }
  }

  const janN = input.exerciceFiscal * 12;
  const decN = janN + 11;
  const first = parsed[0]!;
  const last = parsed[parsed.length - 1]!;
  const upToYearEnd = parsed.filter((p) => p.month <= decN);
  const anchor = upToYearEnd.at(-1);

  if (!anchor) return nonExploitable("le tableau ne couvre pas l'exercice");
  if (anchor.row.remainingCapital === undefined) {
    return nonExploitable("capital restant dû au 31/12 non lu sur le tableau");
  }
  if (anchor.month < janN && anchor.row.remainingCapital !== 0) {
    return nonExploitable("le tableau ne couvre pas l'exercice");
  }
  // R1.x (P0-A, VER option 2) — « prêt démarrant en N » vs « tableau tronqué / renuméroté après
  // renégociation » : le n° 1 imprimé est nécessaire mais pas suffisant ; le capital d'origine doit être
  // confirmé par un document distinct. Égalité au centime (montants en euros-centimes), aucune tolérance.
  if (first.month > janN && first.month <= decN) {
    if (first.row.rank !== 1) {
      return nonExploitable("début du tableau non démontré : la première ligne n'est pas l'échéance n° 1");
    }
    const capital = input.capitalInitialIndependant;
    if (capital === undefined || !isAmount(capital) || capital === 0 || first.row.remainingCapital === undefined) {
      return nonExploitable("capital d'origine non prouvé par un document distinct du tableau (offre ou contrat de prêt)");
    }
    if (round2(first.row.remainingCapital + first.row.principal) !== round2(capital)) {
      return nonExploitable("capital d'origine du tableau contredit par l'offre ou le contrat de prêt");
    }
  }
  if (last.month >= janN && last.month < decN && last.row.remainingCapital !== 0) {
    return nonExploitable("tableau interrompu en cours d'exercice");
  }

  const inYear = upToYearEnd.filter((p) => p.month >= janN);
  if (input.assuranceExterneDeclaree && inYear.some((p) => p.row.insurance > 0)) {
    return nonExploitable("assurance déclarée externe alors que le tableau porte une assurance bancaire");
  }

  // Seul le CRD de l'ancre (dernière échéance ≤ 31/12) est lu par le moteur (`extractInterestsExercice`) ;
  // une ligne antérieure sans CRD imprimé reçoit la valeur exacte remontée depuis l'ancre, jamais une estimation.
  const echeances: EcheanceMensuelle[] = new Array(upToYearEnd.length);
  let crd = anchor.row.remainingCapital;
  for (let i = upToYearEnd.length - 1; i >= 0; i -= 1) {
    const { row } = upToYearEnd[i]!;
    const capitalRestantDu = row.remainingCapital ?? crd;
    echeances[i] = {
      date: row.date,
      mensualite: round2(row.principal + row.interest + row.insurance),
      interets: row.interest,
      capital: row.principal,
      assurance: row.insurance,
      capitalRestantDu,
    };
    crd = round2(capitalRestantDu + row.principal);
  }

  return { status: "exploitable", echeances };
}
