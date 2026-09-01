

Version : 1.1

Statut : 🔒 Contrat d'architecture

---

# Mission

Le Workflow Engine orchestre le parcours d'un dossier Fiscal AI.

Il décide uniquement de la prochaine étape du parcours.

Il ne prend jamais de décision métier.

---

# Objectif

Garantir qu'un dossier suit toujours un parcours cohérent, déterministe et contrôlé.

Le Workflow Engine est responsable de la progression.

Il n'est responsable d'aucun traitement métier.

---

# Responsabilités

Le Workflow Engine doit :

- créer le parcours d'un dossier ;
    
- connaître l'état courant du dossier ;
    
- déterminer l'étape suivante ;
    
- déclencher les moteurs nécessaires ;
    
- recevoir leurs résultats ;
    
- décider de la transition suivante.
    

---

# Interdictions

Le Workflow Engine ne doit jamais :

- lire un document ;
    
- faire de l'OCR ;
    
- classifier un document ;
    
- calculer une valeur fiscale ;
    
- interpréter une règle métier ;
    
- poser une question directement à l'utilisateur ;
    
- modifier les données du dossier.
    

---

# Entrées

Le Workflow Engine reçoit uniquement :

- l'état actuel du dossier ;
    
- les événements émis par les autres moteurs ;
    
- les actions de l'utilisateur.
    

---

# Sorties

Le Workflow Engine produit uniquement :

- le prochain état du dossier ;
    
- les moteurs à exécuter ;
    
- les événements de transition.
    

---

# Dépendances

Le Workflow Engine peut déclencher :

- Document Engine
    
- OCR Engine
    
- Classification Engine
    
- Validation Engine
    
- Question Engine
    
- Calculation Engine
    
- Explanation Engine
    

Il ne réalise jamais leur travail.

---

# États du dossier (MVP)

Le dossier peut être dans l'un des états suivants, définis par [[STATE-001 – Cycle de vie d'un dossier]], qui en est la source de vérité :

- DOSSIER_CREE
    
- INFORMATIONS_GENERALES
    
- BIEN_EN_COURS
    
- BIEN_COMPLETE
    
- DOCUMENTS_EN_ATTENTE
    
- DOCUMENTS_IMPORTES
    
- ANALYSE_DOCUMENTAIRE
    
- INFORMATIONS_MANQUANTES
    
- DOSSIER_COMPLET
    
- CALCUL_EN_COURS
    
- CALCUL_TERMINE
    
- DECLARATION_GENEREE
    
- DOSSIER_TERMINE
    

---

# Événements pris en charge

Exemples :

- DOSSIER_CREE
    
- DOCUMENT_IMPORTE
    
- OCR_TERMINE
    
- CLASSIFICATION_TERMINE
    
- VALIDATION_TERMINE
    
- QUESTION_REPONDUE
    
- CALCUL_TERMINE
    
- DECLARATION_GENEREE
    

Le Workflow Engine ne crée jamais ces événements.

Il les consomme.

---

# Contrat

Le Workflow Engine ne possède aucune connaissance fiscale.

Il ne possède aucune logique documentaire.

Il ne possède aucune logique d'intelligence artificielle.

Sa seule responsabilité est :

**déterminer quel moteur doit intervenir ensuite.**

---

# Exemple

État actuel :

DOCUMENTS_EN_ATTENTE

↓

Événement reçu :

DOCUMENT_IMPORTE

↓

Décision :

Lancer OCR Engine

↓

Nouvel état :

DOCUMENTS_IMPORTES

---

# Critères d'acceptation

Le Workflow Engine est conforme lorsque :

✓ il ne contient aucune logique métier ;

✓ il ne réalise aucun calcul ;

✓ il ne modifie jamais les données métier ;

✓ toutes les transitions sont déterministes ;

✓ chaque changement d'état est provoqué par un événement.

---

# Ce que Claude Code ne doit jamais faire

- Ajouter des calculs dans le Workflow Engine.
    
- Lire directement les PDF.
    
- Déterminer des règles fiscales.
    
- Poser des questions à l'utilisateur.
    
- Mélanger orchestration et métier.