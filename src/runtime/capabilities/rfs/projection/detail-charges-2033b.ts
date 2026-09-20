import type { FiscalResult } from "../../f006/types";

/**
 * A1 — cohérence du détail 2033-B : les lignes détaillées publiées (242, 244) doivent
 * expliquer EXACTEMENT le total des charges d'exploitation 264, hors dotations aux
 * amortissements publiées séparément en 254 :
 *
 *   242 + 244 + 254 = 264
 *   264 − 254 = chargesExploitation + chargesExploitationPreExploitation + totalNonDeductible
 *
 * Ce module ne calcule AUCUNE valeur fiscale. Il ventile, catégorie par catégorie, des
 * montants déjà calculés par F-012 (transportés par F-006) vers les deux lignes Cerfa
 * concernées, puis vérifie que cette ventilation retrouve exactement le total attendu :
 *
 *   - 244 « Impôts, taxes et versements assimilés » ← taxe foncière (part déductible de
 *     l'exercice + quote-part de pré-exploitation) ;
 *   - 242 « Autres achats et charges externes » ← toutes les autres catégories F-012
 *     (assurance PNO/GLI, copropriété, honoraires, travaux déductibles, frais bancaires,
 *     divers…), part de l'exercice + quote-part de pré-exploitation, + les charges
 *     comptabilisées mais non déductibles de nature externe (fonds de travaux ALUR,
 *     catégorie copropriété).
 *
 * Ce qui n'est PAS attribuable sans deviner reste hors des lignes et fait échouer la
 * conservation (jamais absorbé dans un résiduel silencieux) :
 *   - les frais d'acquisition déduits immédiatement (F-010) : `KS / DATA INSUFFICIENT`. SAV-001
 *     fixe leur composition (droits de mutation, émoluments, débours, frais d'agence acquéreur)
 *     mais F-010 ne persiste que des scalaires (`fraisNotaire`, `fraisEnCharges`) : l'extraction
 *     d'acte agrège émoluments/débours/frais d'acte dans `notaryFees` et ignore les droits ;
 *     `fraisAgence` n'est jamais collectée. Aucune convention n'est appliquée pour remplir 242 ;
 *   - les charges non déductibles de catégorie « divers » : F-012 n'en produit plus (les lignes
 *     déjà comptées par F-011 n'alimentent plus `totalNonDeductible`, voir `exclusionReason`) ;
 *     garde conservée pour les dossiers persistés AVANT cette correction, où ce montant est une
 *     charge FINANCIÈRE (assurance emprunteur), jamais une charge d'exploitation ;
 *   - toute ventilation manquante (dossier persisté avant A1) ou incohérente.
 *
 * Les charges de financement F-011 ne sont en principe jamais ici (264 les
 * exclut via `chargesFinancement`). Exception de présentation Cerfa : les
 * frais de dossier bancaire sont reclassés en 242/264 par `map-2033b.ts`
 * (notice 2033-NOT-SD 2026) sans modifier le résultat fiscal. La garantie /
 * caution reste en 294 (PROVISOIRE / UNRESOLVED).
 */

export type ConservationDetail2033B = {
  /** `CONSERVE` : les lignes 242/244 expliquent exactement 264 − 254. `ECART` : elles ne doivent pas être publiées. */
  status: "CONSERVE" | "ECART";
  /** 264 − 254 : chargesExploitation + pré-exploitation d'exploitation + charges non déductibles comptabilisées. */
  attendu: number;
  /** Somme des montants ventilés (242 + 244). */
  attribue: number;
  /** attendu − attribue (0 si conservé). */
  ecart: number;
  /** Valeur de 244, si publiable (`CONSERVE` et au moins une ligne d'impôts/taxes). */
  ligne244?: number;
  /** Valeur de 242, si publiable (`CONSERVE` et au moins une ligne de charges externes). */
  ligne242?: number;
  /** Pourquoi la conservation échoue (vide si `CONSERVE`). */
  raisons: string[];
};

const CATEGORIE_IMPOTS_TAXES = "taxe_fonciere";
/** Non déductible « divers » = déjà comptée par F-011 (charge financière) : jamais une charge d'exploitation. */
const CATEGORIE_NON_DEDUCTIBLE_FINANCIERE = "divers";

const cents = (value: number): number => Math.round(value * 100);
const fromCents = (value: number): number => value / 100;

function sumEntries(map: Partial<Record<string, number>> | undefined, predicate: (categorie: string) => boolean): number {
  let total = 0;
  for (const [categorie, montant] of Object.entries(map ?? {})) {
    if (predicate(categorie) && typeof montant === "number") total += cents(montant);
  }
  return total;
}

function hasKey(map: Partial<Record<string, number>> | undefined, predicate: (categorie: string) => boolean): boolean {
  return Object.keys(map ?? {}).some(predicate);
}

/**
 * Vérifie la conservation du détail 2033-B pour un `FiscalResult` donné. Pure : ne lit que
 * `fr.charges`, ne modifie rien.
 */
export function resolveConservationDetail2033B(fr: FiscalResult): ConservationDetail2033B {
  const c = fr.charges;
  const raisons: string[] = [];

  const preExploitationExploitation = c.chargesExploitationPreExploitation ?? 0;
  const attenduCents = cents(c.chargesExploitation) + cents(preExploitationExploitation) + cents(c.totalNonDeductible);

  const deductible = c.detailParCategorie;
  if (deductible === undefined && cents(c.chargesExploitation) !== cents(c.fraisAcquisitionEnCharges ?? 0)) {
    raisons.push("ventilation des charges déductibles par catégorie absente (detailParCategorie)");
  }

  const preExploitation = c.detailPreExploitationParCategorie;
  if (preExploitation === undefined && cents(preExploitationExploitation) !== 0) {
    raisons.push(
      "ventilation par catégorie de la pré-exploitation non persistée (dossier antérieur à A1 — confirmer à nouveau l'assistant Charges)",
    );
  }

  const nonDeductible = c.detailNonDeductibleParCategorie;
  if (nonDeductible === undefined && cents(c.totalNonDeductible) !== 0) {
    raisons.push("ventilation par catégorie des charges non déductibles non persistée (confirmer à nouveau l'assistant Charges)");
  }

  if (cents(c.fraisAcquisitionEnCharges ?? 0) > 0) {
    raisons.push(
      `frais d'acquisition déduits immédiatement (${c.fraisAcquisitionEnCharges} €) — KS / DATA INSUFFICIENT : F-010 ne persiste que le total (fraisNotaire → fraisEnCharges, scalaires) ; le champ minimal manquant est la part de droits et taxes (droits de mutation…) incluse dans ce total, seule distinction qui sépare 244 de 242 (SAV-001 en fixe la composition, aucune donnée ne la porte) — non attribuables à 242/244`,
    );
  }

  const nonDeductibleFinancier = sumEntries(nonDeductible, (cat) => cat === CATEGORIE_NON_DEDUCTIBLE_FINANCIERE);
  if (nonDeductibleFinancier !== 0) {
    raisons.push(
      `charges non déductibles de catégorie « divers » (${fromCents(nonDeductibleFinancier)} €) : déjà comptées par F-011 (charge financière), jamais une charge d'exploitation — non attribuables à 242/244`,
    );
  }

  const isImpotsTaxes = (categorie: string) => categorie === CATEGORIE_IMPOTS_TAXES;
  const isChargeExterne = (categorie: string) => categorie !== CATEGORIE_IMPOTS_TAXES;
  const isNonDeductibleExterne = (categorie: string) =>
    categorie !== CATEGORIE_IMPOTS_TAXES && categorie !== CATEGORIE_NON_DEDUCTIBLE_FINANCIERE;

  const impotsTaxes =
    sumEntries(deductible, isImpotsTaxes) + sumEntries(preExploitation, isImpotsTaxes) + sumEntries(nonDeductible, isImpotsTaxes);
  const chargesExternes =
    sumEntries(deductible, isChargeExterne) + sumEntries(preExploitation, isChargeExterne) + sumEntries(nonDeductible, isNonDeductibleExterne);

  const attribueCents = impotsTaxes + chargesExternes;
  const ecartCents = attenduCents - attribueCents;

  if (ecartCents !== 0 && raisons.length === 0) {
    raisons.push(
      "les montants ventilés par catégorie ne retrouvent pas chargesExploitation + pré-exploitation + charges non déductibles (incohérence de transport entre F-012 et F-006)",
    );
  }

  const conserve = ecartCents === 0 && raisons.length === 0;
  const hasTaxes =
    hasKey(deductible, isImpotsTaxes) || hasKey(preExploitation, isImpotsTaxes) || hasKey(nonDeductible, isImpotsTaxes);
  const hasExternes =
    hasKey(deductible, isChargeExterne) || hasKey(preExploitation, isChargeExterne) || hasKey(nonDeductible, isNonDeductibleExterne);

  return {
    status: conserve ? "CONSERVE" : "ECART",
    attendu: fromCents(attenduCents),
    attribue: fromCents(attribueCents),
    ecart: fromCents(ecartCents),
    ...(conserve && hasTaxes ? { ligne244: fromCents(impotsTaxes) } : {}),
    ...(conserve && hasExternes ? { ligne242: fromCents(chargesExternes) } : {}),
    raisons,
  };
}
