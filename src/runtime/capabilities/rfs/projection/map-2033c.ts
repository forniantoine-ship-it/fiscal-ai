import type { FiscalRepresentation } from "../types";
import type { CaseTrace, CerfaCase } from "../../f007/types";
import { round2 } from "../../f007/types";

/**
 * Projection Cerfa 2033-C-SD (Immobilisations — Amortissements — Plus-values
 * — Moins-values) — consomme UNIQUEMENT la RFS (`rfs.fiscalResult`,
 * `rfs.immobilisations`). Aucun appel à produceFiscalResult()/
 * applyAmortissementStocks(), aucune lecture directe d'assistant
 * F-010/F-011/F-012/F-013/F-014, aucun accès FEC, aucune reconstruction
 * comptable.
 *
 * Cycle 54 — audit exploratoire : sur l'ensemble du formulaire, seules 3
 * cases satisfont les 7 conditions de la règle de décision (donnée
 * disponible, correspondance Cerfa positionnellement démontrée sur le
 * dossier de référence, transformation identité, aucun calcul fiscal
 * nouveau) : 572 (Cadre II, dotations de l'exercice), 496 (Cadre I, valeur
 * brute fin d'exercice), 576 (Cadre II, amortissements cumulés fin
 * d'exercice). Tout le reste du formulaire reste hors périmètre de ce
 * mapper : la ventilation par catégorie (400-486, 500-566) exigerait de
 * faire correspondre les libellés libres de `PlanLigne`/SAV-007 à des
 * catégories PCG/Cerfa — une heuristique interdite, confirmée fragile même
 * sur le dossier réel (Cycle 46). Les colonnes de mouvement (490/492/494,
 * 570/574) exigeraient de savoir si l'exercice courant est l'année de mise
 * en service, donnée jamais exposée à la RFS (Cycle 38, toujours vrai).
 * Le Cadre III (plus-values/moins-values, cessions) est hors périmètre :
 * aucune notion de cession n'existe nulle part dans F-006/F-010/F-012/F-014.
 *
 * Cycle 55 — implémentation. 572 est un pass-through pur de
 * `fiscalResult.amortCalcule`, indépendant de `rfs.immobilisations` — même
 * source que la case 254 du 2033-B, déjà livrée. 496/576 réutilisent
 * exactement la même valeur/formule que les cases 028/030 du 2033-A, sous la
 * MÊME garde d'invariant F-010/F-014 introduite au Cycle 37 (comparaison
 * `fiscalResult.amortCalcule` vs `rfs.immobilisations.totalAnnuelExercice` —
 * si elles divergent, un `composantNouveau` F-012 existe sans que son brut
 * ne soit reflété dans `totalBrut`, et 496/576 resteraient silencieusement
 * sous-évaluées si alimentées quand même).
 *
 * La garde est DUPLIQUÉE à l'identique depuis `map-2033a.ts` plutôt
 * qu'extraite en utilitaire partagé : le périmètre gelé au Cycle 53 interdit
 * de toucher au mapper 2033-A sans nouveau besoin produit, y compris pour un
 * refactor sans changement de comportement. Dette technique reconnue — à
 * consolider si les deux mappers sont un jour retouchés ensemble.
 *
 * Cycle 56-57 — case 426 (Cadre I, ligne "Terrains", colonne "fin
 * d'exercice") : pass-through pur de `rfs.immobilisations.valeurTerrain`,
 * SANS la garde F-010/F-014. Preuve par lecture de code (Cycle 56) :
 * `composePlanAmortissement()` (F-014, `compose-plan-amortissement.ts`) ne
 * prend `valeurTerrain` en paramètre nulle part — le terrain n'entre jamais
 * dans le plan d'amortissement ni dans `composantsNouveaux` (qui ne
 * représentent que des travaux amortissables). Il ne peut donc structurellement
 * jamais diverger entre F-010 et F-014, contrairement à `totalBrut`/
 * `totalAnnuelExercice` (496/572/576). Correspondance Cerfa non heuristique :
 * "terrain" est un champ F-010 explicitement nommé, pas un libellé libre
 * `PlanLigne.label` à catégoriser.
 *
 * Cycle 58 — case 476 (Cadre I, ligne "Autres immobilisations corporelles"
 * = Mobilier, colonne "fin d'exercice") : même pattern que 426.
 * `rfs.immobilisations.montantMobilier` propagé depuis
 * `draft.logementAmortissement.montantMobilier` (F-010,
 * `computePrixRevient().montantMobilierIsole`, valeur explicitement isolée,
 * jamais déduite d'un libellé de `PlanLigne`) — extension additive de
 * `ImmobilisationsRfs` (`rfs/types.ts`) et de la fusion dans
 * `run-declaration-generation.ts`, sur le modèle exact de `valeurTerrain`
 * (Cycle 35). Sans garde F-010/F-014 : `compose-plan-amortissement.ts` ne
 * reçoit `montantMobilier` en paramètre nulle part — même preuve que 426.
 */

export type CerfaCaseNonAlimenteeCategorie =
  | "donnee_absente"
  | "incoherence_modele"
  | "hors_perimetre"
  | "non_applicable";

export type CerfaCaseNonAlimentee = {
  caseId: string;
  label: string;
  raison: string;
  categorie: CerfaCaseNonAlimenteeCategorie;
};

export type Form2033C = {
  formId: "2033-C-SD";
  millésime: number;
  cases: CerfaCase[];
  /** Jamais une valeur inventée : chaque case listée ici reste explicitement sans valeur, avec sa raison tracée. */
  casesNonAlimentees: CerfaCaseNonAlimentee[];
};

const RAISON_DIVERGENCE_F010_F014 =
  "fiscalResult.amortCalcule (F-014, source fiscale autoritaire, inclut d'éventuels composantsNouveaux issus de F-012) diverge de rfs.immobilisations.totalAnnuelExercice (F-010 seul, qui ne reçoit jamais ces composants nouveaux). Cette divergence prouve que rfs.immobilisations est incomplet pour ce dossier — au moins un élément amortissable existe sans que son coût brut ne soit reflété dans totalBrut. Produire cette case depuis F-010 seul sous-évaluerait silencieusement le formulaire ; aucune reconstruction de la part manquante n'est tentée ici (même garde que les cases 028/030 du 2033-A, Cycle 37).";

const RAISON_TERRAIN_ABSENT =
  "rfs.immobilisations est présent mais sans valeurTerrain (dossier ou fixture antérieur à l'exposition de cette donnée, Cycle 35) — produire une valeur brute sans le terrain sous-évaluerait silencieusement la valeur réelle plutôt que de signaler l'absence.";

const RAISON_IMMO_ABSENT =
  "rfs.immobilisations est absent — aucun plan d'amortissement disponible pour ce dossier (F-010 non encore exécuté ou non persisté).";

const RAISON_MOUVEMENT =
  "Cette colonne exige de savoir si l'exercice courant est l'année de mise en service (début=0, augmentations=brut) ou un exercice ultérieur (début=brut, augmentations=0) — `dateMiseEnService`/`premiereAnnee` ne sont jamais exposés à la RFS aujourd'hui (audit Cycle 38, confirmé toujours vrai). Seule la colonne « fin d'exercice », indépendante de cette ambiguïté, est alimentée.";

const RAISON_426_IMMO_ABSENT =
  "rfs.immobilisations est absent — aucun plan d'amortissement disponible pour ce dossier (F-010 non encore exécuté ou non persisté), donc aucune valeur de terrain à projeter.";

const RAISON_426_TERRAIN_ABSENT =
  "rfs.immobilisations est présent mais sans valeurTerrain (dossier ou fixture antérieur à l'exposition de cette donnée, Cycle 35) — jamais transformé en 0 par défaut : une valeur de 0 signifierait à tort « terrain nul » plutôt que « donnée non transmise ».";

const RAISON_476_IMMO_ABSENT =
  "rfs.immobilisations est absent — aucun plan d'amortissement disponible pour ce dossier (F-010 non encore exécuté ou non persisté), donc aucune valeur de mobilier à projeter.";

const RAISON_476_MOBILIER_ABSENT =
  "rfs.immobilisations est présent mais sans montantMobilier (dossier ou fixture antérieur à l'exposition de cette donnée, Cycle 58) — jamais transformé en 0 par défaut : une valeur de 0 signifierait à tort « aucun mobilier » plutôt que « donnée non transmise ».";

export function map2033CFromRfs(rfs: FiscalRepresentation): Form2033C {
  const fr = rfs.fiscalResult;
  const immo = rfs.immobilisations;
  const baseTrace: Omit<CaseTrace, "path"> = { source: "FiscalResult", ksArtifacts: ["TRF-0032"] };

  const cases: CerfaCase[] = [];
  const casesNonAlimentees: CerfaCaseNonAlimentee[] = [];

  // Case 572 — Cadre II, TOTAL, colonne "Augmentations : dotations de
  // l'exercice". Pass-through pur de fiscalResult.amortCalcule, AUCUNE
  // dépendance à rfs.immobilisations — même source que la case 254 du
  // 2033-B déjà livrée (Cycle 47). Toujours alimentée, y compris à 0 :
  // même convention que 254/318/360 (aucun seuil, aucune condition).
  cases.push({
    caseId: "572",
    label: "Dotations de l'exercice (amortissements)",
    value: round2(fr.amortCalcule),
    trace: { ...baseTrace, path: "fiscalResult.amortCalcule", ksArtifacts: ["TRF-0012", "TRF-0032"] },
  });

  // Case 426 — Cadre I, ligne "Terrains", colonne "Valeur brute des
  // immobilisations à la fin de l'exercice". Pass-through pur de
  // rfs.immobilisations.valeurTerrain — AUCUNE garde F-010/F-014 : voir doc
  // de fichier ci-dessus (Cycle 56) pour la preuve que le terrain n'entre
  // jamais dans composePlanAmortissement() et ne peut donc jamais diverger.
  // Indépendante de 496/576 : sa disponibilité ne dépend que de
  // typeof valeurTerrain === "number", jamais de amortissementDivergent.
  if (immo !== undefined && typeof immo.valeurTerrain === "number") {
    cases.push({
      caseId: "426",
      label: "Terrains — Valeur brute des immobilisations à la fin de l'exercice",
      value: round2(immo.valeurTerrain),
      trace: {
        source: "FiscalResult",
        path: "rfs.immobilisations.valeurTerrain",
        ksArtifacts: ["TRF-0032"],
      },
    });
  } else {
    casesNonAlimentees.push({
      caseId: "426",
      label: "Terrains — Valeur brute des immobilisations à la fin de l'exercice",
      raison: immo === undefined ? RAISON_426_IMMO_ABSENT : RAISON_426_TERRAIN_ABSENT,
      categorie: "donnee_absente",
    });
  }

  // Case 476 — Cadre I, ligne "Autres immobilisations corporelles"
  // (Mobilier), colonne "Valeur brute des immobilisations à la fin de
  // l'exercice". Pass-through pur de rfs.immobilisations.montantMobilier —
  // AUCUNE garde F-010/F-014 : même preuve que pour 426 (Cycle 56/58) —
  // `composePlanAmortissement()` (F-014) ne reçoit jamais montantMobilier en
  // paramètre, cette valeur ne peut donc jamais diverger entre F-010 et
  // F-014. Correspondance Cerfa non heuristique : `montantMobilier` est une
  // valeur F-010 explicitement isolée (computePrixRevient().montantMobilierIsole),
  // jamais déduite d'un libellé de PlanLigne.
  if (immo !== undefined && typeof immo.montantMobilier === "number") {
    cases.push({
      caseId: "476",
      label: "Autres immobilisations corporelles (Mobilier) — Valeur brute des immobilisations à la fin de l'exercice",
      value: round2(immo.montantMobilier),
      trace: {
        source: "FiscalResult",
        path: "rfs.immobilisations.montantMobilier",
        ksArtifacts: ["TRF-0032"],
      },
    });
  } else {
    casesNonAlimentees.push({
      caseId: "476",
      label: "Autres immobilisations corporelles (Mobilier) — Valeur brute des immobilisations à la fin de l'exercice",
      raison: immo === undefined ? RAISON_476_IMMO_ABSENT : RAISON_476_MOBILIER_ABSENT,
      categorie: "donnee_absente",
    });
  }

  // Garde F-010/F-014 — dupliquée à l'identique depuis map-2033a.ts (Cycle 37),
  // voir doc de fichier ci-dessus pour la justification de la duplication.
  const amortissementDivergent =
    immo !== undefined && Math.abs(round2(fr.amortCalcule - immo.totalAnnuelExercice)) > 0.01;

  if (immo !== undefined && typeof immo.valeurTerrain === "number" && !amortissementDivergent) {
    const brut = round2(immo.totalBrut + immo.valeurTerrain);
    const amortissementsCumules = round2(immo.lignes.reduce((acc, l) => acc + l.amortissementsCumules, 0));

    // Case 496 — Cadre I, TOTAL, colonne "Valeur brute des immobilisations à
    // la fin de l'exercice". Même valeur/formule que la case 028 du 2033-A.
    cases.push({
      caseId: "496",
      label: "Valeur brute des immobilisations à la fin de l'exercice",
      value: brut,
      trace: {
        source: "FiscalResult",
        path: "rfs.immobilisations.totalBrut + rfs.immobilisations.valeurTerrain (= case 028 du 2033-A-SD)",
        ksArtifacts: ["TRF-0032"],
      },
    });
    // Case 576 — Cadre II, TOTAL, colonne "Montant des amortissements à la
    // fin de l'exercice". Même valeur/formule que la composante amortissement
    // de la case 030 du 2033-A.
    cases.push({
      caseId: "576",
      label: "Montant des amortissements à la fin de l'exercice",
      value: amortissementsCumules,
      trace: {
        source: "FiscalResult",
        path: "Σ rfs.immobilisations.lignes[].amortissementsCumules (= composante amortissement de la case 030 du 2033-A-SD)",
        ksArtifacts: ["TRF-0032"],
      },
    });
  } else if (immo !== undefined && typeof immo.valeurTerrain === "number" && amortissementDivergent) {
    for (const [caseId, label] of [
      ["496", "Valeur brute des immobilisations à la fin de l'exercice"],
      ["576", "Montant des amortissements à la fin de l'exercice"],
    ] as const) {
      casesNonAlimentees.push({ caseId, label, raison: RAISON_DIVERGENCE_F010_F014, categorie: "incoherence_modele" });
    }
  } else if (immo !== undefined) {
    for (const [caseId, label] of [
      ["496", "Valeur brute des immobilisations à la fin de l'exercice"],
      ["576", "Montant des amortissements à la fin de l'exercice"],
    ] as const) {
      casesNonAlimentees.push({ caseId, label, raison: RAISON_TERRAIN_ABSENT, categorie: "donnee_absente" });
    }
  } else {
    for (const [caseId, label] of [
      ["496", "Valeur brute des immobilisations à la fin de l'exercice"],
      ["576", "Montant des amortissements à la fin de l'exercice"],
    ] as const) {
      casesNonAlimentees.push({ caseId, label, raison: RAISON_IMMO_ABSENT, categorie: "donnee_absente" });
    }
  }

  // Colonnes de mouvement (Cadre I et Cadre II, TOTAL) — jamais alimentées,
  // périmètre strictement limité à 572/496/576 ce cycle (Cycle 55).
  casesNonAlimentees.push(
    { caseId: "490", label: "Valeur brute des immobilisations au début de l'exercice", raison: RAISON_MOUVEMENT, categorie: "donnee_absente" },
    { caseId: "492", label: "Augmentations (immobilisations)", raison: RAISON_MOUVEMENT, categorie: "donnee_absente" },
    { caseId: "494", label: "Diminutions (immobilisations)", raison: RAISON_MOUVEMENT, categorie: "donnee_absente" },
    { caseId: "570", label: "Montant des amortissements au début de l'exercice", raison: RAISON_MOUVEMENT, categorie: "donnee_absente" },
    { caseId: "574", label: "Diminutions : amortissements afférents aux éléments sortis de l'actif et reprises", raison: RAISON_MOUVEMENT, categorie: "donnee_absente" },
  );

  return {
    formId: "2033-C-SD",
    millésime: rfs.exercice,
    cases,
    casesNonAlimentees,
  };
}
