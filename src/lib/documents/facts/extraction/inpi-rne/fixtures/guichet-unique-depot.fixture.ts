/**
 * Anonymized structural fixture: "Synthèse de dépôt — Guichet Unique des
 * Entreprises" (INSEE/INPI formation confirmation), reproducing the REAL
 * document's exact field order and labels — fictitious identity/address.
 *
 * The field order is load-bearing: in the real document, SIRET / NIC / Code
 * APE all appear BEFORE "Nature de l'établissement pour l'entreprise :",
 * inside an "Etablissements - <NIC>" record. A fixture that reorders these
 * fields (SIRET after "Nature...") does not reproduce the bug this fixture
 * exists to catch — see guichet-unique-depot.test.ts.
 */
export const GUICHET_UNIQUE_DEPOT = `
GUICHET UNIQUE DES ENTREPRISES
Synthèse de dépôt – Version définitive – Formalité de création validée
Consultez les informations de votre entreprise sur data.inpi.fr/entreprises/104589478
Identité de l'entreprise
Nom, Prénom(s) : MARTIN ALICE
N° d'identification (SIREN) : 104589478
Etablissements
Nombre d'établissements dans la formalité : 1
Etablissements - 00015
SIRET de l'établissement : 10458947800015
Numéro interne de classement (NIC) : 00015
Code APE de l'établissement : 6820A
Nature de l'établissement pour l'entreprise : Établissement principal
Adresse de l'établissement :
12 RUE DES EXEMPLES
75001 PARIS
Données issues de la reprise des données
`.trim();
