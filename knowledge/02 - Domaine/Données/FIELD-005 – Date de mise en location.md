

Version : 1.0

Statut : 🔒 Champ métier

---

# Objectif

Définir de manière unique le champ "Date de mise en location".

Ce document constitue la référence officielle de ce champ dans Fiscal AI.

---

# Description

La Date de mise en location correspond à la date à laquelle le bien est effectivement mis à disposition d'un locataire.

Elle marque le début de l'exploitation du bien en LMNP.

Cette date est essentielle pour le calcul des amortissements, des charges déductibles et des proratas.

---

# Entité

- Bien
    

---

# Nom métier

Date de mise en location

---

# Nom technique

rental_start_date

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

- Bail
    
- État des lieux
    
- Première quittance
    
- Utilisateur
    

---

# Moteurs concernés

- OCR Engine
    
- Classification Engine
    
- Validation Engine
    
- Question Engine
    
- Calculation Engine
    
- Explanation Engine
    

---

# Features concernées

- F-002 Création du bien
    
- F-004 Analyse documentaire
    
- F-005 Compléter les informations
    
- F-006 Calcul fiscal
    
- F-007 Génération de la déclaration
    

---

# Rules concernées

Toutes les Rules relatives :

- au début d'exploitation ;
    
- aux amortissements ;
    
- aux proratas temporis ;
    
- aux charges déductibles.
    

---

# Validation

Le champ doit :

- être une date valide ;
    
- ne pas être dans le futur ;
    
- être postérieure ou égale à la date d'acquisition ;
    
- être cohérente avec les documents fournis.
    

---

# Dépendances

Impacte notamment :

- Début des amortissements
    
- Durée d'exploitation
    
- Calcul des proratas
    
- Charges déductibles
    
- Déclaration fiscale
    

---

# Questions associées

Si la valeur est absente :

**"À quelle date le bien a-t-il été mis en location pour la première fois ?"**

---

# Documents pouvant fournir cette donnée

- Bail d'habitation
    
- Bail commercial
    
- État des lieux d'entrée
    
- Première quittance de loyer
    
- Mandat de gestion
    

---

# Utilisation

Ce champ est utilisé pour :

- déterminer le début d'exploitation ;
    
- calculer les proratas ;
    
- déclencher les amortissements ;
    
- contrôler la cohérence du dossier ;
    
- alimenter les formulaires fiscaux.
    

---

# Traçabilité

Pour chaque valeur, Fiscal AI conserve :

- la valeur ;
    
- la source ;
    
- le document d'origine ;
    
- la date d'obtention ;
    
- le moteur ayant renseigné la donnée ;
    
- le niveau de confiance.
    

---

# Critères d'acceptation

✓ Une seule date officielle est conservée.

✓ La provenance est connue.

✓ Toute modification est historisée.

✓ La date est cohérente avec les autres dates du dossier.

---

# ❌ Erreurs d'implémentation interdites

- Accepter une date antérieure à la date d'acquisition sans justification.
    
- Utiliser une date future.
    
- Modifier la valeur sans historisation.
    
- Calculer les amortissements sans date de mise en location valide.
    
- Utiliser une valeur dont la provenance est inconnue.