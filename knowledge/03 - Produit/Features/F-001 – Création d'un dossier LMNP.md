

Version : 1.0

Statut : 🔒 Contrat fonctionnel

Priorité : Critique

---

# Mission

Permettre à un utilisateur de créer un nouveau dossier LMNP afin de démarrer une déclaration fiscale.

---

# Valeur utilisateur

Créer un dossier en moins d'une minute.

L'utilisateur doit pouvoir commencer immédiatement sa déclaration.

---

# Déclencheur

L'utilisateur clique sur **"Nouveau dossier"**.

---

# Préconditions

L'utilisateur est authentifié.

Aucun dossier n'est en cours de création.

---

# Résultat attendu

Un nouveau dossier est créé.

Le Workflow est initialisé.

Le dossier est prêt à recevoir les premières informations.

---

# Objets métier concernés

- Dossier
    

---

# Moteurs concernés

- ENG-001 Workflow Engine
    

---

# États concernés

- DOSSIER_CREE
    
- INFORMATIONS_GENERALES
    

---

# Événements concernés

- DOSSIER_CREE
    

---

# Rules concernées

Aucune.

---

# Parcours utilisateur

1. L'utilisateur clique sur **Créer un dossier**.
    
2. Le système crée le dossier.
    
3. Le Workflow initialise le parcours.
    
4. L'utilisateur est redirigé vers les informations générales.
    

---

# Critères d'acceptation

✓ Un identifiant unique est généré.

✓ Le dossier est enregistré.

✓ Le Workflow est initialisé.

✓ L'état est **DOSSIER_CREE**.

✓ L'utilisateur accède immédiatement à l'étape suivante.

---

# Cas limites

L'utilisateur tente de créer plusieurs dossiers simultanément.

La création échoue.

Le Workflow ne démarre pas.

---

# Erreurs interdites

Le Workflow n'est pas lancé.

Le dossier est créé sans état.

Le dossier est créé sans identifiant.

Le Workflow contient une logique métier.

---

# Dépendances

Aucune.

Cette Feature constitue le point d'entrée du MVP.

---

# Notes

Cette Feature ne collecte encore aucune donnée fiscale.

Elle prépare uniquement le cycle de vie du dossier.