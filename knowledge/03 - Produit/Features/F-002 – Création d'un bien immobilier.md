

Version : 1.0

Statut : 🔒 Contrat fonctionnel

Priorité : Critique

---

# Mission

Permettre à l'utilisateur de créer un bien immobilier rattaché à un dossier LMNP.

---

# Valeur utilisateur

Déclarer le bien qui fera l'objet des calculs fiscaux.

Toutes les informations du dossier seront ensuite rattachées à ce bien.

---

# Déclencheur

Le dossier est créé.

Le Workflow passe à l'étape de création du bien.

---

# Préconditions

- Un dossier existe.
    
- Le dossier est actif.
    
- Aucun bien n'est encore créé (MVP).
    

---

# Résultat attendu

Un bien est créé.

Il est associé au dossier.

Le Workflow poursuit vers la collecte des informations du bien.

---

# Objets métier concernés

- Dossier
    
- Bien
    

---

# Moteurs concernés

- ENG-001 Workflow Engine
    
- ENG-006 Question Engine
    
- ENG-005 Validation Engine
    

---

# États concernés

- BIEN_EN_COURS
    
- BIEN_COMPLETE
    

---

# Événements concernés

- BIEN_CREE
    
- BIEN_MODIFIE
    

---

# Rules concernées

Aucune.

---

# Parcours utilisateur

1. Le Workflow démarre la création du bien.
    
2. Les informations nécessaires sont collectées.
    
3. Les données sont validées.
    
4. Le bien est créé.
    
5. Le Workflow passe à l'étape suivante.
    

---

# Critères d'acceptation

✓ Un bien est associé au dossier.

✓ Toutes les données obligatoires sont renseignées.

✓ Les informations sont validées.

✓ Le Workflow poursuit automatiquement.

---

# Cas limites

- L'utilisateur interrompt la saisie.
    
- Une information obligatoire est absente.
    
- Une donnée est incohérente.
    

Le Workflow conserve l'état du dossier jusqu'à résolution.

---

# Erreurs interdites

- Créer un bien sans dossier.
    
- Créer plusieurs biens dans le MVP.
    
- Autoriser un calcul sans bien.
    
- Passer à l'étape suivante avec des données invalides.
    

---

# Dépendances

F-001 – Création d'un dossier LMNP

---

# Notes

Le MVP autorise un seul bien par dossier.

La gestion multi-biens sera introduite dans une version ultérieure sans modifier cette Feature.