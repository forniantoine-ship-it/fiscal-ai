

Version : 1.0

Statut : 🔒 Entité métier

ID métier

---

# Objectif

Définir l'ensemble des informations représentant un bien immobilier dans Fiscal AI.

Cette entité constitue la référence unique utilisée par l'ensemble du système.

---

# Description

Un Bien représente un investissement immobilier faisant l'objet d'une déclaration LMNP.

Il appartient obligatoirement à un seul Dossier.

Dans le MVP, un Dossier ne peut contenir qu'un seul Bien.

---

# Cycle de vie

Créé

↓

Complété

↓

Documenté

↓

Validé

↓

Calculé

↓

Déclaré

↓

Archivé

---

# Relations

Appartient à :

- Dossier
    

Possède :

- Documents
    
- Calculs
    

Utilise :

- Rules
    

Produit :

- Déclaration fiscale
    

---

# Attributs

## Identification

- Identifiant
    
- Nom libre
    
- Référence interne
    

---

## Acquisition

- Date d'acquisition
    
- Date de signature
    
- Date de mise en location
    
- Prix d'acquisition
    
- Valeur du terrain
    
- Valeur du bâti
    
- Frais de notaire
    
- Frais d'agence
    
- Frais d'acquisition
    

---

## Localisation

- Adresse
    
- Code postal
    
- Ville
    
- Pays
    

---

## Caractéristiques

- Type de bien
    
- Surface habitable
    
- Nombre de pièces
    
- Étage
    
- Parking
    
- Cave
    
- Balcon
    
- Terrasse
    

---

## Exploitation

- Type de location
    
- Début d'exploitation
    
- Fin d'exploitation
    
- Statut d'exploitation
    

---

## Financement

- Mode de financement
    
- Montant emprunté
    
- Durée
    
- Taux
    
- Assurance
    

---

## Travaux

- Montant
    
- Nature
    
- Date
    
- Catégorie
    

---

## Mobilier

- Valeur totale
    
- Liste des équipements
    
- Date d'acquisition
    

---

## Fiscalité

- Régime fiscal
    
- Durée d'amortissement
    
- Base amortissable
    

---

# Provenance des données

Chaque attribut possède une origine :

- Utilisateur
    
- Document
    
- Rule
    
- Calcul
    

Une donnée peut être modifiée uniquement par son processus autorisé.

---

# Validation

Chaque attribut peut être :

- Obligatoire
    
- Facultatif
    
- Calculé
    
- Déduit
    
- Vérifié
    

---

# Utilisation

Cette entité est utilisée par :

- Workflow Engine
    
- Validation Engine
    
- Question Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Interdictions

Ne jamais :

- ajouter une logique métier ;
    
- ajouter un calcul ;
    
- ajouter une logique d'interface ;
    
- ajouter une dépendance technique.
    

Cette entité décrit uniquement le métier.

---

# Critères d'acceptation

✓ Tous les attributs métier du bien sont centralisés ici.

✓ Aucune information n'est dupliquée ailleurs.

✓ Les Features utilisent cette entité.

✓ Les Rules utilisent cette entité.

✓ Les futurs écrans utilisent cette entité.

---

# ❌ Erreurs d'implémentation interdites

- Ajouter un champ directement dans une base de données sans mettre à jour cette entité.
    
- Ajouter un champ dans une page sans mettre à jour cette entité.
    
- Ajouter un champ utilisé par une Rule sans le documenter ici.
    
- Mélanger des informations techniques avec les informations métier.