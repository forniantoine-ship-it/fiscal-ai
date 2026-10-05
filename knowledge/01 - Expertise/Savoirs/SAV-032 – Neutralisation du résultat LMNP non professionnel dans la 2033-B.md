---
id: SAV-032
title: "Neutralisation du résultat LMNP non professionnel dans la 2033-B"
type: savoir
status: approved
version: "1.1"
created: 2026-10-03
updated: 2026-10-05
owner: product-owner
source: "Notice DGFiP 2033-NOT-SD 2026 (rubriques 330, 350, 690, 691) ; formulaire 2033-B-SD 2026 ; formulaires 2031-SD et 2031 Bis-SD 2026 (ligne 7 ; cadre I « Résultat avant imputation des déficits antérieurs ») ; CGI art. 156, I, 1° bis ; BOFiP BOI-BIC-DEF-20-10 §§ 80 à 100 (individualisation, cadre H de la 2031-SD) ; dossier témoin EDI accepté (oracle empirique, cas déficitaire) ; CGI art. 39 C, II-3 ; BOI-BIC-AMT-20-40-10-30 § 10 ; BOI-FORM-000038 ; BOI-BIC-CHAMP-40-20 (III-A) ; décision du Product Owner du 2026-10-05 (INT-0-CLOSE)"
tags: [2033-b, 2031-sd, lmnp, non-professionnel, neutralisation, 330, 350, 7a, 7b, résultat-fiscal]
catégorie: concept
domaine: fiscal
portée: "Personne physique exerçant une activité LMNP exclusive, au réel simplifié, à l'IR. Hors LMP, hors coexistence avec une activité professionnelle dans la même entreprise, hors micro-BIC, hors IS."
justifie: [TRF-0031, TRF-0032, TRF-0034]
éclaire: [SAV-030, SAV-031]
voir_aussi: [AX-015, AX-017]
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

## Équation du domaine supporté (1.1)

Notations (résultats du moteur 39 C, SAV-030) : `après` = `resultatFiscalAvantDeficits` = résultat après amortissement courant admis `D` et ARD historique utilisé `H` (peut être négatif : un amortissement admissible ne l'interdit pas) ; `H` = `amortReportesUtilises` ; `ND` = `totalNonDeductible` (charges comptabilisées mais fiscalement non déductibles, ex. avance de trésorerie / fonds de roulement de copropriété) ; `ARDn` = amortissement courant non admis de l'exercice (`amortNonDeduitExercice`).

| Ligne | Valeur | Niveau de preuve |
|---|---|---|
| 312 / 314 | `avant − dotation − ND` (bénéfice col. 1 / déficit col. 2), `avant` = résultat avant amortissement | DIRECT (formulaire : report du résultat comptable) |
| 318 | `ARDn` (fraction de la dotation N écartée par le 39 C) | **STRONG INFERENCE** (voir ci-dessous) |
| 330 | `max(−après, 0) + ND` | STRONG INFERENCE (notice 330 ; BOFiP CHAMP-40-20 III-A : le résultat d'ensemble est corrigé « dans le sens de l'augmentation s'il est déficitaire ») |
| 350 | `max(après, 0) + H` | **STRONG INFERENCE — ACCEPTED FOR PRODUCT** pour `H` (voir ci-dessous) ; bénéfice non professionnel : notice 350 |
| 352 / 370 | 0 imprimé en colonne 1 | dossier témoin accepté |
| 354 / 372 | vides | dossier témoin accepté |
| 2031 7a / 7b | `max(après, 0)` / `max(−après, 0)` (jamais les deux) | DIRECT (cadre I de la 2031 Bis) |

Bouclage : `(312 − 314) + 318 + 330 − 350 = 0`. Preuve : `avant − dotation − ND + ARDn + max(−après,0) + ND − max(après,0) − H = (avant − D − H) − après = 0`, car `D = dotation − ARDn` et `après = avant − D − H`.

**Équivalence avec la rédaction 1.0.** La version 1.0 posait `E = après + H` avec `330 = max(−E,0) + ND` et `350 = max(E,0)`. Les deux écritures coïncident quand `H = 0` ou `après ≥ 0` ; elles divergent seulement lorsque `H > 0` et `après < 0` (Oracle C ci-dessous), état que la rédaction 1.0 ne décrivait pas. La rédaction 1.1 fait foi.

Les zéros des lignes 352 et 370 sont imprimés en colonne 1 (bénéfice), comme sur le dossier témoin accepté.

## Amortissements réputés différés (ARD) antérieurs utilisés : ligne 350 (décision PO 2026-10-05)

**ARD historique utilisé → 2033-B ligne 350 « Divers à déduire ». Niveau de preuve : `STRONG INFERENCE — ACCEPTED FOR PRODUCT`. Ce niveau ne doit jamais être présenté comme DIRECT.**

Raisonnement : l'article 39 C, II-3 autorise la déduction ultérieure ; le BOI-BIC-AMT-20-40-10-30 § 10 la prévoit « en sus de l'annuité normale », dans la limite `loyers acquis − autres charges` ; le BOI-FORM-000038 suit l'imputation de l'ARD antérieur (lignes A, F, H) ; cette imputation n'est pas une charge comptable de l'exercice ; la ligne 350 est la ligne de déduction extracomptable pertinente. **Aucune source primaire trouvée ne dit littéralement « ARD 39 C repris = ligne 350 ».** La phrase de la notice sur les ARD « reportables à compter du 1er janvier 2004 » vise l'ancien régime des ARD (stock au 1er janvier 2004, 2033-D cadre II), pas le mécanisme 39 C.

Conséquences : `H` figure en 350 en plus du bénéfice non professionnel éventuel (`350 = max(après,0) + H`) ; en situation bénéficiaire le total reste `après + H`, identique à la rédaction 1.0. Aucune double déduction : `H` n'est pas retranché une seconde fois du résultat, il est la seule contrepartie extracomptable de la déduction de l'ARD. Le suivi du stock d'ARD relève de l'état de suivi par bien (BOI-FORM-000038, SAV-031), pas du tableau 2033-B.

## Ligne 318 : amortissement courant non admis (39 C)

**Amortissement courant 39 C non déductible → ligne 318. Niveau de preuve : `STRONG INFERENCE`**, tant qu'aucune source primaire plus explicite n'est disponible (ne pas présenter comme DIRECT). Indices : libellé officiel « Amortissements excédentaires (art. 39-4 du CGI) et autres amortissements non déductibles » ; l'amortissement écarté est « régulièrement comptabilisé » (BOFiP -30 § 10) et ne peut être déduit « au titre de l'exercice » (BOFiP -20 § 80) ; aucune autre ligne de réintégration d'amortissement n'existe ; le dossier témoin accepté en EDI porte 318 = 3 720 (dotation entière non déduite : résultat avant amortissement négatif). Valeur : `ARDn`, mouvement annuel, jamais le stock d'ARD.

## Oracle C et oracles de référence (golden permanents)

| Oracle | avant | D | H | ARDn | après | 312/314 | 318 | 330 | 350 | 352/370 | 7a / 7b | déficit LMNP créé | ARD finale |
|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|---:|---:|
| A (L 10 000, B 7 000, ACTIVITY 1 000, dotation 2 500) | 2 000 | 2 500 | 0 | 0 | −500 | 314 = 500 | 0 | 500 | — | 0 | 7b = 500 | 500 | 0 |
| B (ACTIVITY 4 000, dotation 2 500) | −1 000 | 2 500 | 0 | 0 | −3 500 | 314 = 3 500 | 0 | 3 500 | — | 0 | 7b = 3 500 | 3 500 | 0 |
| **C** (ACTIVITY 1 000, dotation 1 500, ARD historique 1 500) | 2 000 | 1 500 | 1 500 | 0 | −1 000 | 312 = 500 | 0 | 1 000 | 1 500 | 0 | 7b = 1 000 | 1 000 | 0 |
| D (ACTIVITY 1 000, dotation 4 000) | 2 000 | 3 000 | 0 | 1 000 | −1 000 | 314 = 2 000 | 1 000 | 1 000 | — | 0 | 7b = 1 000 | 1 000 | 1 000 |
| E (OTHER_PRODUCT 2 000, dotation 4 000) | 5 000 | 3 000 | 0 | 1 000 | +2 000 | 312 = 1 000 | 1 000 | — | 2 000 | 0 | 7a = 2 000 | 0 | 1 000 |
| F (avant 2 000, dotation 0, déficit antérieur 3 000) | 2 000 | 0 | 0 | 0 | +2 000 | 312 = 2 000 | 0 | — | 2 000 | 0 | 7a = 2 000 | 0 | 0 |

Oracle C : dans la rédaction 1.0 (330 = 0, 350 = 500) le déficit de l'activité n'était pas réintégré en 330 ; la projection retenue est 330 = 1 000 et 350 = 1 500. Oracle D : ARD nouvelle (1 000) et déficit LMNP nouveau (1 000) sont **deux stocks juridiquement distincts** (ARD : art. 39 C II-3, état de suivi ; déficit : art. 156 I 1° ter, dix ans sur les revenus de même nature, 2042-C-PRO 5NY puis 5GA–5GJ). Oracle F : les déficits antérieurs (3 000) ne figurent ni en 2033-B ni en 2031 ; 2 000 sont imputés après 7a, il reste 1 000. Les montants des oracles A, B, D, E, F sont ceux produits par les mappers actuels pour ces valeurs ; l'oracle C est une **cible** (le mapper actuel ne la produit pas).

## Identité de bouclage (test de non-confusion ARD ↔ déficit)

Avec `avant`, `dotation`, capacité `C` :
`D = min(dotation, C)` ; `ARDn = dotation − D` ; `H = min(ARD_ouverture, C − D)` ; `après = avant − D − H` ; `ARD_clôture = ARD_ouverture − H + ARDn` ; `déficit_nouveau = max(−après, 0)` ; `imputé = min(stock_déficits_antérieurs, max(après, 0))` ; `imposable = max(après, 0) − imputé`.
Contrôles : `(312−314) + 318 + 330 − 350 = 0` ; `7a·7b = 0` ; `ΔARD = ARDn − H` ne contient jamais `déficit_nouveau` ; `Δdéficits = déficit_nouveau − imputé` ne contient jamais `ARDn` ; `D + H ≤ C`.

## Déficits LMNP antérieurs

Les déficits LMNP antérieurs ne sont **ni en 330, ni en 350, ni en 352/354, ni en 370/372** : le cadre I de la 2031 Bis-SD demande un « Résultat avant imputation des déficits antérieurs ». Leur imputation (sur les revenus de même nature, CGI art. 156, I, 1° ter ; BOI-BIC-DEF-20-20) intervient donc après 7a, dans le circuit de la déclaration personnelle. Le lieu exact (2042-C-PRO, cases 5NA / 5GA à 5GJ) **n'est pas établi** par une source officielle à ce stade : voir « Limites ».

Cette règle remplace, pour une activité LMNP exclusive, l'hypothèse d'un report des **déficits antérieurs imputés** en ligne 350 (notice de la 2033-D, rubrique « Déficits reportables », qui vise les entreprises à l'IR en général). Y ajouter les déficits antérieurs à une ligne 350 qui neutralise déjà le résultat ferait apparaître un résultat 352/354 négatif. Cette exclusion ne concerne **pas** l'ARD 39 C utilisé, qui figure en 350 (section ci-dessus).

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

- *Approbation (2026-10-03, Product Owner) : les réserves ci-dessous sont des limites de preuve documentées d'un Savoir approuvé ; elles ne le remettent pas en draft.*
- **Aucun dossier bénéficiaire réel accepté** n'est disponible : le sens « bénéfice déduit en 350 » repose sur le texte officiel (notice, rubriques 350 et 690), pas sur un oracle réel. La décomposition du cas bénéficiaire (non-déductible en 330, ARD utilisé en 350) en est déduite.
- **Ligne de l'ARD utilisé (350), ligne 318 pour l'amortissement 39 C non admis, et lignes 330/350 pour l'état « H > 0 et après < 0 »** : inférences fortes, aucune source primaire littérale ; décision PO du 2026-10-05 pour le produit.
- Le **BOFiP** (BOI-BIC-DEF-20-10 §§ 80 à 100) fonde l'individualisation du résultat non professionnel (cadre H de la 2031-SD et 2031 Bis-SD) mais **ne cite ni la ligne 330 ni la ligne 350** : la preuve des lignes repose sur la notice DGFiP, les formulaires et le dossier témoin.
- Le lieu d'imputation des déficits LMNP antérieurs dans la déclaration personnelle (2042-C-PRO) n'est pas établi officiellement ici (notice 2042-C-PRO non consultée) : dette d'audit, hors périmètre.
- Hors périmètre : LMP, activité professionnelle coexistante dans la même entreprise (ligne 350/330 alors à répartir), sociétés.
