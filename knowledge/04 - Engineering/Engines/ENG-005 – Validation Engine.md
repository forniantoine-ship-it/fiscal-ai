

Version : 2.0

Statut : 🔒 Contrat d'architecture

---

# Slogan

**Vérifier. Jamais corriger.**

---

# Philosophie

Le Validation Engine vérifie que les informations disponibles sont cohérentes, complètes et exploitables.

Il ne modifie jamais une donnée.

Il ne complète jamais une information.

Il ne prend jamais de décision fiscale.

---

# Mission

Contrôler la qualité des données avant qu'elles soient utilisées par les autres moteurs.

---

# Objectif

Garantir que seules des données valides circulent dans Fiscal AI.

---

# Architecture interne

Le Validation Engine exécute l'ensemble de ses Rules de validation, puis agrège leurs résultats en un Validation Report unique.

Une Rule de validation :

- vérifie un seul aspect de la qualité des données ;
    
- ne connaît aucune autre Rule ;
    
- ne produit jamais de sortie consommée en dehors du Validation Engine ;
    
- respecte les mêmes Interdictions que le Validation Engine lui-même.
    

Le Validation Engine peut être sollicité à plusieurs étapes du parcours du dossier, chacune portant sur les données disponibles à cette étape (cf. ARCH-001, flux MVP). Chaque exécution produit un Validation Report — jamais une sortie parallèle propre à l'étape ou à une Rule prise isolément.

Le nombre de Rules de validation appliquées n'est pas fixé par ce document — il dépend des Rules effectivement définies. Ce que ce document fixe est invariant : quel que soit ce nombre, une seule sortie existe — le Validation Report.

---

# Responsabilités

- Vérifier la présence des données obligatoires.
    
- Vérifier la cohérence des informations.
    
- Détecter les anomalies.
    
- Détecter les données manquantes.
    
- Coordonner l'exécution de ses Rules de validation et agréger leurs résultats en un Validation Report unique.
    

---

# Interdictions

Ne jamais :

- corriger une donnée ;
    
- inventer une valeur ;
    
- compléter une information ;
    
- poser une question à l'utilisateur ;
    
- calculer ;
    
- interpréter une règle fiscale ;
    
- laisser une Rule de validation exposer un résultat qui contourne le Validation Report.
    

---

# Entrées

- Données extraites
    
- Réponses utilisateur
    
- Métadonnées du dossier
    

---

# Validation Report

Le Validation Report est l'unique artefact de sortie du Validation Engine, quel que soit le nombre de Rules de validation qui y ont contribué.

Il contient :

- Validation réussie (oui/non)
    
- Liste des erreurs
    
- Liste des avertissements
    
- Liste des informations manquantes
    

Une Rule de validation ne produit jamais son propre rapport. Elle produit une contribution — une erreur, un avertissement ou une information manquante — que le Validation Engine agrège dans le Validation Report avant de le retourner.

---

# Sorties

- Validation Report
    
- Événement VALIDATION_TERMINE
    

---

# Dépendances

Appelé uniquement par :

Workflow Engine

---

# Contrat

Le Validation Engine répond uniquement à une question :

**Peut-on utiliser ces données en toute confiance ?**

Il ne décide jamais de la suite.

Le Workflow Engine décide.

Cette question porte toujours sur le Validation Report dans son ensemble — jamais sur le résultat d'une seule Rule de validation prise isolément.

---

# Relations

### Appelé par

Workflow Engine

### Appelle

Personne

### Produit

Validation Report

VALIDATION_TERMINE

### Consomme

Données du dossier

### Interdit

- Correction
    
- Calcul
    
- Questions
    
- Classification
    
- OCR
    

---

# Exemple

Informations extraites

↓

Exécution des Rules de validation

↓

3 données manquantes

↓

Validation Report

↓

VALIDATION_TERMINE

↓

Workflow Engine

---

# Critères d'acceptation

✓ Toutes les incohérences sont détectées.

✓ Les données manquantes sont identifiées.

✓ Aucune correction automatique n'est effectuée.

✓ Aucun calcul n'est réalisé.

✓ Quel que soit le nombre de Rules de validation exécutées, une seule sortie existe : le Validation Report.

✓ Aucune Rule de validation n'est consommée directement par un composant autre que le Validation Engine.

---

# ❌ Erreurs d'implémentation interdites

- Corriger automatiquement une donnée.
    
- Inventer une valeur.
    
- Poser directement une question à l'utilisateur.
    
- Déclencher un calcul.
    
- Modifier le dossier.
    
- Appliquer une règle métier.
    
- Faire produire à une Rule de validation une sortie consommée en dehors du Validation Report.
    
- Créer un second rapport de validation parallèle au Validation Report.
