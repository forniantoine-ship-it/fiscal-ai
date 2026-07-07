

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité centrale de Fiscal AI.

Le Dossier représente une déclaration fiscale LMNP complète.

Toutes les autres entités gravitent autour de lui.

---

# Description

Le Dossier est l'unité de travail principale de Fiscal AI.

Il regroupe toutes les informations nécessaires à la production d'une déclaration fiscale.

Dans le MVP, un Dossier est associé à un seul Bien.

---

# Cycle de vie

Créé

↓

En cours de constitution

↓

En attente de documents

↓

Analyse documentaire

↓

Complété

↓

Calculé

↓

Déclaration générée

↓

Terminé

↓

Archivé

---

# Relations

Possède :

- 1 Bien (MVP)
    
- Plusieurs Documents
    
- Plusieurs Questions
    
- Plusieurs Réponses
    
- Plusieurs Calculs
    
- 1 Déclaration
    

Utilise :

- Rules
    
- Engines
    

---

# Attributs

## Identification

- Identifiant unique
    
- Référence dossier
    
- Année fiscale
    
- Date de création
    
- Date de dernière modification
    
- Statut
    

---

## Propriétaire

- Nom
    
- Prénom
    
- Date de naissance
    
- Adresse
    
- Téléphone
    
- Email
    

---

## Fiscalité

- Régime fiscal
    
- Exercice fiscal
    
- Devise
    
- Pays
    

---

## Suivi

- Progression
    
- État courant
    
- Dernière étape validée
    
- Date de clôture
    

---

# Provenance des données

Chaque donnée provient de :

- Utilisateur
    
- Documents
    
- Rules
    
- Calculs
    

---

# Validation

Chaque attribut est :

- Obligatoire
    
- Facultatif
    
- Calculé
    
- Déduit
    
- Vérifié
    

---

# Utilisation

Cette entité est utilisée par :

- Workflow Engine
    
- Document Engine
    
- Validation Engine
    
- Question Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Interdictions

Ne jamais :

- ajouter une logique métier ;
    
- ajouter une logique technique ;
    
- ajouter des calculs ;
    
- ajouter des comportements d'interface.
    

Cette entité décrit uniquement le métier.

---

# Critères d'acceptation

✓ Le Dossier centralise toutes les informations métier.

✓ Toutes les autres entités sont rattachées au Dossier.

✓ Aucun moteur ne modifie directement la structure de cette entité.

✓ Toute évolution du Dossier est documentée ici avant d'être développée.

---

# ❌ Erreurs d'implémentation interdites

- Créer une information métier hors du Dossier sans justification.
    
- Ajouter un attribut directement en base de données sans mettre à jour cette entité.
    
- Dupliquer une information déjà présente dans une autre entité.
    
- Mélanger données métier et données techniques.