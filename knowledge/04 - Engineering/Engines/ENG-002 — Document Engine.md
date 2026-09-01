

Version : 1.0

Statut : 🔒 Contrat d'architecture

---

# Mission

Le Document Engine est responsable de la gestion des documents importés dans Fiscal AI.

Il reçoit les fichiers de l'utilisateur, les enregistre et prépare leur traitement.

Il ne lit jamais leur contenu.

---

# Objectif

Garantir que chaque document soit stocké, identifié et traçable avant toute analyse.

---

# Responsabilités

Le Document Engine doit :

- recevoir un document importé ;
    
- vérifier son intégrité ;
    
- générer un identifiant unique ;
    
- enregistrer le document ;
    
- conserver les métadonnées ;
    
- notifier le Workflow Engine qu'un nouveau document est disponible.
    

---

# Interdictions

Le Document Engine ne doit jamais :

- lire le contenu d'un PDF ;
    
- effectuer de l'OCR ;
    
- classifier un document ;
    
- interpréter des données ;
    
- calculer une valeur fiscale ;
    
- modifier les données métier.
    

---

# Entrées

Le Document Engine reçoit :

- PDF ;
    
- image ;
    
- document bureautique (si supporté dans le MVP).
    

---

# Sorties

Le Document Engine produit :

- un document enregistré ;
    
- un identifiant unique ;
    
- les métadonnées du document ;
    
- un événement DOCUMENT_IMPORTE.
    

---

# Dépendances

Le Document Engine peut uniquement communiquer avec :

- Workflow Engine.
    

Il ne déclenche jamais directement :

- OCR Engine ;
    
- Classification Engine ;
    
- Validation Engine.
    

Le Workflow décide toujours.

---

# Métadonnées minimales

Chaque document possède :

- identifiant ;
    
- nom d'origine ;
    
- type MIME ;
    
- taille ;
    
- date d'import ;
    
- utilisateur ;
    
- dossier associé ;
    
- statut.
    

---

# Contrat

Le Document Engine ignore totalement le contenu du document.

Pour lui :

Un PDF fiscal

=

Une photo

=

Un acte notarié

=

Une facture.

Tous sont uniquement des fichiers.

---

# Exemple

Utilisateur

↓

Importe un PDF

↓

Document Engine

↓

Stocke le fichier

↓

Crée DOC-000145

↓

Émet

DOCUMENT_IMPORTE

↓

Workflow Engine

---

# Critères d'acceptation

✓ Aucun document n'est perdu.

✓ Chaque document possède un identifiant unique.

✓ Le moteur ne connaît jamais le contenu du fichier.

✓ Toutes les métadonnées sont enregistrées.

✓ Le Workflow est notifié.

---

# Relations

### Appelé par

- Workflow Engine
    

### Appelle

Personne.

### Produit

- DOCUMENT_IMPORTE
    

### Consomme

- Fichier utilisateur
    

### Interdit

- OCR
    
- Classification
    
- Calcul
    
- Validation
    
- Questions
    
- IA
    

---

# ❌ Erreurs d'implémentation interdites

- Lire un PDF.
    
- Lancer directement l'OCR.
    
- Déterminer le type du document.
    
- Extraire une information fiscale.
    
- Modifier les données du dossier.
    
- Appeler directement un autre moteur.