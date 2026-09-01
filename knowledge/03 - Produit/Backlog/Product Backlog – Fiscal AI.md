

Version : 1.0

Statut : 🔒 Verrouillé

---

# Objectif

Ce document constitue le backlog officiel de Fiscal AI.

Il recense toutes les fonctionnalités du produit, leur priorité, leur état d'avancement et leurs dépendances.

Toute évolution du produit doit être ajoutée à ce backlog.

---

# Règles

Une Feature représente une capacité métier complète.

Une Feature est développable indépendamment.

Une Feature possède :

- un objectif ;
    
- un scénario ;
    
- des User Stories ;
    
- un Blueprint ;
    
- un SAS ;
    
- des tests.
    

Une Feature n'est considérée comme terminée que lorsque tous ces éléments sont validés.

---

# MVP V1

## F-001 — Création d'un dossier LMNP

**Objectif**

Permettre à un utilisateur de créer un nouveau dossier LMNP.

**Priorité**

⭐⭐⭐⭐⭐

**Dépendances**

Aucune.

**Statut**

🟡 Conception

---

## F-002 — Création d'un bien immobilier

**Objectif**

Créer un bien rattaché à un dossier LMNP.

**Priorité**

⭐⭐⭐⭐⭐

**Dépendances**

F-001

**Statut**

🟡 Conception

---

## F-003 — Import des documents

**Objectif**

Importer tous les documents utiles à la déclaration.

**Priorité**

⭐⭐⭐⭐⭐

**Dépendances**

F-001

F-002

**Statut**

🟡 Conception

---

## F-004 — Analyse automatique des documents

**Objectif**

Analyser automatiquement les documents importés grâce à l'OCR et aux moteurs d'interprétation.

**Priorité**

⭐⭐⭐⭐⭐

**Dépendances**

F-003

**Statut**

🟡 Conception

---

## F-005 — Complément intelligent des informations

**Objectif**

Poser uniquement les questions nécessaires afin de compléter le dossier.

**Priorité**

⭐⭐⭐⭐⭐

**Dépendances**

F-004

**Statut**

🟡 Conception

---

## F-006 — Calcul fiscal LMNP

**Objectif**

Calculer automatiquement la déclaration fiscale.

**Priorité**

⭐⭐⭐⭐⭐

**Dépendances**

F-005

**Statut**

🟡 Conception

---

## F-007 — Génération de la déclaration fiscale

**Objectif**

Produire la liasse fiscale et les documents associés.

**Priorité**

⭐⭐⭐⭐⭐

**Dépendances**

F-006

**Statut**

🟡 Conception

---

## F-008 — Historique, export et archivage

**Objectif**

Permettre à l'utilisateur de retrouver l'historique de ses déclarations, télécharger ses documents et archiver son dossier.

**Priorité**

⭐⭐⭐⭐

**Dépendances**

F-007

**Statut**

🟡 Conception

---

# Fonctionnalités V2

Ces fonctionnalités ne font pas partie du MVP mais sont prévues dans la roadmap.

## F-101 — Multi-biens

## F-102 — Multi-propriétaires

## F-103 — Comparaison Micro-BIC / Réel

## F-104 — Optimisation fiscale

## F-105 — Déclarations des années précédentes

## F-106 — Tableau de bord patrimonial

## F-107 — Assistant IA patrimonial

## F-108 — Gestion SCI

## F-109 — Déficit foncier

## F-110 — IFI

---

# Définition de terminé (Definition of Done)

Une Feature est terminée lorsque :

✓ le PRD est validé ;

✓ le scénario est validé ;

✓ les moteurs concernés sont spécifiés ;

✓ les règles métier sont documentées ;

✓ le SAS est rédigé ;

✓ les User Stories sont terminées ;

✓ les tests sont validés ;

✓ la fonctionnalité est développée ;

✓ la revue fonctionnelle est approuvée.