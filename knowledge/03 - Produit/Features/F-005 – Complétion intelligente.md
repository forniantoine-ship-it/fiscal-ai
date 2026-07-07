

Version : 1.0

Statut : 🔒 Contrat fonctionnel

Priorité : Critique

---

# Mission

Compléter automatiquement le dossier en demandant à l'utilisateur uniquement les informations réellement indispensables que les documents n'ont pas permis d'obtenir.

---

# Valeur utilisateur

Réduire au maximum la saisie manuelle.

L'utilisateur ne répond qu'aux questions strictement nécessaires.

---

# Déclencheur

L'analyse documentaire est terminée.

Le Workflow détecte que certaines informations sont manquantes ou incohérentes.

---

# Préconditions

- Les documents ont été analysés.
    
- Les données extraites ont été validées.
    
- Au moins une information est manquante ou nécessite une confirmation.
    

---

# Résultat attendu

Toutes les informations nécessaires au calcul sont disponibles.

Le dossier est complet.

Le Workflow peut lancer les calculs.

---

# Objets métier concernés

- Dossier
    
- Bien
    
- Question
    
- Réponse
    

---

# Moteurs concernés

- ENG-001 Workflow Engine
    
- ENG-005 Validation Engine
    
- ENG-006 Question Engine
    

---

# États concernés

- INFORMATIONS_MANQUANTES
    
- DOSSIER_COMPLET
    

---

# Événements concernés

- QUESTION_GENEREE
    
- QUESTION_REPONDUE
    
- VALIDATION_TERMINE
    

---

# Rules concernées

Aucune.

---

# Parcours utilisateur

1. Le Workflow identifie les informations manquantes.
    
2. Le Question Engine prépare les questions nécessaires.
    
3. L'utilisateur répond aux questions.
    
4. Les réponses sont validées.
    
5. Le Workflow vérifie que le dossier est désormais complet.
    
6. Le dossier passe à l'état **DOSSIER_COMPLET**.
    

---

# Critères d'acceptation

✓ Aucune question inutile n'est posée.

✓ Les questions tiennent compte des réponses déjà connues.

✓ Les réponses sont enregistrées.

✓ Le dossier est déclaré complet uniquement lorsque toutes les informations nécessaires sont disponibles.

✓ Le Workflow poursuit automatiquement vers le calcul.

---

# Cas limites

- L'utilisateur interrompt le questionnaire.
    
- Une réponse est incohérente.
    
- Une réponse contredit un document importé.
    
- Une information reste manquante.
    

Le Workflow conserve le dossier dans un état permettant sa reprise.

---

# Erreurs interdites

- Poser une question dont la réponse est déjà connue.
    
- Poser plusieurs fois la même question.
    
- Modifier automatiquement une réponse utilisateur.
    
- Lancer le calcul avec un dossier incomplet.
    
- Ignorer une incohérence détectée.
    

---

# Dépendances

- F-001 – Création d'un dossier LMNP
    
- F-002 – Création d'un bien immobilier
    
- F-003 – Importer les documents
    
- F-004 – Analyse documentaire
    

---

# Notes

Cette Feature marque la fin de la constitution du dossier.

À son issue, toutes les informations nécessaires au calcul fiscal doivent être disponibles et validées.