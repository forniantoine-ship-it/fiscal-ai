import type { DocumentType } from "./document-classification-types";

/** Representative text snippets for manual / integration verification of the classifier. */
export type ClassifyFixture = {
  label: string;
  expectedType: DocumentType;
  rawText: string;
};

export const CLASSIFY_FIXTURES: ClassifyFixture[] = [
  {
    label: "Ikea invoice",
    expectedType: "invoice",
    rawText: `IKEA France SAS
FACTURE N° 123456789
Date : 15/03/2024

Article                          Qté    Prix TTC
BILLY bibliothèque blanche         1     89,00 €
MALM commode 4 tiroirs             1    149,00 €

Total TTC                          238,00 €
TVA 20%                             39,67 €

Merci de votre achat.`,
  },
  {
    label: "Bank loan offer",
    expectedType: "loan_offer",
    rawText: `Crédit Agricole — Offre de prêt immobilier
Référence : OP-2024-789456

Monsieur DUPONT Jean
Objet : Proposition de financement pour acquisition immobilière

Montant du prêt proposé : 180 000,00 €
Durée : 240 mois
Taux nominal : 3,45 % fixe
Mensualité estimée : 1 042,30 €

Cette offre est valable 30 jours.
Signature et acceptation requises.`,
  },
  {
    label: "Notary act",
    expectedType: "notary_act",
    rawText: `Maître LEFEBVRE — Notaire associé
Étude notariale de Paris

ACTE AUTHENTIQUE DE VENTE

L'an deux mille vingt-quatre, le quinze mars,
Par-devant Maître LEFEBVRE, notaire soussigné,

A comparu :
Monsieur MARTIN Pierre, vendeur,
Madame DURAND Sophie, acquéreur,

Lesquels ont établi la présente vente d'un appartement sis
12 rue de la Paix, 75002 Paris.

Prix de vente : 320 000 euros.`,
  },
  {
    label: "INPI registration",
    expectedType: "inpi_document",
    rawText: `INSTITUT NATIONAL DE LA PROPRIÉTÉ INDUSTRIELLE
Guichet Unique — INPI

RÉCÉPISSÉ DE DÉPÔT D'IMMATRICULATION

Dénomination : SCI LES TILLEULS
Forme juridique : Société civile immobilière
SIREN : 912 345 678
Date de dépôt : 10/01/2024

Votre dossier d'immatriculation a été enregistré.
Extrait Kbis disponible sous 48h.`,
  },
  {
    label: "Unsupported random document",
    expectedType: "unknown",
    rawText: `Programme de la conférence Tech Summit 2024

Mercredi 12 juin — Amphithéâtre B
09:00 Keynote : L'avenir du cloud
11:00 Atelier : Introduction à Rust
14:00 Table ronde : IA et éthique

Inscription gratuite sur techsummit.example.com`,
  },
];
