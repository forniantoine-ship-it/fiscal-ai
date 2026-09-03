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
 * structurée et testable ; `render-client-summary-pdf.ts` transforme
 * ensuite cette représentation en PDF. Aucune logique métier dans le renderer.
 */

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export type ClientSummaryResultatPrincipal =
  | { nature: "benefice"; montant: number }
  | { nature: "deficit"; montant: number };

export type ClientSummaryCase2042 = {
  case: string;
  label: string;
  montant: number | string;
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
    /** Restitution directe de fiscalResult.resultatFiscal — 0 si l'exercice est déficitaire. */
    resultatFiscal: number;
    /** Restitution directe de fiscalResult.deficitNouveau — 0 si l'exercice est bénéficiaire. */
    deficitFiscal: number;
    /** Ce qui doit être affiché en titre — ne vaut jamais 0 € pour un exercice déficitaire. */
    resultatPrincipal: ClientSummaryResultatPrincipal;
    deficitsAnterieursImputes: number;
    /** Restitution directe de fiscalResult.stocks.deficits, filtrée de l'exercice courant — tel quel, non retraité. */
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
    explicationPreremplissage: string;
    instructionsSiPreremplie: string;
    instructionsSiAbsente: string;
    instructionsSiDivergente: string;
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
    };
  }

  if (classification === "partial") {
    return {
      case: "5CD",
      label,
      montant: "À vérifier",
      note: "À vérifier : la durée de l'exercice est inférieure à 12 mois ; renseignez la case 5CD selon votre situation.",
    };
  }

  return {
    case: "5CD",
    label,
    montant: "À vérifier",
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
  fr: FiscalResult,
  isDeficit: boolean,
  activityStartDate?: string,
): ClientSummaryCase2042[] {
  const cases: ClientSummaryCase2042[] = [];

  cases.push(buildCase5CD(activityStartDate, fr.exercice));

  if (isDeficit) {
    cases.push({
      case: "5NY",
      label: "Déficit — locations meublées non professionnelles, régime réel, cas général",
      montant: fr.deficitNouveau,
    });
  } else {
    cases.push({
      case: "5NA",
      label: "Revenu imposable — locations meublées non professionnelles, régime réel, cas général",
      montant: fr.resultatFiscal,
    });
  }

  for (const deficit of deficitsVraimentAnterieurs(fr)) {
    const caseId = get2042DeficitCase(fr.exercice, deficit.millesime);
    if (!caseId) continue;
    cases.push({
      case: caseId,
      label: `Déficit antérieur restant à reporter (exercice ${deficit.millesime})`,
      montant: deficit.montant,
    });
  }

  return cases;
}

function buildFormationDuResultat(fr: FiscalResult, isDeficit: boolean): string[] {
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

  if (fr.amortReporte > 0) {
    lignes.push(
      `Amortissement non déduit cette année, reporté sans limite de durée (art. 39 C du CGI) : ${fmtEur(fr.amortReporte)}`,
    );
  }

  if (fr.deficitsImputes > 0) {
    lignes.push(`Déficits antérieurs imputés sur le résultat de cette année : ${fmtEur(fr.deficitsImputes)}`);
  }

  lignes.push(
    isDeficit
      ? `= Déficit fiscal de l'exercice : ${fmtEur(fr.deficitNouveau)}`
      : `= Résultat fiscal de l'exercice : ${fmtEur(fr.resultatFiscal)}`,
  );

  return lignes;
}

/**
 * Rappel de la prestation réalisée, adapté au dossier — chaque phrase n'est
 * ajoutée que si le fait qu'elle décrit s'est réellement produit dans ce
 * FiscalResult (ex. la limitation d'amortissement n'est mentionnée que si
 * `amortReporte > 0`). Pur choix parmi des phrases fixes, aucun calcul.
 */
function buildTravailEffectue(fr: FiscalResult, isDeficit: boolean): string[] {
  const lignes: string[] = [
    "Vos recettes locatives ont été analysées.",
    "Vos charges déductibles ont été prises en compte, catégorie par catégorie.",
    "L'amortissement de votre bien et de son mobilier a été calculé selon les règles du régime réel LMNP.",
  ];

  if (fr.amortReporte > 0) {
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

  const resultatPrincipal: ClientSummaryResultatPrincipal = isDeficit
    ? { nature: "deficit", montant: fr.deficitNouveau }
    : { nature: "benefice", montant: fr.resultatFiscal };

  const cases = buildCases2042(fr, isDeficit, options?.activityStartDate);
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
      amortissementReporte: fr.amortReporte,
      resultatAvantAmortissement: fr.resultatAvantAmort,
      resultatFiscal: fr.resultatFiscal,
      deficitFiscal: fr.deficitNouveau,
      resultatPrincipal,
      deficitsAnterieursImputes: fr.deficitsImputes,
      deficitsAnterieursRestants,
      // Somme d'affichage — addition simple de montants déjà calculés par F-006, aucune règle fiscale nouvelle.
      totalDeficitsAnterieursRestants: deficitsAnterieursRestants.reduce((total, d) => total + d.montant, 0),
    },
    chargesParCategorie: buildChargesParCategorie(fr),
    formationDuResultat: buildFormationDuResultat(fr, isDeficit),
    travailEffectue: buildTravailEffectue(fr, isDeficit),
    aide2042: {
      cases,
      explicationPreremplissage:
        "Ces informations sont normalement susceptibles d'être reprises dans votre déclaration préremplie, lorsque les traitements administratifs le permettent. Vérifiez néanmoins votre déclaration : si une information est absente, incomplète ou différente, il vous appartient de la renseigner ou de la corriger.",
      instructionsSiPreremplie:
        "Si ces informations apparaissent déjà dans votre déclaration personnelle : vérifiez que les montants correspondent à ceux indiqués ci-dessous. Si les données sont correctes, aucune ressaisie n'est nécessaire.",
      instructionsSiAbsente:
        "Si, au moment de valider votre déclaration personnelle, ces informations ne sont pas encore présentes ou sont incomplètes : vous devez alors renseigner vous-même les montants indiqués dans le tableau ci-dessous, dans les cases concernées.",
      instructionsSiDivergente:
        "Si les montants déjà préremplis diffèrent de ceux indiqués ci-dessous : ne validez pas automatiquement votre déclaration. Vérifiez l'origine de l'écart avant de la confirmer.",
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
