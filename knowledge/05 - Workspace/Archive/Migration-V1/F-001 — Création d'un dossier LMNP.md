

ID : F-001

Epic : EPIC-01 – Gestion des dossiers

Version : 1.0

Statut : 🟡 En conception

Priorité : Critique

---

# Mission

Permettre à un utilisateur de créer un nouveau dossier LMNP afin de démarrer une déclaration fiscale.

Cette fonctionnalité constitue le point d'entrée de tout le produit.

Sans dossier, aucune autre fonctionnalité n'est accessible.

---

# Valeur utilisateur

En moins d'une minute, un utilisateur doit pouvoir commencer sa déclaration sans configuration complexe.

Le logiciel prend immédiatement en charge le parcours.

---

# Résultat attendu

À la fin de cette Feature :

- un dossier existe ;
    
- un identifiant unique est créé ;
    
- le Workflow est initialisé ;
    
- l'espace documentaire est créé ;
    
- la première étape est affichée.
    

---

# Dépendances

Aucune.

Cette Feature est le point d'entrée du MVP.

---

# Scénarios

SCN-001 – Création d'un dossier LMNP

---

# User Stories

US-001 – Créer un nouveau dossier

US-002 – Générer un identifiant unique

US-003 – Créer l'espace documentaire

US-004 – Initialiser le Workflow

US-005 – Préparer les premières questions

US-006 – Afficher la première étape

---

# Moteurs concernés

ENG-001 Workflow Engine

ENG-002 Question Engine

ENG-004 Document Engine

---

# Règles métier

Aucune.

Cette fonctionnalité ne réalise encore aucun calcul fiscal.

---

# Architecture (SAS)

À définir.

---

# Critères d'acceptation

✓ Le dossier est créé.

✓ Le Workflow démarre automatiquement.

✓ Aucun document n'est encore importé.

✓ Aucun calcul n'est lancé.

✓ Le système est prêt pour la suite.

---

# Définition de terminé

La Feature est terminée lorsque :

- toutes les User Stories sont validées ;
    
- tous les tests passent ;
    
- le Workflow démarre correctement ;
    
- l'utilisateur peut poursuivre vers F-002.