---
id: SAV-033
title: "Report du résultat et des déficits LMNP sur la 2042-C-PRO"
type: savoir
status: draft
version: "0.1"
created: 2026-10-03
updated: 2026-10-03
owner: product-owner
source: "Formulaire 2031-SD 2026 (ligne 7, cases 7a/7b : « reportés de manière automatique sur la déclaration n° 2042-C-PRO ») ; formulaire 2031 Bis-SD 2026 (cadre I : « Résultat avant imputation des déficits antérieurs ») ; DGFiP, page « Location meublée » d'impots.gouv.fr (« le montant de votre bénéfice calculé sur votre déclaration n°2031 aux cases 5NA, 5OA ou 5PA » ; « le montant non encore imputé des déficits… des années antérieures » aux cases 5GA à 5GJ) ; aide officielle du simulateur IR 2026 (revenus professions non salariées) ; brochure pratique IR 2026 (revenus 2025), pp. 174 et 236 et reproduction de la 2042-C-PRO (5GA = 2015 … 5GJ = 2024) ; formulaire 2042-C-PRO 2026 (note « les cases 5GA à 5GI sont communiquées uniquement à titre indicatif ») ; CGI art. 156, I, 1° ter ; BOFiP BOI-BIC-DEF-20-20 §§ 110 à 130"
tags: [2042-c-pro, 5na, 5ny, 5ga, deficits, lmnp, imputation, 2031-sd, 7a, 7b]
catégorie: concept
domaine: fiscal
portée: "Personne physique exerçant une activité LMNP exclusive, au réel simplifié, à l'IR, hors organismes de sécurité sociale (cases 5NM / 5WE non couvertes), hors LMP."
justifie: [TRF-0034]
éclaire: [SAV-030, SAV-032, AX-016]
---

# SAV-033 — Report du résultat et des déficits LMNP sur la 2042-C-PRO

## Règle

Pour une activité LMNP exclusive au réel (régime « bénéfice réel », cas général) :

| Donnée | Grandeur métier F-006 | 2031 | 2042-C-PRO |
|---|---|---|---|
| Bénéfice de l'exercice | `resultatFiscalAvantDeficits` (si ≥ 0) | 7a | **5NA** — bénéfice **avant** imputation des déficits antérieurs |
| Déficit de l'exercice | `deficitNouveau` | 7b | **5NY** |
| Déficits des années antérieures non encore imputés | stock de déficits d'**ouverture** de l'exercice | — | **5GA à 5GJ**, une case par année d'origine |

5NA représente donc le bénéfice LMNP avant imputation des déficits antérieurs (« bénéfice calculé sur la 2031 » = 7a, lui-même défini par la 2031 Bis comme « résultat avant imputation des déficits antérieurs »).

## Cases 5GA à 5GJ

Elles portent les déficits LMNP des années antérieures **non encore imputés au début de l'exercice déclaré** : le **stock d'ouverture**, jamais le stock de clôture après imputation de l'exercice. Une case par année d'origine, mapping glissant : pour la déclaration des revenus N, N − 10 → 5GA, …, N − 1 → 5GJ (revenus 2025 : 2015 → 5GA, 2024 → 5GJ). Un déficit de l'année N se déclare en 5NY ; il devient une case 5GA–5GJ à la déclaration des revenus N + 1.

Durée : un déficit LMNP ne s'impute que sur les revenus de la même activité pendant les dix années suivantes (CGI art. 156, I, 1° ter) ; au-delà de dix ans il est perdu et n'a plus de case.

## Grandeurs qui ne sont pas des cases

- `resultatFiscal` (résultat après imputation) n'alimente pas 5NA : c'est une information métier, « résultat imposable attendu après imputation ».
- `deficitsImputes` (consommation métier du stock pendant l'exercice) sert au suivi, aux contrôles et à l'explication ; il ne réduit pas 5NA.
- Le stock de clôture après imputation (« reste à reporter ») est une information de suivi ; il n'est jamais déclaré dans 5GA–5GJ pour l'exercice courant. Il devient le stock d'ouverture de l'exercice suivant.

## Interdiction de la double imputation

Déclarer ensemble un 5NA brut (avant imputation) et un stock 5GA–5GJ déjà diminué de l'imputation de l'exercice ferait imputer deux fois le même déficit. Oracle : bénéfice avant imputation 649,18 ; stock d'ouverture 1 500 (déclaré 5GA–5GJ) ; imputé 649,18 ; résultat imposable attendu 0 ; stock restant 850,82. Le montant 850,82 ne se déclare jamais avec un 5NA de 649,18.

## Oracles

| Cas | 7a / 7b | 5NA | 5NY | 5GA–5GJ | imputé | imposable attendu | stock restant |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bénéfice simple (20 000 − 12 000 − 3 000), sans déficit antérieur | 7a = 5 000 | 5 000 | — | — | 0 | 5 000 | 0 |
| Reprise (ARD 2 500, déficit 2024 de 1 500) | 7a = 649,18 | 649,18 | — | 1 500 (2024) | 649,18 | 0 | 850,82 |
| Déficit (7 306,98) | 7b = 7 306,98 | — | 7 306,98 | — | 0 | 0 | 7 306,98 (millésime de l'exercice) |

## Limites et réserves

- **L'acteur exact de l'imputation** (calcul automatique de l'administration à partir de 5NA et des cases 5GA–5GJ, ou autre) n'est pas décrit mot pour mot dans les sources obtenues. La chaîne déclarative « 5NA + stock 5GA–5GJ » est en revanche établie ; aucune règle supplémentaire n'en est déduite.
- Aucune source n'énonce littéralement « 5NA avant imputation » : la règle repose sur la chaîne 2031 Bis (7a avant imputation) → report automatique 7a/7b vers la 2042-C-PRO → « bénéfice calculé sur la 2031 » en 5NA.
- La notice détaillée de la 2042-C-PRO n'a pas été consultée.
- Les cases 5NM / 5WE (revenus relevant des organismes de sécurité sociale), 5EY (source étrangère) et le cas du LMP sont hors périmètre.
- Les cases 5GA à 5GI sont « communiquées à titre indicatif » par l'administration : l'aide de déclaration ne les présente pas comme préremplies ni comme certaines.
