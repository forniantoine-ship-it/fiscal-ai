---
id: SAV-010
title: Liasse 2033-C comme source de reprise
type: savoir
status: approved
version: "1.1"
created: 2026-06-29
updated: 2026-09-24
owner: product-owner
source: Administration fiscale
tags: [amortissement, liasse, continuation, 2033-C, registre, reprise]
catégorie: fait
domaine: fiscal
éclaire: [RAI-002, TRF-0013]
---

# SAV-010 — Liasse 2033-C comme source de reprise

Le formulaire 2033-C (Tableau des immobilisations et amortissements) contient, pour chaque immobilisation :

- La valeur brute
- Les amortissements cumulés en début d'exercice
- La dotation de l'exercice
- Les amortissements cumulés en fin d'exercice
- La valeur nette comptable

C'est la source principale pour reconstituer un plan d'amortissement antérieur lors d'une reprise de dossier.

## Alignement de période — reprise N depuis un registre N-1

Identité temporelle (PO, 2026-09-24) — non une permission de reconstruire un historique manquant :

Pour une reprise d'exercice **N** à partir d'un registre d'amortissements (ou liasse) couvrant l'exercice **N-1** :

```
cumul d'ouverture N
=
cumul de clôture au 31/12/N-1
```

Vocabulaire registre actuellement supporté :

- `cumulOuverture(N)` ← **« Amort. fin »** N-1
- **« Amort. début »** N-1 = cumul d'ouverture de N-1 — **ne doit jamais** servir de cumul d'ouverture N

Cette identité aligne la reprise externe sur le chemin natif N→N+1 (clôture cumulée N-1 → ouverture N).

Fail closed : si « Amort. fin » est absent/vide, le cumul d'ouverture N reste manquant — jamais `Amort. début + Dotation`, jamais `brut − VNC`.
