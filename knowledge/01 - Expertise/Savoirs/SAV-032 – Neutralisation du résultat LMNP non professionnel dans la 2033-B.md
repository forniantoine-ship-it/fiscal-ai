---
id: SAV-032
title: "Neutralisation du résultat LMNP non professionnel dans la 2033-B"
type: savoir
status: draft
version: "0.1"
created: 2026-10-03
updated: 2026-10-03
owner: product-owner
source: "Notice DGFiP 2033-NOT-SD 2026 (rubriques 330, 350, 690, 691) ; formulaire 2033-B-SD 2026 ; formulaires 2031-SD et 2031 Bis-SD 2026 (ligne 7 ; cadre I « Résultat avant imputation des déficits antérieurs ») ; CGI art. 156, I, 1° bis ; BOFiP BOI-BIC-DEF-20-10 §§ 80 à 100 (individualisation, cadre H de la 2031-SD) ; dossier témoin EDI accepté (oracle empirique, cas déficitaire)"
tags: [2033-b, 2031-sd, lmnp, non-professionnel, neutralisation, 330, 350, 7a, 7b, résultat-fiscal]
catégorie: concept
domaine: fiscal
portée: "Personne physique exerçant une activité LMNP exclusive, au réel simplifié, à l'IR. Hors LMP, hors coexistence avec une activité professionnelle dans la même entreprise, hors micro-BIC, hors IS."
justifie: [TRF-0031, TRF-0032, TRF-0034]
éclaire: [SAV-030, SAV-031]
---

# SAV-032 — Neutralisation du résultat LMNP non professionnel dans la 2033-B

## Règle

Le résultat d'une activité exercée à titre non professionnel (CGI art. 156, I, 1° bis) est déterminé séparément, puis **neutralisé** dans le résultat fiscal général du tableau 2033-B-SD, puis reporté dans le cadre dédié de la 2031 Bis-SD :

- le **déficit** et, le cas échéant, les charges d'une activité non professionnelle sont **réintégrés en ligne 330** « Divers à réintégrer » (notice 2033-NOT-SD 2026, rubriques 330 et 691) ;
- le **bénéfice** d'une activité non professionnelle est **déduit en ligne 350** « Divers à déduire » (notice, rubriques 350 et 690) ;
- le résultat de la 2033-B après neutralisation (lignes 352/354, puis 370/372) vaut donc **zéro** pour une activité exclusivement LMNP ;
- le résultat LMNP **avant imputation des déficits antérieurs** est reporté séparément : cadre I de la 2031 Bis-SD, puis cases **7a** (bénéfice) et **7b** (déficit) de la 2031-SD, reportées automatiquement sur la 2042-C-PRO.

Les cases 7a/7b ne sont donc pas un « dont » arithmétique des lignes 370/372 : le dossier témoin accepté en EDI porte 7b = 9 862 avec 370 = 0 et 372 vide.

## Deux grandeurs à ne pas confondre

| Grandeur | Nature | Définition |
|---|---|---|
| `resultatFiscalAvantDeficits` (F-006) | grandeur métier | résultat LMNP après plafond 39 C et consommation éventuelle des amortissements réputés différés (ARD), **avant** imputation des déficits LMNP antérieurs. Alimente 2031 7a lorsqu'elle est positive. |
| lignes 352/354 de la 2033-B | lignes du Cerfa | résultat de l'équation du tableau 2033-B **après** réintégrations, déductions et neutralisation (voir ci-dessous). Valent 0 pour une activité LMNP exclusive. |

La première n'est **pas** directement la seconde. Le nom `resultatFiscalAvantDeficits` ne prouve pas la correspondance avec 352/354 : cette assimilation, présente dans la rédaction initiale de SAV-030, est corrigée.

## Équation du domaine supporté

Notations : `E = resultatFiscalAvantDeficits + amortReportesUtilises` (résultat avant ARD consommés et avant déficits antérieurs ; égal à `resultatAvantAmort − amortDeduct`), `ND = totalNonDeductible` (charges comptabilisées mais fiscalement non déductibles, ex. avance de trésorerie / fonds de roulement de copropriété).

| Cas | 330 | 350 | 352 | 354 | 370 | 372 | 2031 |
|---|---|---|---|---|---|---|---|
| E < 0 | `−E + ND` (= `deficitNouveau + ND`) | vide | 0 | vide | 0 | vide | 7b = `deficitNouveau` |
| E ≥ 0 | `ND` (si > 0) | `E` (si > 0) | 0 | vide | 0 | vide | 7a = `resultatFiscalAvantDeficits` (si > 0) |

Bouclage : `(312 − 314) + 318 + 330 − 350 = 0`, avec `318 = amortCalcule − amortDeduct` et `312 − 314 = resultatAvantAmort − amortCalcule − ND`. L'identité tient pour tout E : `E − ND + ND − E = 0`.

Les zéros des lignes 352 et 370 sont imprimés en colonne 1 (bénéfice), comme sur le dossier témoin accepté.

## Amortissements réputés différés (ARD) antérieurs

Les ARD antérieurs consommés font partie de la détermination du résultat LMNP (SAV-030, étape 3). Ils sont **inclus dans E**, donc dans le total de la ligne 350 en situation bénéficiaire. Aucune seconde déduction d'ARD n'est portée : ce serait un double comptage (352 deviendrait négatif). Le suivi du stock d'ARD relève de l'état de suivi par bien (BOI-FORM-000038, SAV-031), pas du tableau 2033-B.

## Déficits LMNP antérieurs

Les déficits LMNP antérieurs ne sont **ni en 330, ni en 350, ni en 352/354, ni en 370/372** : le cadre I de la 2031 Bis-SD demande un « Résultat avant imputation des déficits antérieurs ». Leur imputation (sur les revenus de même nature, CGI art. 156, I, 1° ter ; BOI-BIC-DEF-20-20) intervient donc après 7a, dans le circuit de la déclaration personnelle. Le lieu exact (2042-C-PRO, cases 5NA / 5GA à 5GJ) **n'est pas établi** par une source officielle à ce stade : voir « Limites ».

Cette règle remplace, pour une activité LMNP exclusive, l'hypothèse d'un report des déficits imputés et des ARD en ligne 350 (notice de la 2033-D, rubrique « Déficits reportables », qui vise les entreprises à l'IR en général). Y ajouter les déficits antérieurs à une ligne 350 qui neutralise déjà E ferait apparaître un résultat 352/354 négatif.

## Oracle empirique : dossier témoin EDI (déficit, 1ᵉʳ exercice)

| Ligne | Valeur acceptée |
|---|---:|
| 310 / 314 | (13 681) / 13 681 |
| 318 | 3 720 |
| 330 | 9 961 (= 9 862 de déficit + 99 de non-déductible, FEC compte 614100 « Fond de roulement – Avance trésorerie copro ») |
| 350, 354, 372 | vides |
| 352, 370 (colonne 1) | 0 |
| 2031-SD ligne 1 colonne 1 | 0 |
| 2031-SD 7b | 9 862 |

## Limites et réserves

- **Aucun dossier bénéficiaire réel accepté** n'est disponible : le sens « bénéfice déduit en 350 » repose sur le texte officiel (notice, rubriques 350 et 690), pas sur un oracle réel. La décomposition du cas bénéficiaire (non-déductible en 330, ARD inclus dans le total 350) en est déduite.
- Le **BOFiP** (BOI-BIC-DEF-20-10 §§ 80 à 100) fonde l'individualisation du résultat non professionnel (cadre H de la 2031-SD et 2031 Bis-SD) mais **ne cite ni la ligne 330 ni la ligne 350** : la preuve des lignes repose sur la notice DGFiP, les formulaires et le dossier témoin.
- Le lieu d'imputation des déficits LMNP antérieurs dans la déclaration personnelle (2042-C-PRO) n'est pas établi officiellement ici (notice 2042-C-PRO non consultée) : dette d'audit, hors périmètre.
- Hors périmètre : LMP, activité professionnelle coexistante dans la même entreprise (ligne 350/330 alors à répartir), sociétés.
