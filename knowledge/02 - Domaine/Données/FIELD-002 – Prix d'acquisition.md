

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Prix d'acquisition".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

Le Prix d'acquisition correspond au prix d'achat du bien immobilier, hors ventilation entre terrain, bâti, mobilier et frais d'acquisition.

Il constitue l'une des principales données utilisées pour les calculs fiscaux.

---

# Entité

- Bien
    

---

# Nom métier

Prix d'acquisition

---

# Nom technique

purchase_price

---

# Type

Montant

---

# Format

Nombre décimal (EUR)

---

# Unité

Euro (€)

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
    
- Acte de vente
    
- Compromis de vente
    
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

Toutes les Rules utilisant le coût d'acquisition du bien.

---

# Validation

Le champ doit :

- être supérieur à zéro ;
    
- être exprimé en euros ;
    
- être cohérent avec les montants présents dans les actes ;
    
- être cohérent avec la ventilation terrain + bâti + mobilier + frais lorsque celle-ci est disponible.
    

---

# Dépendances

Impacte notamment :

- Valeur du terrain
    
- Valeur du bâti
    
- Frais d'acquisition
    
- Base amortissable
    
- Calculs d'amortissement
    
- Déclaration fiscale
    

---

# Questions associées

Si la valeur est absente :

**"Quel est le prix d'acquisition du bien (hors ventilation) ?"**

---

# Documents pouvant fournir cette donnée

- Acte authentique
    
- Compromis de vente
    
- Acte de vente
    

---

# Utilisation

Ce champ est utilisé pour :

- la ventilation du prix ;
    
- les contrôles de cohérence ;
    
- les calculs fiscaux ;
    
- les amortissements ;
    
- les formulaires fiscaux.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la devise ;
    
- la source ;
    
- le document d'origine ;
    
- la date d'obtention ;
    
- le moteur ayant renseigné la donnée ;
    
- le niveau de confiance.
    

---

# Critères d'acceptation

✓ Une seule valeur officielle est conservée.

✓ La provenance est connue.

✓ Toute modification est historisée.

✓ Le champ est disponible pour les Rules, les calculs et les formulaires.

---

# ❌ Erreurs d'implémentation interdites

- Accepter un montant négatif ou nul.
    
- Mélanger le prix d'acquisition avec les frais d'acquisition.
    
- Modifier la valeur sans historisation.
    
- Utiliser une valeur dont la provenance est inconnue.
    
- Utiliser une devise différente sans conversion explicite.