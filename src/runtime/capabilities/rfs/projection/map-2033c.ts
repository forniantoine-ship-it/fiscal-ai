import type { FiscalRepresentation } from "../types";
import type { CaseTrace, CerfaCase } from "../../f007/types";
import { round2 } from "../../f007/types";
import {
  computeClosingImmobilisationsTotals,
  reconcileImmobilisationsContinuity,
} from "@/lib/lmnp/services/dossier/immobilisations-comptables";

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
 * sur le dossier réel (Cycle 46). Le Cadre III (plus-values/moins-values,
 * cessions) est hors périmètre : aucune notion de cession n'existe nulle
 * part dans F-006/F-010/F-012/F-014.
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
 *
 * GO-2 — cases 490/492/570 (Cadre I/II, TOTAL, colonnes "début d'exercice"
 * et "augmentations"), UNIQUEMENT pour le premier exercice de mise en
 * service. `rfs.immobilisations.dateMiseEnService` est exposée depuis
 * P3-LIASSE-1B.2 (`rfs/types.ts`) et propagée en production depuis
 * `draft.dateMiseEnService` (`run-declaration-generation.ts`) — l'ancienne
 * affirmation de ce fichier ("jamais exposée à la RFS") ne tenait plus dès
 * ce jalon. Cette donnée ne résout qu'UNE ambiguïté précise : si l'exercice
 * courant EST l'année de mise en service, alors par définition comptable
 * "début d'exercice" = 0 et "augmentations" = la valeur brute déjà connue en
 * fin d'exercice (490=0, 570=0, 492=496) — aucun calcul nouveau, aucune
 * lecture de `composantsNouveaux`. Pour un exercice ULTÉRIEUR, reconstruire
 * ces colonnes exigerait de connaître le détail des acquisitions propres à
 * CET exercice (`composantsNouveaux` de l'année en cours, montant par
 * montant) — donnée non traitée par ce jalon (STOP explicite composants
 * nouveaux) : 490/492/570 restent alors non alimentées, exactement comme
 * avant GO-2. Même garde F-010/F-014 que 496/576 (Cycle 37) : ces colonnes
 * ne sont produites que quand 496/576 le sont elles-mêmes.
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
  "fiscalResult.amortCalcule (F-014) diverge de rfs.immobilisations.totalAnnuelExercice + Σ composantsDetail.dotationExercice — la composition RFS est incomplète ou incohérente ; 496/576/490/492/570 restent non alimentées (fail-closed).";

const RAISON_TERRAIN_ABSENT =
  "rfs.immobilisations est présent mais sans valeurTerrain (dossier ou fixture antérieur à l'exposition de cette donnée, Cycle 35) — produire une valeur brute sans le terrain sous-évaluerait silencieusement la valeur réelle plutôt que de signaler l'absence.";

const RAISON_IMMO_ABSENT =
  "rfs.immobilisations est absent — aucun plan d'amortissement disponible pour ce dossier (F-010 non encore exécuté ou non persisté).";

const RAISON_MOUVEMENT_EXERCICE_ULTERIEUR =
  "Exercice ultérieur à la mise en service : 490/492/570 exigent les ouvertures comptables issues de la clôture N (rfs.immobilisations.mouvements). Absentes → non alimentées (UNKNOWN ≠ ZERO). Lot 5.";

const RAISON_MOUVEMENT_DATE_ABSENTE =
  "rfs.immobilisations.dateMiseEnService est absente — impossible de déterminer si l'exercice courant est le premier exercice de mise en service, condition nécessaire pour alimenter « début d'exercice »/« augmentations » (GO-2). Jamais supposée par défaut.";

const RAISON_F012_SANS_DETAIL =
  "Des composants F-012 existent sans composantsDetail enrichi — brut/cumul/net non fiables (Lot 5 fail-closed).";

const RAISON_RECONCILIATION_BRUT =
  "Réconciliation brut échouée : closingGross ≠ openingGross + acquisitions explicites (provenance acquisition_exercice). Une variation n'est pas une acquisition — 490/492/496 non alimentées (Lot 5 fail-closed).";

const RAISON_RECONCILIATION_AMORT =
  "Réconciliation amortissements échouée : 570 + 572 ≠ 576 (ouverture + dotation exercice ≠ cumul clôture). Aucune sortie inventée — cases non alimentées (Lot 5 fail-closed).";

// 494/574 (diminutions) restent hors périmètre GO-2, quel que soit
// l'exercice : aucune notion de cession/sortie d'actif n'existe nulle part
// dans F-006/F-010/F-012/F-014 (Cycle 54, toujours vrai) — indépendant de
// dateMiseEnService.
const RAISON_MOUVEMENT_DIMINUTIONS =
  "Cette colonne exige une notion de cession/sortie d'actif en cours d'exercice, qui n'existe nulle part dans F-006/F-010/F-012/F-014 aujourd'hui (Cycle 54) — hors périmètre quel que soit l'exercice (Cadre III, cessions : non traité par GO-2). Lot 5 : aucune invention de disposal.";

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

  // Lot 5 — garde F-010/F-014 : amortCalcule doit matcher F-010 + détail F-012.
  const f012Details = immo?.composantsDetail ?? [];
  const f012SansDetail =
    immo !== undefined &&
    (immo.composantsNouveaux?.length ?? 0) > 0 &&
    f012Details.length === 0;
  const dotationF012 = round2(f012Details.reduce((acc, d) => acc + d.dotationExercice, 0));
  const amortissementDivergent =
    immo !== undefined &&
    !f012SansDetail &&
    Math.abs(round2(fr.amortCalcule - (immo.totalAnnuelExercice + dotationF012))) > 0.01;

  const LABEL_490 = "Valeur brute des immobilisations au début de l'exercice";
  const LABEL_492 = "Augmentations (immobilisations)";
  const LABEL_570 = "Montant des amortissements au début de l'exercice";

  if (immo !== undefined && typeof immo.valeurTerrain === "number" && !amortissementDivergent && !f012SansDetail) {
    const totals = computeClosingImmobilisationsTotals(immo);
    if (!totals) {
      // Défense : totals absents malgré les gardes ci-dessus.
      for (const [caseId, label] of [
        ["490", LABEL_490],
        ["492", LABEL_492],
        ["496", "Valeur brute des immobilisations à la fin de l'exercice"],
        ["570", LABEL_570],
        ["576", "Montant des amortissements à la fin de l'exercice"],
      ] as const) {
        casesNonAlimentees.push({
          caseId,
          label,
          raison: RAISON_F012_SANS_DETAIL,
          categorie: "donnee_absente",
        });
      }
    } else {
      const { brut, amortissementsCumules } = totals;

      const pushMouvementNonAlimente = (raison: string, categorie: CerfaCaseNonAlimenteeCategorie) => {
        casesNonAlimentees.push(
          { caseId: "490", label: LABEL_490, raison, categorie },
          { caseId: "492", label: LABEL_492, raison, categorie },
          { caseId: "570", label: LABEL_570, raison, categorie },
        );
      };

      const pushTotauxNonAlimentes = (raison: string) => {
        for (const [caseId, label] of [
          ["490", LABEL_490],
          ["492", LABEL_492],
          ["496", "Valeur brute des immobilisations à la fin de l'exercice"],
          ["570", LABEL_570],
          ["576", "Montant des amortissements à la fin de l'exercice"],
        ] as const) {
          casesNonAlimentees.push({
            caseId,
            label,
            raison,
            categorie: "incoherence_modele",
          });
        }
      };

      // Lot 5 B2 — réconciliation avant toute publication de 490/492/570/496/576.
      const reconciliation = reconcileImmobilisationsContinuity({
        immobilisations: immo,
        exercice: rfs.exercice,
        amortCalcule: fr.amortCalcule,
      });

      if (reconciliation.status === "fail") {
        pushTotauxNonAlimentes(
          reconciliation.code === "IMMOBILISATIONS_AMORT_RECONCILIATION_FAILED"
            ? RAISON_RECONCILIATION_AMORT
            : RAISON_RECONCILIATION_BRUT,
        );
      } else if (immo.dateMiseEnService === undefined) {
        cases.push(
          {
            caseId: "496",
            label: "Valeur brute des immobilisations à la fin de l'exercice",
            value: brut,
            trace: {
              source: "FiscalResult",
              path: "rfs.immobilisations.totalBrut + valeurTerrain + Σ composantsDetail.montant",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "576",
            label: "Montant des amortissements à la fin de l'exercice",
            value: amortissementsCumules,
            trace: {
              source: "FiscalResult",
              path: "Σ lignes.amortissementsCumules + Σ composantsDetail.amortissementsCumules",
              ksArtifacts: ["TRF-0032"],
            },
          },
        );
        pushMouvementNonAlimente(RAISON_MOUVEMENT_DATE_ABSENTE, "donnee_absente");
      } else if (reconciliation.status === "ok" && reconciliation.mode === "premier_exercice") {
        cases.push(
          {
            caseId: "496",
            label: "Valeur brute des immobilisations à la fin de l'exercice",
            value: brut,
            trace: {
              source: "FiscalResult",
              path: "rfs.immobilisations.totalBrut + valeurTerrain + Σ composantsDetail.montant",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "576",
            label: "Montant des amortissements à la fin de l'exercice",
            value: amortissementsCumules,
            trace: {
              source: "FiscalResult",
              path: "Σ lignes.amortissementsCumules + Σ composantsDetail.amortissementsCumules",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "490",
            label: LABEL_490,
            value: 0,
            trace: {
              source: "FiscalResult",
              path: "premier exercice de mise en service ⇒ 0",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "492",
            label: LABEL_492,
            value: brut,
            trace: {
              source: "FiscalResult",
              path: "premier exercice ⇒ augmentations = brut fin (= 496)",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "570",
            label: LABEL_570,
            value: 0,
            trace: {
              source: "FiscalResult",
              path: "premier exercice de mise en service ⇒ 0",
              ksArtifacts: ["TRF-0032"],
            },
          },
        );
      } else if (reconciliation.status === "ok" && reconciliation.mode === "exercice_ulterieur" && immo.mouvements) {
        const acquisitions = reconciliation.acquisitionsExercice;
        cases.push(
          {
            caseId: "496",
            label: "Valeur brute des immobilisations à la fin de l'exercice",
            value: brut,
            trace: {
              source: "FiscalResult",
              path: "rfs.immobilisations.totalBrut + valeurTerrain + Σ composantsDetail.montant",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "576",
            label: "Montant des amortissements à la fin de l'exercice",
            value: amortissementsCumules,
            trace: {
              source: "FiscalResult",
              path: "Σ lignes.amortissementsCumules + Σ composantsDetail.amortissementsCumules",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "490",
            label: LABEL_490,
            value: immo.mouvements.valeurBruteOuverture,
            trace: {
              source: "FiscalResult",
              path: "rfs.immobilisations.mouvements.valeurBruteOuverture (clôture N)",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "492",
            label: LABEL_492,
            value: acquisitions,
            trace: {
              source: "FiscalResult",
              path: "Σ composantsDetail[provenance=acquisition_exercice].montant (pas closing−opening)",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "570",
            label: LABEL_570,
            value: immo.mouvements.amortissementsCumulesOuverture,
            trace: {
              source: "FiscalResult",
              path: "rfs.immobilisations.mouvements.amortissementsCumulesOuverture (clôture N)",
              ksArtifacts: ["TRF-0032"],
            },
          },
        );
      } else {
        // unknown opening — publier 496/576 si fiables, jamais 490/570 = 0 inventé.
        cases.push(
          {
            caseId: "496",
            label: "Valeur brute des immobilisations à la fin de l'exercice",
            value: brut,
            trace: {
              source: "FiscalResult",
              path: "rfs.immobilisations.totalBrut + valeurTerrain + Σ composantsDetail.montant",
              ksArtifacts: ["TRF-0032"],
            },
          },
          {
            caseId: "576",
            label: "Montant des amortissements à la fin de l'exercice",
            value: amortissementsCumules,
            trace: {
              source: "FiscalResult",
              path: "Σ lignes.amortissementsCumules + Σ composantsDetail.amortissementsCumules",
              ksArtifacts: ["TRF-0032"],
            },
          },
        );
        pushMouvementNonAlimente(RAISON_MOUVEMENT_EXERCICE_ULTERIEUR, "donnee_absente");
      }
    }
  } else if (immo !== undefined && typeof immo.valeurTerrain === "number" && (amortissementDivergent || f012SansDetail)) {
    const raison = f012SansDetail ? RAISON_F012_SANS_DETAIL : RAISON_DIVERGENCE_F010_F014;
    for (const [caseId, label] of [
      ["490", LABEL_490],
      ["492", LABEL_492],
      ["496", "Valeur brute des immobilisations à la fin de l'exercice"],
      ["570", LABEL_570],
      ["576", "Montant des amortissements à la fin de l'exercice"],
    ] as const) {
      casesNonAlimentees.push({
        caseId,
        label,
        raison,
        categorie: f012SansDetail ? "donnee_absente" : "incoherence_modele",
      });
    }
  } else if (immo !== undefined) {
    for (const [caseId, label] of [
      ["490", LABEL_490],
      ["492", LABEL_492],
      ["496", "Valeur brute des immobilisations à la fin de l'exercice"],
      ["570", LABEL_570],
      ["576", "Montant des amortissements à la fin de l'exercice"],
    ] as const) {
      casesNonAlimentees.push({ caseId, label, raison: RAISON_TERRAIN_ABSENT, categorie: "donnee_absente" });
    }
  } else {
    for (const [caseId, label] of [
      ["490", LABEL_490],
      ["492", LABEL_492],
      ["496", "Valeur brute des immobilisations à la fin de l'exercice"],
      ["570", LABEL_570],
      ["576", "Montant des amortissements à la fin de l'exercice"],
    ] as const) {
      casesNonAlimentees.push({ caseId, label, raison: RAISON_IMMO_ABSENT, categorie: "donnee_absente" });
    }
  }

  // Colonnes de mouvement hors périmètre GO-2 : diminutions (494/574),
  // jamais alimentées quel que soit l'exercice (aucune notion de cession).
  casesNonAlimentees.push(
    { caseId: "494", label: "Diminutions (immobilisations)", raison: RAISON_MOUVEMENT_DIMINUTIONS, categorie: "donnee_absente" },
    { caseId: "574", label: "Diminutions : amortissements afférents aux éléments sortis de l'actif et reprises", raison: RAISON_MOUVEMENT_DIMINUTIONS, categorie: "donnee_absente" },
  );

  return {
    formId: "2033-C-SD",
    millésime: rfs.exercice,
    cases,
    casesNonAlimentees,
  };
}
