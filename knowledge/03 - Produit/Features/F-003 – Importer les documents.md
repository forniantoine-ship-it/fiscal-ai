
Version : 1.0

Statut : 🔒 Contrat fonctionnel

Priorité : Critique

---

# Mission

Permettre à l'utilisateur d'importer tous les documents nécessaires à la constitution de son dossier fiscal.

---

# Valeur utilisateur

Éviter toute ressaisie d'informations.

Les documents deviennent la principale source d'alimentation du dossier.

---

# Déclencheur

Le Workflow indique que des documents sont nécessaires à la poursuite du dossier.

---

# Préconditions

- Un dossier existe.
    
- Un bien immobilier est créé.
    
- L'utilisateur a accès à son dossier.
    

---

# Résultat attendu

Les documents sont enregistrés.

Ils sont disponibles pour les traitements automatiques.

Le Workflow peut poursuivre le parcours.

---

# Objets métier concernés

- Dossier
    
- Bien
    
- Document
    

---

# Moteurs concernés

- ENG-001 Workflow Engine
    
- ENG-002 Document Engine
    

---

# États concernés

- DOCUMENTS_EN_ATTENTE
    
- DOCUMENTS_IMPORTES
    

---

# Événements concernés

- DOCUMENT_IMPORTE
    
- DOCUMENT_SUPPRIME
    
- DOCUMENT_CORROMPU
    
- DOCUMENT_NON_SUPPORTE
    

---

# Rules concernées

Aucune.

---

# Parcours utilisateur

1. L'utilisateur sélectionne un ou plusieurs documents.
    
2. Les documents sont importés.
    
3. Chaque document est enregistré.
    
4. Le Workflow est informé de la disponibilité des documents.
    
5. Le parcours continue automatiquement.
    

---

# Critères d'acceptation

✓ Plusieurs documents peuvent être importés.

✓ Chaque document reçoit un identifiant unique.

✓ Les métadonnées sont enregistrées.

✓ Aucun document n'est analysé durant cette Feature.

✓ Le Workflow est notifié de chaque import.

---

# Cas limites

- Document corrompu.
    
- Format non supporté.
    
- Import interrompu.
    
- Import partiel.
    
- Document importé plusieurs fois.
    

Le Workflow détermine la suite à donner.

---

# Erreurs interdites

- Lire un document pendant l'import.
    
- Déclencher directement l'OCR.
    
- Classifier un document.
    
- Extraire des informations métier.
    
- Calculer une donnée fiscale.
    
- Modifier le dossier autrement que par l'ajout des documents.
    

---

# Dépendances

- F-001 – Création d'un dossier LMNP
    
- F-002 – Création d'un bien immobilier
    

---

# Notes

Cette Feature se limite à la réception et à l'enregistrement des documents.

L'analyse, la classification, l'extraction et la validation des informations sont réalisées par les Features suivantes.