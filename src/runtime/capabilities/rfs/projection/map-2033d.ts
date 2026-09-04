import type { FiscalRepresentation } from "../types";

/**
 * Projection Cerfa 2033-D-SD (Relevé des provisions, amortissements
 * dérogatoires, déficits reportables) — P3-LIASSE-1A, socle minimal honnête.
 *
 * SAV-029 (source DGFiP Notice n° 2033-NOT-SD, BOFiP BOI-BIC-DECLA-30-20-10) :
 * ce formulaire est obligatoire pour toute entreprise individuelle LMNP au
 * régime réel simplifié, sans condition de chiffre d'affaires — mais son
 * contenu, pour ce régime précis (IR), est structurellement quasi-nul :
 *
 * 1. Provisions — aucune provision n'est modélisée par F-006/F-010/F-011/
 *    F-012/F-013/F-014, constat déjà établi et déjà reflété dans le 2033-A-SD
 *    (cases 140/154, "cohérent avec l'audit du 2033-D — Cycle 34", voir
 *    map-2033a.ts). Ce mapper reprend exactement la même conclusion, jamais
 *    une seconde source de vérité.
 *
 * 2. Amortissements dérogatoires — mécanisme distinguant un amortissement
 *    comptable d'un amortissement fiscal accéléré. F-006/F-014 ne calculent
 *    qu'un seul amortissement (`amortCalcule`) : ce mécanisme n'est
 *    simplement pas implémenté — décision de périmètre, pas une donnée qui
 *    manquerait à un modèle qui la prévoirait.
 *
 * 3. Déficits reportables — la notice 2033-NOT-SD réserve explicitement ce
 *    cadre aux entreprises relevant de l'impôt sur les sociétés (confirmé
 *    déjà dans le code, voir map-2033b.ts, case 350 : "à la place du Cadre II
 *    du 2033-D-SD (réservé à l'IS), le montant de déficit imputé sur le
 *    bénéfice catégoriel doit être mentionné en case 350"). Un LMNP au réel
 *    simplifié relève de l'IR : ce cadre ne concerne pas notre régime par
 *    construction légale — `fiscalResult.stocks`/`deficitsImputes` restent
 *    des données F-006 valides, déjà projetées ailleurs (2033-B case 350,
 *    2042-C-PRO), jamais dupliquées ici.
 *
 * Limite explicite (P3-LIASSE-1) : l'environnement d'audit n'a pas permis de
 * lire le PDF officiel de la notice 2033-NOT-SD (aucun rendu PDF disponible)
 * pour vérifier field-by-field les numéros de case exacts propres au 2033-D.
 * Les trois identifiants ci-dessous (`2033D_CADRE_*`) sont donc des
 * identifiants de CADRE, pas des numéros de case Cerfa officiels vérifiés —
 * à la différence de "140"/"350" (2033-A/B), qui EUX sont des numéros
 * positionnellement vérifiés sur un dossier réel (cf. Cycles antérieurs).
 * Cette distinction est volontaire : mieux vaut un identifiant honnêtement
 * non numéroté qu'un numéro de case inventé qui prétendrait une précision
 * non vérifiée. Aucune valeur n'est produite dans `cases` par ce mapper —
 * seul l'existant qui a pu être démontré avec certitude (SAV-029 + les
 * citations déjà présentes dans map-2033a.ts/map-2033b.ts) est représenté.
 *
 * Conforme au principe déjà appliqué à map-2033a.ts/map-2033b.ts/
 * map-2033c.ts : consomme UNIQUEMENT la RFS, aucun appel à
 * produceFiscalResult()/applyAmortissementStocks(), aucune lecture directe
 * d'assistant F-010/F-011/F-012/F-013/F-014, aucun accès FEC, aucune
 * reconstruction comptable, aucun mécanisme de stock d'ouverture N-1 (la RFS
 * mono-exercice actuelle n'en porte aucun — ce mapper ne cherche pas à en
 * fabriquer un).
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

/** Représentation documentaire du 2033-D-SD — pas de logique fiscale, jamais de valeur inventée. */
export type Form2033D = {
  formId: "2033-D-SD";
  millésime: number;
  cases: never[];
  /** Jamais une valeur inventée : chaque cadre listé ici reste explicitement sans valeur, avec sa raison tracée. */
  casesNonAlimentees: CerfaCaseNonAlimentee[];
};

const RAISON_PROVISIONS =
  "Aucune provision n'est modélisée par F-006/F-010/F-011/F-012/F-013/F-014 — même constat déjà établi et déjà reflété dans le 2033-A-SD (cases 140/154, cohérent avec l'audit du 2033-D — Cycle 34). Ce mapper reprend cette conclusion, il ne la recalcule pas.";

const RAISON_AMORTISSEMENTS_DEROGATOIRES =
  "F-006/F-014 ne calculent qu'un seul amortissement (fiscalResult.amortCalcule) — la distinction entre amortissement comptable et amortissement fiscal accéléré (amortissements dérogatoires) n'est pas implémentée par le moteur : décision de périmètre, pas une donnée manquante à un modèle qui la prévoirait.";

const RAISON_DEFICITS_REPORTABLES =
  "La notice 2033-NOT-SD réserve ce cadre aux entreprises relevant de l'impôt sur les sociétés (confirmé dans le code, voir map-2033b.ts case 350 : pour un LMNP à l'IR, le déficit imputé sur le bénéfice catégoriel se mentionne en case 350 du 2033-B-SD, jamais sur ce cadre du 2033-D-SD). Un LMNP au réel simplifié relève de l'IR : ce cadre ne concerne pas notre régime par construction légale. fiscalResult.stocks.deficits/deficitsImputes restent des données F-006 valides, déjà projetées ailleurs (2033-B case 350, 2042-C-PRO) — jamais dupliquées ici.";

export function map2033DFromRfs(rfs: FiscalRepresentation): Form2033D {
  return {
    formId: "2033-D-SD",
    millésime: rfs.exercice,
    cases: [],
    casesNonAlimentees: [
      {
        caseId: "2033D_CADRE_PROVISIONS",
        label: "Provisions",
        raison: RAISON_PROVISIONS,
        categorie: "non_applicable",
      },
      {
        caseId: "2033D_CADRE_AMORTISSEMENTS_DEROGATOIRES",
        label: "Amortissements dérogatoires",
        raison: RAISON_AMORTISSEMENTS_DEROGATOIRES,
        categorie: "hors_perimetre",
      },
      {
        caseId: "2033D_CADRE_DEFICITS_REPORTABLES",
        label: "Déficits reportables",
        raison: RAISON_DEFICITS_REPORTABLES,
        categorie: "non_applicable",
      },
    ],
  };
}
