---
id: PROF-005
title: Le Multi-Biens Complexe
type: profil
status: approved
version: "1.1"
created: 2026-06-30
updated: 2026-10-03
owner: product-owner
tags: [profil, utilisateur, lmnp]
---

# Le Multi-Biens Complexe

---

# Résumé

Investisseur avec plusieurs biens, potentiellement sous des structures différentes (SIRET multiples, société). Il arrive sur Fiscal AI avec une situation plus complexe que le cas standard et risque de mal comprendre comment le produit segmente les dossiers.

---

# Situation de départ

Il possède 2 à 5 biens en location meublée. Certains peuvent être sous une activité individuelle (SIRET EI), d'autres sous une société (SARL de famille, SCI à l'IR). Il a généralement un comptable mais souhaite avoir une vision directe de ses dossiers fiscaux.

---

# Ce qu'il sait

- La structure de ses différentes activités
- Que chaque entité juridique a son propre régime fiscal
- Ses SIRET respectifs

---

# Ce qu'il ignore

- Comment Fiscal AI segmente les dossiers (par bien ? par SIRET ? par entité ?)
- Si un dossier Fiscal AI peut regrouper plusieurs biens sous le même SIRET
- Si les données d'une entité peuvent contaminer celles d'une autre

---

# Ce qu'il possède

- Plusieurs jeux de documents (un par entité ou par bien)
- Une vision globale de son patrimoine

---

# Ce qu'il ne possède pas

- La certitude que Fiscal AI gère correctement sa structure multi-entités
- Un modèle mental clair de la façon dont organiser ses dossiers dans le produit

---

# Ce qu'il cherche réellement

Une vision consolidée de son patrimoine LMNP, avec la garantie que chaque entité est déclarée correctement et indépendamment des autres. Il cherche aussi à ne pas mélanger les données entre entités.

---

# Situations structurelles

- Plusieurs biens sous un même SIRET EI → un seul dossier Fiscal AI
- Biens sous des entités différentes → dossiers Fiscal AI séparés
- Mélange EI + société → deux régimes fiscaux différents à gérer en parallèle
- Bien en indivision avec conjoint → cas non standard à identifier explicitement

---

# Points de friction typiques

- Ambiguïté sur le regroupement (par bien ? par SIRET ?) → erreur de structure difficile à corriger
- Import du mauvais document dans le mauvais dossier → données corrompues silencieusement
- Impossibilité de naviguer entre dossiers depuis une vue consolidée → perte de temps

---

# Arc de progression

Première utilisation : longue, avec des questions de structuration. Une fois la structure comprise : utilisateur régulier et exigeant. À terme : prescripteur pour d'autres investisseurs multi-biens.

---

# Features où ce profil est primaire

- F-001 — Création d'un dossier LMNP (question de structuration en amont)
- F-008 — Consultation et gestion du dossier

---

# JTBD associés

- JTBD-001 — Déclarer mon activité LMNP au régime réel

---

# Support MVP (ADR-011)

Le multi-biens du MVP n'est **pas** un support universel. Il couvre uniquement : plusieurs biens natifs d'une même activité LMNP au réel simplifié, en première année, sans déficit antérieur, ARD, reprise ni stock d'ouverture, sans charge commune ni prêt partagé, avec des dotations intégralement déductibles ; clôture et exercice suivant interdits.

Pour ce profil, tout ce qui sort de ce domaine (société, SIRET multiples, indivision, reprise d'historique, déficit ou ARD reportable, charges communes) est **bloqué explicitement** : le produit refuse plutôt que d'approcher. Le tarif reste 149 € par dossier et par exercice.
