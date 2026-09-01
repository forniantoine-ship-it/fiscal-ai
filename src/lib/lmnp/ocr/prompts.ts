import type { DocumentCategory, DocumentType } from "../types";

export const OCR_RELIABILITY_RULES = `
RÈGLES DE FIABILITÉ (priorité absolue) :
- Une mauvaise extraction fiscale est PIRE qu'une absence d'extraction.
- Si tu n'es pas certain à ≥ 80 %, renvoie null pour ce champ.
- Ne devine JAMAIS un montant à partir du contexte ou de moyennes.
- Ne confonds pas : numéro de facture, code postal, référence, page, année fiscale avec un montant.
- Les montants doivent être des nombres décimaux en euros (ex. 1420.50), sans symbole €.
- Indique la période du montant principal : monthly, annual, one_time ou unknown.
- Indique si le montant est TTC, HT ou unknown.
- documentTypeConfidence : confiance 0-100 dans le type de document détecté.
- Pour chaque champ extrait avec confiance ≥ 70, indique sa position approximative sur l'image (region en % 0-100).
`.trim();

const TYPE_GUIDANCE: Record<DocumentType, string> = {
  lease_contract: `
BAIL / CONTRAT DE LOCATION MEUBLÉE :
- Montant principal : loyer mensuel charges comprises (TTC) ou loyer annuel si explicitement indiqué.
- Pas de TVA sur les loyers d'habitation — vatAmount = null.
- Fournisseur : bailleur, agence ou SCI propriétaire.
- Adresse : adresse complète du bien loué (numéro, rue, ville).
- Date : date de signature ou début de bail.`,

  rent_receipt: `
QUITTANCE DE LOYER :
- Montant : loyer du mois (souvent mensuel) — indique amountPeriod = monthly si c'est un loyer mensuel.
- Pas de TVA — vatAmount = null.
- Fournisseur : bailleur ou agence.
- Adresse : adresse du bien.
- Date : mois/année du loyer quittancé.`,

  rent_bank_statement: `
RELEVÉ BANCAIRE — LOYERS ENCAISSÉS :
- Montant : total des loyers encaissés sur la période visible (souvent mensuel ou trimestriel).
- Si plusieurs virements loyer, prends le total des crédits identifiés comme loyer.
- Pas de TVA.
- Fournisseur : nom de la banque.
- Date : fin de période du relevé.`,

  bank_statement: `
RELEVÉ BANCAIRE GÉNÉRAL :
- Montant : uniquement si des loyers sont clairement identifiables, sinon totalAmount = null.
- Ne prends pas le solde du compte ni les débits.`,

  property_tax: `
AVIS DE TAXE FONCIÈRE :
- Montant : montant total à payer (TTC) sur l'avis — souvent libellé "Montant à payer" ou "Total".
- Pas de TVA sur la taxe foncière — vatAmount = null.
- Fournisseur : Direction générale des Finances publiques / Trésor public.
- Adresse : adresse du bien imposé.
- Date : date limite de paiement ou année d'imposition.`,

  insurance_invoice: `
FACTURE / ATTESTATION ASSURANCE PNO :
- Montant : prime annuelle TTC ou montant facturé.
- TVA : uniquement si explicitement indiquée sur la facture.
- Fournisseur : compagnie d'assurance (AXA, MAIF, Allianz…).
- Adresse : adresse du bien assuré si visible.`,

  condo_charges: `
APPEL DE CHARGES / SYNDIC :
- Montant : montant total des charges (TTC) pour la période.
- TVA : rarement applicable — null sauf si explicitement indiquée.
- Fournisseur : syndic de copropriété.
- Adresse : adresse de l'immeuble / lot.`,

  works_invoice: `
FACTURE TRAVAUX / ENTRETIEN :
- Montant : total TTC de la facture.
- TVA : montant TVA si indiqué séparément.
- Fournisseur : artisan, entreprise, fournisseur.
- Date : date de facturation.`,

  furniture_invoice: `
FACTURE MOBILIER / ÉQUIPEMENT :
- Montant : total TTC de la facture d'achat.
- TVA : si indiquée.
- Fournisseur : magasin ou vendeur.
- Date : date d'achat.`,

  loan_interest_certificate: `
ATTESTATION D'INTÉRÊTS D'EMPRUNT :
- Montant : intérêts payés sur l'année fiscale (souvent annual).
- Pas de TVA.
- Fournisseur : banque prêteuse.
- Date : année fiscale couverte.`,

  loan_schedule: `
TABLEAU D'AMORTISSEMENT :
- Montant : intérêts de l'année ou cumul annuel si visible.
- Ne prends pas le capital remboursé ni le capital restant dû.`,

  notary_deed: `
ACTE NOTARIÉ / ACQUISITION :
- Montant : prix d'acquisition TTC si visible (one_time).
- Fournisseur : étude notariale.
- Adresse : adresse du bien acquis.`,

  unknown: `
TYPE INCONNU :
- documentType = unknown si aucun type LMNP ne correspond clairement.
- N'extrais un montant que s'il est clairement libellé comme un montant fiscal pertinent.
- documentTypeConfidence ≤ 50.`,
};

export function buildOcrSystemPrompt(): string {
  const typeBlocks = Object.entries(TYPE_GUIDANCE)
    .filter(([k]) => k !== "unknown")
    .map(([type, guidance]) => `### ${type}\n${guidance.trim()}`)
    .join("\n\n");

  return `Tu es un expert OCR fiscal pour la location meublée non professionnelle (LMNP) en France.

${OCR_RELIABILITY_RULES}

GUIDE PAR TYPE DE DOCUMENT :
${typeBlocks}

${TYPE_GUIDANCE.unknown}`;
}

export function buildOcrUserPrompt(params: {
  fileName: string;
  userCategory: DocumentCategory;
  pageCount: number;
  suggestedType?: DocumentType;
  fiscalYear?: number;
}): string {
  const hints: string[] = [
    `Fichier : "${params.fileName}".`,
    `Catégorie choisie par l'utilisateur : ${params.userCategory}.`,
    `Pages analysées : ${params.pageCount}.`,
  ];

  if (params.suggestedType && params.suggestedType !== "unknown") {
    hints.push(
      `Suggestion pré-analyse (nom de fichier) : ${params.suggestedType} — confirme ou corrige avec documentTypeConfidence.`,
    );
  }

  if (params.fiscalYear) {
    hints.push(
      `Exercice fiscal visé : ${params.fiscalYear}. Les dates et montants doivent être cohérents avec cette année.`,
    );
  }

  hints.push(
    "Extrais uniquement les champs visibles et fiables. Positionne chaque champ extrait (region) sur l'image en pourcentages.",
  );

  return hints.join("\n");
}
