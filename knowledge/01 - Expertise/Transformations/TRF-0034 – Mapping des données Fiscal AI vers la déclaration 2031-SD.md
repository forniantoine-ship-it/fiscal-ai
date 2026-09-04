---
id: TRF-0034
title: "Mapping des données Fiscal AI vers la déclaration 2031-SD"
type: transformation
status: approved
version: "1.0"
created: 2026-09-02
updated: 2026-09-04
owner: product-owner
tags: [liasse, 2031-sd, identité, mapping, régime-réel-simplifié, bic, ir]
catégorie: mapping
requiert: [SAV-029]
---

# TRF-0034 — Mapping des données Fiscal AI vers la déclaration 2031-SD

## Entrées

- siren : identifiant SIREN de l'exploitant, si connu
- siret : identifiant SIRET de l'établissement, si connu — utilisé en repli pour dériver le SIREN (9 premiers caractères) si `siren` est absent. Ce repli est une règle technique de produit, fondée sur la structure du répertoire Sirene (le SIRET est structurellement composé du SIREN suivi d'un NIC à 5 chiffres) — ce n'est pas une prescription DGFiP de remplissage du 2031-SD.
- dénomination : nom et prénom de l'exploitant, ou à défaut le SIREN
- adresse_entreprise : adresse de l'établissement, à défaut l'adresse personnelle de l'exploitant
- activity_start_date : date de début d'activité déclarée au RNE/INPI — retenue par Fiscal AI comme représentation opérationnelle du commencement des opérations pour ce calcul, sans équivalence juridique générale affirmée. Distincte de dateMiseEnService (première location effective du bien) et de FIELD-026 (début d'exploitation du bien), toutes deux hors périmètre de cette Transformation.
- exercice : année de l'exercice fiscal traité — voir FIELD-075 (exercice figé pour ce calcul) lorsqu'une référence documentaire est utile
- résultat_fiscal : résultat imposable de l'exercice — voir FIELD-084
- déficit_nouveau : déficit de l'exercice, si le résultat avant amortissement est négatif (sortie de TRF-0031)

## Sorties

**Section A — Identification**

- SIREN : reportée si `siren` est connu ; sinon dérivée des 9 premiers caractères du `siret` si disponible ; sinon la case reste absente.
- Dénomination de l'entreprise : reportée si `dénomination` est connue ; sinon absente.
- Adresse de l'entreprise : reportée si `adresse_entreprise` est connue ; sinon absente.
- Exercice ouvert le :
  - si `activity_start_date` se situe dans l'exercice traité, reportée après conversion au format JJ/MM/AAAA ;
  - si `activity_start_date` est antérieure à l'exercice traité, la case porte le 1er janvier de l'exercice ;
  - si `activity_start_date` est absente ou non exploitable, la case reste absente — aucune date n'est jamais fabriquée.
- Exercice clos le : toujours le 31 décembre de l'exercice traité — Fiscal AI ne gère aujourd'hui que des exercices clos au 31/12.

**Régime d'imposition** (case à cocher en en-tête du formulaire, hors cadre lettré — distincte du Cadre D officiel, qui porte sur la contribution temporaire de solidarité)

- Régime réel simplifié : mention fixe, reflet du périmètre produit actuel (LMNP réel simplifié) — ne dépend d'aucune donnée du dossier, jamais calculée.

**Section C — Récapitulation des éléments d'imposition**

- Résultat fiscal — Bénéfice : reportée depuis `résultat_fiscal` si positif.
- Résultat fiscal — Déficit : reportée depuis `déficit_nouveau` si positif.
- BIC non professionnels — Bénéfice / Déficit : mêmes valeurs, reportées séparément vers la section dédiée du formulaire.

## Logique

Le 2031-SD est un document de synthèse : chaque case qu'il porte est un report direct d'une donnée déjà connue du dossier ou déjà validée par le calcul fiscal (TRF-0029, TRF-0031, TRF-0032) — aucune règle fiscale n'est recalculée par cette Transformation.

L'ouverture d'exercice suit une logique conditionnelle à trois branches, détaillée dans la section A ci-dessus : activité commencée pendant l'exercice, activité commencée avant l'exercice, donnée absente. Cette règle a été validée par le Product Owner comme représentation opérationnelle du commencement des opérations pour ce calcul, sans en faire une équivalence juridique générale.

Toute case dont la donnée source est absente est simplement omise du formulaire produit — jamais remplacée par une valeur par défaut ou une estimation.

Les recettes de l'exercice (`fiscalResult.recettes.total`) ne font l'objet d'aucune sortie de cette Transformation : le 2031-SD 2026 ne comporte aucune rubrique « Production vendue ». Cette donnée reste disponible sur le FiscalResult et alimente déjà, séparément, le mapping 2033-B-SD (rubrique 218, hors périmètre du présent document).

## Relations avec SAV-029

SAV-029 documente quels formulaires composent la liasse LMNP réel simplifié et sous quelles conditions (2031-SD, 2033-A à 2033-E selon les règles qui y sont décrites). TRF-0034 ne redéfinit pas cette composition : elle documente uniquement comment les données du dossier et du FiscalResult se reportent dans le 2031-SD, une fois ce formulaire jugé applicable. Aucune référence à 2033-D, 2033-E, 2033-F ou 2033-G n'est faite ici — ces points relèvent exclusivement de SAV-029.

## Sources

Formulaire N° 2031-SD, millésime 2026, Cerfa 11085*28 (DGFiP). Notice N° 2033-NOT-SD, millésime 2026, Cerfa 50448#28 (DGFiP) — pour la distinction 2031-SD / 2033-B-SD (rubrique 218). Voir SAV-029 pour les sources DGFiP/BOFiP relatives à la composition de la liasse.
