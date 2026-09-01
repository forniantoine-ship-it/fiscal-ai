/**
 * LMNP Business Engine — Fiscal Knowledge Rules Registry
 *
 * A deterministic registry of fiscal knowledge rules for each accounting
 * category. Drives consistent, pedagogically coherent explanations.
 *
 * Rules are NEVER randomly generated. The same category + amount combination
 * always produces the same explanation family — building user trust over time.
 *
 * All text is written for a non-accountant LMNP owner:
 * - Plain French
 * - No accounting jargon
 * - Concrete examples
 * - Reassuring tone
 */

import type { AccountingCategory, FiscalKnowledgeRule } from "./business-engine.types";

// ---------------------------------------------------------------------------
// Knowledge rule registry
// ---------------------------------------------------------------------------

export const FISCAL_KNOWLEDGE_RULES: Record<AccountingCategory, FiscalKnowledgeRule> = {
  immeuble: {
    id: "rule-immeuble",
    category: "immeuble",
    suggestedDurationYears: 30,
    durationRangeMin: 25,
    durationRangeMax: 40,
    explanationTemplate:
      "Ce bien immobilier est amorti sur {duration} ans, ce qui représente {annualAmort} de déduction annuelle. " +
      "L'immeuble est le principal actif de votre activité LMNP. " +
      "Il perd progressivement de sa valeur comptable chaque année.",
    examples: [
      "Appartement acheté pour 185 000 € → environ 5 500 € par an de déduction",
      "Studio Paris 13e → amortissement sur 30 ans",
      "Maison à Bordeaux → durée typique 25 à 35 ans selon l'état",
    ],
    confidenceRules: [
      "La présence d'un acte notarié augmente la confiance",
      "Le prix d'acquisition doit être cohérent avec le marché local",
      "Le terrain (environ 15%) n'est jamais amorti",
    ],
    fiscalBasis:
      "Les immeubles LMNP sont amortissables par composants. En V1, nous appliquons une durée unique simplifiée.",
  },

  travaux: {
    id: "rule-travaux",
    category: "travaux",
    suggestedDurationYears: 12,
    durationRangeMin: 10,
    durationRangeMax: 15,
    explanationTemplate:
      "Ces travaux ({label}) sont immobilisés et amortis sur {duration} ans, soit {annualAmort} par an. " +
      "Ils améliorent durablement votre bien et ne constituent pas de la simple maintenance.",
    examples: [
      "Réfection salle de bain (4 200 €) → 350 €/an sur 12 ans",
      "Remplacement fenêtres (6 800 €) → 567 €/an sur 12 ans",
      "Installation parquet (2 100 €) → 175 €/an sur 12 ans",
      "Ravalement façade (8 500 €) → 708 €/an sur 12 ans",
    ],
    confidenceRules: [
      "Montant ≥ 500 € → signal immobilisation",
      "Mots-clés 'rénovation', 'remplacement', 'installation' → durable",
      "Mots-clés 'réparation', 'entretien courant' → charge déductible",
      "Même fournisseur sur 3+ factures → chantier groupé probable",
    ],
    fiscalBasis:
      "Les travaux d'amélioration sont distingués des travaux d'entretien. " +
      "Les améliorations durables sont immobilisées, les entretiens sont des charges.",
  },

  mobilier: {
    id: "rule-mobilier",
    category: "mobilier",
    suggestedDurationYears: 7,
    durationRangeMin: 5,
    durationRangeMax: 10,
    explanationTemplate:
      "Ce mobilier ({label}) est immobilisé et amorti sur {duration} ans, soit {annualAmort} par an. " +
      "Le mobilier d'un logement meublé est un actif durable de votre activité LMNP.",
    examples: [
      "Canapé + table basse (1 200 €) → 171 €/an sur 7 ans",
      "Lit double + matelas (890 €) → 127 €/an sur 7 ans",
      "Armoire penderie (650 €) → 93 €/an sur 7 ans",
    ],
    confidenceRules: [
      "Fournisseurs typiques : IKEA, But, Maisons du Monde, Conforama",
      "Mots-clés 'meuble', 'canapé', 'lit', 'armoire' → mobilier certain",
      "Montant < 500 € → passage en charge directe plus simple",
    ],
    fiscalBasis:
      "Le mobilier de logement meublé est un actif immobilisable. " +
      "La durée standard en LMNP est 5 à 10 ans selon la nature.",
  },

  electromenager: {
    id: "rule-electromenager",
    category: "electromenager",
    suggestedDurationYears: 6,
    durationRangeMin: 5,
    durationRangeMax: 7,
    explanationTemplate:
      "Cet électroménager ({label}) est immobilisé et amorti sur {duration} ans, soit {annualAmort} par an. " +
      "Durée calée sur la vie technique réelle de ces équipements.",
    examples: [
      "Lave-linge (480 €) → 80 €/an sur 6 ans",
      "Réfrigérateur combiné (690 €) → 115 €/an sur 6 ans",
      "Four encastrable (350 €) → 58 €/an sur 6 ans",
      "Hotte aspirante (220 €) → souvent passée en charge si < 500 €",
    ],
    confidenceRules: [
      "Mots-clés : lave-linge, lave-vaisselle, réfrigérateur, four, hotte, VMC",
      "Fournisseurs : Darty, Boulanger, Fnac, Electrodépôt",
      "Montant < 500 € → charge immédiate recommandée",
    ],
    fiscalBasis:
      "L'électroménager est amorti sur 5 à 7 ans selon les règles LMNP courantes.",
  },

  cuisine: {
    id: "rule-cuisine",
    category: "cuisine",
    suggestedDurationYears: 10,
    durationRangeMin: 8,
    durationRangeMax: 12,
    explanationTemplate:
      "Cette cuisine équipée ({label}) est immobilisée et amortie sur {duration} ans, soit {annualAmort} par an. " +
      "Une cuisine équipée intégrée a une durée de vie longue et améliore durablement votre bien.",
    examples: [
      "Cuisine SCHMIDT complète (12 430 €) → 1 243 €/an sur 10 ans",
      "Cuisine IKEA montée (4 800 €) → 480 €/an sur 10 ans",
      "Cuisine Lapeyre avec électroménager (7 200 €) → 720 €/an sur 10 ans",
    ],
    confidenceRules: [
      "Fournisseurs typiques : Schmidt, Mobalpa, Cuisinella, Ikea, Lapeyre",
      "Plusieurs factures d'un même fournisseur = chantier cuisine probable",
      "Mots-clés : acompte, pose, plan de travail, meuble bas/haut",
      "La cuisine est souvent le regroupement de 2 à 4 factures",
    ],
    fiscalBasis:
      "La cuisine équipée est traitée comme un seul actif en LMNP (approche simplifiée V1). " +
      "Elle combine mobilier et équipements avec une durée moyenne de 10 ans.",
  },

  assurance: {
    id: "rule-assurance",
    category: "assurance",
    suggestedDurationYears: 0,
    durationRangeMin: 0,
    durationRangeMax: 0,
    explanationTemplate:
      "Cette assurance ({label}) est une charge récurrente déductible de l'exercice ({amount}). " +
      "Les primes d'assurance ne s'immobilisent pas — elles se déduisent intégralement chaque année.",
    examples: [
      "Assurance propriétaire non-occupant (320 €/an) → charge annuelle",
      "Assurance multirisque habitation (280 €/an) → charge annuelle",
      "Assurance loyers impayés (450 €/an) → charge annuelle",
    ],
    confidenceRules: [
      "Toutes les primes d'assurance sont des charges, sans exception",
      "Un certificat annuel d'assurance confirme le montant",
    ],
    fiscalBasis:
      "Les primes d'assurance sont des charges d'exploitation déductibles en totalité chaque année.",
  },

  taxe_fonciere: {
    id: "rule-taxe-fonciere",
    category: "taxe_fonciere",
    suggestedDurationYears: 0,
    durationRangeMin: 0,
    durationRangeMax: 0,
    explanationTemplate:
      "La taxe foncière ({amount}) est déductible intégralement de vos revenus LMNP. " +
      "C'est un impôt annuel — jamais une immobilisation.",
    examples: [
      "Taxe foncière Paris 11e (1 800 €) → charge annuelle",
      "Taxe foncière Bordeaux (950 €) → charge annuelle",
    ],
    confidenceRules: [
      "L'avis de taxe foncière est émis chaque année par les impôts",
      "Le montant varie selon la commune et la superficie",
    ],
    fiscalBasis:
      "La taxe foncière est une charge fiscale déductible en totalité chaque année en LMNP réel.",
  },

  autre: {
    id: "rule-autre",
    category: "autre",
    suggestedDurationYears: 10,
    durationRangeMin: 5,
    durationRangeMax: 15,
    explanationTemplate:
      "Cette dépense ({label}, {amount}) a été classée en 'Autre'. " +
      "Sa durée d'amortissement proposée est de {duration} ans. " +
      "Nous vous recommandons de vérifier cette classification.",
    examples: [
      "Honoraires notariaux → peuvent être intégrés à l'immeuble",
      "Frais de comptabilité → charge annuelle déductible",
      "Dépôt de garantie → non déductible, non amortissable",
    ],
    confidenceRules: [
      "Catégorie 'Autre' indique une confiance faible",
      "Vérifier si la dépense relève d'une catégorie plus précise",
    ],
    fiscalBasis:
      "Les dépenses non catégorisées doivent être examinées au cas par cas.",
  },
};

// ---------------------------------------------------------------------------
// Lookup and template rendering
// ---------------------------------------------------------------------------

/**
 * Returns the knowledge rule for a given category.
 * Always returns a valid rule — "autre" is the fallback.
 */
export function getKnowledgeRule(category: AccountingCategory): FiscalKnowledgeRule {
  return FISCAL_KNOWLEDGE_RULES[category] ?? FISCAL_KNOWLEDGE_RULES.autre;
}

/**
 * Renders an explanation from a template, substituting known variables.
 * Variables supported: {label}, {amount}, {duration}, {annualAmort}
 */
export function renderExplanationTemplate(
  template: string,
  vars: {
    label?: string;
    amount?: number;
    duration?: number;
    annualAmort?: number;
  },
): string {
  const fmt = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

  return template
    .replace("{label}", vars.label ?? "cet actif")
    .replace("{amount}", vars.amount !== undefined ? fmt.format(vars.amount) : "?")
    .replace("{duration}", vars.duration !== undefined ? String(vars.duration) : "?")
    .replace("{annualAmort}", vars.annualAmort !== undefined ? fmt.format(vars.annualAmort) : "?");
}

/**
 * Generates a consistent, template-driven fiscal explanation for an asset.
 * This replaces ad-hoc explanation generation and ensures every asset of
 * the same category produces the same explanation family.
 */
export function generateConsistentExplanation(
  category: AccountingCategory,
  label: string,
  amount: number,
  durationYears: number,
): string {
  const rule = getKnowledgeRule(category);
  const annualAmort = durationYears > 0 ? Math.round(amount / durationYears) : 0;

  return renderExplanationTemplate(rule.explanationTemplate, {
    label,
    amount,
    duration: durationYears,
    annualAmort,
  });
}

/**
 * Returns the category duration range as a human-readable French string.
 * Used in tooltips and educational text.
 */
export function getDurationRangeLabel(category: AccountingCategory): string {
  const rule = getKnowledgeRule(category);
  if (rule.durationRangeMin === 0) return "Non amortissable";
  if (rule.durationRangeMin === rule.durationRangeMax) return `${rule.durationRangeMin} ans`;
  return `${rule.durationRangeMin} à ${rule.durationRangeMax} ans`;
}

/**
 * Returns whether a duration is within the acceptable range for a category.
 * Used to flag potentially incorrect user-edited durations.
 */
export function isDurationReasonable(category: AccountingCategory, durationYears: number): boolean {
  const rule = getKnowledgeRule(category);
  if (rule.durationRangeMin === 0) return durationYears === 0;
  return durationYears >= rule.durationRangeMin && durationYears <= rule.durationRangeMax;
}

/**
 * Returns a warning message if the user-set duration is outside the expected range.
 * Returns null if the duration is acceptable.
 */
export function getDurationWarning(
  category: AccountingCategory,
  durationYears: number,
): string | null {
  const rule = getKnowledgeRule(category);
  if (rule.durationRangeMin === 0) return null;
  if (durationYears < rule.durationRangeMin) {
    return `Durée inférieure à la fourchette recommandée (${rule.durationRangeMin}–${rule.durationRangeMax} ans). Vérifiez si cette durée est justifiable.`;
  }
  if (durationYears > rule.durationRangeMax) {
    return `Durée supérieure à la fourchette recommandée (${rule.durationRangeMin}–${rule.durationRangeMax} ans). Vérifiez si cette durée est justifiable.`;
  }
  return null;
}
