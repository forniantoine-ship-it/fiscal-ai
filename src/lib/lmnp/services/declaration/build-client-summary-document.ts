import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { FiscalResult, StockDeficit } from "@/runtime/capabilities/f006/types";

/**
 * Document client 149 € — synthèse fiscale + aide à la déclaration 2042-C-PRO.
 *
 * Construit depuis la RFS (`rfs.identite` / `rfs.fiscalResult`) : aucune
 * lecture d'assistant (F-012/F-013/F-014/…), aucun recalcul fiscal. Chaque
 * montant fiscal de ce document est une restitution directe d'un champ déjà
 * calculé par F-006 — voir `build-client-summary-document.test.ts` pour la
 * preuve. Les seules opérations arithmétiques de ce fichier sont des
 * agrégations d'affichage pures (somme d'une liste déjà calculée, tri par
 * montant) — jamais une règle fiscale nouvelle. Chacune est commentée à
 * l'endroit où elle apparaît.
 *
 * Exception d'affichage P1-4B : `activityStartDate` (F-009, début d'activité)
 * est lue en option hors RFS, uniquement pour décider si la case 5CD doit
 * inviter à un report. Ce n'est pas un calcul fiscal, et ce n'est jamais
 * `dateMiseEnService`.
 *
 * Séparation volontaire : cette fonction produit une représentation
 * structurée et testable ; `render-aide-2042-pdf.ts` dispose `aide2042`
 * en PDF client. Aucune logique métier dans le renderer.
 */

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export type ClientSummaryResultatPrincipal =
  | { nature: "benefice"; montant: number }
  | { nature: "deficit"; montant: number };

/**
 * Catégorisation d'affichage pure, dérivée du code de case lui-même — jamais d'une règle fiscale nouvelle (SAV-033) :
 *
 * - "a_saisir" : 5CD, 5NA, 5NY — montants à déclarer par le contribuable. 5NA = bénéfice LMNP AVANT imputation des déficits
 *   antérieurs (= 2031 7a) ; 5NY = déficit de l'exercice (= 2031 7b).
 * - "a_verifier" : 5GA à 5GJ — déficits des années antérieures NON ENCORE IMPUTÉS au début de l'exercice (stock d'OUVERTURE).
 *   Le formulaire les indique « à titre indicatif » : l'aide ne les présente jamais comme préremplies ni comme certaines.
 */
export type ClientSummaryCase2042Categorie = "a_saisir" | "a_verifier";

export type ClientSummaryCase2042 = {
  case: string;
  label: string;
  montant: number | string;
  categorie: ClientSummaryCase2042Categorie;
  /** Ambiguïté ou point à vérifier avant de reporter cette case — jamais masqué. */
  note?: string;
};

/**
 * Options hors RFS — données d'affichage 2042 qui n'appartiennent pas au
 * FiscalResult et que l'on ne transporte pas via l'identité 2031 (dates
 * d'exercice hardcodées 01/01–31/12, chantier distinct).
 */
export type ClientSummaryOptions = {
  /**
   * F-009 — date de début d'activité (`DeclarationDraft.activityStartDate`).
   * Sert uniquement à classer 5CD : exercice de 12 mois vs première année.
   * Jamais un nombre de mois. Distinct de `dateMiseEnService`.
   */
  activityStartDate?: string;
};

export type ClientSummaryChargeCategorie = {
  /** Clé technique F-012 (ex. "taxe_fonciere") — conservée pour traçabilité/tests. */
  categorie: string;
  label: string;
  montant: number;
};

export type ClientSummaryDocument = {
  meta: {
    exercice: number;
    identite: {
      denomination?: string;
      siren?: string;
      siret?: string;
      adresseEntreprise?: string;
      exerciceDebut?: string;
      exerciceFin?: string;
    };
    generatedAt: string;
    /** Horodatage du FiscalResult source — permet de dater la fiabilité du document. */
    sourceFiscalResultAt: string;
  };
  syntheseFiscale: {
    recettes: number;
    /** Charges déductibles de l'exercice — exclut volontairement chargesPreExploitation (voir ce champ ci-dessous). */
    chargesDeductibles: number;
    /**
     * P0-3b — restitution directe de fiscalResult.charges.chargesPreExploitation
     * (A+B+C, TRF-0025/TRF-0030), jamais recalculée. Sans cette donnée, la
     * formation du résultat présentée au client sautait de "Charges
     * déductibles" (exercice seul) à "Résultat avant amortissement" avec un
     * signe "=" arithmétiquement faux dès que ce montant est non nul.
     * Présentée comme un total unique (le document client ne ventile jamais
     * A/B/C — cette ventilation reste une information de liasse technique,
     * cf. cases 242/264/294 du 2033-B).
     */
    chargesPreExploitation: number;
    amortissementCalcule: number;
    amortissementDeductible: number;
    amortissementReporte: number;
    resultatAvantAmortissement: number;
    /**
     * SAV-033 — bénéfice LMNP AVANT imputation des déficits antérieurs (`fiscalResult.resultatFiscalAvantDeficits`) : la valeur
     * déclarée en 2031 7a et 2042-C-PRO 5NA. `undefined` pour un FiscalResult antérieur à P0-39C (non reconstruit).
     */
    resultatAvantImputationDeficits?: number;
    /**
     * Restitution directe de fiscalResult.resultatFiscal — 0 si l'exercice est déficitaire. INFORMATION MÉTIER (résultat imposable
     * attendu APRÈS imputation des déficits antérieurs) : ce n'est PAS une case Cerfa et il n'alimente jamais 5NA (SAV-033).
     */
    resultatFiscal: number;
    /** Restitution directe de fiscalResult.deficitNouveau — 0 si l'exercice est bénéficiaire. */
    deficitFiscal: number;
    /** Ce qui doit être affiché en titre — ne vaut jamais 0 € pour un exercice déficitaire. */
    resultatPrincipal: ClientSummaryResultatPrincipal;
    /** Consommation métier du stock pendant l'exercice (`fiscalResult.deficitsImputes`) — suivi et explication, jamais une valeur déclarée. */
    deficitsAnterieursImputes: number;
    /**
     * SAV-033 — stock de déficits d'OUVERTURE (`rfs.deficitsOuverture`, transport de la source d'ouverture de F-006) : ce que les
     * cases 5GA–5GJ déclarent. `undefined` : RFS antérieure à SAV-033, ouverture non établie — jamais remplacée par la clôture.
     */
    deficitsAnterieursOuverture?: StockDeficit[];
    /** Stock APRÈS imputation (clôture, hors déficit de l'exercice courant) — suivi seulement ; devient l'ouverture de l'exercice suivant. */
    deficitsAnterieursRestants: StockDeficit[];
    /** Somme d'affichage de deficitsAnterieursRestants[].montant — pure addition, aucune règle fiscale. */
    totalDeficitsAnterieursRestants: number;
  };
  /**
   * Détail des charges par catégorie — restitution directe de
   * fiscalResult.charges.detailParCategorie (F-012, via F-006). Tableau vide
   * si cette donnée n'est pas disponible sur le dossier — jamais une
   * catégorie inventée.
   */
  chargesParCategorie: ClientSummaryChargeCategorie[];
  /** Lignes pédagogiques — chaque valeur est un fmtEur() d'un champ FiscalResult existant, aucune arithmétique nouvelle. */
  formationDuResultat: string[];
  /**
   * « Ce que nous avons calculé pour vous » — rappel de la prestation
   * réalisée. Choix de phrases parmi un ensemble fixe, sélectionnées selon
   * l'état du FiscalResult (ex. la phrase sur la limitation d'amortissement
   * n'apparaît que si une limitation a réellement eu lieu) — jamais un texte
   * générique sans rapport avec le dossier, jamais un nouveau calcul.
   */
  travailEffectue: string[];
  aide2042: {
    cases: ClientSummaryCase2042[];
    /**
     * SAV-033 — ESTIMATION d'information, distincte des montants à déclarer : jamais une case. Ne remplace aucune valeur
     * déclarative (5NA, 5NY, 5GA–5GJ).
     */
    estimation: {
      /** Déficits antérieurs consommés cette année (`fiscalResult.deficitsImputes`). */
      deficitImpute: number;
      /** Résultat imposable attendu après imputation (`fiscalResult.resultatFiscal`). */
      resultatImposableAttendu: number;
      /** Stock de déficits après imputation (clôture, avec le déficit de l'exercice s'il existe). */
      stockRestantApresImputation: StockDeficit[];
      totalStockRestantApresImputation: number;
    };
    /** Instruction pour les cases "a_saisir" (5CD, 5NA, 5NY). N'affirme aucun préremplissage. */
    instructionASaisir: string;
    /** Instruction pour les cases "a_verifier" (5GA–5GJ) : cases « communiquées à titre indicatif » par le formulaire. */
    instructionAVerifier: string;
    /** P2-1 — que faire si la case à vérifier est vide ou diffère du montant indiqué. */
    instructionAVerifierDivergence: string;
    /** Toutes les ambiguïtés signalées par les cases ci-dessus, regroupées pour affichage. */
    ambiguites: string[];
  };
  avertissements: {
    perimetreDocument: string;
    statutEdi: string;
    /** Pédagogique et générique — n'affirme aucun montant, n'introduit aucun calcul. */
    differenceResultatTresorerie: string;
    /**
     * P1-3 — présent uniquement si `fr.stocks.deficitsExpires` (F-006) contient
     * au moins une entrée : un ou plusieurs déficits ont dépassé la limite
     * légale de report de 10 ans (art. 156 I 1° ter du CGI) et ne sont plus
     * disponibles pour une imputation future. Restitution directe des
     * millésimes/montants déjà calculés par F-006 — aucun recalcul, jamais
     * une expiration inventée.
     */
    deficitsExpires?: string;
  };
};

/**
 * Cycle 28 (correction P0) — `fr.stocks.deficits` (F-006) porte, pour un
 * exercice déficitaire, le déficit de CET exercice au même titre que les
 * déficits vraiment antérieurs (cf. `apply-amortissement-stocks.ts` :
 * `{ millesime: input.exercice, montant: deficitNouveau }` est ajouté au
 * stock). Ce n'est pas une erreur de F-006 — c'est le stock à reporter aux
 * exercices SUIVANTS. Mais pour CE document (l'exercice courant), le déficit
 * de l'année est déjà présenté en 5NY : le compter aussi en 5GA-5GJ le
 * dupliquerait sous une fausse étiquette « antérieur ». On exclut donc
 * systématiquement l'entrée dont le millésime est celui de l'exercice en
 * cours — jamais retiré de `FiscalResult` lui-même, uniquement de ce qui est
 * présenté ici comme « antérieur ». Cette fonction reste la source unique de
 * cette distinction — utilisée à la fois par le tableau 2042 et par
 * `syntheseFiscale`, jamais recalculée séparément à deux endroits.
 */
function deficitsVraimentAnterieurs(fr: FiscalResult): StockDeficit[] {
  return fr.stocks.deficits.filter((deficit) => deficit.millesime !== fr.exercice);
}

/**
 * P1-4A — correspondance Cerfa 2042-C-PRO, cases 5GA à 5GJ.
 *
 * Fenêtre glissante de 10 ans : N-10 → 5GA … N-1 → 5GJ. Les codes de case
 * sont stables ; les millésimes imprimés sur le formulaire avancent d'un an
 * à chaque campagne. Jamais une table d'années figée.
 *
 * Sources (audit P1-4) : Cerfa 2042-C-PRO n° 11222*28 (revenus 2025) et
 * n° 11222*27 (revenus 2024) ; brochure IR DGFiP ; CGI art. 156, I, 1° ter.
 * Aucun calcul fiscal : projection d'affichage d'un millésime déjà porté
 * par F-006. `undefined` hors fenêtre (exercice courant, expiré, ou millésime
 * non reportable) — jamais une case inventée.
 */
const DEFICIT_2042_CASE_LETTERS = "ABCDEFGHIJ";

export function get2042DeficitCase(exercice: number, millesime: number): string | undefined {
  const offset = millesime - (exercice - 10);
  if (offset < 0 || offset > 9) return undefined;
  return `5G${DEFICIT_2042_CASE_LETTERS[offset]}`;
}

/**
 * P1-4B — 5CD se remplit seulement si l'exercice dure moins de 12 mois
 * (Cerfa : « nombre de mois si inférieur à 12 »). Un départ au 1er janvier
 * de l'exercice est un exercice complet : on n'invite pas à renseigner.
 * Aucun comptage de mois (UNKNOWN pour un départ en cours de mois).
 * Exception saisonnière : non détectée (donnée absente du dossier).
 */
function classifyExerciceDuration(
  activityStartDate: string | undefined,
  exercice: number,
): "full" | "partial" | "unknown" {
  if (!activityStartDate) return "unknown";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(activityStartDate.trim());
  if (!match) return "unknown";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < exercice) return "full";
  if (year === exercice && month === 1 && day === 1) return "full";
  if (year === exercice) return "partial";
  return "unknown";
}

function buildCase5CD(activityStartDate: string | undefined, exercice: number): ClientSummaryCase2042 {
  const classification = classifyExerciceDuration(activityStartDate, exercice);
  const label = "Durée de l'exercice (nombre de mois si inférieur à 12)";

  if (classification === "full") {
    return {
      case: "5CD",
      label,
      montant: "Ne pas renseigner (exercice de 12 mois)",
      categorie: "a_saisir",
    };
  }

  if (classification === "partial") {
    return {
      case: "5CD",
      label,
      montant: "À vérifier",
      categorie: "a_saisir",
      note: "À vérifier : la durée de l'exercice est inférieure à 12 mois ; renseignez la case 5CD selon votre situation.",
    };
  }

  return {
    case: "5CD",
    label,
    montant: "À vérifier",
    categorie: "a_saisir",
    note: "La date de début d'activité n'est pas connue. Ne renseignez la case 5CD que si votre exercice a duré moins de 12 mois.",
  };
}

/**
 * P1-3 — restitution pure de `fr.stocks.deficitsExpires` (F-006,
 * `expireDeficits()`) sous forme d'un avertissement lisible. Aucun recalcul :
 * la liste des déficits expirés et leur montant sont déjà déterminés par
 * F-006 selon la règle des 10 ans (art. 156, I, 1° ter du CGI, vérifiée en
 * P1-3) ; cette fonction ne fait que les mettre en phrase. `undefined`
 * lorsqu'aucun déficit n'a expiré cette année — jamais une alerte inventée.
 */
function buildDeficitsExpiresAvertissement(fr: FiscalResult): string | undefined {
  const expires = fr.stocks.deficitsExpires;
  if (!expires || expires.length === 0) return undefined;

  const pluriel = expires.length > 1;
  const detail = expires
    .map((d) => `exercice ${d.millesime} (${fmtEur(d.montant)})`)
    .join(", ");

  return (
    `${pluriel ? "Les déficits suivants ont" : "Le déficit suivant a"} dépassé la limite légale de ` +
    `report de 10 ans (article 156, I, 1° ter du CGI) et ${pluriel ? "ne sont" : "n'est"} plus ` +
    `disponible${pluriel ? "s" : ""} pour une imputation sur vos bénéfices futurs : ${detail}.`
  );
}

/**
 * Libellés français des catégories F-012 (`ChargeCategorie`, connues via
 * `fiscalResult.charges.detailParCategorie`, qui n'est typé que comme
 * `Partial<Record<string, number>>` au niveau F-006/RFS). Purement du texte
 * d'affichage — aucune règle fiscale. Une clé absente de cette liste (nouvelle
 * catégorie F-012 non encore répercutée ici) est affichée humanisée plutôt que
 * masquée, pour ne jamais faire disparaître silencieusement une charge.
 */
const CHARGE_CATEGORY_LABELS: Record<string, string> = {
  taxe_fonciere: "Taxe foncière",
  assurance_pno: "Assurance propriétaire non occupant",
  assurance_gli: "Assurance loyers impayés",
  copropriete: "Charges de copropriété",
  honoraires_gestion: "Honoraires de gestion locative",
  travaux: "Travaux et réparations",
  honoraires_comptable: "Honoraires comptables",
  frais_bancaires: "Frais bancaires",
  divers: "Autres charges",
};

function humanizeUnknownCategorie(categorie: string): string {
  return categorie.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * P0-4.1 — `fr.charges.detailParCategorie` (F-012, `ChargesAssistantOutput.
 * parCategorie`) ne couvre que les charges d'exploitation ; `chargesFinancement`
 * (F-011 — intérêts et assurance d'emprunt de l'exercice) n'a jamais de
 * catégorie possible dans `ChargeCategorie` et n'apparaissait donc dans aucune
 * ligne de ce détail, alors qu'il est déjà inclus dans `chargesDeductibles`
 * (`fr.charges.totalDeductible = chargesExploitation + chargesFinancement`).
 * Un client sommant ce tableau obtenait donc un total inférieur à celui
 * annoncé plus haut dans le document, sans explication. Restitution directe
 * de `fr.charges.chargesFinancement` — jamais recalculé, jamais ventilé en
 * intérêts/assurance séparés (cette ventilation reste une information de
 * liasse technique, cases 242/294 du 2033-B — voir P0-3a.2). Absente si nulle,
 * comme les autres catégories déjà filtrées à `> 0` ci-dessous.
 */
const CHARGES_FINANCEMENT_CATEGORIE = "financement_emprunt";
const CHARGES_FINANCEMENT_LABEL = "Intérêts et assurance d'emprunt";

/** Restitution triée par montant décroissant (tri d'affichage, pas une règle fiscale) des charges par catégorie déjà calculées par F-012/F-006/F-011. */
function buildChargesParCategorie(fr: FiscalResult): ClientSummaryChargeCategorie[] {
  const detail = fr.charges.detailParCategorie;
  const lignes: ClientSummaryChargeCategorie[] = detail
    ? Object.entries(detail)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
        .map(([categorie, montant]) => ({
          categorie,
          label: CHARGE_CATEGORY_LABELS[categorie] ?? humanizeUnknownCategorie(categorie),
          montant,
        }))
    : [];

  if (fr.charges.chargesFinancement > 0) {
    lignes.push({
      categorie: CHARGES_FINANCEMENT_CATEGORIE,
      label: CHARGES_FINANCEMENT_LABEL,
      montant: fr.charges.chargesFinancement,
    });
  }

  return lignes.sort((a, b) => b.montant - a.montant);
}

function buildCases2042(
  rfs: FiscalRepresentation,
  isDeficit: boolean,
  activityStartDate?: string,
): ClientSummaryCase2042[] {
  const fr = rfs.fiscalResult;
  const cases: ClientSummaryCase2042[] = [];

  cases.push(buildCase5CD(activityStartDate, fr.exercice));

  if (isDeficit) {
    cases.push({
      case: "5NY",
      label: "Déficit — locations meublées non professionnelles, régime réel, cas général",
      montant: fr.deficitNouveau,
      categorie: "a_saisir",
    });
  } else if (typeof fr.resultatFiscalAvantDeficits === "number" && Number.isFinite(fr.resultatFiscalAvantDeficits)) {
    // SAV-033 — 5NA = bénéfice AVANT imputation des déficits antérieurs (= 2031 7a), jamais `resultatFiscal` (après imputation).
    cases.push({
      case: "5NA",
      label: "Bénéfice avant imputation des déficits antérieurs — locations meublées non professionnelles, régime réel, cas général",
      montant: fr.resultatFiscalAvantDeficits,
      categorie: "a_saisir",
    });
  } else {
    // FiscalResult antérieur à P0-39C : le bénéfice avant imputation n'est pas établi — jamais substitué par `resultatFiscal`.
    cases.push({
      case: "5NA",
      label: "Bénéfice avant imputation des déficits antérieurs — locations meublées non professionnelles, régime réel, cas général",
      montant: "À vérifier",
      categorie: "a_saisir",
      note: "Le bénéfice avant imputation des déficits antérieurs n'a pas pu être établi à partir de ce dossier : il doit être recalculé avant de renseigner la case 5NA.",
    });
  }

  // SAV-033 — 5GA–5GJ = déficits des années antérieures NON ENCORE IMPUTÉS au début de l'exercice : stock d'OUVERTURE transporté
  // par la RFS (source d'ouverture de F-006), jamais le stock de clôture après imputation.
  const opening = rfs.deficitsOuverture;
  if (opening) {
    const ordered = [...opening.deficits].sort((a, b) => a.millesime - b.millesime);
    for (const deficit of ordered) {
      if (!(deficit.montant > 0)) continue;
      const caseId = get2042DeficitCase(fr.exercice, deficit.millesime);
      if (!caseId) continue;
      cases.push({
        case: caseId,
        label: `Déficit antérieur non encore imputé au début de l'exercice (exercice ${deficit.millesime})`,
        montant: deficit.montant,
        categorie: "a_verifier",
      });
    }
  } else if (deficitsVraimentAnterieurs(fr).length > 0 || fr.deficitsImputes > 0) {
    // Ouverture non établie alors que des déficits antérieurs existent : jamais le stock de clôture à la place.
    cases.push({
      case: "5GA–5GJ",
      label: "Déficits des années antérieures non encore imputés au début de l'exercice",
      montant: "Non disponible",
      categorie: "a_verifier",
      note: "Le stock de déficits au début de l'exercice n'est pas disponible dans ce dossier : il ne peut pas être déduit du stock de clôture. Reportez-vous à votre déclaration de l'année précédente.",
    });
  }

  return cases;
}

function buildFormationDuResultat(fr: FiscalResult, isDeficit: boolean): string[] {
  const avantImputation = fr.resultatFiscalAvantDeficits;
  const lignes: string[] = [
    `Recettes de l'activité : ${fmtEur(fr.recettes.total)}`,
    `Charges déductibles de l'exercice : ${fmtEur(fr.charges.totalDeductible)}`,
  ];

  // P0-3b — sans cette ligne, "Charges déductibles" (exercice seul) suivie de
  // "= Résultat avant amortissement" affichait une équation arithmétiquement
  // fausse dès que ce montant est non nul (fiscalResult.resultatAvantAmort,
  // TRF-0030, déduit aussi chargesPreExploitation). Restitution directe,
  // jamais recalculée ; masquée à 0 comme les lignes conditionnelles
  // ci-dessous (amortReporte, deficitsImputes). Total unique A+B+C — jamais
  // ventilé ici (ventilation Cerfa 242/264/294 : information de liasse
  // technique, hors document client).
  if (fr.charges.chargesPreExploitation > 0) {
    lignes.push(`Charges déductibles de pré-exploitation : ${fmtEur(fr.charges.chargesPreExploitation)}`);
  }

  lignes.push(
    `= Résultat avant amortissement : ${fmtEur(fr.resultatAvantAmort)}`,
    `Amortissement calculé sur l'exercice : ${fmtEur(fr.amortCalcule)}`,
  );

  if (fr.amortDeduct < fr.amortCalcule) {
    lignes.push(
      `Amortissement déductible cette année, limité par l'article 39 C du CGI : ${fmtEur(fr.amortDeduct)}`,
    );
  } else {
    lignes.push(`Amortissement déductible cette année : ${fmtEur(fr.amortDeduct)}`);
  }

  if (fr.amortNonDeduitExercice > 0) {
    lignes.push(
      `Amortissement non déduit cette année, reporté sans limite de durée (art. 39 C du CGI) : ${fmtEur(fr.amortNonDeduitExercice)}`,
    );
  }

  if (isDeficit) {
    lignes.push(`= Déficit fiscal de l'exercice (case 5NY) : ${fmtEur(fr.deficitNouveau)}`);
    return lignes;
  }

  // SAV-033 — le montant déclaré en 5NA est le bénéfice AVANT imputation des déficits antérieurs ; l'imputation et le résultat
  // imposable qui en découle sont une ESTIMATION d'information, jamais des cases.
  if (typeof avantImputation === "number" && Number.isFinite(avantImputation)) {
    lignes.push(`= Bénéfice avant imputation des déficits antérieurs (case 5NA) : ${fmtEur(avantImputation)}`);
  }
  if (fr.deficitsImputes > 0) {
    lignes.push(`Estimation — déficits antérieurs imputés sur ce bénéfice (ne se saisit pas) : ${fmtEur(fr.deficitsImputes)}`);
  }
  lignes.push(`Estimation — résultat imposable attendu après imputation (ne se saisit pas) : ${fmtEur(fr.resultatFiscal)}`);

  return lignes;
}

/**
 * Rappel de la prestation réalisée, adapté au dossier — chaque phrase n'est
 * ajoutée que si le fait qu'elle décrit s'est réellement produit dans ce
 * FiscalResult (ex. la limitation d'amortissement n'est mentionnée que si
 * `amortNonDeduitExercice > 0`). Pur choix parmi des phrases fixes, aucun calcul.
 */
function buildTravailEffectue(fr: FiscalResult, isDeficit: boolean): string[] {
  const lignes: string[] = [
    "Vos recettes locatives ont été analysées.",
    "Vos charges déductibles ont été prises en compte, catégorie par catégorie.",
    "L'amortissement de votre bien et de son mobilier a été calculé selon les règles du régime réel LMNP.",
  ];

  if (fr.amortNonDeduitExercice > 0) {
    lignes.push(
      "La limitation de la déduction de l'amortissement (article 39 C du CGI) a été appliquée et le surplus a été mis en report.",
    );
  }

  if (fr.deficitsImputes > 0 || deficitsVraimentAnterieurs(fr).length > 0) {
    lignes.push("Vos déficits des exercices précédents ont été pris en compte dans ce calcul.");
  }

  lignes.push(
    isDeficit
      ? "Votre déficit fiscal de l'exercice a été déterminé."
      : "Votre résultat fiscal de l'exercice a été déterminé.",
  );
  lignes.push(
    "Les informations utiles à votre déclaration personnelle ont été regroupées dans ce document, prêtes à être vérifiées et reportées.",
  );

  return lignes;
}

export function buildClientSummaryDocument(
  rfs: FiscalRepresentation,
  options?: ClientSummaryOptions,
): ClientSummaryDocument {
  const fr = rfs.fiscalResult;
  const isDeficit = fr.deficitNouveau > 0;

  // SAV-033 — le montant mis en avant pour un bénéfice est celui qui se DÉCLARE (avant imputation des déficits antérieurs, = 5NA).
  // FiscalResult antérieur à P0-39C (scalaire absent) : repli d'affichage sur `resultatFiscal`, la case 5NA étant alors « À vérifier ».
  const beneficeDeclare =
    typeof fr.resultatFiscalAvantDeficits === "number" && Number.isFinite(fr.resultatFiscalAvantDeficits)
      ? fr.resultatFiscalAvantDeficits
      : fr.resultatFiscal;
  const resultatPrincipal: ClientSummaryResultatPrincipal = isDeficit
    ? { nature: "deficit", montant: fr.deficitNouveau }
    : { nature: "benefice", montant: beneficeDeclare };

  const cases = buildCases2042(rfs, isDeficit, options?.activityStartDate);
  const deficitsAnterieursRestants = deficitsVraimentAnterieurs(fr);

  return {
    meta: {
      exercice: rfs.exercice,
      identite: {
        denomination: rfs.identite.denomination,
        siren: rfs.identite.siren,
        siret: rfs.identite.siret,
        adresseEntreprise: rfs.identite.adresseEntreprise,
        exerciceDebut: rfs.identite.exerciceDebut,
        exerciceFin: rfs.identite.exerciceFin,
      },
      generatedAt: new Date().toISOString(),
      sourceFiscalResultAt: fr.trace.computedAt,
    },
    syntheseFiscale: {
      recettes: fr.recettes.total,
      chargesDeductibles: fr.charges.totalDeductible,
      chargesPreExploitation: fr.charges.chargesPreExploitation,
      amortissementCalcule: fr.amortCalcule,
      amortissementDeductible: fr.amortDeduct,
      // STOCK FINAL à clôture (≠ mouvement annuel — cf. amortNonDeduitExercice / case 318).
      amortissementReporte: fr.amortReporte,
      resultatAvantAmortissement: fr.resultatAvantAmort,
      ...(typeof fr.resultatFiscalAvantDeficits === "number" && Number.isFinite(fr.resultatFiscalAvantDeficits)
        ? { resultatAvantImputationDeficits: fr.resultatFiscalAvantDeficits }
        : {}),
      resultatFiscal: fr.resultatFiscal,
      deficitFiscal: fr.deficitNouveau,
      resultatPrincipal,
      deficitsAnterieursImputes: fr.deficitsImputes,
      ...(rfs.deficitsOuverture ? { deficitsAnterieursOuverture: rfs.deficitsOuverture.deficits } : {}),
      deficitsAnterieursRestants,
      // Somme d'affichage — addition simple de montants déjà calculés par F-006, aucune règle fiscale nouvelle.
      totalDeficitsAnterieursRestants: deficitsAnterieursRestants.reduce((total, d) => total + d.montant, 0),
    },
    chargesParCategorie: buildChargesParCategorie(fr),
    formationDuResultat: buildFormationDuResultat(fr, isDeficit),
    travailEffectue: buildTravailEffectue(fr, isDeficit),
    aide2042: {
      cases,
      estimation: {
        deficitImpute: fr.deficitsImputes,
        resultatImposableAttendu: fr.resultatFiscal,
        stockRestantApresImputation: fr.stocks.deficits,
        totalStockRestantApresImputation: fr.stocks.deficits.reduce((total, d) => total + d.montant, 0),
      },
      // SAV-033 — aucune affirmation de préremplissage : seule la vérification de ce qui figure déjà dans la déclaration est demandée.
      instructionASaisir:
        "Ces montants se reportent dans votre déclaration 2042-C-PRO. Avant de valider, vérifiez ce qui y figure déjà.",
      // Le formulaire 2042-C-PRO indique que les cases 5GA à 5GI sont « communiquées uniquement à titre indicatif ».
      instructionAVerifier:
        "Ces cases peuvent déjà être renseignées à titre indicatif (indication portée par le formulaire). Vérifiez qu'elles correspondent aux déficits des années précédentes non encore imputés au début de cet exercice.",
      instructionAVerifierDivergence:
        "Si le montant est différent ou absent, vérifiez la situation avant de valider votre déclaration.",
      ambiguites: cases.filter((c) => c.note).map((c) => c.note as string),
    },
    avertissements: {
      perimetreDocument:
        "Ce document est une synthèse de votre exercice fiscal et une aide à votre déclaration personnelle. Il ne constitue ni la liasse fiscale officielle, ni l'accusé de réception de la télétransmission EDI, ni une preuve d'acceptation de votre déclaration par l'administration fiscale.",
      statutEdi:
        "Transmission EDI : les éléments nécessaires à la transmission sont préparés. Le statut de transmission et le retour de l'administration seront disponibles séparément.",
      differenceResultatTresorerie:
        "Votre résultat fiscal n'est pas votre trésorerie disponible. L'amortissement, par exemple, réduit votre résultat fiscal sans correspondre à une dépense décaissée cette année ; à l'inverse, le remboursement du capital de votre emprunt représente une sortie de trésorerie qui n'est pas déductible fiscalement. Il est donc normal que ce résultat diffère de votre solde bancaire ou de votre résultat comptable.",
      deficitsExpires: buildDeficitsExpiresAvertissement(fr),
    },
  };
}
