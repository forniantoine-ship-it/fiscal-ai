# User Stories – F-001 Création d'un dossier LMNP

Version : 1.0

Statut : En rédaction

---

## US-001 – Créer un nouveau dossier

### En tant que

Utilisateur

### Je souhaite

Créer un nouveau dossier LMNP

### Afin de

Commencer une nouvelle déclaration.

---

### Critères d'acceptation

- Un bouton "Nouveau dossier" est disponible.
    
- Un nouveau dossier est créé.
    
- Un identifiant unique est généré.
    
- Le Workflow démarre automatiquement.
    

---

## US-002 – Initialiser le dossier

### En tant que

Système

### Je souhaite

Créer automatiquement tous les éléments nécessaires au dossier.

### Afin de

Préparer le parcours utilisateur.

---

Critères :

- espace documentaire créé ;
    
- statut initial créé ;
    
- journal d'événements créé.
    

---

## US-003 – Préparer le Workflow

### En tant que

Workflow Engine

### Je souhaite

Initialiser le parcours.

### Afin de

Connaître la prochaine étape.

---

Critères :

- état = DOSSIER_CREE ;
    
- prochaine étape = INFORMATIONS_GENERALES.
    

---

## US-004 – Préparer les premières questions

### En tant que

Question Engine

### Je souhaite

Préparer uniquement les questions nécessaires.

### Afin de

Réduire les informations demandées.

---

Critères :

- aucune question inutile ;
    
- ordre optimisé.
    

---

## US-005 – Afficher la première étape

### En tant que

Utilisateur

### Je souhaite

Voir immédiatement la première action à réaliser.

### Afin de

Commencer sans me poser de questions.

---

Critères :

- première question affichée ;
    
- progression visible ;
    
- aucune page vide.