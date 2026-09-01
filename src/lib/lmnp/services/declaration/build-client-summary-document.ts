import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { FiscalResult, StockDeficit } from "@/runtime/capabilities/f006/types";

/**
 * Document client 149 € — synthèse fiscale + aide à la déclaration 2042-C-PRO.
 *
 * Construit UNIQUEMENT depuis la RFS (`rfs.identite` / `rfs.fiscalResult`) :
 * aucune lecture d'assistant (F-012/F-013/F-014/…), aucun recalcul fiscal.
 * Chaque montant fiscal de ce document est une restitution directe d'un champ
 * déjà calculé par F-006 — voir `build-client-summary-document.test.ts` pour
 * la preuve. Les seules opérations arithmétiques de ce fichier sont des
 * agrégations d'affichage pures (somme d'une liste déjà calculée, tri par
 * montant) — jamais une règle fiscale nouvelle. Chacune est commentée à
 * l'endroit où elle apparaît.
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
    chargesDeductibles: number;
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

/** Restitution triée par montant décroissant (tri d'affichage, pas une règle fiscale) des charges par catégorie déjà calculées par F-012/F-006. */
function buildChargesParCategorie(fr: FiscalResult): ClientSummaryChargeCategorie[] {
  const detail = fr.charges.detailParCategorie;
  if (!detail) return [];
  return Object.entries(detail)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .map(([categorie, montant]) => ({
      categorie,
      label: CHARGE_CATEGORY_LABELS[categorie] ?? humanizeUnknownCategorie(categorie),
      montant,
    }))
    .sort((a, b) => b.montant - a.montant);
}

function buildCases2042(fr: FiscalResult, isDeficit: boolean): ClientSummaryCase2042[] {
  const cases: ClientSummaryCase2042[] = [];

  cases.push({
    case: "5CD",
    label: "Durée de l'exercice (nombre de mois)",
    montant: "À déterminer à partir de votre date de début d'activité",
    note: "La durée exacte de l'exercice en mois n'est pas encore portée par la représentation fiscale structurée (RFS) — à vérifier avant de reporter cette case.",
  });

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
    cases.push({
      case: "5GA à 5GJ",
      label: `Déficit antérieur restant à reporter (exercice ${deficit.millesime})`,
      montant: deficit.montant,
      note: "La correspondance exacte entre ce déficit et sa case (5GA à 5GJ) dépend de l'ordre demandé par le formulaire officiel ou le service en ligne au moment de la déclaration — à vérifier, ces cases sont d'ailleurs signalées par l'administration comme communiquées à titre indicatif.",
    });
  }

  return cases;
}

function buildFormationDuResultat(fr: FiscalResult, isDeficit: boolean): string[] {
  const lignes: string[] = [
    `Recettes de l'activité : ${fmtEur(fr.recettes.total)}`,
    `Charges déductibles : ${fmtEur(fr.charges.totalDeductible)}`,
    `= Résultat avant amortissement : ${fmtEur(fr.resultatAvantAmort)}`,
    `Amortissement calculé sur l'exercice : ${fmtEur(fr.amortCalcule)}`,
  ];

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

export function buildClientSummaryDocument(rfs: FiscalRepresentation): ClientSummaryDocument {
  const fr = rfs.fiscalResult;
  const isDeficit = fr.deficitNouveau > 0;

  const resultatPrincipal: ClientSummaryResultatPrincipal = isDeficit
    ? { nature: "deficit", montant: fr.deficitNouveau }
    : { nature: "benefice", montant: fr.resultatFiscal };

  const cases = buildCases2042(fr, isDeficit);
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
    },
  };
}
