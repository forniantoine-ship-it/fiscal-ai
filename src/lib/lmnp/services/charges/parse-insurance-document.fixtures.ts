/**
 * OCR fixtures for insurance habitation parser tests (AXA-style layouts).
 */

export type InsuranceOcrFixture = {
  id: string;
  description: string;
  rawText: string;
  expected: {
    fournisseur: string;
    montantTTC: number;
    periodeDebut: string;
    periodeFin: string;
    adresseBien: string;
    deductible: boolean;
  };
};

export const INSURANCE_OCR_FIXTURES: InsuranceOcrFixture[] = [
  {
    id: "axa-standard-annual",
    description: "AXA annual premium with risk address block",
    rawText: `
      AXA ASSURANCE
      Contrat Multirisque Habitation
      N° contrat : 1234567890

      Assuré : M DUPONT Jean
      Risque situé :
      12 rue de la République
      Appartement 3
      69002 Lyon

      Période du 01/01/2025 au 31/12/2025
      Prime annuelle TTC : 428,50 €
      Montant à payer TTC : 428,50 €
    `,
    expected: {
      fournisseur: "AXA",
      montantTTC: 428.5,
      periodeDebut: "01/01/2025",
      periodeFin: "31/12/2025",
      adresseBien: "12 rue de la République Appartement 3 69002 Lyon",
      deductible: true,
    },
  },
  {
    id: "axa-effet-echeance",
    description: "AXA contract with effet / échéance labels",
    rawText: `
      AXA France IARD
      Assurance habitation Meublé de tourisme

      Adresse du risque assuré
      8 avenue Gambetta
      33000 Bordeaux

      Date d'effet : 15/03/2024
      Date d'échéance : 14/03/2025

      Total TTC 512,00 EUR
    `,
    expected: {
      fournisseur: "AXA",
      montantTTC: 512,
      periodeDebut: "15/03/2024",
      periodeFin: "14/03/2025",
      adresseBien: "8 avenue Gambetta 33000 Bordeaux",
      deductible: true,
    },
  },
  {
    id: "maif-pno",
    description: "MAIF PNO habitation prime",
    rawText: `
      MAIF
      Assurance PNO — Propriétaire non occupant

      Situation du risque :
      4 bis chemin des Vignes
      29600 Saint-Martin-des-Champs

      Du 01 janvier 2025 au 31 décembre 2025
      Net à payer TTC 318,40 €
    `,
    expected: {
      fournisseur: "MAIF",
      montantTTC: 318.4,
      periodeDebut: "01/01/2025",
      periodeFin: "31/12/2025",
      adresseBien: "4 bis chemin des Vignes 29600 Saint-Martin-des-Champs",
      deductible: true,
    },
  },
];

export const INSURANCE_OCR_INVALID_FIXTURES: { id: string; rawText: string }[] = [
  {
    id: "missing-amount",
    rawText: "AXA ASSURANCE habitation sans montant",
  },
  {
    id: "malformed-amount",
    rawText: "AXA ASSURANCE Prime TTC : ABC EUR",
  },
];
