/**
 * R2C.3a — consolidation multi-bien des cases d'immobilisations (2033-C, 2033-A) : chaque bien est d'abord projeté par la
 * logique mono EXISTANTE (répartition fournie par l'appelant — `repartir2033CImmobilisations`,
 * `immobilisationsCorporelles2033A`), puis les cases sont sommées en centimes entiers. Aucune règle d'affectation de case
 * ici : uniquement la somme, la traçabilité par bien et le fail-closed.
 *
 * Fail-closed : une case n'est publiée que si CHAQUE bien la publie — un bien en échec n'est jamais compensé par un autre.
 * Les cases dépendant des dotations ne sont publiées que si Σ dotations par bien = amortissement global (au centime).
 *
 * Volontairement sans import de valeur depuis les mappers (types seulement) : pas de cycle mapper ↔ consolidation.
 */
import type { CerfaCase } from "../../f007/types";
import { sumEuros, toCents } from "../../f006/cents";

export type CategorieCaseNonAlimentee = "donnee_absente" | "incoherence_modele" | "hors_perimetre" | "non_applicable";

export type CaseNonAlimenteeBloc = { caseId: string; label: string; raison: string; categorie: CategorieCaseNonAlimentee };

/** Répartition d'UN bloc par la logique mono existante. */
export type RepartitionBloc = { cases: CerfaCase[]; casesNonAlimentees: CaseNonAlimenteeBloc[] };

export type BlocARepartir = { propertyId: string; dotationsExercice?: number; repartition?: RepartitionBloc };

export type CaseConsolidee = {
  readonly caseId: string;
  readonly label: string;
  readonly value: number;
  readonly contributions: ReadonlyArray<{ propertyId: string; value: number }>;
};

export type CaseNonAlimenteeConsolidee = {
  readonly caseId: string;
  readonly label: string;
  readonly categorie: CategorieCaseNonAlimentee;
  /** Raison de CHAQUE bien qui ne publie pas la case (ou raison globale, sans propertyId). */
  readonly raisons: ReadonlyArray<{ propertyId?: string; raison: string }>;
};

export type ConsolidationCases = {
  readonly cases: CaseConsolidee[];
  readonly casesNonAlimentees: CaseNonAlimenteeConsolidee[];
  readonly sommeDotations?: number;
  readonly dotationsCoherentes: boolean;
};

export const RAISON_DOTATIONS_GLOBALES =
  "Σ des dotations par bien ≠ amortissement global de l'exercice : les montants consolidés ne sont pas fiables (fail-closed).";
export const RAISON_DOTATION_ABSENTE = "Dotation de l'exercice du bien absente : répartition impossible pour ce bien.";
export const RAISON_DEUX_INVENTAIRES =
  "La RFS porte à la fois un inventaire unique et des inventaires par bien : source ambiguë, aucune case d'immobilisation publiée.";
export const RAISON_AUCUN_BIEN = "Aucun inventaire de bien transmis (immobilisationsParBien vide).";
export const RAISON_BIEN_DUPLIQUE = "Un même bien porte plusieurs inventaires : source ambiguë, aucune case d'immobilisation publiée.";

/** Blocage structurel des blocs par bien (ambiguïté de source) — `undefined` si les blocs sont exploitables. */
export function blocageBlocsParBien(input: { propertyIds: readonly string[]; blocUniquePresent: boolean }): string | undefined {
  if (input.blocUniquePresent) return RAISON_DEUX_INVENTAIRES;
  if (input.propertyIds.length === 0) return RAISON_AUCUN_BIEN;
  if (new Set(input.propertyIds).size !== input.propertyIds.length) return RAISON_BIEN_DUPLIQUE;
  return undefined;
}

export function consoliderCasesParBien(input: {
  blocs: readonly BlocARepartir[];
  caseIds: readonly string[];
  /** Cases publiées seulement si Σ dotations par bien = amortissement global. */
  casesSoumisesAuxDotations: ReadonlySet<string>;
  /** Amortissement global de l'exercice (F-006) ; à défaut, Σ des dotations par bien. */
  amortCalculeGlobal?: number;
  /** Libellés de repli (répartition mono « sans immobilisations »). */
  labels?: Readonly<Record<string, string>>;
  /** Raison globale bloquant TOUTES les cases (ambiguïté de source). */
  blocage?: string;
}): ConsolidationCases {
  const dotations = input.blocs.map((bloc) => bloc.dotationsExercice);
  const sommeDotations = input.blocs.length > 0 && dotations.every((value) => value !== undefined) ? sumEuros(dotations as number[]) : undefined;
  const amortGlobal = input.amortCalculeGlobal ?? sommeDotations;
  const dotationsCoherentes = sommeDotations !== undefined && amortGlobal !== undefined && toCents(sommeDotations) === toCents(amortGlobal);

  const cases: CaseConsolidee[] = [];
  const casesNonAlimentees: CaseNonAlimenteeConsolidee[] = [];
  for (const caseId of input.caseIds) {
    const parBien = input.blocs.map((bloc) => ({
      propertyId: bloc.propertyId,
      publiee: bloc.repartition?.cases.find((item) => item.caseId === caseId),
      manquante: bloc.repartition?.casesNonAlimentees.find((item) => item.caseId === caseId),
      sansRepartition: bloc.repartition === undefined,
    }));
    const label =
      parBien.map((item) => item.publiee?.label ?? item.manquante?.label).find((value) => value !== undefined) ?? input.labels?.[caseId] ?? caseId;
    const raisons: Array<{ propertyId?: string; raison: string }> = [];
    let incoherence = false;
    let categorieBien: CategorieCaseNonAlimentee | undefined;
    if (input.blocage !== undefined) {
      raisons.push({ raison: input.blocage });
      incoherence = true;
    } else {
      for (const item of parBien) {
        if (item.publiee !== undefined) continue;
        if (item.sansRepartition) {
          raisons.push({ propertyId: item.propertyId, raison: RAISON_DOTATION_ABSENTE });
          categorieBien ??= "donnee_absente";
          continue;
        }
        raisons.push({ propertyId: item.propertyId, raison: item.manquante?.raison ?? caseId });
        if (item.manquante?.categorie === "incoherence_modele") incoherence = true;
        categorieBien ??= item.manquante?.categorie;
      }
      if (input.casesSoumisesAuxDotations.has(caseId) && !dotationsCoherentes) {
        raisons.push({ raison: RAISON_DOTATIONS_GLOBALES });
        incoherence = true;
      }
      if (input.blocs.length === 0) raisons.push({ raison: RAISON_AUCUN_BIEN });
    }
    if (raisons.length > 0) {
      casesNonAlimentees.push({ caseId, label, categorie: incoherence ? "incoherence_modele" : categorieBien ?? "donnee_absente", raisons });
      continue;
    }
    const contributions = parBien.map((item) => ({ propertyId: item.propertyId, value: item.publiee!.value as number }));
    cases.push({ caseId, label, value: sumEuros(contributions.map((item) => item.value)), contributions });
  }
  return { cases, casesNonAlimentees, ...(sommeDotations !== undefined ? { sommeDotations } : {}), dotationsCoherentes };
}

/** Raison lisible d'une case non publiée : chaque raison préfixée de son bien. */
export function raisonConsolidee(raisons: CaseNonAlimenteeConsolidee["raisons"]): string {
  return raisons.map((item) => (item.propertyId !== undefined ? `[${item.propertyId}] ${item.raison}` : item.raison)).join(" ");
}

/** Projection au format des mappers : une `CerfaCase` par case consolidée (trace par bien), une non-alimentée lisible. */
export function versCasesCerfa(consolidation: ConsolidationCases, path: string): RepartitionBloc {
  return {
    cases: consolidation.cases.map((item) => ({
      caseId: item.caseId,
      label: item.label,
      value: item.value,
      trace: {
        source: "FiscalResult",
        path: `${path} — ${item.contributions.map((contribution) => `${contribution.propertyId}=${contribution.value}`).join(" + ")}`,
        ksArtifacts: ["TRF-0032"],
      },
    })),
    casesNonAlimentees: consolidation.casesNonAlimentees.map((item) => ({
      caseId: item.caseId,
      label: item.label,
      raison: raisonConsolidee(item.raisons),
      categorie: item.categorie,
    })),
  };
}

/** Libellés d'une répartition (cases publiées ou non) — repli quand aucun bien ne fournit la case. */
export function libellesDe(repartition: RepartitionBloc): Record<string, string> {
  return Object.fromEntries([...repartition.cases, ...repartition.casesNonAlimentees].map((item) => [item.caseId, item.label]));
}
