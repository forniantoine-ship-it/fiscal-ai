

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Rule de Fiscal AI.

Une Rule représente une règle métier indépendante permettant au système de prendre une décision ou d'effectuer un calcul.

---

# Description

Une Rule formalise une connaissance métier.

Elle ne contient aucune implémentation technique.

Elle peut être utilisée par une ou plusieurs Features.

Elle est exécutée uniquement par le Calculation Engine.

---

# Cycle de vie

Créée

↓

Rédigée

↓

Validée

↓

Activée

↓

Exécutée

↓

Versionnée

↓

Archivée

---

# Relations

Utilisée par :

- Calculation Engine
    

S'applique à :

- Dossier
    
- Bien
    
- Calcul
    

Produit :

- Résultat de calcul
    
- Décision métier
    

---

# Attributs

## Identification

- Identifiant
    
- Code
    
- Nom
    
- Version
    

---

## Description

- Objectif
    
- Description
    
- Domaine métier
    
- Catégorie
    

---

## Déclenchement

- Conditions d'application
    
- Données nécessaires
    
- Prérequis
    

---

## Résultat

- Valeur produite
    
- Décision produite
    
- Message éventuel
    

---

## Traçabilité

- Auteur
    
- Date de création
    
- Date de validation
    
- Historique des versions
    
- Statut
    

---

# Provenance

Une Rule est créée par les experts métier.

Elle est validée avant toute utilisation.

---

# Validation

Une Rule peut être :

- Brouillon
    
- En validation
    
- Active
    
- Obsolète
    
- Archivée
    

---

# Utilisation

Cette entité est utilisée par :

- Calculation Engine
    
- Explanation Engine
    

---

# Interdictions

Ne jamais :

- contenir du code applicatif ;
    
- dépendre d'un écran ;
    
- dépendre d'une base de données ;
    
- dépendre d'un moteur spécifique autre que le Calculation Engine.
    

Une Rule exprime une connaissance métier.

Jamais une implémentation.

---

# Critères d'acceptation

✓ Chaque Rule possède un identifiant unique.

✓ Chaque Rule est versionnée.

✓ Les conditions d'application sont explicites.

✓ Les données nécessaires sont identifiées.

✓ Les résultats sont traçables.

---

# ❌ Erreurs d'implémentation interdites

- Coder directement une Rule dans le Calculation Engine.
    
- Modifier une Rule sans créer une nouvelle version.
    
- Créer une Rule dépendante d'une interface utilisateur.
    
- Mélanger plusieurs règles métier dans une seule Rule.
    
- Utiliser une Rule non validée.