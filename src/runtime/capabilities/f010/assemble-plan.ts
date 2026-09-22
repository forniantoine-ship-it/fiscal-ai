import type { Anomaly } from "../../contracts/Anomaly";
import { computePlanDotationForYear } from "./compute-plan-dotation-for-year";
import { continuePlanLine } from "./continue-plan-line";
import type {
  AmortissementPlan,
  ComposantAmorti,
  DepreciationOpeningAnchor,
  PlanLigne,
} from "./types";
import { round2 } from "./types";

/**
 * TRF-0012 — Assemblage du plan d'amortissement.
 * Fonde AX-004 (linéaire). Assemble toutes les lignes en un plan unique et
 * calcule le total pour l'exercice demandé. Ne vérifie pas la cohérence (TRF-0014).
 *
 * Lot 2A : branche optionnelle `openingAnchors` — cumul attesté d'ouverture,
 * sans reconstruction des exercices passés. Sans ancre : comportement historique
 * STRICTEMENT inchangé.
 */
export type AssemblePlanOpeningAnchor = DepreciationOpeningAnchor & {
  /** Label du composant ancré (doit correspondre à un composant). */
  label: string;
  /** Identité explicite — jamais `f010-${index}` comme preuve d'ancre. */
  id: string;
  propertyId?: string;
};

export type AssemblePlanInput = {
  composantsBati: ComposantAmorti[];
  composantsMobilier: ComposantAmorti[];
  dotationsAnnee1: { label: string; dotationProratisee: number }[];
  /** Année de la mise en service (première année amortie). */
  premiereAnnee: number;
  /** Exercice pour lequel on veut la dotation. */
  exerciceFiscal: number;
  /**
   * Ancres d'ouverture comptable par label (Lot 2A).
   * Absentes → chemin historique inchangé.
   */
  openingAnchors?: AssemblePlanOpeningAnchor[];
};

export type AssemblePlanOutput = {
  plan: AmortissementPlan;
  anomalies: Anomaly[];
};

function assembleLineHistorical(params: {
  composant: ComposantAmorti;
  d1: number;
  yearsElapsed: number;
  premiereAnnee: number;
  exerciceFiscal: number;
}): PlanLigne {
  const { composant: c, d1, yearsElapsed } = params;
  const da = c.dotationAnnuelle;
  const n = c.dureeAnnees;

  const dotationExercice = computePlanDotationForYear({
    montant: c.montant,
    dureeAnnees: n,
    dotationAnnuelle: da,
    dotationAnnee1: d1,
    premiereAnnee: params.premiereAnnee,
    exerciceFiscal: params.exerciceFiscal,
  });

  // Cumul depuis la première année jusqu'à l'exercice demandé (chemin historique).
  let cumule: number;
  if (yearsElapsed < 0) {
    cumule = 0;
  } else if (yearsElapsed === 0) {
    cumule = d1;
  } else {
    cumule = round2(d1 + da * Math.min(yearsElapsed, n - 1));
    if (yearsElapsed >= n) {
      cumule = c.montant;
    }
  }
  cumule = Math.min(round2(cumule), c.montant);
  const vnc = Math.max(0, round2(c.montant - cumule));

  return {
    label: c.label,
    montant: c.montant,
    dureeAnnees: c.dureeAnnees,
    dotationExercice,
    amortissementsCumules: cumule,
    vnc,
  };
}

export function assemblePlan(input: AssemblePlanInput): AssemblePlanOutput {
  const anomalies: Anomaly[] = [];
  const prorataByLabel = new Map(
    input.dotationsAnnee1.map((d) => [d.label, d.dotationProratisee]),
  );
  const anchorsByLabel = new Map(
    (input.openingAnchors ?? []).map((a) => [a.label, a] as const),
  );

  const composants = [...input.composantsBati, ...input.composantsMobilier];
  const yearsElapsed = input.exerciceFiscal - input.premiereAnnee;

  const lignes: PlanLigne[] = [];

  for (const c of composants) {
    const d1 = prorataByLabel.get(c.label) ?? 0;
    const anchor = anchorsByLabel.get(c.label);

    if (anchor === undefined) {
      // Chemin historique STRICTEMENT inchangé (sans ancre).
      lignes.push(
        assembleLineHistorical({
          composant: c,
          d1,
          yearsElapsed,
          premiereAnnee: input.premiereAnnee,
          exerciceFiscal: input.exerciceFiscal,
        }),
      );
      continue;
    }

    // Branche ancrée : cumul attesté, pas de reconstruction du passé.
    const normalDotation = computePlanDotationForYear({
      montant: c.montant,
      dureeAnnees: c.dureeAnnees,
      dotationAnnuelle: c.dotationAnnuelle,
      dotationAnnee1: d1,
      premiereAnnee: input.premiereAnnee,
      exerciceFiscal: input.exerciceFiscal,
    });

    const continued = continuePlanLine({
      label: c.label,
      baseAmortissable: c.montant,
      dureeAnnees: c.dureeAnnees,
      normalDotation,
      openingAnchor: {
        exerciceFiscal: anchor.exerciceFiscal,
        cumulComptableOuverture: anchor.cumulComptableOuverture,
      },
      exerciceFiscal: input.exerciceFiscal,
      id: anchor.id,
      propertyId: anchor.propertyId,
    });

    if (!continued.ok) {
      anomalies.push(...continued.anomalies);
      continue;
    }
    lignes.push(continued.ligne);
  }

  const totalAnnuelExercice = round2(lignes.reduce((acc, l) => acc + l.dotationExercice, 0));
  const totalBrut = round2(lignes.reduce((acc, l) => acc + l.montant, 0));

  return {
    plan: { lignes, totalAnnuelExercice, totalBrut },
    anomalies,
  };
}
