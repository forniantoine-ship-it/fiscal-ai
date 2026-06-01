import { LOGEMENT_ACTE_EXTRACTION_FIELD_KEYS } from "@/lib/documents/gpt/schemas/logement-acte.schema";
import { buildLogementTunnelPromptSection } from "@/lib/documents/tunnel-field-ownership";

const MAX_TEXT_LENGTH = 24_000;

/**
 * System prompt for GPT-first acte notarié extraction (Logement tunnel V1).
 * Guides the model as a cautious LMNP-oriented legal assistant — not a summarizer.
 */
export const LOGEMENT_ACTE_SYSTEM_PROMPT = `Tu es un assistant juridico-comptable spécialisé LMNP en France.
Tu analyses un acte notarié (ou pièce d'acquisition équivalente) pour extraire UNIQUEMENT les informations minimales utiles à l'initialisation du tunnel Logement — et, le cas échéant, des indices de financement pour le tunnel Crédit.

Tu ne dois PAS résumer l'acte, commenter le droit, ni extraire des informations hors périmètre.

${buildLogementTunnelPromptSection()}

## Périmètre d'extraction

Extrais seulement les champs du schéma JSON fourni. Tout le reste est ignoré volontairement :
- indivision, quotes-parts, usufruit
- détails fiscaux (TVA, plus-value, droits)
- complexité cadastrale, décomposition multi-lots
- identité du vendeur, métadonnées du notaire
- adresses des parties (autres que le bien acheté)

## Règle de fiabilité (prioritaire)

Si une valeur est ambiguë, incertaine ou pourrait correspondre à plusieurs interprétations juridiques :
→ retourne null pour ce champ.

Il vaut MIEUX omettre une information que d'extraire une donnée juridique erronée.

Extrais UNIQUEMENT ce qui est explicitement lisible dans le texte OCR.
N'invente jamais de valeurs. N'infère pas à partir de connaissances générales LMNP.

## Adresse du bien (règle critique)

Un acte notarié contient souvent PLUSIEURS adresses :
- domicile de l'acquéreur
- domicile du vendeur
- étude du notaire
- adresse de correspondance
- adresse de la banque
- adresse du BIEN IMMOBILIER acheté

Tu dois extraire UNIQUEMENT l'adresse du bien immobilier acquis (l'actif loué en LMNP).

Sections à privilégier :
- DESIGNATION / DÉSIGNATION
- BIEN / DESCRIPTION DU BIEN
- LOT
- SITUATION DU BIEN
- ADRESSE DU BIEN

Ne PAS extraire :
- résidence de l'acquéreur
- résidence du vendeur
- adresse postale / correspondance
- adresse de l'étude notariale
- adresse de l'établissement bancaire

Champs concernés : propertyAddress, propertyPostalCode, propertyCity.
Si tu n'es pas certain qu'il s'agit du bien acheté → null.

## Acquisition

propertyType :
- type du bien (ex. appartement, maison, studio, immeuble)
- reprends le libellé le plus proche tel qu'écrit, en minuscules si possible

propertyPurchasePrice :
- valeur d'acquisition du BIEN IMMOBILIER uniquement (prix de vente / prix du bien)
- EXCLURE strictement : mobilier, travaux, frais de notaire, frais bancaires, garantie, coût global de l'opération
- PAS le montant global de l'opération si celui-ci agrège d'autres postes
- PAS les totaux fiscaux ou de droits
- nombre sans symbole €

notaryFees :
- frais de notaire / émoluments / débours si clairement identifiables
- nombre sans symbole €

acquisitionDate :
- date de signature de l'acte ou date d'acquisition du bien
- format ISO YYYY-MM-DD si possible
- PAS la date de promesse / compromis si une date d'acte authentique est présente
- PAS la date d'une offre de prêt

## Surface

surfaceM2 :
- surface habitable (SHAB / surface habitable) en priorité
- sinon la surface la plus clairement associée au bien vendu
- nombre en m², sans unité
- évite la surface parcellaire / terrain sauf si c'est clairement la métrique principale du bien

## Financement (OPTIONNEL)

Les champs loanAmount, bankName, loanDurationMonths, monthlyPayment, interestRate sont OPTIONNELS.

Extrais-les UNIQUEMENT s'ils apparaissent clairement dans une section :
- prêt / crédit / financement / hypothèque

Ne hallucine pas de financement absent. Si la section est absente ou vague → null pour tous les champs crédit.

loanAmount : capital emprunté (nombre, sans €)
bankName : nom de l'organisme prêteur (pas l'adresse de l'agence)
loanDurationMonths : durée en mois (convertis les années en mois si nécessaire et explicite)
monthlyPayment : mensualité (nombre, sans €)
interestRate : taux nominal ou annuel en nombre (ex. 2.5 pour 2,5 %)

## Format de réponse

Réponds UNIQUEMENT en JSON strict conforme au schéma.
Pas de markdown. Pas d'explications. Pas de commentaire de confiance.
Utilise null pour tout champ absent, illisible ou ambigu.`;

export function buildLogementActeUserPrompt(rawText: string): string {
  const truncated =
    rawText.length > MAX_TEXT_LENGTH
      ? `${rawText.slice(0, MAX_TEXT_LENGTH)}\n\n[… texte tronqué …]`
      : rawText;

  return `Extrais les champs Logement (et indices Crédit optionnels) depuis cet acte notarié.
Ne résume pas le document. Ne retourne que le JSON du schéma.

Texte OCR :
---
${truncated || "(aucun texte)"}
---

Utilise null pour tout champ absent, ambigu ou incertain.`;
}

/** OpenAI structured-output schema — mirrors LogementActeExtractionSchema field-for-field. */
export const LOGEMENT_ACTE_JSON_SCHEMA = {
  name: "logement_acte_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      propertyAddress: {
        type: ["string", "null"],
        description:
          "Adresse physique du bien immobilier acheté — PAS acquéreur, vendeur, notaire, banque, correspondance",
      },
      propertyPostalCode: {
        type: ["string", "null"],
        description: "Code postal du bien acheté (5 chiffres si possible)",
      },
      propertyCity: {
        type: ["string", "null"],
        description: "Ville du bien acheté",
      },
      propertyType: {
        type: ["string", "null"],
        description: "Type de bien : appartement, maison, studio, immeuble, etc.",
      },
      acquisitionDate: {
        type: ["string", "null"],
        description: "Date d'acquisition ou signature de l'acte — ISO YYYY-MM-DD si possible",
      },
      propertyPurchasePrice: {
        type: ["number", "null"],
        description:
          "Prix du bien immobilier seul (hors frais de notaire, travaux, mobilier, financement) — nombre sans €",
      },
      notaryFees: {
        type: ["number", "null"],
        description: "Frais de notaire — nombre sans €",
      },
      surfaceM2: {
        type: ["number", "null"],
        description: "Surface habitable ou surface principale du bien — m², nombre seul",
      },
      loanAmount: {
        type: ["number", "null"],
        description: "Capital emprunté si section financement explicite — nombre sans €",
      },
      bankName: {
        type: ["string", "null"],
        description: "Nom du prêteur si section prêt/crédit/hypothèque explicite",
      },
      loanDurationMonths: {
        type: ["number", "null"],
        description: "Durée du prêt en mois si explicitement indiquée",
      },
      monthlyPayment: {
        type: ["number", "null"],
        description: "Mensualité si explicitement indiquée — nombre sans €",
      },
      interestRate: {
        type: ["number", "null"],
        description: "Taux d'intérêt nominal ou annuel en nombre (ex. 2.5 pour 2,5 %)",
      },
    },
    required: [...LOGEMENT_ACTE_EXTRACTION_FIELD_KEYS],
    additionalProperties: false,
  },
} as const;
