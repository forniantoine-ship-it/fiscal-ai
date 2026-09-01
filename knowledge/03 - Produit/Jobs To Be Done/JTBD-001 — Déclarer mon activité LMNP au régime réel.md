---
id: JTBD-001
title: Déclarer mon activité LMNP au régime réel
type: jtbd
status: approved
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
tags: [jtbd, lmnp, activité, déclaration]
---

# Déclarer mon activité LMNP au régime réel

---

# Énoncé canonique

> Lorsque je dois produire ma déclaration fiscale annuelle en tant que loueur en meublé non professionnel au régime réel,
> je veux que mon activité soit correctement identifiée et que ses paramètres de départ soient enregistrés
> afin que tous mes calculs fiscaux reposent sur des données exactes et défendables.

---

# Profils concernés

- PROF-001 — Le Néophyte Pressé (primaire — c'est souvent sa première déclaration au régime réel)
- PROF-002 — Le Vétéran Organisé (secondaire — il a déjà fait cette démarche, veut confirmer la reprise correcte)
- PROF-003 — Le Non-Déclaré (primaire — doit d'abord régulariser avant d'accomplir ce Job)
- PROF-004 — Le Perdu Administratif (primaire — accompagnement fort nécessaire)
- PROF-005 — Le Multi-Biens Complexe (secondaire — doit d'abord structurer ses dossiers)

---

# Fréquence

Ponctuel à la création du dossier, puis vérifié à chaque exercice.

Les paramètres fondamentaux (SIRET, date de début, régime) ne changent pas d'une année sur l'autre — sauf événement exceptionnel (changement de régime, cession, modification de structure).

---

# Indicateur de succès

L'utilisateur a fourni ou confirmé :
- Son identité fiscale (SIRET valide)
- La date de début d'activité effective (date de première mise en location)
- Le régime fiscal applicable (réel simplifié ou réel normal)

Ces informations sont enregistrées et leur impact sur les calculs est expliqué à l'utilisateur (notamment le prorata de première année — TRF-0011).

L'utilisateur comprend ce qui a été retenu et pourquoi.

---

# Ce qui rendrait ce Job inutile

- Une connexion directe et automatisée avec l'administration fiscale (pré-remplissage depuis impots.gouv ou l'API SIRENE sans intervention utilisateur)
- La disparition du régime réel LMNP au profit d'un régime simplifié sans amortissement

---

# Features qui servent ce Job

1. F-009 — Déclaration d'activité LMNP (Feature principale — accomplit directement ce Job)
2. F-006 — Calcul fiscal (consomme les données issues de ce Job pour TRF-0011)
3. F-007 — Génération de la déclaration (utilise le SIRET pour produire la liasse)

---

# UX Patterns mobilisés

- UXP-001 — Diagnostic de situation (identifier la situation de l'utilisateur avant de demander un document ou un SIRET)

---

# Ce que ce Job n'est PAS

- La saisie des revenus locatifs (c'est un Job distinct — déclaration des recettes)
- La saisie des charges déductibles (autre Job)
- La production du plan d'amortissement (autre Job — bien que lié)
- La vérification de la cohérence du dossier (rôle du Validation Engine, pas de ce Job)

Ce Job couvre uniquement l'établissement de l'identité et des paramètres fondamentaux de l'activité LMNP.
