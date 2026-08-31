import type { FiscalRepresentation } from "../types";
import type { CaseTrace, CerfaCase } from "../../f007/types";
import { round2 } from "../../f007/types";

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

export function map2033AFromRfs(rfs: FiscalRepresentation): Form2033A {
  const fr = rfs.fiscalResult;
  const immo = rfs.immobilisations;
  const baseTrace: Omit<CaseTrace, "path"> = { source: "FiscalResult", ksArtifacts: ["TRF-0032"] };

  const cases: CerfaCase[] = [];
  const casesNonAlimentees: CerfaCaseNonAlimentee[] = [];

  // Case 136 — Résultat de l'exercice. Même valeur, même formule que la case
  // 310 du 2033-B (Cycle 32/33) : référencée, jamais recalculée.
  const resultatExercice = round2(fr.resultatAvantAmort - fr.amortCalcule - fr.charges.totalNonDeductible);
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

  // Case 156 — Emprunts et dettes assimilées. Somme de valeurs déjà produites
  // par F-011 (capitalRestantDu31_12 par prêt) — projection de présentation,
  // aucun solde recalculé.
  if (rfs.emprunts !== undefined) {
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
  const amortissementDivergent =
    immo !== undefined && Math.abs(round2(fr.amortCalcule - immo.totalAnnuelExercice)) > 0.01;

  if (immo !== undefined && typeof immo.valeurTerrain === "number" && !amortissementDivergent) {
    const brut = round2(immo.totalBrut + immo.valeurTerrain);
    const amortissementsCumules = round2(immo.lignes.reduce((acc, l) => acc + l.amortissementsCumules, 0));
    const net = round2(brut - amortissementsCumules);

    cases.push({
      caseId: "028",
      label: "Immobilisations corporelles (brut)",
      value: brut,
      trace: {
        source: "FiscalResult",
        path: "rfs.immobilisations.totalBrut + rfs.immobilisations.valeurTerrain",
        ksArtifacts: ["TRF-0032"],
      },
    });
    cases.push({
      caseId: "030",
      label: "Immobilisations corporelles (net)",
      value: net,
      trace: {
        source: "FiscalResult",
        path: "(rfs.immobilisations.totalBrut + rfs.immobilisations.valeurTerrain) − Σ rfs.immobilisations.lignes[].amortissementsCumules (projection de présentation ; le terrain n'est jamais amorti)",
        ksArtifacts: ["TRF-0032"],
      },
    });
  } else if (immo !== undefined && typeof immo.valeurTerrain === "number" && amortissementDivergent) {
    for (const [caseId, suffixe] of [["028", "brut"], ["030", "net"]] as const) {
      casesNonAlimentees.push({
        caseId,
        label: `Immobilisations corporelles (${suffixe})`,
        raison:
          "fiscalResult.amortCalcule (F-014, source fiscale autoritaire, inclut d'éventuels composantsNouveaux issus de F-012) diverge de rfs.immobilisations.totalAnnuelExercice (F-010 seul, qui ne reçoit jamais ces composants nouveaux). Cette divergence prouve que rfs.immobilisations est incomplet pour ce dossier — au moins un élément amortissable (travaux réintégrés en immobilisation) existe sans que son coût brut ne soit reflété dans totalBrut. Produire 028/030 depuis F-010 seul sous-évaluerait silencieusement le bilan ; aucune reconstruction de la part manquante n'est tentée ici.",
        categorie: "incoherence_modele",
      });
    }
  } else if (immo !== undefined) {
    for (const [caseId, suffixe] of [["028", "brut"], ["030", "net"]] as const) {
      casesNonAlimentees.push({
        caseId,
        label: `Immobilisations corporelles (${suffixe})`,
        raison:
          "rfs.immobilisations est présent mais sans valeurTerrain (dossier ou fixture antérieur à l'exposition de cette donnée, Cycle 35) — produire un brut/net sans le terrain sous-évaluerait silencieusement la valeur réelle plutôt que de signaler l'absence.",
        categorie: "donnee_absente",
      });
    }
  } else {
    for (const [caseId, suffixe] of [["028", "brut"], ["030", "net"]] as const) {
      casesNonAlimentees.push({
        caseId,
        label: `Immobilisations corporelles (${suffixe})`,
        raison: "rfs.immobilisations est absent — aucun plan d'amortissement disponible pour ce dossier (F-010 non encore exécuté ou non persisté).",
        categorie: "donnee_absente",
      });
    }
  }

  casesNonAlimentees.push(
    { caseId: "010", label: "Fonds commercial (brut)", raison: "Un LMNP exploite une location, pas un fonds de commerce — case sans objet par nature, colonne brut.", categorie: "non_applicable" },
    { caseId: "012", label: "Fonds commercial (net)", raison: "Un LMNP exploite une location, pas un fonds de commerce — case sans objet par nature, colonne net.", categorie: "non_applicable" },
    { caseId: "014", label: "Autres immobilisations incorporelles (brut)", raison: "Aucune immobilisation incorporelle n'est modélisée par F-010/F-014 — colonne brut.", categorie: "donnee_absente" },
    { caseId: "016", label: "Autres immobilisations incorporelles (net)", raison: "Aucune immobilisation incorporelle n'est modélisée par F-010/F-014 — colonne net.", categorie: "donnee_absente" },
    { caseId: "040", label: "Immobilisations financières (brut)", raison: "Aucune immobilisation financière n'est modélisée par le produit — colonne brut.", categorie: "donnee_absente" },
    { caseId: "042", label: "Immobilisations financières (net)", raison: "Aucune immobilisation financière n'est modélisée par le produit — colonne net.", categorie: "donnee_absente" },
    { caseId: "044", label: "Total I — Actif immobilisé (brut)", raison: RAISON_TOTAL_ACTIF_IMMOBILISE, categorie: "incoherence_modele" },
    { caseId: "048", label: "Total I — Actif immobilisé (net)", raison: RAISON_TOTAL_ACTIF_IMMOBILISE, categorie: "incoherence_modele" },
    { caseId: "050", label: "Stocks — matières premières, approvisionnements, en cours de production (brut)", raison: "Aucun stock dans une activité de location meublée — colonne brut.", categorie: "non_applicable" },
    { caseId: "052", label: "Stocks (net)", raison: "Aucun stock dans une activité de location meublée — colonne net.", categorie: "non_applicable" },
    { caseId: "060", label: "Marchandises (brut)", raison: "Aucune marchandise dans une activité de location meublée — colonne brut.", categorie: "non_applicable" },
    { caseId: "062", label: "Marchandises (net)", raison: "Aucune marchandise dans une activité de location meublée — colonne net.", categorie: "non_applicable" },
    { caseId: "064", label: "Avances et acomptes versés sur commandes (brut)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "066", label: "Avances et acomptes versés sur commandes (net)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "068", label: "Clients et comptes rattachés (brut)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "070", label: "Clients et comptes rattachés (net)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "072", label: "Autres créances (brut)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "074", label: "Autres créances (net)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "080", label: "Valeurs mobilières de placement (brut)", raison: "Non pertinent pour un LMNP réel simplifié — aucune donnée modélisée, colonne brut.", categorie: "donnee_absente" },
    { caseId: "082", label: "Valeurs mobilières de placement (net)", raison: "Non pertinent pour un LMNP réel simplifié — aucune donnée modélisée, colonne net.", categorie: "donnee_absente" },
    { caseId: "084", label: "Disponibilités (brut)", raison: RAISON_TRESORERIE, categorie: "donnee_absente" },
    { caseId: "086", label: "Disponibilités (net)", raison: RAISON_TRESORERIE, categorie: "donnee_absente" },
    { caseId: "092", label: "Charges constatées d'avance (brut)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "094", label: "Charges constatées d'avance (net)", raison: RAISON_TIERS_ABSENTS, categorie: "donnee_absente" },
    { caseId: "096", label: "Total II — Actif circulant (brut)", raison: RAISON_TOTAL_ACTIF_CIRCULANT, categorie: "incoherence_modele" },
    { caseId: "098", label: "Total II — Actif circulant (net)", raison: RAISON_TOTAL_ACTIF_CIRCULANT, categorie: "incoherence_modele" },
    { caseId: "110", label: "Total général actif (I + II) (brut)", raison: RAISON_TOTAL_GENERAL_ACTIF, categorie: "incoherence_modele" },
    { caseId: "112", label: "Total général actif (I + II) (net)", raison: RAISON_TOTAL_GENERAL_ACTIF, categorie: "incoherence_modele" },
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
  );

  return {
    formId: "2033-A-SD",
    millésime: rfs.exercice,
    cases,
    casesNonAlimentees,
  };
}
