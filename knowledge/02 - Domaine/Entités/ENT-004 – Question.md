

Version : 1.0

Statut : 🔒 Entité métier

---

# Objectif

Définir l'entité Question de Fiscal AI.

Une Question représente une information indispensable que le système ne peut pas obtenir automatiquement.

---

# Description

Une Question est générée uniquement lorsque les documents, les données existantes et les Rules ne permettent pas de compléter le dossier.

Une Question n'est jamais posée par défaut.

---

# Cycle de vie

Identifiée

↓

Générée

↓

Affichée

↓

Répondue

↓

Validée

↓

Archivée

---

# Relations

Appartient à :

- Dossier
    

Concerne :

- Bien
    
- Document
    
- Calcul
    

Produit :

- Une Réponse
    

---

# Attributs

## Identification

- Identifiant
    
- Référence
    
- Version
    

---

## Contenu

- Libellé
    
- Description
    
- Aide utilisateur
    
- Exemple de réponse
    

---

## Gestion

- Priorité
    
- Catégorie
    
- Statut
    
- Ordre d'affichage
    

---

## Validation

- Type de réponse attendu
    
- Valeur obligatoire
    
- Contraintes
    
- Contrôle de cohérence
    

---

## Traçabilité

- Date de génération
    
- Date d'affichage
    
- Date de réponse
    
- Date de validation
    

---

# Provenance

Une Question peut être générée par :

- Validation Engine
    
- Workflow Engine
    

Sa présentation est assurée par le Question Engine.

---

# Validation

Une Question peut être :

- en attente ;
    
- affichée ;
    
- répondue ;
    
- validée ;
    
- annulée.
    

---

# Utilisation

Cette entité est utilisée par :

- Workflow Engine
    
- Validation Engine
    
- Question Engine
    

---

# Interdictions

Ne jamais :

- poser une question déjà répondue ;
    
- poser une question dont la réponse est présente dans un document ;
    
- modifier une réponse utilisateur ;
    
- contenir une logique métier.
    

---

# Critères d'acceptation

✓ Chaque question possède un identifiant.

✓ Chaque question possède un objectif.

✓ Chaque question possède un type de réponse.

✓ Une question est toujours rattachée à un dossier.

✓ Une question peut être tracée jusqu'à son origine.

---

# ❌ Erreurs d'implémentation interdites

- Générer une question sans justification.
    
- Poser deux fois la même question.
    
- Poser une question alors que la réponse est déjà connue.
    
- Supprimer une question ayant participé à un calcul.
    
- Mélanger la question et sa réponse dans la même entité.