

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Date d'acquisition".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Date d'acquisition correspond à la date à laquelle le bien immobilier est juridiquement acquis par son propriétaire.

Elle constitue une donnée fondamentale utilisée dans de nombreux calculs fiscaux.

---

# Entité

- Bien
    

---

# Nom métier

Date d'acquisition

---

# Nom technique

acquisition_date

---

# Type

Date

---

# Format

AAAA-MM-JJ

---

# Valeur obligatoire

Oui

---

# Valeur par défaut

Aucune

---

# Source prioritaire

Document

---

# Sources autorisées

- Acte authentique
    
- Acte notarié
    
- Utilisateur
    

---

# Moteurs concernés

- OCR Engine
    
- Classification Engine
    
- Validation Engine
    
- Question Engine
    
- Calculation Engine
    

---

# Features concernées

- F-002 Création du bien
    
- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    

---

# Rules concernées

Toutes les Rules nécessitant la date d'acquisition.

---

# Validation

Le champ doit :

- être une date valide ;
    
- ne pas être dans le futur ;
    
- être cohérent avec la date de signature ;
    
- être cohérent avec la date de mise en location.
    

---

# Dépendances

Peut impacter :

- Date de mise en location
    
- Début des amortissements
    
- Calculs fiscaux
    

---

# Questions associées

Si la valeur est absente :

Le Question Engine peut demander :

**"Quelle est la date d'acquisition du bien ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Acte de vente
    

---

# Utilisation

Ce champ est utilisé pour :

- les calculs ;
    
- les validations ;
    
- les contrôles de cohérence ;
    
- les formulaires fiscaux.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- sa source ;
    
- la date d'obtention ;
    
- le moteur l'ayant renseignée ;
    
- le niveau de confiance.
    

---

# Critères d'acceptation

✓ Une seule valeur est autorisée.

✓ La provenance est toujours connue.

✓ Toute modification est historisée.

✓ Le champ est disponible pour les Rules.

---

# ❌ Erreurs d'implémentation interdites

- Saisir une date future.
    
- Utiliser une valeur sans provenance.
    
- Écraser une valeur validée sans historisation.
    
- Utiliser un format différent du standard.
    
- Calculer une valeur à partir d'une date invalide.