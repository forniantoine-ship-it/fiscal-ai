import type { PretFinancementExercice } from "../../f011/types";
import { round2 } from "../../f007/types";

/**
 * Ventilation 2033-B des composantes F-011 (présentation Cerfa uniquement) :
 *
 *   - intérêts, IRA, assurance emprunteur → 294 (charges financières) ;
 *   - frais de dossier bancaire → 242 (autres charges externes) et donc 264 ;
 *   - garantie / caution → 294 PROVISOIRE / UNRESOLVED (aucune reclassification
 *     ratifiée — notice « services bancaires » vs SAV-001 « charges financières »).
 *
 * Le résultat fiscal et le résultat comptable 310 ne changent pas : on déplace
 * uniquement la présentation (264 ↑ / 294 ↓ du même montant de frais de dossier).
 *
 * Sans détail `emprunts`, impossible de séparer les frais de dossier → tout reste
 * en 294 (repli conservateur, comportement historique).
 */
export type Financement2033BSplit = {
  /** Montant à publier en case 294. */
  case294: number;
  /** Frais de dossier à ajouter à 242 / 264 (0 si non séparables). */
  fraisDossier242: number;
  /**
   * Garantie / caution conservée en 294 — statut PROVISOIRE / UNRESOLVED
   * (exposé pour les tests et la documentation, jamais reclassé en 242 ici).
   */
  garantieProvisoire294: number;
};

export function splitFinancementFor2033B(input: {
  emprunts: PretFinancementExercice[] | undefined;
  /** Repli si `emprunts` absent : total chargesFinancement de l'exercice. */
  chargesFinancementFallback: number;
}): Financement2033BSplit {
  const { emprunts, chargesFinancementFallback } = input;
  if (emprunts === undefined) {
    return {
      case294: round2(chargesFinancementFallback),
      fraisDossier242: 0,
      garantieProvisoire294: 0,
    };
  }

  let case294 = 0;
  let fraisDossier242 = 0;
  let garantieProvisoire294 = 0;
  for (const p of emprunts) {
    case294 +=
      p.interetsEmpruntExercice +
      p.interetsPreExploitation +
      p.iraDeductible +
      p.assuranceEmpruntExercice +
      p.assurancePreExploitation +
      p.garantieDeductible;
    fraisDossier242 += p.fraisDossierDeductibles;
    garantieProvisoire294 += p.garantieDeductible;
  }
  return {
    case294: round2(case294),
    fraisDossier242: round2(fraisDossier242),
    garantieProvisoire294: round2(garantieProvisoire294),
  };
}
