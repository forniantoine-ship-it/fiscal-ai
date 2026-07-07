

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Travaux de Fiscal AI.

L'entité Travaux centralise toutes les dépenses liées aux travaux réalisés sur un bien immobilier et constitue la référence unique pour leur qualification, leur traitement fiscal et leur traçabilité.

---

# Description

Un Travail représente une opération réalisée sur un Bien.

Dans le MVP, un Bien peut posséder plusieurs Travaux.

Chaque Travail possède ses propres justificatifs et son propre traitement fiscal.

---

# Cycle de vie

Créé

↓

Documenté

↓

Qualifié

↓

Validé

↓

Utilisé dans les calculs

↓

Archivé

---

# Relations

Appartient à :

- Bien
    

Possède :

- Documents
    

Utilisé par :

- Rules
    
- Calculs
    

Alimente :

- Déclaration
    

---

# Attributs

## Identification

- Identifiant
    
- Référence
    
- Libellé
    
- Description
    

---

## Réalisation

- Date des travaux
    
- Date de facture
    
- Date de paiement
    
- Date de mise en service
    

---

## Prestataire

- Nom
    
- SIREN
    
- Adresse
    
- Contact
    

---

## Informations financières

- Montant HT
    
- TVA
    
- Montant TTC
    
- Mode de paiement
    

---

## Qualification

- Nature des travaux
    
- Catégorie
    
- Traitement fiscal
    
- Immobilisable
    
- Déductible
    
- Amortissable
    

---

## Justificatifs

- Factures
    
- Devis
    
- Attestations
    
- Photos (V2)
    

---

## État

- À qualifier
    
- Qualifié
    
- Validé
    
- Refusé
    
- Archivé
    

---

# Provenance des données

Les informations peuvent provenir :

- des documents importés ;
    
- de l'utilisateur ;
    
- des Rules.
    

---

# Validation

Chaque donnée peut être :

- Obligatoire
    
- Facultative
    
- Calculée
    
- Déduite
    
- Vérifiée
    

---

# Utilisation

Cette entité est utilisée par :

- Validation Engine
    
- Question Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Interdictions

Ne jamais :

- contenir des calculs fiscaux ;
    
- contenir des amortissements calculés ;
    
- dépendre d'un écran ;
    
- dépendre d'une technologie.
    

Les Travaux décrivent exclusivement les opérations réalisées sur le Bien.

---

# Critères d'acceptation

✓ Plusieurs travaux peuvent être associés à un même Bien.

✓ Chaque travail possède ses justificatifs.

✓ Chaque travail possède sa qualification fiscale.

✓ Chaque travail est entièrement traçable.

✓ Les Rules utilisent cette entité sans modifier son contenu.

---

# ❌ Erreurs d'implémentation interdites

- Fusionner plusieurs travaux dans une seule entité.
    
- Stocker les résultats des calculs dans cette entité.
    
- Modifier les montants issus des justificatifs.
    
- Supprimer un travail utilisé dans une déclaration sans traçabilité.
    
- Ajouter des règles fiscales directement dans cette entité.