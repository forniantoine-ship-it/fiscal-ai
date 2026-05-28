import type { InvoiceData } from "../schemas/invoice-schema";

export type InvoiceFixture = {
  label: string;
  fileName: string;
  rawText: string;
  expected: Partial<Record<keyof InvoiceData, string | number | null>>;
};

export const INVOICE_FIXTURES: InvoiceFixture[] = [
  {
    label: "Ikea invoice",
    fileName: "ikea-facture.pdf",
    rawText: `IKEA France SAS
ZAC de la Plaine Saint-Denis
FACTURE N° FR-2024-887654
Date : 12/04/2025

Client : M. DUPONT

Article                          Qté    Prix TTC
MALM commode 4 tiroirs blanc       1    149,00 €
BILLY bibliothèque blanche         2     89,00 €
LACK table basse                   1     29,99 €

Total TTC                        356,99 €
Dont TVA 20%                      59,50 €

Paiement par carte bancaire.`,
    expected: {
      supplierName: "IKEA",
      totalTtc: 356.99,
      vatAmount: 59.5,
      currency: "EUR",
      categoryHint: "furniture",
    },
  },
  {
    label: "Leroy Merlin invoice",
    fileName: "leroy-merlin-travaux.pdf",
    rawText: `LEROY MERLIN FRANCE
Facture n° LM-4589123
Date de facturation : 2025-02-18

Travaux de rénovation salle de bain
Carrelage mural 30x60 cm              420,00 €
Colle carrelage 25 kg                  38,50 €
Main d'oeuvre pose carrelage          680,00 €

Total TTC                           1 138,50 €
TVA 10%                               103,50 €

Devise : EUR`,
    expected: {
      supplierName: "LEROY MERLIN",
      invoiceDate: "2025-02-18",
      totalTtc: 1138.5,
      vatAmount: 103.5,
      currency: "EUR",
      categoryHint: "works",
    },
  },
  {
    label: "Appliance invoice",
    fileName: "darty-lave-linge.pdf",
    rawText: `DARTY — Facture
N° FA-77889900
Date : 05/06/2025

Lave-linge Samsung WW90T554DAW
Réf. 4567890

Prix TTC                           649,99 €
Montant TVA 20%                     108,33 €

Merci pour votre achat.`,
    expected: {
      supplierName: "DARTY",
      totalTtc: 649.99,
      vatAmount: 108.33,
      categoryHint: "appliance",
    },
  },
  {
    label: "Furniture invoice",
    fileName: "but-canape.pdf",
    rawText: `BUT
Facture client FC-2025-334455
Émise le 20/01/2025

Canapé d'angle convertible LENA
Couleur gris anthracite

Montant total TTC                  899,00 €
TVA collectée                       149,83 €`,
    expected: {
      supplierName: "BUT",
      invoiceDate: "2025-01-20",
      totalTtc: 899,
      categoryHint: "furniture",
    },
  },
  {
    label: "Work invoice",
    fileName: "artisan-plomberie.pdf",
    rawText: `SARL MARTIN PLOMBERIE
14 rue des Artisans — 69003 Lyon
Facture N° 2025-042

Date : 15/03/2025
Client : SCI Les Tilleuls

Remplacement chauffe-eau
Fourniture chauffe-eau 200L          520,00 €
Main d'oeuvre installation           280,00 €

TOTAL TTC                            800,00 €
TVA 10%                               72,73 €`,
    expected: {
      supplierName: "MARTIN PLOMBERIE",
      invoiceDate: "2025-03-15",
      totalTtc: 800,
      vatAmount: 72.73,
      categoryHint: "works",
    },
  },
];
