

Version : 1.0

Statut : 🔒 Contrat d'architecture

---

# Slogan

**Identifier. Jamais interpréter.**

---

# Philosophie

Le Classification Engine identifie la nature d'un document.

Il ne cherche jamais à comprendre les données qu'il contient.

Son rôle s'arrête dès que le type du document est connu.

---

# Mission

Déterminer le type d'un document à partir du texte extrait.

---

# Objectif

Attribuer une catégorie fiable à chaque document afin d'orienter correctement le traitement suivant.

---

# Responsabilités

- Identifier le type du document.
    
- Attribuer un niveau de confiance.
    
- Signaler une classification impossible.
    
- Retourner le type identifié.
    

---

# Interdictions

Ne jamais :

- extraire une valeur ;
    
- interpréter un montant ;
    
- reconnaître un propriétaire ;
    
- vérifier la cohérence d'une donnée ;
    
- calculer ;
    
- poser une question.
    

---

# Entrées

- Texte OCR
    
- Métadonnées du document
    

---

# Sorties

- Type du document
    
- Niveau de confiance
    
- Événement CLASSIFICATION_TERMINE
    

---

# Types de documents (MVP)

- Acte notarié
    
- Facture
    
- Tableau d'amortissement
    
- Taxe foncière
    
- Appel de charges
    
- Assurance
    
- Bail commercial
    
- Autre
    

---

# Dépendances

Appelé uniquement par :

Workflow Engine

---

# Contrat

Le moteur ne cherche jamais les informations contenues dans un document.

Il répond uniquement à une question :

**Quel est ce document ?**

---

# Relations

### Appelé par

Workflow Engine

### Appelle

Personne

### Produit

CLASSIFICATION_TERMINE

### Consomme

Texte OCR

### Interdit

- Extraction
    
- Validation
    
- Calcul
    
- Questions
    
- IA métier
    

---

# Exemple

Texte OCR

↓

Classification

↓

"Acte notarié"

↓

CLASSIFICATION_TERMINE

↓

Workflow Engine

---

# Critères d'acceptation

✓ Chaque document possède un type.

✓ Un niveau de confiance est fourni.

✓ Aucune donnée métier n'est extraite.

✓ Aucun calcul n'est réalisé.

---

# ❌ Erreurs d'implémentation interdites

- Extraire des montants.
    
- Identifier des amortissements.
    
- Corriger des informations.
    
- Modifier le dossier.
    
- Déclencher directement un autre moteur.
    
- Appliquer une règle fiscale.