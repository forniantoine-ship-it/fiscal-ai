import type { FiscalRepresentation } from "../types";
import type { CaseTrace, CerfaCase } from "../../f007/types";
import { round2 } from "../../f007/types";
import { resultatComptable as resultatComptableCentral } from "../../bilan/resultat-comptable";
import { checkBilanEquilibre } from "../../bilan/check-bilan-equilibre";
import {
  gateTotal044ActifImmobiliseBrut,
  gateTotal048,
  gateTotal098,
  gateTotal110,
  gateTotal112,
  gateTotal180,
} from "../../bilan/lignes-simples";
import {
  gateTotal096AvecVentilation,
  gateTotal176AvecVentilation,
  resolveCaseAvecVentilationPrioritaire,
} from "../../bilan/ventilation-tiers";
import { resolveTotalCapitauxPropres } from "../../bilan/total-capitaux-propres";
import type { BilanEquilibreStatus, LignePatrimonialeResolution } from "../../bilan/types";
import { computeClosingImmobilisationsTotals } from "@/lib/lmnp/services/dossier/immobilisations-comptables";

/**
 * Projection Cerfa 2033-A-SD (bilan simplifié) — consomme UNIQUEMENT la RFS
 * (`rfs.fiscalResult`, `rfs.immobilisations`, `rfs.emprunts`). Aucun appel à
 * produceFiscalResult()/applyAmortissementStocks(), aucune lecture directe
 * d'assistant F-010/F-011/F-012/F-013/F-014, aucun accès FEC, aucune
 * reconstruction comptable (notamment jamais de solde du compte 108, jamais
 * de trésorerie déduite par différence actif/passif).
 *
 * Cycle 35 — audit de préparation (notice 2033-NOT-SD + spécimen réel + FEC
 * réel du dossier de référence, positionnellement ré-extraits pour associer
 * chaque case à sa vraie valeur). Constat central : la quasi-totalité du
 * bilan simplifié n'a aujourd'hui aucune représentation fiable dans le
 * modèle produit (pas de trésorerie, pas de créances/dettes de tiers, pas de
 * suivi du compte de l'exploitant) — seules deux cases préexistantes
 * (résultat de l'exercice, emprunts) et deux cases nouvellement débloquées
 * ce cycle (immobilisations corporelles brut/net, grâce à l'exposition de
 * `valeurTerrain`) sont alimentées. Aucun total (044/048/096/098/110/112/
 * 142/176/180) n'est alimenté : un total partiel serait une donnée fausse,
 * pas une donnée manquante — voir `rfs-2033a.test.ts` pour la preuve.
 *
 * Cycle 37 — audit de la fondation F-010/F-014 : `rfs.immobilisations`
 * provient de F-010 seul, alors que `fiscalResult.amortCalcule` (source
 * fiscale autoritaire, déjà utilisée par 136 et par le 2033-B) provient de
 * F-014, qui ajoute aux dotations F-010 celles de `composantsNouveaux`
 * (travaux F-012 réintégrés en immobilisation). Cette divergence est réelle
 * et prouvée par capability (voir `rfs-2033a-invariant.test.ts`) : 028/030
 * ne sont désormais alimentées que si `fiscalResult.amortCalcule` et
 * `rfs.immobilisations.totalAnnuelExercice` concordent — sinon la RFS est
 * connue incomplète pour ce dossier et les deux cases restent bloquées
 * plutôt que de produire un bilan silencieusement sous-évalué.
 */

export type CerfaCaseNonAlimenteeCategorie =
  /** Aucun champ du modèle fiscal actuel ne représente cette grandeur. */
  | "donnee_absente"
  /** La donnée existe mais la reconstituer exigerait une règle non validée, une confusion de concepts, ou l'agrégation de composantes elles-mêmes non fiables. */
  | "incoherence_modele"
  /** Le mécanisme correspondant n'est pas implémenté par F-006 — décision de périmètre, pas une lacune de donnée. */
  | "hors_perimetre"
  /** La case ne concerne pas notre régime cible (LMNP réel simplifié, entreprise individuelle) par construction légale ou structurelle — pas un choix produit, pas une donnée manquante. */
  | "non_applicable";

export type CerfaCaseNonAlimentee = {
  caseId: string;
  label: string;
  raison: string;
  categorie: CerfaCaseNonAlimenteeCategorie;
};

export type Form2033A = {
  formId: "2033-A-SD";
  millésime: number;
  cases: CerfaCase[];
  /** Jamais une valeur inventée : chaque case listée ici reste explicitement sans valeur, avec sa raison tracée. */
  casesNonAlimentees: CerfaCaseNonAlimentee[];
  /**
   * NEXT-5B — champ additif, diagnostic pur, jamais consommé pour produire
   * une case : expose tel quel le statut déjà calculé par `checkBilanEquilibre()`
   * (source unique de la notion d'équilibre/divergence bilan, `bilan/check-bilan-equilibre.ts`),
   * pour que `resolveFinalDeclarabilityState()` (NEXT-5) distingue une case
   * 142/180 non alimentée par simple donnée manquante (`DONNEE_MANQUANTE`/
   * `STOCK_OUVERTURE_ABSENT`, jamais bloquant) d'une case non alimentée par
   * divergence/déséquilibre prouvé (`DIVERGENCE_SOURCE`/`DESEQUILIBRE_REEL`,
   * bloquant) — sans reparser le texte libre `raison`. `undefined` quand
   * `rfs.patrimoine` est absent (aucun équilibre à constater, cf.
   * `checkBilanEquilibre()` non appelée dans ce cas).
   */
  equilibreStatus?: BilanEquilibreStatus;
};

const RAISON_TRESORERIE =
  "Aucune dimension trésorerie (banque, caisse, comptes courants) n'est modélisée par F-006/F-010/F-011/F-012/F-013 : confirmé par l'audit du dossier de référence, dont le FEC réel ne contient aucun compte de classe 5. Ne jamais déduire cette valeur par différence entre actif et passif — ce serait une reconstruction comptable locale, interdite.";

const RAISON_TIERS_ABSENTS =
  "Aucun suivi de créances ou dettes de tiers (clients, fournisseurs, avances, charges/produits constatés d'avance) n'existe dans le modèle actuel — F-006/F-012/F-013 agrègent des totaux annuels, pas des soldes de fin d'exercice par tiers.";

const RAISON_CAPITAL_INDIVIDUEL =
  "Cette valeur correspond au solde du compte 108 (compte de l'exploitant) dans la comptabilité réelle, qui mélange apports, prélèvements et opérations courantes sur un même compte (confirmé par l'audit du FEC réel du dossier de référence). La reconstituer exigerait de rejouer le grand livre comptable comme un expert-comptable — explicitement interdit dans une projection.";

const RAISON_TOTAL_ACTIF_IMMOBILISE =
  "Le Total I (actif immobilisé) additionne les immobilisations corporelles (alimentées), incorporelles et financières (jamais modélisées). Un total qui omettrait silencieusement une composante non nulle serait une donnée fausse, pas une donnée manquante — il reste bloqué tant que toutes ses composantes ne sont pas fiables.";

const RAISON_TOTAL_ACTIF_CIRCULANT =
  "Le Total II (actif circulant) dépend de lignes (créances, disponibilités, charges constatées d'avance) toutes non modélisées aujourd'hui. Le fait qu'elles soient nulles sur le dossier de référence ne garantit rien pour un autre dossier — bloqué par principe, pas déduit à 0.";

const RAISON_TOTAL_GENERAL_ACTIF =
  "Dépend du Total I et du Total II, tous deux non fiables — voir leurs raisons respectives.";

const RAISON_TOTAL_CAPITAUX_PROPRES =
  "Le Total I (capitaux propres) additionne le capital individuel (non reconstituable, voir case 120) et le résultat de l'exercice (alimenté). Bloqué tant que le capital individuel n'a pas de source fiable.";

const RAISON_TOTAL_DETTES =
  "Le Total III (dettes) additionne les emprunts (alimentés) et d'autres postes (fournisseurs, dettes fiscales et sociales, comptes courants) jamais modélisés. Qu'ils soient nuls sur le dossier de référence ne garantit rien pour un autre dossier présentant une dette fournisseur ou fiscale réelle — bloqué par principe.";

const RAISON_TOTAL_GENERAL_PASSIF =
  "Dépend du Total I (capitaux propres) et du Total III (dettes), tous deux non fiables — voir leurs raisons respectives.";

const RAISON_AMORT_066 =
  "Aucune source métier de provision ou d'amortissement sur avances versées (case 066, colonne Amortissements-Provisions) — distincte de la case 064 (brut). Le modèle ne collecte aujourd'hui que le brut via `lignesSimples.avancesAcomptesVerses` / ventilation ; absence ou montant brut connu ≠ provision sur avances.";

const RAISON_AMORT_070 =
  "Aucune source métier de provision ou d'amortissement sur clients (case 070, colonne Amortissements-Provisions) — distincte de la case 068 (brut). La ventilation tiers `LOYER_DU_PAR_LOCATAIRE` alimente uniquement le brut clients ; une créance client brute ne doit jamais être recopiée en provision.";

const RAISON_AMORT_074 =
  "Aucune source métier de provision ou d'amortissement sur autres créances (case 074, colonne Amortissements-Provisions) — distincte de la case 072 (brut). La ventilation tiers ne projette que le brut ; absence de créance brute ≠ absence de provision.";

const RAISON_AMORT_094 =
  "Aucune source métier de provision ou d'amortissement sur charges constatées d'avance (case 094, colonne Amortissements-Provisions) — distincte de la case 092 (brut). Le modèle ne collecte aujourd'hui que le brut via `lignesSimples.chargesConstateesAvance` / ventilation ; absence de CCA brute ≠ absence de provision.";

/**
 * P1-PDF-02-F4-A — projection d'une feuille colonne Amortissements-Provisions
 * depuis une `LignePatrimonialeResolution` déjà résolue (P1-B.2). Ne publie
 * que si DECLARE ou NUL_CONFIRME explicite — jamais si INCONNU.
 */
function projectCaseAmortFeuilleFromLigne(
  caseId: string,
  label: string,
  resolution: LignePatrimonialeResolution,
  tracePath: string,
): { published?: CerfaCase; blocked?: CerfaCaseNonAlimentee } {
  if (resolution.status === "DECLARE" || resolution.status === "NUL_CONFIRME") {
    return {
      published: {
        caseId,
        label,
        value: resolution.montant,
        trace: { source: "FiscalResult", path: tracePath, ksArtifacts: ["TRF-0032"] },
      },
    };
  }
  return {
    blocked: {
      caseId,
      label,
      raison: resolution.raison,
      categorie: "donnee_absente",
    },
  };
}

function statutFeuillePourTrace(resolution: LignePatrimonialeResolution): string {
  return resolution.status;
}

function sommeFeuillesPubliables(cases: CerfaCase[], caseIds: readonly string[]): number {
  return round2(
    caseIds.reduce((acc, caseId) => {
      const feuille = cases.find((c) => c.caseId === caseId);
      if (feuille === undefined) {
        throw new Error(`gate COMPOSANTES_CONNUES incohérent : feuille ${caseId} absente des cases publiées`);
      }
      return acc + (feuille.value as number);
    }, 0),
  );
}

function traceTotalAmortFeuilles(
  totalCaseId: string,
  formule: string,
  caseIds: readonly string[],
  cases: CerfaCase[],
  statuts: Record<string, string>,
): string {
  const termes = caseIds.map((id) => {
    const val = cases.find((c) => c.caseId === id)?.value;
    const statut = statuts[id] ?? "publié";
    return `${id}(${val},${statut})`;
  });
  return `${totalCaseId} = ${formule} = ${termes.join(" + ")} — somme des feuilles publiables uniquement, jamais de bruts ni sous-totaux`;
}

/**
 * Chantier 2D-B — variante colonne-agnostique de `traceTotalAmortFeuilles`,
 * pour les totaux 044 (Brut) et 176 (Dettes, colonne NET unique) : la garde
 * "jamais de bruts" de la variante Amort n'a pas de sens pour un total qui
 * additionne lui-même des feuilles Brut/NET. Même mécanique, formulation
 * générique. N'affecte pas 048/098/112 (inchangés, utilisent toujours
 * `traceTotalAmortFeuilles`).
 */
function traceTotalFeuilles(
  totalCaseId: string,
  formule: string,
  caseIds: readonly string[],
  cases: CerfaCase[],
  statuts: Record<string, string>,
): string {
  const termes = caseIds.map((id) => {
    const val = cases.find((c) => c.caseId === id)?.value;
    const statut = statuts[id] ?? "publié";
    return `${id}(${val},${statut})`;
  });
  return `${totalCaseId} = ${formule} = ${termes.join(" + ")} — somme des feuilles publiables uniquement, jamais une composante non publiée ni un sous-total partiel`;
}

export function map2033AFromRfs(rfs: FiscalRepresentation): Form2033A {
  const fr = rfs.fiscalResult;
  const immo = rfs.immobilisations;
  const baseTrace: Omit<CaseTrace, "path"> = { source: "FiscalResult", ksArtifacts: ["TRF-0032"] };

  const cases: CerfaCase[] = [];
  const casesNonAlimentees: CerfaCaseNonAlimentee[] = [];
  // NEXT-5B — capturé au moment du seul appel existant à checkBilanEquilibre()
  // plus bas (jamais un second appel), pour exposition additive en sortie.
  let equilibreStatus: BilanEquilibreStatus | undefined;

  // Case 136 — Résultat de l'exercice. MICRO-JALON socle patrimonial P0 :
  // source UNIQUE désormais partagée avec la case 310 du 2033-B
  // (`capabilities/bilan/resultat-comptable.ts`) — même formule qu'avant
  // (aucun changement de valeur, non-régression vérifiée), jamais recalculée
  // indépendamment dans deux fichiers.
  const resultatExercice = resultatComptableCentral(fr);
  cases.push({
    caseId: "136",
    label: "Résultat de l'exercice",
    value: resultatExercice,
    trace: {
      ...baseTrace,
      path: "fiscalResult.resultatAvantAmort − fiscalResult.amortCalcule − fiscalResult.charges.totalNonDeductible (= case 310 du 2033-B-SD)",
      ksArtifacts: ["TRF-0030", "TRF-0012", "TRF-0020", "TRF-0032"],
    },
  });

  // Case 156 — Emprunts et dettes assimilées. Correction P0-3 (audit
  // indépendant) : quand `rfs.patrimoine` est fourni, la source canonique
  // devient `patrimoine.emprunts` (résolution qui compare F-011 et
  // BilanInputs.financements.clotureCRD — voir `assemble-patrimoine.ts`).
  // Si les deux sources divergent, 156 n'est PLUS publiée (avant cette
  // correction, elle restait sourcée uniquement sur F-011 sans jamais
  // détecter une seconde source contradictoire). Sans patrimoine,
  // comportement rigoureusement inchangé : F-011 seul, aucun recalcul.
  const patrimoinePourEmprunts = rfs.patrimoine;
  if (patrimoinePourEmprunts !== undefined) {
    if (patrimoinePourEmprunts.emprunts.etat === "DISPONIBLE") {
      cases.push({
        caseId: "156",
        label: "Emprunts et dettes assimilées",
        value: patrimoinePourEmprunts.emprunts.totalCRD,
        trace: { source: "FiscalResult", path: patrimoinePourEmprunts.emprunts.source, ksArtifacts: ["TRF-0032"] },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "156",
        label: "Emprunts et dettes assimilées",
        raison: patrimoinePourEmprunts.emprunts.raison,
        categorie: patrimoinePourEmprunts.emprunts.etat === "DIVERGENT" ? "incoherence_modele" : "donnee_absente",
      });
    }
  } else if (rfs.emprunts !== undefined) {
    const totalEmprunts = round2(rfs.emprunts.reduce((acc, p) => acc + p.capitalRestantDu31_12, 0));
    cases.push({
      caseId: "156",
      label: "Emprunts et dettes assimilées",
      value: totalEmprunts,
      trace: {
        source: "FiscalResult",
        path: "Σ rfs.emprunts[].capitalRestantDu31_12",
        ksArtifacts: ["TRF-0032"],
      },
    });
  } else {
    casesNonAlimentees.push({
      caseId: "156",
      label: "Emprunts et dettes assimilées",
      raison:
        "rfs.emprunts est absent (aucun financement déclaré ou pas encore persisté par F-011 pour ce dossier) — jamais transformé en 0 par défaut, une valeur de 0 signifierait à tort « aucun emprunt » plutôt que « donnée non transmise ».",
      categorie: "donnee_absente",
    });
  }

  // Cases 028/030 — Immobilisations corporelles brut/net. Débloquées ce
  // cycle (TRF-0032/Cycle 35) grâce à l'exposition de `valeurTerrain`
  // (F-010, jamais recalculé ici) : `totalBrut` (F-010) exclut
  // structurellement le terrain (non amortissable par nature — voir
  // `compute-amortization-plan.ts`), il faut donc le rajouter pour
  // reconstituer le brut comptable complet. Le net soustrait la somme des
  // amortissements cumulés déjà produits ligne par ligne — le terrain n'est
  // jamais amorti, il n'entre donc que dans le brut, jamais en déduction.
  // Cycle 37 — garde d'invariant F-010/F-014 : `rfs.immobilisations` (F-010)
  // ne porte JAMAIS les `composantsNouveaux` que F-012 fait entrer dans F-014
  // (`compose-plan-amortissement.ts` : `total_dotations_exercice` =
  // Σ dotations F-010 + Σ dotations nouveaux éléments), alors que
  // `fiscalResult.amortCalcule` EST ce total F-014 complet
  // (`aggregate-inputs.ts` : `amortCalcule = amortissementAssistant.totalDotations`,
  // transport pur — voir `produce-fiscal-result.ts`, commentaire « Amortissement
  // calculé (F-014) »). Si les deux valeurs divergent, `rfs.immobilisations`
  // est structurellement incomplet pour ce dossier (au moins un composant
  // nouveau existe sans que son brut soit reflété dans totalBrut) : produire
  // 028/030 depuis F-010 seul sous-évaluerait silencieusement le bilan. Aucun
  // recalcul ici — seule une comparaison entre deux valeurs déjà produites.
  // MICRO-JALON socle patrimonial P0 : quand `rfs.patrimoine` est fourni, le
  // registre unifié (`assembleRegistreImmobilisationsPatrimoniales`) prend le
  // relais pour 028/030 — il sait, en plus de ce qui suit, intégrer le BRUT
  // des composants nouveaux F-012 (voir ce module pour la preuve). Sans
  // patrimoine, comportement rigoureusement inchangé (branche ci-dessous,
  // non modifiée).
  const patrimoine = rfs.patrimoine;

  // Lot 5 / P0-2A — avec `composantsDetail` enrichi, 028/030 alignent sur
  // map-2033c (F-010 + F-012). Sans détail + composantsNouveaux : Cycle 37.
  const f012Details = immo?.composantsDetail ?? [];
  const f012SansDetail =
    immo !== undefined &&
    (immo.composantsNouveaux?.length ?? 0) > 0 &&
    f012Details.length === 0;
  const dotationF012 = round2(f012Details.reduce((acc, d) => acc + d.dotationExercice, 0));
  const expectedDotation =
    immo !== undefined && f012Details.length > 0
      ? round2(immo.totalAnnuelExercice + dotationF012)
      : immo?.totalAnnuelExercice;
  const amortissementDivergent =
    immo !== undefined &&
    expectedDotation !== undefined &&
    !f012SansDetail &&
    Math.abs(round2(fr.amortCalcule - expectedDotation)) > 0.01;

  if (patrimoine !== undefined) {
    if (patrimoine.immobilisations.brutTotal !== undefined) {
      cases.push({
        caseId: "028",
        label: "Immobilisations corporelles (brut)",
        value: patrimoine.immobilisations.brutTotal,
        trace: { source: "FiscalResult", path: "patrimoine.immobilisations.brutTotal (registre unifié F-010+F-012)", ksArtifacts: ["TRF-0032"] },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "028",
        label: "Immobilisations corporelles (brut)",
        raison: patrimoine.immobilisations.raisons.join(" ") || "Registre patrimonial d'immobilisations non fiable pour ce dossier.",
        categorie: "incoherence_modele",
      });
    }
    if (patrimoine.immobilisations.cumuleTotal !== undefined) {
      cases.push({
        caseId: "030",
        label: "Immobilisations corporelles (amortissements-provisions)",
        value: patrimoine.immobilisations.cumuleTotal,
        trace: { source: "FiscalResult", path: "patrimoine.immobilisations.cumuleTotal (registre unifié F-010+F-012)", ksArtifacts: ["TRF-0032"] },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "030",
        label: "Immobilisations corporelles (amortissements-provisions)",
        raison: patrimoine.immobilisations.raisons.join(" ") || "Registre patrimonial d'immobilisations non fiable pour ce dossier.",
        categorie: "incoherence_modele",
      });
    }
  } else if (
    immo !== undefined &&
    typeof immo.valeurTerrain === "number" &&
    !amortissementDivergent &&
    !f012SansDetail
  ) {
    const totals = computeClosingImmobilisationsTotals(immo);
    if (!totals) {
      for (const [caseId, suffixe] of [["028", "brut"], ["030", "amortissements-provisions"]] as const) {
        casesNonAlimentees.push({
          caseId,
          label: `Immobilisations corporelles (${suffixe})`,
          raison:
            "Totaux d'immobilisations non fiables (terrain absent ou composants F-012 sans détail enrichi).",
          categorie: "donnee_absente",
        });
      }
    } else {
      cases.push({
        caseId: "028",
        label: "Immobilisations corporelles (brut)",
        value: totals.brut,
        trace: {
          source: "FiscalResult",
          path:
            f012Details.length > 0
              ? "rfs.immobilisations.totalBrut + valeurTerrain + Σ composantsDetail.montant"
              : "rfs.immobilisations.totalBrut + rfs.immobilisations.valeurTerrain",
          ksArtifacts: ["TRF-0032"],
        },
      });
      cases.push({
        caseId: "030",
        label: "Immobilisations corporelles (amortissements-provisions)",
        value: totals.amortissementsCumules,
        trace: {
          source: "FiscalResult",
          path:
            f012Details.length > 0
              ? "Σ lignes.amortissementsCumules + Σ composantsDetail.amortissementsCumules"
              : "Σ rfs.immobilisations.lignes[].amortissementsCumules",
          ksArtifacts: ["TRF-0032"],
        },
      });
    }
  } else if (
    immo !== undefined &&
    typeof immo.valeurTerrain === "number" &&
    (amortissementDivergent || f012SansDetail)
  ) {
    for (const [caseId, suffixe] of [["028", "brut"], ["030", "amortissements-provisions"]] as const) {
      casesNonAlimentees.push({
        caseId,
        label: `Immobilisations corporelles (${suffixe})`,
        raison:
          "fiscalResult.amortCalcule (F-014, source fiscale autoritaire, inclut d'éventuels composantsNouveaux issus de F-012) diverge de rfs.immobilisations.totalAnnuelExercice (F-010 seul, qui ne reçoit jamais ces composants nouveaux). Cette divergence prouve que rfs.immobilisations est incomplet pour ce dossier — au moins un élément amortissable (travaux réintégrés en immobilisation) existe sans que son coût brut ne soit reflété dans totalBrut. Produire 028/030 depuis F-010 seul sous-évaluerait silencieusement le bilan ; aucune reconstruction de la part manquante n'est tentée ici.",
        categorie: "incoherence_modele",
      });
    }
  } else if (immo !== undefined) {
    for (const [caseId, suffixe] of [["028", "brut"], ["030", "amortissements-provisions"]] as const) {
      casesNonAlimentees.push({
        caseId,
        label: `Immobilisations corporelles (${suffixe})`,
        raison:
          "rfs.immobilisations est présent mais sans valeurTerrain (dossier ou fixture antérieur à l'exposition de cette donnée, Cycle 35) — produire un brut/net sans le terrain sous-évaluerait silencieusement la valeur réelle plutôt que de signaler l'absence.",
        categorie: "donnee_absente",
      });
    }
  } else {
    for (const [caseId, suffixe] of [["028", "brut"], ["030", "amortissements-provisions"]] as const) {
      casesNonAlimentees.push({
        caseId,
        label: `Immobilisations corporelles (${suffixe})`,
        raison: "rfs.immobilisations est absent — aucun plan d'amortissement disponible pour ce dossier (F-010 non encore exécuté ou non persisté).",
        categorie: "donnee_absente",
      });
    }
  }

  // ------------------------------------------------------------------
  // MICRO-JALON socle patrimonial P0 — cases 084/086/120/134 et la case 142
  // (Total I — Capitaux propres, seul total publiable, voir plus bas),
  // UNIQUEMENT quand `rfs.patrimoine` est fourni (`assemblePatrimoine()`,
  // `capabilities/bilan`). Purement additif : sans patrimoine, ces cases
  // restent bloquées exactement comme avant ce jalon (bulk
  // `casesNonAlimentees` ci-dessous, non modifié pour ces caseId — voir le
  // filtrage juste avant le `return`).
  //
  // Correction P0-4 (audit indépendant) : 044/048/096/098/110/112/176/180
  // restent TOUJOURS bloqués, même bilan équilibré — voir le commentaire
  // détaillé au-dessus du calcul de 142 plus bas. `checkBilanEquilibre()`
  // reste le SEUL juge de la fiabilité du sous-ensemble suivi par ce module,
  // jamais une reconstitution locale ici — mais un sous-ensemble équilibré
  // n'est pas un total Cerfa complet tant que ses catégories non modélisées
  // (incorporelles, financières, autres tiers) ne sont pas confirmées.
  // ------------------------------------------------------------------
  if (patrimoine !== undefined) {
    // 084/086 — Disponibilités. 084 (brut) et 086 (Amortissements-Provisions) sont
    // résolues indépendamment : aucune recopie de clotureRetenue vers 086.
    if (patrimoine.tresorerie.clotureRetenue !== undefined) {
      cases.push({
        caseId: "084",
        label: "Disponibilités (brut)",
        value: patrimoine.tresorerie.clotureRetenue,
        trace: { source: "FiscalResult", path: `patrimoine.tresorerie.clotureRetenue (${patrimoine.tresorerie.etat})`, ksArtifacts: ["TRF-0032"] },
      });
      if (patrimoine.tresorerie.clotureRetenue === 0) {
        cases.push({
          caseId: "086",
          label: "Disponibilités (amortissements-provisions)",
          value: 0,
          trace: {
            source: "FiscalResult",
            path: `patrimoine.tresorerie (${patrimoine.tresorerie.etat}) — 086=0 cohérent avec trésorerie brute nulle confirmée ; aucune provision distincte modélisée`,
            ksArtifacts: ["TRF-0032"],
          },
        });
      } else {
        const prov086 = patrimoine.disponibilitesAmortissementsProvisions;
        if (prov086.status === "DECLARE" || prov086.status === "NUL_CONFIRME") {
          cases.push({
            caseId: "086",
            label: "Disponibilités (amortissements-provisions)",
            value: prov086.montant,
            trace: {
              source: "FiscalResult",
              path: "patrimoine.disponibilitesAmortissementsProvisions ← BilanInputs.tresorerie.provisionsAmortissements (086 ≠ 084)",
              ksArtifacts: ["TRF-0032"],
            },
          });
        } else {
          casesNonAlimentees.push({
            caseId: "086",
            label: "Disponibilités (amortissements-provisions)",
            raison:
              prov086.raison +
              " La trésorerie brute (084) est connue mais ne suffit pas à alimenter 086 — absence de donnée ≠ zéro.",
            categorie: "donnee_absente",
          });
        }
      }
    } else {
      casesNonAlimentees.push({ caseId: "084", label: "Disponibilités (brut)", raison: patrimoine.tresorerie.raison, categorie: "donnee_absente" });
      casesNonAlimentees.push({
        caseId: "086",
        label: "Disponibilités (amortissements-provisions)",
        raison: patrimoine.tresorerie.raison,
        categorie: "donnee_absente",
      });
    }

    // 120 — Capital social ou individuel (compte de l'exploitant).
    if (patrimoine.compteExploitant.disponible && patrimoine.compteExploitant.clotureN !== undefined) {
      cases.push({
        caseId: "120",
        label: "Capital social ou individuel",
        value: patrimoine.compteExploitant.clotureN,
        trace: { source: "FiscalResult", path: "patrimoine.compteExploitant.clotureN (ouverture + apports − prélèvements, résultat N jamais inclus)", ksArtifacts: ["TRF-0032"] },
      });
    } else {
      casesNonAlimentees.push({ caseId: "120", label: "Capital social ou individuel", raison: patrimoine.compteExploitant.raison, categorie: "donnee_absente" });
    }

    // 134 — Report à nouveau.
    if (patrimoine.ran.disponible && patrimoine.ran.valeur !== undefined) {
      cases.push({
        caseId: "134",
        label: "Report à nouveau",
        value: patrimoine.ran.valeur,
        trace: { source: "FiscalResult", path: "patrimoine.ran.valeur", ksArtifacts: ["TRF-0032"] },
      });
    } else {
      casesNonAlimentees.push({ caseId: "134", label: "Report à nouveau", raison: patrimoine.ran.raison, categorie: "donnee_absente" });
    }

    // 137 — Subventions d'investissement. Correction P1-A (audit indépendant,
    // asymétrie 142/137) : contrairement à 124/126/130/131/132/140 (concepts
    // sociétaires, structurellement hors périmètre EI, restés en dur dans
    // `toujoursBloquees`), 137 dépend d'une confirmation par dossier — "quasi
    // inexistant en pratique" n'est jamais une justification pour l'écrire à
    // 0 sans statut explicite (voir `subventions-investissement.ts`).
    if (patrimoine.subventionsInvestissement.status !== "INCONNU") {
      cases.push({
        caseId: "137",
        label: "Subventions d'investissement",
        value: patrimoine.subventionsInvestissement.montant,
        trace: { source: "FiscalResult", path: "patrimoine.subventionsInvestissement", ksArtifacts: ["TRF-0032"] },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "137",
        label: "Subventions d'investissement",
        raison: patrimoine.subventionsInvestissement.raison,
        categorie: "donnee_absente",
      });
    }

    // P1-PDF-02-F4-A — feuilles colonne Amortissements-Provisions (immobilisé,
    // P1-B.2). Les propriétés `*Net` de `lignesSimples` portent un suffixe
    // historique trompeur : P1-PDF-02-B a établi que 016/042/082 sont
    // physiquement en colonne Amort. La saisie DECLARE/NUL_CONFIRME vise le
    // montant de CETTE colonne Cerfa — jamais une VNC comptable, jamais le
    // brut de la ligne voisine (014/040/080).
    const ls = patrimoine.lignesSimples;
    for (const spec of [
      {
        caseId: "016",
        label: "Autres immobilisations incorporelles (amortissements-provisions)",
        resolution: ls.autresImmobilisationsIncorporellesNet,
        path: "patrimoine.lignesSimples.autresImmobilisationsIncorporellesNet → case 016 (colonne Amortissements-Provisions)",
      },
      {
        caseId: "042",
        label: "Immobilisations financières (amortissements-provisions)",
        resolution: ls.immobilisationsFinancieresNet,
        path: "patrimoine.lignesSimples.immobilisationsFinancieresNet → case 042 (colonne Amortissements-Provisions)",
      },
      {
        caseId: "082",
        label: "Valeurs mobilières de placement (amortissements-provisions)",
        resolution: ls.valeursMobilieresPlacementNet,
        path: "patrimoine.lignesSimples.valeursMobilieresPlacementNet → case 082 (colonne Amortissements-Provisions)",
      },
    ] as const) {
      const { published, blocked } = projectCaseAmortFeuilleFromLigne(spec.caseId, spec.label, spec.resolution, spec.path);
      if (published !== undefined) {
        cases.push(published);
      } else if (blocked !== undefined) {
        casesNonAlimentees.push(blocked);
      }
    }

    // P1-PDF-02-F4-B — feuilles circulant colonne Amort (066/070/074/094).
    // Sources dédiées `lignesSimples.*Amort*` — jamais le brut voisin ni LOYER_DU.
    for (const spec of [
      {
        caseId: "066",
        label: "Avances et acomptes versés sur commandes (amortissements-provisions)",
        resolution: ls.avancesAcomptesVersesAmort,
        path: "patrimoine.lignesSimples.avancesAcomptesVersesAmort → case 066 (colonne Amortissements-Provisions, ≠ 064 brut)",
      },
      {
        caseId: "070",
        label: "Clients et comptes rattachés (amortissements-provisions)",
        resolution: ls.clientsAmortissementsProvisions,
        path: "patrimoine.lignesSimples.clientsAmortissementsProvisions → case 070 (colonne Amortissements-Provisions, ≠ 068/LOYER_DU brut)",
      },
      {
        caseId: "074",
        label: "Autres créances (amortissements-provisions)",
        resolution: ls.autresCreancesAmortissementsProvisions,
        path: "patrimoine.lignesSimples.autresCreancesAmortissementsProvisions → case 074 (colonne Amortissements-Provisions, ≠ 072 brut)",
      },
      {
        caseId: "094",
        label: "Charges constatées d'avance (amortissements-provisions)",
        resolution: ls.chargesConstateesAvanceAmort,
        path: "patrimoine.lignesSimples.chargesConstateesAvanceAmort → case 094 (colonne Amortissements-Provisions, ≠ 092 brut)",
      },
    ] as const) {
      const { published, blocked } = projectCaseAmortFeuilleFromLigne(spec.caseId, spec.label, spec.resolution, spec.path);
      if (published !== undefined) {
        cases.push(published);
      } else if (blocked !== undefined) {
        casesNonAlimentees.push(blocked);
      }
    }

    // P1-PDF-02-G2 — cases Brut/tiers résolues en interne (lignesSimples/
    // ventilationTiers) mais jusqu'ici jamais projetées en case Cerfa
    // (audit P1-PDF-02-G, Finding transverse #1). Trois familles :
    //  - source unique lignesSimples (014/040/080) ;
    //  - source unique ventilationTiers (068/072/164/166/172) ;
    //  - double source réconciliée par resolveCaseAvecVentilationPrioritaire
    //    (064/092/174/175 — ventilation prioritaire si DECLARE, repli sur
    //    lignesSimples sinon, blocage explicite si deux DECLARE divergent).
    // Aucune règle fiscale nouvelle : réutilise projectCaseAmortFeuilleFromLigne
    // tel quel pour la publication/blocage, comme F4-A/F4-B. N'affecte aucun
    // total (044/096/110/112/176/180 restent hors périmètre, toujours bloqués).
    const vt = patrimoine.ventilationTiers;
    for (const spec of [
      {
        caseId: "014",
        label: "Autres immobilisations incorporelles (brut)",
        resolution: ls.autresImmobilisationsIncorporellesBrut,
        path: "patrimoine.lignesSimples.autresImmobilisationsIncorporellesBrut → case 014 (colonne Brut)",
      },
      {
        caseId: "040",
        label: "Immobilisations financières (brut)",
        resolution: ls.immobilisationsFinancieresBrut,
        path: "patrimoine.lignesSimples.immobilisationsFinancieresBrut → case 040 (colonne Brut)",
      },
      {
        caseId: "080",
        label: "Valeurs mobilières de placement (brut)",
        resolution: ls.valeursMobilieresPlacementBrut,
        path: "patrimoine.lignesSimples.valeursMobilieresPlacementBrut → case 080 (colonne Brut)",
      },
      {
        caseId: "068",
        label: "Clients et comptes rattachés (brut)",
        resolution: vt.cases.clients,
        path: "patrimoine.ventilationTiers.cases.clients (nature LOYER_DU_PAR_LOCATAIRE) → case 068",
      },
      {
        caseId: "072",
        label: "Autres créances (brut)",
        resolution: vt.cases.autresCreances,
        path: "patrimoine.ventilationTiers.cases.autresCreances (nature AUTRE_CREANCE_ACTIVITE) → case 072",
      },
      {
        caseId: "164",
        label: "Avances et acomptes reçus sur commandes en cours",
        resolution: vt.cases.avancesAcomptesRecus,
        path: "patrimoine.ventilationTiers.cases.avancesAcomptesRecus (nature ACOMPTE_RECU_SUR_COMMANDE) → case 164",
      },
      {
        caseId: "166",
        label: "Fournisseurs et comptes rattachés",
        resolution: vt.cases.fournisseurs,
        path: "patrimoine.ventilationTiers.cases.fournisseurs (nature FOURNISSEUR_NON_PAYE) → case 166",
      },
      {
        caseId: "172",
        label: "Dettes fiscales et sociales",
        resolution: vt.cases.dettesFiscalesSociales,
        path: "patrimoine.ventilationTiers.cases.dettesFiscalesSociales (nature DETTE_FISCALE_OU_SOCIALE) → case 172",
      },
      {
        caseId: "064",
        label: "Avances et acomptes versés sur commandes (brut)",
        resolution: resolveCaseAvecVentilationPrioritaire("064", ls.avancesAcomptesVerses, vt.cases.avancesAcomptesVerses),
        path: "resolveCaseAvecVentilationPrioritaire(064, lignesSimples.avancesAcomptesVerses, ventilationTiers.cases.avancesAcomptesVerses) — ventilation prioritaire si DECLARE, repli lignesSimples sinon",
      },
      {
        caseId: "092",
        label: "Charges constatées d'avance (brut)",
        resolution: resolveCaseAvecVentilationPrioritaire("092", ls.chargesConstateesAvance, vt.cases.chargesConstateesAvance),
        path: "resolveCaseAvecVentilationPrioritaire(092, lignesSimples.chargesConstateesAvance, ventilationTiers.cases.chargesConstateesAvance) — ventilation prioritaire si DECLARE, repli lignesSimples sinon",
      },
      {
        caseId: "174",
        label: "Produits constatés d'avance",
        resolution: resolveCaseAvecVentilationPrioritaire("174", ls.produitsConstatesAvance, vt.cases.produitsConstatesAvance),
        path: "resolveCaseAvecVentilationPrioritaire(174, lignesSimples.produitsConstatesAvance, ventilationTiers.cases.produitsConstatesAvance) — ventilation prioritaire si DECLARE, repli lignesSimples sinon",
      },
      {
        caseId: "175",
        label: "Autres dettes",
        resolution: resolveCaseAvecVentilationPrioritaire("175", ls.autresDettes, vt.cases.autresDettes),
        path: "resolveCaseAvecVentilationPrioritaire(175, lignesSimples.autresDettes, ventilationTiers.cases.autresDettes) — ventilation prioritaire si DECLARE, repli lignesSimples sinon",
      },
    ] as const) {
      const { published, blocked } = projectCaseAmortFeuilleFromLigne(spec.caseId, spec.label, spec.resolution, spec.path);
      if (published !== undefined) {
        cases.push(published);
      } else if (blocked !== undefined) {
        casesNonAlimentees.push(blocked);
      }
    }

    // P1-PDF-02-F4-C — totaux colonne Amortissements-Provisions (048, 098).
    // Sources = feuilles déjà publiées dans `cases` — jamais bruts voisins,
    // jamais somme partielle si une composante est INCONNU.
    const case030Published = cases.some((c) => c.caseId === "030");
    const case030Blocked = casesNonAlimentees.find((c) => c.caseId === "030");
    const gate048 = gateTotal048(ls, case030Published, case030Blocked?.raison);
    if (gate048.status === "COMPOSANTES_CONNUES") {
      const composantes048 = ["016", "030", "042"] as const;
      const total048 = sommeFeuillesPubliables(cases, composantes048);
      cases.push({
        caseId: "048",
        label: "Total I — Actif immobilisé (amortissements-provisions)",
        value: total048,
        trace: {
          source: "FiscalResult",
          path: traceTotalAmortFeuilles("048", "016 + 030 + 042", composantes048, cases, {
            "016": statutFeuillePourTrace(ls.autresImmobilisationsIncorporellesNet),
            "030": "publié (registre immobilisations corporelles)",
            "042": statutFeuillePourTrace(ls.immobilisationsFinancieresNet),
          }),
          ksArtifacts: ["TRF-0032"],
        },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "048",
        label: "Total I — Actif immobilisé (amortissements-provisions)",
        raison: gate048.raison,
        categorie: "incoherence_modele",
      });
    }

    const case086Published = cases.some((c) => c.caseId === "086");
    const case086Blocked = casesNonAlimentees.find((c) => c.caseId === "086");
    const gate098 = gateTotal098(ls, case086Published, case086Blocked?.raison);
    if (gate098.status === "COMPOSANTES_CONNUES") {
      const composantes098 = ["066", "070", "074", "082", "086", "094"] as const;
      const total098 = sommeFeuillesPubliables(cases, composantes098);
      cases.push({
        caseId: "098",
        label: "Total II — Actif circulant (amortissements-provisions)",
        value: total098,
        trace: {
          source: "FiscalResult",
          path: traceTotalAmortFeuilles("098", "066 + 070 + 074 + 082 + 086 + 094", composantes098, cases, {
            "066": statutFeuillePourTrace(ls.avancesAcomptesVersesAmort),
            "070": statutFeuillePourTrace(ls.clientsAmortissementsProvisions),
            "074": statutFeuillePourTrace(ls.autresCreancesAmortissementsProvisions),
            "082": statutFeuillePourTrace(ls.valeursMobilieresPlacementNet),
            "086": case086Published
              ? patrimoine.tresorerie.clotureRetenue === 0
                ? "NUL_CONFIRME (F2 : 084=0)"
                : statutFeuillePourTrace(patrimoine.disponibilitesAmortissementsProvisions)
              : "INCONNU",
            "094": statutFeuillePourTrace(ls.chargesConstateesAvanceAmort),
          }),
          ksArtifacts: ["TRF-0032"],
        },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "098",
        label: "Total II — Actif circulant (amortissements-provisions)",
        raison: gate098.raison,
        categorie: "incoherence_modele",
      });
    }

    // P1-PDF-02-F4-D — total général actif (112 = 048 + 098), colonne
    // Amortissements-Provisions uniquement. Consomme les gates 048/098 déjà
    // résolues ci-dessus + le fait qu'elles aient RÉELLEMENT été publiées
    // dans `cases` (jamais une gate seule). 112 n'est jamais déduit de
    // 110 − 180 (contrôle d'équilibre croisé distinct, voir
    // check-bilan-equilibre.ts) — uniquement une somme de feuilles publiées.
    const case048Published = cases.some((c) => c.caseId === "048");
    const case098Published = cases.some((c) => c.caseId === "098");
    const gate112 = gateTotal112(gate048, gate098, case048Published, case098Published);
    if (gate112.status === "COMPOSANTES_CONNUES") {
      const composantes112 = ["048", "098"] as const;
      const total112 = sommeFeuillesPubliables(cases, composantes112);
      cases.push({
        caseId: "112",
        label: "Total général actif (I + II) (amortissements-provisions)",
        value: total112,
        trace: {
          source: "FiscalResult",
          path: traceTotalAmortFeuilles("112", "048 + 098", composantes112, cases, {
            "048": "publié (gateTotal048)",
            "098": "publié (gateTotal098)",
          }),
          ksArtifacts: ["TRF-0032"],
        },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "112",
        label: "Total général actif (I + II) (amortissements-provisions)",
        raison: gate112.raison,
        categorie: "incoherence_modele",
      });
    }

    // Chantier 2D-B — total 044 (colonne Brut). Formule Cerfa :
    // 044 = 010 + 014 + 028 + 040. 010 (Fonds commercial, brut) est
    // catégoriquement 0 pour un LMNP (`non_applicable`, hors composante de
    // la gate — voir `gateTotal044ActifImmobiliseBrut`). 014/040 proviennent
    // de `lignesSimples` (G2, déjà publiées ci-dessus) ; 028 provient du
    // registre patrimonial (branche 028/030 plus haut) et nécessite un flag
    // de publication réelle, même doctrine que `case030Published` pour 048.
    const case028Published = cases.some((c) => c.caseId === "028");
    const case028Blocked = casesNonAlimentees.find((c) => c.caseId === "028");
    const gate044 = gateTotal044ActifImmobiliseBrut(ls, case028Published, case028Blocked?.raison);
    if (gate044.status === "COMPOSANTES_CONNUES") {
      const composantes044 = ["014", "028", "040"] as const;
      const total044 = sommeFeuillesPubliables(cases, composantes044);
      cases.push({
        caseId: "044",
        label: "Total I — Actif immobilisé (brut)",
        value: total044,
        trace: {
          source: "FiscalResult",
          path: traceTotalFeuilles("044", "014 + 028 + 040", composantes044, cases, {
            "014": statutFeuillePourTrace(ls.autresImmobilisationsIncorporellesBrut),
            "028": "publié (registre immobilisations corporelles)",
            "040": statutFeuillePourTrace(ls.immobilisationsFinancieresBrut),
          }),
          ksArtifacts: ["TRF-0032"],
        },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "044",
        label: "Total I — Actif immobilisé (brut)",
        raison: gate044.raison,
        categorie: "incoherence_modele",
      });
    }

    // Chantier 2D-B — total 096 (colonne Brut). Formule Cerfa :
    // 096 = 050 + 060 + 064 + 068 + 072 + 080 + 084 + 092. 050/060 (stocks/
    // marchandises) catégoriquement 0 pour un LMNP, hors composantes. 064/092
    // réconciliées par `resolveCaseAvecVentilationPrioritaire` — jamais une
    // logique locale différente (même fonction que celle qui a réellement
    // publié ces cases ci-dessus, ligne 611/617). 068/072 proviennent de
    // `ventilationTiers` seul ; 080 de `lignesSimples` seul ; 084
    // (Disponibilités, brut) provient de `patrimoine.tresorerie`, mécanisme
    // entièrement séparé — nécessite un flag de publication réelle.
    const resolution064PourTrace = resolveCaseAvecVentilationPrioritaire("064", ls.avancesAcomptesVerses, vt.cases.avancesAcomptesVerses);
    const resolution092PourTrace = resolveCaseAvecVentilationPrioritaire("092", ls.chargesConstateesAvance, vt.cases.chargesConstateesAvance);
    const case084Published = cases.some((c) => c.caseId === "084");
    const case084Blocked = casesNonAlimentees.find((c) => c.caseId === "084");
    const gate096 = gateTotal096AvecVentilation(ls, vt, case084Published, case084Blocked?.raison);
    if (gate096.status === "COMPOSANTES_CONNUES") {
      const composantes096 = ["064", "068", "072", "080", "084", "092"] as const;
      const total096 = sommeFeuillesPubliables(cases, composantes096);
      cases.push({
        caseId: "096",
        label: "Total II — Actif circulant (brut)",
        value: total096,
        trace: {
          source: "FiscalResult",
          path: traceTotalFeuilles("096", "064 + 068 + 072 + 080 + 084 + 092", composantes096, cases, {
            "064": statutFeuillePourTrace(resolution064PourTrace),
            "068": statutFeuillePourTrace(vt.cases.clients),
            "072": statutFeuillePourTrace(vt.cases.autresCreances),
            "080": statutFeuillePourTrace(ls.valeursMobilieresPlacementBrut),
            "084": "publié (patrimoine.tresorerie)",
            "092": statutFeuillePourTrace(resolution092PourTrace),
          }),
          ksArtifacts: ["TRF-0032"],
        },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "096",
        label: "Total II — Actif circulant (brut)",
        raison: gate096.raison,
        categorie: "incoherence_modele",
      });
    }

    // Chantier 2D-E2 — total 110 (colonne Brut). Formule Cerfa :
    // 110 = 044 + 096 (Total général actif = Total I + Total II, même
    // colonne — symétrique de 112 côté Amortissements-Provisions). Consomme
    // les gates 044/096 déjà résolues ci-dessus + le fait qu'elles aient
    // RÉELLEMENT été publiées dans `cases` (jamais une gate seule). 110
    // n'est jamais déduit de 112/180 (contrôle d'équilibre croisé distinct,
    // voir check-bilan-equilibre.ts) — uniquement une somme de feuilles
    // publiées, jamais les totaux reconstruits localement par
    // `checkBilanEquilibre()`.
    const case044Published = cases.some((c) => c.caseId === "044");
    const case096Published = cases.some((c) => c.caseId === "096");
    const gate110 = gateTotal110(gate044, gate096, case044Published, case096Published);
    if (gate110.status === "COMPOSANTES_CONNUES") {
      const composantes110 = ["044", "096"] as const;
      const total110 = sommeFeuillesPubliables(cases, composantes110);
      cases.push({
        caseId: "110",
        label: "Total général actif (I + II) (brut)",
        value: total110,
        trace: {
          source: "FiscalResult",
          path: traceTotalFeuilles("110", "044 + 096", composantes110, cases, {
            "044": "publié (gateTotal044ActifImmobiliseBrut)",
            "096": "publié (gateTotal096AvecVentilation)",
          }),
          ksArtifacts: ["TRF-0032"],
        },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "110",
        label: "Total général actif (I + II) (brut)",
        raison: gate110.raison,
        categorie: "incoherence_modele",
      });
    }

    // Chantier 2D-B — total 176 (colonne NET, Dettes). Formule Cerfa :
    // 176 = 156 + 164 + 166 + 172 + 173 + 174 + 175. 173 (comptes courants
    // d'associés) catégoriquement 0 pour une EI, hors composante. 174/175
    // réconciliées par `resolveCaseAvecVentilationPrioritaire` (même fonction
    // qui a publié ces cases ci-dessus). 164/166/172 proviennent de
    // `ventilationTiers` seul. 156 (Emprunts) provient de F-011/
    // `patrimoine.emprunts`, peut être `DIVERGENT` — nécessite un flag de
    // publication réelle ; une divergence bloque 176 comme n'importe quelle
    // composante non publiée, jamais silencieusement ignorée.
    const resolution174PourTrace = resolveCaseAvecVentilationPrioritaire("174", ls.produitsConstatesAvance, vt.cases.produitsConstatesAvance);
    const resolution175PourTrace = resolveCaseAvecVentilationPrioritaire("175", ls.autresDettes, vt.cases.autresDettes);
    const case156Published = cases.some((c) => c.caseId === "156");
    const case156Blocked = casesNonAlimentees.find((c) => c.caseId === "156");
    const gate176 = gateTotal176AvecVentilation(ls, vt, case156Published, case156Blocked?.raison);
    if (gate176.status === "COMPOSANTES_CONNUES") {
      const composantes176 = ["156", "164", "166", "172", "174", "175"] as const;
      const total176 = sommeFeuillesPubliables(cases, composantes176);
      cases.push({
        caseId: "176",
        label: "Total III — Dettes",
        value: total176,
        trace: {
          source: "FiscalResult",
          path: traceTotalFeuilles("176", "156 + 164 + 166 + 172 + 174 + 175", composantes176, cases, {
            "156": "publié (F-011/patrimoine.emprunts)",
            "164": statutFeuillePourTrace(vt.cases.avancesAcomptesRecus),
            "166": statutFeuillePourTrace(vt.cases.fournisseurs),
            "172": statutFeuillePourTrace(vt.cases.dettesFiscalesSociales),
            "174": statutFeuillePourTrace(resolution174PourTrace),
            "175": statutFeuillePourTrace(resolution175PourTrace),
          }),
          ksArtifacts: ["TRF-0032"],
        },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "176",
        label: "Total III — Dettes",
        raison: gate176.raison,
        categorie: "incoherence_modele",
      });
    }

    // Totaux — correction P0-4 (audit indépendant). Avant cette correction,
    // le fait que le SOUS-ENSEMBLE suivi par ce module (immobilisations
    // corporelles + trésorerie + tiers, compte de l'exploitant + RAN +
    // résultat + emprunts) soit intégralement équilibré suffisait à publier
    // 044/096/110/112/176/180 comme s'ils étaient les totaux OFFICIELS du
    // Cerfa — alors que ces totaux officiels agrègent aussi des catégories
    // JAMAIS modélisées par le produit aujourd'hui (immobilisations
    // incorporelles/financières 014/016/040/042 pour 044/110/112 ; avances,
    // charges constatées d'avance pour 096/110/112 ; fournisseurs, dettes
    // fiscales et sociales, autres dettes pour 176/180 — voir
    // `toujoursBloquees` ci-dessous, catégorie `donnee_absente`, jamais
    // `non_applicable`). Un total qui traite silencieusement ces catégories
    // comme nulles est une donnée FAUSSE, pas une donnée manquante : `044`,
    // `048`, `096`, `098`, `110`, `112`, `176` et `180` ne sont donc PLUS
    // jamais produits ici à partir d'un sous-ensemble équilibré seul — sauf
    // 048/098 (P1-PDF-02-F4-C), 112 (P1-PDF-02-F4-D), 044/096/176 (chantier
    // 2D-B) et 110/180 (chantier 2D-E2) lorsque TOUTES leurs composantes
    // réelles sont publiables via leurs gates respectives
    // (`gateTotal044ActifImmobiliseBrut`, `gateTotal096AvecVentilation`,
    // `gateTotal176AvecVentilation` chantier 2C ; `gateTotal110`/
    // `gateTotal180` chantier 2D-E1). Plus aucun total général n'est
    // structurellement interdit — chacun dépend uniquement de la
    // publication réelle de ses propres composantes.
    //
    // Seule EXCEPTION : la case 142 (Total I — Capitaux propres). Correction
    // P1-A (audit indépendant, asymétrie 142/137) : le calcul et le gate de
    // 142 vivent désormais entièrement dans `total-capitaux-propres.ts`
    // (couche bilan) — ce mapper se contente de projeter le résultat déjà
    // résolu, exactement comme pour 084/086/120/134/137 ci-dessus, sans
    // aucune règle métier propre. 124/126/130/131/132/140 restent
    // structurellement `non_applicable` pour une EI (inchangé) ; 137 n'en
    // fait plus partie (voir bloc dédié ci-dessus) — `checkBilanEquilibre()`
    // reste le premier gate (même garde conservatrice qu'avant cette
    // correction, non allégée), 137 INCONNU en est un second, nouveau.
    const equilibre = checkBilanEquilibre({ patrimoine });
    equilibreStatus = equilibre.status;
    const totalCapitauxPropres = resolveTotalCapitauxPropres(patrimoine, equilibre.status, equilibre.reasons);
    if (totalCapitauxPropres.status === "DISPONIBLE") {
      cases.push({
        caseId: "142",
        label: "Total I — Capitaux propres",
        value: totalCapitauxPropres.montant,
        trace: { source: "FiscalResult", path: "120 + 134 + 136 + 137 (124/126/130/131/132/140 non applicables pour une EI)", ksArtifacts: ["TRF-0032"] },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "142",
        label: "Total I — Capitaux propres",
        raison: totalCapitauxPropres.raison,
        categorie: "incoherence_modele",
      });
    }

    // Chantier 2D-E2 — total 180 (colonne NET, Total général passif).
    // Formule Cerfa : 180 = 142 + 154 + 176. 154 (Provisions pour risques et
    // charges) catégoriquement 0 pour le produit actuel (aucune provision
    // modélisée, `non_applicable` structurel) — hors composante, jamais
    // introduite dans la somme, exactement comme 010/050/060/173 le sont
    // déjà pour 044/096/176. Consomme la résolution réelle de 142
    // (`totalCapitauxPropres`, calculée juste au-dessus) et la gate 176 déjà
    // résolue plus haut + leur publication réelle dans `cases`. Ne recalcule
    // JAMAIS depuis `checkBilanEquilibre()` (`equilibre`/ses totaux locaux
    // ci-dessus servent uniquement de contrôle, jamais de source de
    // production) — uniquement une somme de feuilles publiées.
    const case142Published = cases.some((c) => c.caseId === "142");
    const case176Published = cases.some((c) => c.caseId === "176");
    const gate180 = gateTotal180(totalCapitauxPropres, gate176, case142Published, case176Published);
    if (gate180.status === "COMPOSANTES_CONNUES") {
      const composantes180 = ["142", "176"] as const;
      const total180 = sommeFeuillesPubliables(cases, composantes180);
      cases.push({
        caseId: "180",
        label: "Total général passif (I + II + III)",
        value: total180,
        trace: {
          source: "FiscalResult",
          path: traceTotalFeuilles("180", "142 + 176", composantes180, cases, {
            "142": "publié (resolveTotalCapitauxPropres)",
            "176": "publié (gateTotal176AvecVentilation)",
          }),
          ksArtifacts: ["TRF-0032"],
        },
      });
    } else {
      casesNonAlimentees.push({
        caseId: "180",
        label: "Total général passif (I + II + III)",
        raison: gate180.raison,
        categorie: "incoherence_modele",
      });
    }
  }

  // Liste "toujours bloquées" par nature (hors périmètre, non applicable EI,
  // ou tiers/totaux jamais couverts au P0) — filtrée pour ne jamais dupliquer
  // un caseId déjà traité ci-dessus par le socle patrimonial (alimenté OU
  // explicitement non-alimenté avec sa propre raison, plus précise).
  const caseIdsDejaTraites = new Set<string>([
    ...cases.map((c) => c.caseId),
    ...casesNonAlimentees.map((c) => c.caseId),
  ]);
  const toujoursBloquees: CerfaCaseNonAlimentee[] = [
    { caseId: "010", label: "Fonds commercial (brut)", raison: "Un LMNP exploite une location, pas un fonds de commerce — case sans objet par nature, colonne brut.", categorie: "non_applicable" },
    { caseId: "012", label: "Fonds commercial (net)", raison: "Un LMNP exploite une location, pas un fonds de commerce — case sans objet par nature, colonne net.", categorie: "non_applicable" },
    { caseId: "014", label: "Autres immobilisations incorporelles (brut)", raison: "Aucune immobilisation incorporelle n'est modélisée par F-010/F-014 — colonne brut.", categorie: "donnee_absente" },
    {
      caseId: "016",
      label: "Autres immobilisations incorporelles (amortissements-provisions)",
      raison:
        "Sans `rfs.patrimoine` / `BilanInputs.lignesSimples`, aucune confirmation explicite (DECLARE/NUL_CONFIRME) n'est disponible pour la colonne Amortissements-Provisions — absence ≠ zéro.",
      categorie: "donnee_absente",
    },
    { caseId: "040", label: "Immobilisations financières (brut)", raison: "Aucune immobilisation financière n'est modélisée par le produit — colonne brut.", categorie: "donnee_absente" },
    {
      caseId: "042",
      label: "Immobilisations financières (amortissements-provisions)",
      raison:
        "Sans `rfs.patrimoine` / `BilanInputs.lignesSimples`, aucune confirmation explicite (DECLARE/NUL_CONFIRME) n'est disponible pour la colonne Amortissements-Provisions — absence ≠ zéro.",
      categorie: "donnee_absente",
    },
    { caseId: "044", label: "Total I — Actif immobilisé (brut)", raison: RAISON_TOTAL_ACTIF_IMMOBILISE, categorie: "incoherence_modele" },
    {
      caseId: "048",
      label: "Total I — Actif immobilisé (amortissements-provisions)",
      raison:
        "Sans `rfs.patrimoine` ou sans gate `gateTotal048` (016 + 030 + 042 tous publiables) — jamais une somme partielle des feuilles disponibles.",
      categorie: "incoherence_modele",
    },
    { caseId: "050", label: "Stocks — matières premières, approvisionnements, en cours de production (brut)", raison: "Aucun stock dans une activité de location meublée — colonne brut.", categorie: "non_applicable" },
    { caseId: "052", label: "Stocks (net)", raison: "Aucun stock dans une activité de location meublée — colonne net.", categorie: "non_applicable" },
    { caseId: "060", label: "Marchandises (brut)", raison: "Aucune marchandise dans une activité de location meublée — colonne brut.", categorie: "non_applicable" },
    { caseId: "062", label: "Marchandises (net)", raison: "Aucune marchandise dans une activité de location meublée — colonne net.", categorie: "non_applicable" },
    { caseId: "064", label: "Avances et acomptes versés sur commandes (brut)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "066", label: "Avances et acomptes versés sur commandes (amortissements-provisions)", raison: RAISON_AMORT_066, categorie: "donnee_absente" },
    { caseId: "068", label: "Clients et comptes rattachés (brut)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "070", label: "Clients et comptes rattachés (amortissements-provisions)", raison: RAISON_AMORT_070, categorie: "donnee_absente" },
    { caseId: "072", label: "Autres créances (brut)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "074", label: "Autres créances (amortissements-provisions)", raison: RAISON_AMORT_074, categorie: "donnee_absente" },
    { caseId: "080", label: "Valeurs mobilières de placement (brut)", raison: "Non pertinent pour un LMNP réel simplifié — aucune donnée modélisée, colonne brut.", categorie: "donnee_absente" },
    {
      caseId: "082",
      label: "Valeurs mobilières de placement (amortissements-provisions)",
      raison:
        "Sans `rfs.patrimoine` / `BilanInputs.lignesSimples`, aucune confirmation explicite (DECLARE/NUL_CONFIRME) n'est disponible pour la colonne Amortissements-Provisions — absence ≠ zéro.",
      categorie: "donnee_absente",
    },
    { caseId: "084", label: "Disponibilités (brut)", raison: RAISON_TRESORERIE, categorie: "donnee_absente" },
    { caseId: "086", label: "Disponibilités (amortissements-provisions)", raison: RAISON_TRESORERIE, categorie: "donnee_absente" },
    { caseId: "092", label: "Charges constatées d'avance (brut)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "094", label: "Charges constatées d'avance (amortissements-provisions)", raison: RAISON_AMORT_094, categorie: "donnee_absente" },
    { caseId: "096", label: "Total II — Actif circulant (brut)", raison: RAISON_TOTAL_ACTIF_CIRCULANT, categorie: "incoherence_modele" },
    {
      caseId: "098",
      label: "Total II — Actif circulant (amortissements-provisions)",
      raison:
        "Sans `rfs.patrimoine` ou sans gate `gateTotal098` (066 + 070 + 074 + 082 + 086 + 094 tous publiables ; 052/062 hors périmètre LMNP non_applicable) — jamais une somme partielle.",
      categorie: "incoherence_modele",
    },
    { caseId: "110", label: "Total général actif (I + II) (brut)", raison: RAISON_TOTAL_GENERAL_ACTIF, categorie: "incoherence_modele" },
    { caseId: "112", label: "Total général actif (I + II) (amortissements-provisions)", raison: RAISON_TOTAL_GENERAL_ACTIF, categorie: "incoherence_modele" },
    { caseId: "120", label: "Capital social ou individuel", raison: RAISON_CAPITAL_INDIVIDUEL, categorie: "donnee_absente" },
    { caseId: "124", label: "Écarts de réévaluation", raison: "Régime légal de réévaluation (1976), rarissime et non modélisé.", categorie: "hors_perimetre" },
    { caseId: "126", label: "Réserve légale", raison: "Concept sociétaire (obligation des sociétés de capitaux) — sans objet pour une entreprise individuelle.", categorie: "non_applicable" },
    { caseId: "130", label: "Réserves réglementées", raison: "Concept sociétaire — sans objet pour une entreprise individuelle.", categorie: "non_applicable" },
    { caseId: "131", label: "Autres réserves — dont réserve relative à l'achat d'œuvres originales d'artistes vivants", raison: "Concept sociétaire — sans objet pour une entreprise individuelle.", categorie: "non_applicable" },
    { caseId: "132", label: "Autres réserves", raison: "Concept sociétaire — sans objet pour une entreprise individuelle.", categorie: "non_applicable" },
    {
      caseId: "134",
      label: "Report à nouveau",
      raison:
        "Concept comptable (cumul des résultats non distribués des exercices antérieurs) distinct du déficit fiscal reportable de F-006 (fiscalResult.stocks.deficits/deficitsImputes) — les confondre serait une erreur, comme documenté pour les cases 352/354 du 2033-D (Cycle 34). Aucune vraie source comptable n'existe dans le modèle actuel.",
      categorie: "incoherence_modele",
    },
    { caseId: "137", label: "Subventions d'investissement", raison: "Aucune subvention n'est modélisée par le produit.", categorie: "donnee_absente" },
    { caseId: "140", label: "Provisions réglementées", raison: "Aucune provision n'est modélisée — cohérent avec l'audit du 2033-D (Cycle 34).", categorie: "non_applicable" },
    { caseId: "142", label: "Total I — Capitaux propres", raison: RAISON_TOTAL_CAPITAUX_PROPRES, categorie: "incoherence_modele" },
    { caseId: "154", label: "Provisions pour risques et charges — Total II", raison: "Aucune provision n'est modélisée — cohérent avec l'audit du 2033-D (Cycle 34).", categorie: "non_applicable" },
    { caseId: "164", label: "Avances et acomptes reçus sur commandes en cours", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "166", label: "Fournisseurs et comptes rattachés", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "172", label: "Dettes fiscales et sociales", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "173", label: "Comptes courants d'associés", raison: "Concept sociétaire — sans objet pour une entreprise individuelle.", categorie: "non_applicable" },
    { caseId: "174", label: "Produits constatés d'avance", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "175", label: "Autres dettes", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "176", label: "Total III — Dettes", raison: RAISON_TOTAL_DETTES, categorie: "incoherence_modele" },
    { caseId: "180", label: "Total général passif (I + II + III)", raison: RAISON_TOTAL_GENERAL_PASSIF, categorie: "incoherence_modele" },
  ];
  casesNonAlimentees.push(...toujoursBloquees.filter((c) => !caseIdsDejaTraites.has(c.caseId)));

  return {
    formId: "2033-A-SD",
    millésime: rfs.exercice,
    cases,
    casesNonAlimentees,
    equilibreStatus,
  };
}
