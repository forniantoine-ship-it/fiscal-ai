

Version : 1.0

Statut : 🔒 Contrat d'architecture

---

# Slogan

**Lire. Jamais comprendre.**

---

# Philosophie

L'OCR Engine transforme une image ou un PDF en texte brut.

Il ne possède aucune connaissance métier.

Pour lui, tous les caractères ont la même valeur.

---

# Mission

Extraire le texte d'un document avec la meilleure précision possible.

---

# Objectif

Transformer un document numérique en contenu textuel exploitable.

---

# Responsabilités

- Lire un PDF.
    
- Lire une image.
    
- Détecter les pages.
    
- Détecter les zones de texte.
    
- Extraire le texte.
    
- Préserver la structure de lecture.
    
- Retourner un résultat exploitable.
    

---

# Interdictions

Ne jamais :

- classifier un document ;
    
- interpréter une valeur ;
    
- reconnaître une facture ;
    
- reconnaître un acte notarié ;
    
- corriger une donnée métier ;
    
- calculer une valeur ;
    
- poser une question.
    

---

# Entrées

- PDF
    
- JPEG
    
- PNG
    
- Image
    

---

# Sorties

- Texte brut
    
- Confiance OCR
    
- Structure du document
    
- Événement OCR_TERMINE
    

---

# Dépendances

Appelé uniquement par :

Workflow Engine

Le Workflow décide toujours de son exécution.

---

# Contrat

Le moteur ignore totalement :

- la fiscalité ;
    
- le LMNP ;
    
- les formulaires ;
    
- les montants ;
    
- les dates.
    

Il extrait uniquement du texte.

---

# Relations

### Appelé par

Workflow Engine

### Appelle

Personne

### Produit

OCR_TERMINE

### Consomme

Document enregistré

### Interdit

- Classification
    
- Validation
    
- Calcul
    
- IA métier
    
- Questions
    

---

# Exemple

Document reçu

↓

OCR

↓

Texte extrait

↓

OCR_TERMINE

↓

Workflow Engine

---

# Critères d'acceptation

✓ Le texte est extrait.

✓ Les pages sont conservées.

✓ Le moteur n'interprète jamais le contenu.

✓ Aucun calcul n'est réalisé.

---

# ❌ Erreurs d'implémentation interdites

- Déterminer le type du document.
    
- Extraire des données fiscales.
    
- Corriger une valeur.
    
- Utiliser des règles métier.
    
- Déclencher directement un autre moteur.
    
- Modifier les données du dossier.