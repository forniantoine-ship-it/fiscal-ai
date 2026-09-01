

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Mobilier de Fiscal AI.

L'entité Mobilier centralise tous les biens mobiliers acquis dans le cadre d'un investissement LMNP et constitue la référence unique pour leur gestion, leur amortissement et leur traçabilité.

---

# Description

Un Mobilier représente un bien meuble utilisé dans l'exploitation du logement.

Dans le MVP, un Bien peut posséder plusieurs éléments de mobilier.

Chaque élément est géré individuellement.

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

Amorti

↓

Sorti d'actif

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

## Acquisition

- Date d'achat
    
- Date de mise en service
    
- Fournisseur
    
- Référence de facture
    

---

## Informations financières

- Prix HT
    
- TVA
    
- Prix TTC
    
- Frais accessoires
    

---

## Caractéristiques

- Catégorie
    
- Quantité
    
- État
    
- Durée d'utilisation estimée
    

---

## Traitement fiscal

- Immobilisable
    
- Amortissable
    
- Durée d'amortissement
    
- Base amortissable
    

---

## Justificatifs

- Facture
    
- Bon de livraison
    
- Garantie
    

---

## État

- À qualifier
    
- En service
    
- Amorti
    
- Cédé
    
- Mis au rebut
    
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

- contenir les calculs d'amortissement ;
    
- contenir des règles fiscales ;
    
- dépendre d'un écran ou d'une technologie ;
    
- fusionner plusieurs meubles dans une seule entité.
    

Chaque élément de mobilier est une entité indépendante.

---

# Critères d'acceptation

✓ Chaque meuble possède un identifiant unique.

✓ Plusieurs meubles peuvent être associés à un même Bien.

✓ Chaque meuble possède ses justificatifs.

✓ Les caractéristiques d'origine sont conservées.

✓ Les Rules utilisent cette entité sans la modifier.

---

# ❌ Erreurs d'implémentation interdites

- Stocker les amortissements calculés dans cette entité.
    
- Modifier le prix d'acquisition après validation sans traçabilité.
    
- Regrouper plusieurs meubles dans une seule fiche.
    
- Supprimer un meuble utilisé dans un calcul sans historisation.
    
- Ajouter une logique métier directement dans cette entité.