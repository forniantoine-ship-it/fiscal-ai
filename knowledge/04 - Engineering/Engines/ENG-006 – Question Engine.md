

Version : 1.0

Statut : 🔒 Contrat d'architecture

---

# Slogan

**Demander le minimum. Obtenir le maximum.**

---

# Philosophie

Le Question Engine ne pose jamais une question par défaut.

Il cherche d'abord si l'information existe déjà.

Une question est toujours le dernier recours.

Chaque question doit avoir une utilité démontrable.

---

# Mission

Obtenir les informations manquantes nécessaires à la progression du dossier.

---

# Objectif

Minimiser le nombre de questions posées à l'utilisateur tout en garantissant un dossier complet.

---

# Responsabilités

- Identifier les informations manquantes.
    
- Déterminer les questions nécessaires.
    
- Prioriser les questions.
    
- Éviter les questions redondantes.
    
- Adapter les questions au contexte du dossier.
    
- Retourner les réponses au Workflow Engine.
    

---

# Interdictions

Ne jamais :

- poser une question dont la réponse est déjà connue ;
    
- poser plusieurs fois la même question ;
    
- calculer une valeur ;
    
- interpréter une règle fiscale ;
    
- modifier une donnée ;
    
- décider de la suite du Workflow.
    

---

# Entrées

- Rapport du Validation Engine.
    
- État du dossier.
    
- Documents disponibles.
    
- Réponses déjà connues.
    

---

# Sorties

- Liste des questions.
    
- Priorité des questions.
    
- Réponses collectées.
    
- Événement QUESTION_REPONDUE.
    

---

# Dépendances

Appelé uniquement par :

Workflow Engine

---

# Contrat

Avant de poser une question, le moteur applique obligatoirement la séquence suivante :

1. L'information existe-t-elle déjà ?
    
2. Peut-elle être déduite d'un document ?
    
3. Peut-elle être calculée ?
    
4. Est-elle réellement indispensable ?
    
5. Si aucune réponse n'est possible, alors seulement une question est générée.
    

---

# Relations

### Appelé par

Workflow Engine

### Appelle

Personne

### Produit

QUESTION_REPONDUE

### Consomme

- Rapport de validation
    
- Données du dossier
    
- Réponses utilisateur
    

### Interdit

- Calcul
    
- Validation
    
- OCR
    
- Classification
    
- Décision de Workflow
    

---

# Exemple

Validation Engine

↓

"Date d'acquisition manquante"

↓

Question Engine

↓

"L'acte authentique a-t-il été signé ? Si oui, quelle est la date ?"

↓

QUESTION_REPONDUE

↓

Workflow Engine

---

# Critères d'acceptation

✓ Aucune question inutile.

✓ Aucune question déjà répondue.

✓ Les questions sont contextualisées.

✓ Les réponses sont renvoyées au Workflow.

✓ Le moteur ne décide jamais de la suite.

---

# ❌ Erreurs d'implémentation interdites

- Poser une question alors que la réponse existe.
    
- Poser plusieurs questions simultanément sans nécessité.
    
- Modifier directement le dossier.
    
- Calculer une valeur fiscale.
    
- Déclencher un autre moteur.
    
- Décider du prochain état du Workflow.