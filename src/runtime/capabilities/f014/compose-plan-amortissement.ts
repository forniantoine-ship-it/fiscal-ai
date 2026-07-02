import { assemblePlan } from "../f010/assemble-plan";
import { prorataPremiereAnnee } from "../f010/prorata-premiere-annee";
import type { AmortissementPlan, PlanLigne } from "../f010/types";
import { round2 } from "../f010/types";
import type { ComposantNouveau } from "../f012/types";
import type {
  ComposantAmortissement,
  LignePlan,
  PlanAmortissement,
} from "./types";
import { toNomCourant } from "./nom-courant";

/**
 * Composition explicite F-014 — consomme les sorties F-010 et F-012 sans recalculer le plan logement.
 * Le plan bâti/mobilier provient tel quel de F-010 ; seuls les travaux F-012 sont dotés ici.
 */
export type ComposePlanAmortissementInput = {
  exerciceFiscal: number;
  dateMiseEnService: string;
  /** Plan produit par F-010 (Calculation Engine). */
  planLogement: AmortissementPlan;
  prorataRatio: number;
  composantsNouveaux?: ComposantNouveau[];
  planValidePrecedemment?: boolean;
  anneeValidationInitiale?: number | null;
};

export type ComposePlanAmortissementOutput = {
  plan: PlanAmortissement;
};

function ksArtifactsForLabel(label: string): string[] {
  if (label === "Mobilier") return ["SAV-006", "TRF-0010"];
  return ["SAV-007", "JUG-004", "TRF-0009"];
}

function buildPluriannuelFromLigne(
  ligne: PlanLigne,
  premiereAnnee: number,
  dotationAnnuellePleine: number,
  prorataRatio: number,
): LignePlan[] {
  const rows: LignePlan[] = [];
  const n = ligne.dureeAnnees;
  const d1 = round2(dotationAnnuellePleine * prorataRatio);

  for (let offset = 0; offset < n; offset += 1) {
    const annee = premiereAnnee + offset;
    let dotation: number;
    if (offset === 0) {
      dotation = d1;
    } else if (offset === n - 1) {
      dotation = round2(ligne.montant - (d1 + dotationAnnuellePleine * (n - 2)));
    } else {
      dotation = dotationAnnuellePleine;
    }
    dotation = Math.max(0, round2(dotation));
    const cumul =
      offset === 0
        ? d1
        : offset >= n - 1
          ? ligne.montant
          : round2(d1 + dotationAnnuellePleine * offset);
    rows.push({
      annee,
      dotation,
      cumul_amortissements: Math.min(cumul, ligne.montant),
      valeur_nette_comptable: Math.max(0, round2(ligne.montant - cumul)),
    });
  }
  return rows;
}

function mapLigneToComposant(
  ligne: PlanLigne,
  index: number,
  premiereAnnee: number,
  prorataRatio: number,
  exerciceFiscal: number,
): ComposantAmortissement {
  const dotationAnnuellePleine = round2(ligne.montant / ligne.dureeAnnees);
  const estProratisee =
    exerciceFiscal === premiereAnnee && prorataRatio < 1 && ligne.dotationExercice < dotationAnnuellePleine;

  return {
    id: `f010-${index}`,
    nom_technique: ligne.label,
    nom_courant: toNomCourant(ligne.label),
    base_amortissable: ligne.montant,
    duree_ans: ligne.dureeAnnees,
    dotation_annuelle_pleine: dotationAnnuellePleine,
    dotation_exercice: ligne.dotationExercice,
    est_proratisee: estProratisee,
    ks_artifacts: ksArtifactsForLabel(ligne.label),
    plan_pluriannuel: buildPluriannuelFromLigne(ligne, premiereAnnee, dotationAnnuellePleine, prorataRatio),
  };
}

function mapComposantNouveau(
  composant: ComposantNouveau,
  index: number,
  exerciceFiscal: number,
): ComposantAmortissement {
  const composantAmorti = {
    label: composant.label,
    montant: composant.montant,
    dureeAnnees: composant.dureeAnnees,
    dotationAnnuelle: composant.dotationAnnuelle,
  };
  const premiereAnnee = new Date(composant.dateDebut).getFullYear();
  const prorata = prorataPremiereAnnee({
    composantsBati: [composantAmorti],
    composantsMobilier: [],
    dateDebutAmortissement: composant.dateDebut,
    methodeProrata: "mois",
    exerciceFiscal,
  });
  const dotationProratisee = prorata.dotationsAnnee1[0]?.dotationProratisee ?? composant.dotationAnnuelle;

  const assembled = assemblePlan({
    composantsBati: [composantAmorti],
    composantsMobilier: [],
    dotationsAnnee1: [{ label: composant.label, dotationProratisee }],
    premiereAnnee,
    exerciceFiscal,
  });

  const ligne = assembled.plan.lignes[0]!;
  const prorataRatio = composant.dotationAnnuelle > 0 ? prorata.ratio : 1;

  return {
    id: `f012-${index}`,
    nom_technique: composant.label,
    nom_courant: composant.label,
    base_amortissable: composant.montant,
    duree_ans: composant.dureeAnnees,
    dotation_annuelle_pleine: composant.dotationAnnuelle,
    dotation_exercice: ligne.dotationExercice,
    est_proratisee: premiereAnnee === exerciceFiscal && prorataRatio < 1,
    ks_artifacts: ["TRF-0028", "JUG-013", "SAV-024"],
    plan_pluriannuel: buildPluriannuelFromLigne(
      ligne,
      premiereAnnee,
      composant.dotationAnnuelle,
      Math.min(1, prorataRatio),
    ),
  };
}

export function composePlanAmortissement(
  input: ComposePlanAmortissementInput,
): ComposePlanAmortissementOutput {
  const premiereAnnee = new Date(input.dateMiseEnService).getFullYear();
  const premiereAnneeFlag = input.exerciceFiscal === premiereAnnee;
  const moisExploitation =
    premiereAnneeFlag && input.prorataRatio < 1
      ? Math.max(1, Math.round(input.prorataRatio * 12))
      : null;

  const composants = input.planLogement.lignes.map((ligne, index) =>
    mapLigneToComposant(ligne, index, premiereAnnee, input.prorataRatio, input.exerciceFiscal),
  );

  const nouveauxElements = (input.composantsNouveaux ?? []).map((c, index) =>
    mapComposantNouveau(c, index, input.exerciceFiscal),
  );

  const totalDotations = round2(
    composants.reduce((acc, c) => acc + c.dotation_exercice, 0) +
      nouveauxElements.reduce((acc, c) => acc + c.dotation_exercice, 0),
  );

  return {
    plan: {
      exercice: input.exerciceFiscal,
      premiere_annee: premiereAnneeFlag,
      mois_exploitation: moisExploitation,
      total_dotations_exercice: totalDotations,
      composants,
      nouveaux_elements: nouveauxElements,
      plan_valide_precedemment: input.planValidePrecedemment ?? false,
      annee_validation_initiale: input.anneeValidationInitiale ?? null,
    },
  };
}
