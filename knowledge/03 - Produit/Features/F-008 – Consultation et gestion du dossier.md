

Version : 1.0

Statut : 🔒 Contrat fonctionnel

Priorité : Élevée

---

# Mission

Permettre à l'utilisateur de consulter, suivre, exporter et gérer son dossier fiscal après sa génération.

---

# Valeur utilisateur

Retrouver à tout moment l'ensemble des informations, documents, calculs et déclarations de son dossier.

---

# Déclencheur

Le dossier est disponible dans l'espace utilisateur.

---

# Préconditions

- Un dossier existe.
    
- L'utilisateur dispose des droits d'accès.
    

---

# Résultat attendu

L'utilisateur peut consulter son dossier, télécharger les documents générés et reprendre son travail si nécessaire.

---

# Objets métier concernés

- Dossier
    
- Document
    
- Calcul
    
- Déclaration
    

---

# Moteurs concernés

- ENG-001 Workflow Engine
    
- ENG-008 Explanation Engine
    

---

# États concernés

- DOSSIER_TERMINE
    
- DECLARATION_GENEREE
    

---

# Événements concernés

- DECLARATION_EXPORTEE
    
- DOSSIER_CLOTURE
    

---

# Rules concernées

Aucune.

---

# Parcours utilisateur

1. L'utilisateur ouvre son dossier.
    
2. Il consulte les informations générales.
    
3. Il visualise les documents importés.
    
4. Il consulte les résultats des calculs.
    
5. Il consulte les explications associées.
    
6. Il télécharge les documents générés.
    
7. Il archive ou clôture son dossier si nécessaire.
    

---

# Critères d'acceptation

✓ Toutes les informations du dossier sont accessibles.

✓ Les documents peuvent être consultés.

✓ Les déclarations peuvent être téléchargées.

✓ Les calculs restent consultables.

✓ Les explications restent disponibles.

✓ L'historique du dossier est conservé.

---

# Cas limites

- Déclaration indisponible.
    
- Document manquant.
    
- Téléchargement interrompu.
    
- Dossier archivé.
    
- Accès non autorisé.
    

Le Workflow garantit l'intégrité du dossier.

---

# Erreurs interdites

- Modifier les résultats d'un dossier terminé.
    
- Modifier une déclaration générée.
    
- Supprimer des documents utilisés pour un calcul.
    
- Perdre la traçabilité d'un calcul.
    
- Supprimer l'historique du dossier.
    

---

# Dépendances

- F-001 – Création d'un dossier LMNP
    
- F-002 – Création d'un bien immobilier
    
- F-003 – Importer les documents
    
- F-004 – Analyse documentaire
    
- F-005 – Compléter les informations
    
- F-006 – Calcul fiscal
    
- F-007 – Génération de la déclaration fiscale
    

---

# Notes

Cette Feature constitue le point d'entrée de l'utilisateur après la production de la déclaration.

Elle centralise la consultation du dossier, sans modifier les données métier ni relancer les traitements automatiques.