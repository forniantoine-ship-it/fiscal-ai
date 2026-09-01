

Version : 1.0

Statut : 🔒 Contrat d'architecture

---

# Slogan

**Expliquer. Jamais inventer.**

---

# Philosophie

L'Explanation Engine ne produit jamais une information nouvelle.

Il transforme les décisions déjà prises par Fiscal AI en explications compréhensibles par l'utilisateur.

Chaque explication doit pouvoir être justifiée.

---

# Mission

Expliquer de manière claire, pédagogique et traçable les résultats produits par Fiscal AI.

---

# Objectif

Permettre à l'utilisateur de comprendre :

- pourquoi un calcul a été réalisé ;
    
- pourquoi une règle a été appliquée ;
    
- pourquoi une question a été posée ;
    
- pourquoi une information est nécessaire.
    

---

# Responsabilités

- Générer des explications.
    
- Traduire les règles métier en langage naturel.
    
- Justifier les calculs.
    
- Justifier les décisions du Workflow.
    
- Fournir une traçabilité complète.
    

---

# Interdictions

Ne jamais :

- effectuer un calcul ;
    
- modifier un résultat ;
    
- créer une règle métier ;
    
- inventer une justification ;
    
- interpréter différemment une règle ;
    
- prendre une décision.
    

---

# Entrées

- Résultats du Calculation Engine.
    
- Journal de calcul.
    
- Rules appliquées.
    
- Événements du Workflow.
    
- Données du dossier.
    

---

# Sorties

- Explications utilisateur.
    
- Justifications détaillées.
    
- Traçabilité des décisions.
    
- Événement EXPLICATION_GENEREE.
    

---

# Dépendances

Appelé uniquement par :

Workflow Engine

---

# Contrat

Toute affirmation produite par l'Explanation Engine doit être reliée à une décision réellement prise par Fiscal AI.

Chaque explication doit pouvoir remonter jusqu'à :

- une Rule ;
    
- un résultat de calcul ;
    
- une donnée du dossier ;
    
- un événement du Workflow.
    

Aucune explication ne peut être générée sans preuve.

---

# Relations

### Appelé par

Workflow Engine

### Appelle

Aucun moteur

### Produit

- EXPLICATION_GENEREE
    

### Consomme

- Rules
    
- Journal de calcul
    
- Résultats
    
- Événements
    

### Interdit

- Calcul
    
- Validation
    
- Questions
    
- OCR
    
- Classification
    
- Modification des données
    

---

# Exemple

Utilisateur

↓

"Pourquoi cet amortissement est-il de 5 250 € ?"

↓

Explanation Engine

↓

Résultat du Calculation Engine

↓

TRF-0018

↓

Valeurs utilisées

↓

Explication générée

---

# Critères d'acceptation

✓ Chaque explication est traçable.

✓ Aucune information n'est inventée.

✓ Chaque justification référence une Rule ou un calcul.

✓ Le langage est compréhensible par un non-expert.

✓ Les explications sont cohérentes avec les résultats affichés.

---

# ❌ Erreurs d'implémentation interdites

- Inventer une justification.
    
- Corriger un calcul.
    
- Modifier une donnée.
    
- Appliquer une Rule.
    
- Poser une question.
    
- Produire une explication sans source identifiable.