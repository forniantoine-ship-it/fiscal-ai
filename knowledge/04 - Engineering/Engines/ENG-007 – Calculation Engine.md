

Version : 1.0

Statut : 🔒 Contrat d'architecture

---

# Slogan

**Appliquer. Jamais deviner.**

---

# Philosophie

Le Calculation Engine applique des règles métier.

Il ne prend jamais de décision.

Il ne complète jamais une donnée.

Il ne corrige jamais une information.

Il exécute uniquement les calculs autorisés.

---

# Mission

Produire tous les calculs fiscaux de Fiscal AI de manière déterministe.

---

# Objectif

Transformer un ensemble de données validées en résultats fiscaux fiables, reproductibles et explicables.

---

# Responsabilités

- Charger les règles métier applicables.
    
- Vérifier que toutes les données nécessaires sont disponibles.
    
- Exécuter les calculs.
    
- Produire les résultats.
    
- Générer un journal de calcul.
    
- Retourner les résultats au Workflow Engine.
    

---

# Interdictions

Ne jamais :

- inventer une donnée ;
    
- corriger une information ;
    
- poser une question ;
    
- lire un document ;
    
- effectuer de l'OCR ;
    
- classifier un document ;
    
- modifier une donnée métier ;
    
- choisir une règle fiscale.
    

---

# Entrées

- Données validées.
    
- Règles métier.
    
- Paramètres fiscaux.
    
- État du dossier.
    

---

# Sorties

- Résultats des calculs.
    
- Valeurs intermédiaires.
    
- Journal de calcul.
    
- Événement CALCUL_TERMINE.
    

---

# Dépendances

Appelé uniquement par :

Workflow Engine

Les règles métier sont sa seule source de connaissance.

---

# Contrat

Le Calculation Engine ne contient aucune logique fiscale codée en dur.

Toutes les décisions métier proviennent des RULE.

Le moteur ne fait qu'exécuter.

---

# Relations

### Appelé par

Workflow Engine

### Appelle

Aucun moteur

### Produit

- CALCUL_TERMINE
    
- Journal de calcul
    

### Consomme

- Données validées
    
- Rules
    

### Interdit

- OCR
    
- Classification
    
- Validation
    
- Questions
    
- Explications
    

---

# Exemple

Workflow

↓

Calculation Engine

↓

TRF-0001

↓

TRF-0002

↓

TRF-0003

↓

Résultat fiscal

↓

CALCUL_TERMINE

↓

Workflow Engine

---

# Critères d'acceptation

✓ Même entrée = même résultat.

✓ Tous les calculs sont reproductibles.

✓ Chaque résultat est traçable.

✓ Toutes les règles sont exécutées dans le bon ordre.

✓ Aucun calcul n'est effectué avec des données non validées.

---

# ❌ Erreurs d'implémentation interdites

- Calculer avec des données incomplètes.
    
- Ajouter une logique fiscale directement dans le moteur.
    
- Modifier les données du dossier.
    
- Poser des questions à l'utilisateur.
    
- Corriger automatiquement une valeur.
    
- Déclencher directement un autre moteur.