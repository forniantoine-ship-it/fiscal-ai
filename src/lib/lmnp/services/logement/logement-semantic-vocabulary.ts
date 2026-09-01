import type { LogementDocumentIntent } from "./logement-document-intent";

/**
 * French legal / notarial vocabulary → canonical field keys.
 * Operates on normalized (accent-stripped, lowercase) terms.
 */

export type VocabularyEntry = {
  canonicalField: string;
  intents: LogementDocumentIntent[];
  patterns: RegExp[];
};

function normalizeTerm(term: string): string {
  return term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const LOGEMENT_SEMANTIC_VOCABULARY: VocabularyEntry[] = [
  // — Acquisition price —
  {
    canonicalField: "acquisitionPrice",
    intents: ["acquisition"],
    patterns: [
      /^prix de vente$/,
      /^prix principal$/,
      /^prix net vendeur$/,
      /^montant de la vente$/,
      /^prix d'acquisition$/,
      /^prix d acquisition$/,
      /^ladite vente conclue moyennant/,
      /^somme de$/,
      /^prix paye$/,
      /^prix payé$/,
      /^valeur d'acquisition$/,
      /^montant principal$/,
      /^prix du bien$/,
      /^prix immobilier$/,
    ],
  },
  // — Acquisition date —
  {
    canonicalField: "acquisitionDate",
    intents: ["acquisition"],
    patterns: [
      /^date de l'acte$/,
      /^date de l acte$/,
      /^date de signature$/,
      /^date d'acquisition$/,
      /^date d acquisition$/,
      /^en date du$/,
      /^fait le$/,
      /^acte authentique/,
    ],
  },
  // — Property address —
  {
    canonicalField: "propertyAddress",
    intents: ["acquisition", "fiscal", "ownership"],
    patterns: [
      /^designation$/,
      /^designation du bien$/,
      /^bien situe$/,
      /^bien situé$/,
      /^situe a$/,
      /^situé à$/,
      /^adresse du bien$/,
      /^localisation du bien$/,
      /^description du bien$/,
      /^situation du bien$/,
    ],
  },
  // — Property type —
  {
    canonicalField: "propertyType",
    intents: ["acquisition"],
    patterns: [
      /^type de bien$/,
      /^nature du bien$/,
      /^appartement$/,
      /^maison$/,
      /^studio$/,
      /^immeuble$/,
      /^local$/,
      /^piece principale$/,
    ],
  },
  // — Lot numbers —
  {
    canonicalField: "lotNumbers",
    intents: ["acquisition", "copro"],
    patterns: [
      /^lot numero$/,
      /^lot numéro$/,
      /^lot n/,
      /^lots?$/,
      /^lotissement$/,
      /^cadastre.*lot/,
    ],
  },
  // — Living area —
  {
    canonicalField: "livingArea",
    intents: ["acquisition", "performance"],
    patterns: [
      /^surface habitable$/,
      /^surface$/,
      /^shab$/,
      /^superficie$/,
      /^m2$/,
      /^m²$/,
    ],
  },
  // — Parties —
  {
    canonicalField: "buyerNames",
    intents: ["acquisition"],
    patterns: [
      /^acquereur$/,
      /^acquéreur$/,
      /^acquereurs$/,
      /^acheteur$/,
      /^acheteurs$/,
      /^l'acquereur$/,
      /^l'acquéreur$/,
    ],
  },
  {
    canonicalField: "sellerNames",
    intents: ["acquisition"],
    patterns: [
      /^vendeur$/,
      /^vendeurs$/,
      /^le vendeur$/,
      /^la vendeuse$/,
      /^cédant$/,
      /^cedant$/,
    ],
  },
  {
    canonicalField: "notaryName",
    intents: ["acquisition"],
    patterns: [
      /^notaire$/,
      /^maitre$/,
      /^maître$/,
      /^etude notariale$/,
      /^étude notariale$/,
      /^office notarial$/,
    ],
  },
  // — Notary fees —
  {
    canonicalField: "notaryFees",
    intents: ["acquisition"],
    patterns: [
      /^frais de notaire$/,
      /^emoluments$/,
      /^émoluments$/,
      /^debours$/,
      /^débours$/,
      /^frais d'acte$/,
    ],
  },
  // — Financing —
  {
    canonicalField: "loanAmount",
    intents: ["financing", "acquisition"],
    patterns: [
      /^capital emprunte$/,
      /^capital emprunté$/,
      /^montant du pret$/,
      /^montant du prêt$/,
      /^montant emprunte$/,
      /^principal$/,
    ],
  },
  {
    canonicalField: "interestRate",
    intents: ["financing"],
    patterns: [/^taux d'interet$/, /^taux d'intérêt$/, /^taux nominal$/, /^taux$/],
  },
  {
    canonicalField: "monthlyPayment",
    intents: ["financing"],
    patterns: [/^mensualite$/, /^mensualité$/, /^echeance$/, /^échéance$/],
  },
  {
    canonicalField: "durationMonths",
    intents: ["financing"],
    patterns: [/^duree$/, /^durée$/, /^duree du pret$/, /^durée du prêt$/],
  },
  {
    canonicalField: "bankName",
    intents: ["financing"],
    patterns: [/^banque$/, /^organisme preteur$/, /^prêteur$/, /^preteur$/],
  },
  // — Rental —
  {
    canonicalField: "monthlyRent",
    intents: ["rental"],
    patterns: [/^loyer$/, /^loyer mensuel$/, /^montant du loyer$/],
  },
  {
    canonicalField: "tenantName",
    intents: ["rental"],
    patterns: [/^locataire$/, /^preneur$/, /^baille$/],
  },
  {
    canonicalField: "leaseStartDate",
    intents: ["rental"],
    patterns: [/^date de prise d'effet$/, /^debut du bail$/, /^début du bail$/],
  },
  // — Fiscal —
  {
    canonicalField: "taxAmount",
    intents: ["fiscal"],
    patterns: [/^montant de l'impot$/, /^taxe fonciere$/, /^taxe foncière$/],
  },
];

export function resolveCanonicalFieldFromTerm(
  term: string,
  intent: LogementDocumentIntent,
): string | undefined {
  const normalized = normalizeTerm(term);

  for (const entry of LOGEMENT_SEMANTIC_VOCABULARY) {
    if (!entry.intents.includes(intent)) continue;
    for (const pattern of entry.patterns) {
      if (pattern.test(normalized)) {
        return entry.canonicalField;
      }
    }
  }

  return undefined;
}

/**
 * Map legacy GPT / extractor keys to canonical field names.
 */
export const LEGACY_FIELD_ALIASES: Record<string, string> = {
  propertyPurchasePrice: "acquisitionPrice",
  purchasePrice: "acquisitionPrice",
  prixDeVente: "acquisitionPrice",
  surfaceM2: "livingArea",
  surfaceArea: "livingArea",
  loanDurationMonths: "durationMonths",
  loanRate: "interestRate",
  lenderName: "bankName",
  address: "propertyAddress",
  postalCode: "propertyPostalCode",
  city: "propertyCity",
};

export function resolveCanonicalFieldFromKey(
  key: string,
  intent: LogementDocumentIntent,
): string | undefined {
  if (LEGACY_FIELD_ALIASES[key]) {
    return LEGACY_FIELD_ALIASES[key];
  }

  const fromVocab = resolveCanonicalFieldFromTerm(key, intent);
  if (fromVocab) return fromVocab;

  return key;
}
