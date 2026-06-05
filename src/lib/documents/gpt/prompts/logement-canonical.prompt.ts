import type { LogementDocumentIntent } from "@/lib/lmnp/services/logement/logement-document-intent";
import { CANONICAL_FIELD_KEYS_BY_INTENT } from "@/lib/lmnp/services/logement/logement-canonical-schema";
import { buildLogementTunnelPromptSection } from "@/lib/documents/tunnel-field-ownership";

const MAX_TEXT_LENGTH = 24_000;

const INTENT_LABELS: Record<LogementDocumentIntent, string> = {
  acquisition: "acquisition immobilière (acte, attestation, compromis)",
  financing: "financement / crédit immobilier",
  rental: "location / bail",
  fiscal: "fiscalité foncière",
  charges: "charges / assurance",
  copro: "copropriété",
  performance: "performance énergétique (DPE)",
  legal: "pièce juridique",
  ownership: "propriété / cadastre",
};

const VOCABULARY_HINTS: Record<LogementDocumentIntent, string> = {
  acquisition: `
Vocabulaire documentaire → champs canoniques :
- "prix de vente", "prix principal", "ladite vente conclue moyennant", "somme de" → acquisitionPrice
- "acquéreur", "acheteur" → buyerNames
- "vendeur" → sellerNames
- "désignation", "bien situé", "situation du bien" → propertyAddress
- "lot numéro", "lot n°" → lotNumbers
- "surface habitable", "SHAB" → livingArea
- "acte authentique", "date de signature" → acquisitionDate
- "notaire", "maître" → notaryName
- "frais de notaire", "émoluments" → notaryFees`,
  financing: `
- "capital emprunté", "montant du prêt" → loanAmount
- "taux", "taux nominal" → interestRate
- "mensualité", "échéance" → monthlyPayment
- "durée" → durationMonths
- "banque", "organisme prêteur" → bankName`,
  rental: `
- "loyer", "loyer mensuel" → monthlyRent
- "locataire" → tenantName
- "meublé" → furnished
- "prise d'effet", "début du bail" → leaseStartDate`,
  fiscal: `
- adresse du bien → propertyAddress
- montant taxe → taxAmount
- année → taxYear`,
  charges: `
- prime / montant assurance → insuranceAmount
- assureur → insurerName`,
  copro: `
- appel de fonds → callAmount
- lot → lotNumbers`,
  performance: `
- classe énergétique → energyClass
- surface → livingArea
- date diagnostic → diagnosticDate`,
  legal: `
- titre du document → documentTitle
- date d'effet → effectiveDate`,
  ownership: `
- propriétaire → ownerNames
- références cadastrales → cadastralReferences`,
};

export function buildLogementCanonicalSystemPrompt(intent: LogementDocumentIntent): string {
  const canonicalKeys = CANONICAL_FIELD_KEYS_BY_INTENT[intent].join(", ");

  return `Tu es un assistant juridico-comptable spécialisé LMNP en France.
Tu analyses un document immobilier pour remplir UNIQUEMENT le schéma canonique LMNP — pas de champs libres.

${buildLogementTunnelPromptSection()}

## Intention métier détectée : ${intent} (${INTENT_LABELS[intent]})

## Champs canoniques autorisés (et UNIQUEMENT ceux-ci)
${canonicalKeys}

## Règles impératives

1. Ne crée JAMAIS de clés hors schéma canonique.
2. Mappe le vocabulaire juridique/notarial du document vers les champs canoniques.
3. Remplis rawDocumentTerms avec les libellés documentaires repérés et leur mapping canonique.
4. Si une valeur est ambiguë → null pour ce champ canonique.
5. N'invente pas de valeurs absentes du texte OCR.

${VOCABULARY_HINTS[intent]}

## Adresse du bien (acquisition / fiscal)

propertyAddress = adresse du BIEN IMMOBILIER acheté/loué — PAS acquéreur, vendeur, notaire, banque.

## Format de réponse

JSON strict :
- documentIntent : "${intent}"
- canonicalFields : objet avec les clés canoniques (null si absent)
- rawDocumentTerms : tableau { term, value, mappedField }

Pas de markdown. Pas d'explications.`;
}

export function buildLogementCanonicalVisionSystemPrompt(intent: LogementDocumentIntent): string {
  const canonicalKeys = CANONICAL_FIELD_KEYS_BY_INTENT[intent].join(", ");

  return `Tu es un assistant juridico-comptable spécialisé LMNP en France.
Tu analyses des IMAGES de documents immobiliers (Vision multimodale).

## Processus en 2 temps (obligatoire)
1. LIS d'abord le document comme un OCR humain (texte, montants, noms, adresses visibles).
2. MAPPE ensuite les valeurs lues vers le schéma canonique LMNP.

${buildLogementTunnelPromptSection()}

## Intention métier : ${intent} (${INTENT_LABELS[intent]})

## Champs canoniques autorisés
${canonicalKeys}

${VOCABULARY_HINTS[intent]}

## Règles Vision — extraction agressive

1. Ne laisse PAS un champ à null si une valeur correspondante est visible ou déduite du texte OCR préliminaire fourni.
2. Extrais des valeurs approximatives quand la confiance est moyenne (confidence medium) — mieux vaut une approximation qu'un null.
3. Priorise absolument : prix de vente (acquisitionPrice), noms acquéreur/vendeur, adresse du bien, date d'acte, surface, frais de notaire.
4. Pour rawDocumentTerms : chaque terme repéré DOIT inclure value avec le texte lu (pas seulement le libellé).
5. N'invente pas de données absentes de l'image — mais transcris tout ce qui est lisible même partiellement.

## Adresse du bien

propertyAddress = adresse du BIEN IMMOBILIER — PAS domicile acquéreur/vendeur/notaire.

## Format JSON strict

- documentIntent : "${intent}"
- canonicalFields : valeurs canoniques (null UNIQUEMENT si vraiment illisible)
- rawDocumentTerms : { term, value, mappedField } avec value renseignée quand visible`;
}

export function buildLogementCanonicalVisionUserPrompt(
  intent: LogementDocumentIntent,
  pageCount: number,
  ocrIntermediate?: {
    rawTextBlocks: string[];
    keyValueCandidates: Array<{ label: string; value: string; confidence: string }>;
    amountCandidates: Array<{ label: string; amount: number; confidence: string }>;
  },
): string {
  const ocrSection = ocrIntermediate
    ? `
## OCR préliminaire (phase 1 — utilise ces valeurs pour remplir canonicalFields)

### Blocs de texte lus
${ocrIntermediate.rawTextBlocks.map((block, i) => `[${i + 1}] ${block}`).join("\n")}

### Paires libellé → valeur
${ocrIntermediate.keyValueCandidates
  .map((pair) => `- ${pair.label}: ${pair.value} (${pair.confidence})`)
  .join("\n")}

### Montants candidats
${ocrIntermediate.amountCandidates
  .map((amount) => `- ${amount.label}: ${amount.amount} € (${amount.confidence})`)
  .join("\n")}

Mappe ces éléments vers canonicalFields. Ne retourne pas null si une valeur ci-dessus existe.
`
    : "";

  return `Analyse les ${pageCount} image(s) de ce document immobilier (intention : ${intent}).
${ocrSection}
Étape 1 : lis tout texte visible sur les images.
Étape 2 : remplis canonicalFields et rawDocumentTerms (avec value) à partir du texte lu.

Do not leave fields null if values are visible in the document or in the OCR préliminaire above.
Extract approximate values when confidence is moderate.
Prioritize visible sale price, buyer names, seller names, property addresses.`;
}

export function buildLogementCanonicalUserPrompt(
  rawText: string,
  intent: LogementDocumentIntent,
): string {
  const truncated =
    rawText.length > MAX_TEXT_LENGTH
      ? `${rawText.slice(0, MAX_TEXT_LENGTH)}\n\n[… texte tronqué …]`
      : rawText;

  return `Document à traiter (intention : ${intent}).
Remplis le schéma canonique et liste les termes documentaires repérés.

Texte OCR :
---
${truncated || "(aucun texte)"}
---

Utilise null pour tout champ absent, ambigu ou incertain.`;
}
