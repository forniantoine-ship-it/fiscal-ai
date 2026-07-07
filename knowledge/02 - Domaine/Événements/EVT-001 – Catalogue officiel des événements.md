

Version : 1.0

Statut : 🔒 Référence

---

# Objectif

Définir l'ensemble des événements utilisés par Fiscal AI.

Les événements constituent l'unique moyen de communication entre le Workflow Engine et les autres moteurs.

Tous les événements du système doivent être définis dans ce document.

---

# Principes

Un événement représente un fait.

Il ne représente jamais une intention.

Il est immuable.

Un événement ne peut être émis qu'une seule fois.

Chaque événement possède un émetteur.

Le Workflow Engine est le principal consommateur des événements.

---

# Événements du MVP

## Gestion du dossier

DOSSIER_CREE

DOSSIER_SUPPRIME

DOSSIER_CLOTURE

---

## Gestion du bien

BIEN_CREE

BIEN_MODIFIE

BIEN_SUPPRIME

---

## Gestion documentaire

DOCUMENT_IMPORTE

DOCUMENT_SUPPRIME

DOCUMENT_CORROMPU

DOCUMENT_NON_SUPPORTE

---

## OCR

OCR_DEMARRE

OCR_TERMINE

OCR_ECHEC

---

## Classification

CLASSIFICATION_DEMARREE

CLASSIFICATION_TERMINE

CLASSIFICATION_IMPOSSIBLE

---

## Validation

VALIDATION_DEMARREE

VALIDATION_TERMINE

VALIDATION_ECHEC

---

## Questions

QUESTION_GENEREE

QUESTION_REPONDUE

QUESTION_ANNULEE

---

## Calcul

CALCUL_DEMARRE

CALCUL_TERMINE

CALCUL_ECHEC

---

## Déclaration

DECLARATION_GENEREE

DECLARATION_EXPORTEE

---

## Mission

MISSION_CALCULEE

---

# Structure d'un événement

Chaque événement possède :

- un identifiant ;
    
- une date ;
    
- un moteur émetteur ;
    
- un dossier ;
    
- une charge utile (payload).
    

---

# Règles

Un événement décrit toujours quelque chose qui s'est produit.

Un événement ne déclenche jamais directement un autre moteur.

Le Workflow Engine reçoit l'événement et décide de la suite.

Les événements ne contiennent jamais de logique métier.

---

# Émetteurs autorisés

Workflow Engine

Document Engine

OCR Engine

Classification Engine

Validation Engine

Question Engine

Calculation Engine

Explanation Engine

Mission Engine

---

# Consommateur principal

Workflow Engine

---

# Interdictions

Les moteurs ne communiquent jamais directement entre eux.

Les moteurs ne modifient jamais l'état d'un dossier.

Les événements ne remplacent jamais les Rules.

Les événements ne transportent jamais de logique métier.

---

# Exemple

Utilisateur

↓

Importe un PDF

↓

Document Engine

↓

DOCUMENT_IMPORTE

↓

Workflow Engine

↓

Décision

↓

OCR Engine

---

# Critères d'acceptation

✓ Tous les événements sont définis ici.

✓ Chaque événement possède un seul émetteur.

✓ Le Workflow Engine décide toujours de la suite.

✓ Les moteurs restent indépendants.

---

# ❌ Erreurs d'implémentation interdites

- Deux événements portant le même nom.
    
- Un moteur appelant directement un autre moteur.
    
- Un événement contenant une règle métier.
    
- Un événement modifiant directement le dossier.
    
- Un moteur consommant un événement qui ne lui est pas destiné.