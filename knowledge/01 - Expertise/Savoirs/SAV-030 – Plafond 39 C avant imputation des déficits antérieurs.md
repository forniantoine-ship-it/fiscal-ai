---
id: SAV-030
title: "Plafond 39 C avant imputation des déficits antérieurs"
type: savoir
status: approved
version: "1.2"
created: 2026-10-02
updated: 2026-10-05
owner: product-owner
source: "BOFiP BOI-BIC-AMT-20-40-10-20 du 1er mars 2017, §§ 40 à 100 ; BOI-BIC-AMT-20-40-10-30 ; BOI-BIC-CHAMP-40-20 ; BOI-BIC-DEF-20-20 ; CGI art. 39 C, II, 2 ; formulaire 2033-SD 2026 ; notice 2033-NOT-SD 2026"
tags: [résultat-fiscal, article-39-c, imputation, ordre, déficits, amortissements, 2033-b]
catégorie: concept
domaine: fiscal
portée: LMNP
supersedes: SAV-027
justifie: [TRF-0031, RAI-014]
éclaire: [SAV-032]
---

# SAV-030 — Plafond 39 C avant imputation des déficits antérieurs

Preuve P0-39C.2. Remplace SAV-027, dont l'ordre « déficits avant amortissements » est contredit.

## Règle centrale (correction 1.2)

```
C = max(0, L − B)
```

- `L` = loyers acquis entrant dans le périmètre de l'article 39 C ;
- `B` = autres charges, **hors amortissements**, afférentes aux biens loués.

**Capacité 39 C = max(0, loyers acquis 39 C − charges afférentes aux biens loués hors amortissements).**

La capacité 39 C n'est **pas** définie comme « résultat fiscal global avant amortissements ». La rédaction 1.0/1.1 de l'étape 1 (« le plafond est le résultat avant amortissement ») est **corrigée** : elle n'est exacte que si le résultat global ne contient que `L` et `B`. Les charges de pure activité (`ACTIVITY`) réduisent le résultat fiscal global sans réduire `C` ; les autres produits (`OTHER_PRODUCT`) l'augmentent sans augmenter `C`. Classification : SAV-031.

Niveau de preuve : **DIRECT** (CGI art. 39 C, II, 2 ; BOI-BIC-AMT-20-40-10-20, §§ 40 à 90, issu de 39C-PROOF-2).

## B ≠ ACTIVITY (BOI-BIC-AMT-20-40-10-20, § 70)

- `B` : charges afférentes aux biens loués. Elles diminuent `C`.
- `ACTIVITY` : charges fiscalement déductibles du résultat global, liées à l'activité de location mais **non** au bien donné en location. Elles ne diminuent pas `L` pour déterminer `C`. Exemple doctrinal direct : frais de comptabilité.

Niveau de preuve : **DIRECT** (§ 70).

## Ordre de calcul

1. Calcul de `C = max(0, L − B)`.
2. Dotation courante, déductible dans la limite de `C`. L'excédent est non déductible : réintégration (ligne 318 du 2033-B) et amortissement réputé différé (ARD).
3. ARD historique, déduit dans la capacité **restante** `C − dotation courante déduite`.
4. Résultat courant après amortissements : résultat global (produits et charges, `OTHER_PRODUCT` et `ACTIVITY` compris) moins amortissements déduits (étapes 2 et 3). C'est le **résultat LMNP avant déficits antérieurs** (grandeur métier `resultatFiscalAvantDeficits` de F-006). Il alimente la case 7a de la 2031-SD lorsqu'il est positif. Il n'est **pas** directement la ligne 352/354 de la 2033-B-SD : voir SAV-032.
5. Les déficits LMNP antérieurs sont imputés ensuite, les plus anciens d'abord, sur le seul bénéfice restant (AX-016). Ils ne réduisent **jamais** `C`.
6. Le solde est le résultat fiscal après imputation (grandeur métier `resultatFiscal` de F-006).

| Maillon | Niveau de preuve |
|---|---|
| ARD déductibles « en sus de l'annuité normale » sous le même plafond | **DIRECT** (source officielle) |
| Les déficits antérieurs n'entrent pas dans le plafond | **DIRECT** (§ 40, § 80, § 90 ; art. 39 C, II, 2) |
| Priorité dotation courante → ARD historique (personne physique) | **INFERENCE** fortement étayée, formulée moins directement par les sources. Non citée comme texte officiel |

La ligne 360 de la notice 2033-NOT-SD 2026 est réservée aux sociétés à l'impôt sur les sociétés. Elle ne porte pas l'imputation des déficits LMNP à l'IR.

## Distinction grandeur métier / lignes du Cerfa (correction 1.1)

La rédaction 1.0 associait directement l'étape 4 aux lignes 352/354 et l'étape 6 aux lignes 370/372 de la 2033-B-SD. Cette association est **corrigée** : pour une activité LMNP exclusive, le résultat non professionnel est neutralisé dans la 2033-B (déficit réintégré en 330, bénéfice déduit en 350) et les lignes 352/354 et 370/372 valent 0 (SAV-032). L'ordre de calcul ci-dessus (étapes 1 à 6) décrit le calcul métier de F-006, inchangé ; seule sa projection sur le Cerfa est précisée par SAV-032.

## Un amortissement admissible peut créer ou aggraver un déficit global

L'ancienne règle simplifiée « l'amortissement ne peut jamais créer ou aggraver un déficit global » est **abandonnée**. La limite est `L − B`, non le signe du résultat global. Un amortissement qui respecte `C` peut conduire à un résultat fiscal global négatif lorsque ce déficit provient de charges `ACTIVITY`.

Oracle négatif : `L = 10 000`, `B = 7 000`, `ACTIVITY = 4 000`, dotation = 2 500.

| Grandeur | Montant |
|---|---:|
| `C = max(0, 10 000 − 7 000)` | 3 000 |
| Dotation déduite | 2 500 (≤ C : admissible) |
| ARD nouvelle | 0 |
| Résultat global avant amortissement : 10 000 − 7 000 − 4 000 | −1 000 |
| Résultat après amortissement | −3 500 |

Ce déficit est cohérent avec le contrat 39 C : l'amortissement n'excède pas la marge locative `L − B`.

## Produits hors L

Produit fiscal imposable ≠ automatiquement `L`. `C` utilise les loyers acquis du périmètre 39 C ; les autres produits sont identifiés séparément (`OTHER_PRODUCT`), peuvent augmenter le résultat global, **sans** augmenter `C`.

Oracle : `L = 10 000`, `B = 7 000`, `OTHER_PRODUCT = 2 000`, dotation = 4 000. `C` reste **3 000** (et non 5 000) : amortissement déductible = 3 000 ; ARD nouvelle = 1 000.

## Qualification non résolue : fail-closed (décision produit APPROVED)

Pour toute catégorie dont le classement 39 C est non résolu (liste : SAV-031, notamment la CFE) :

1. calculer les branches fiscalement plausibles ;
2. comparer amortissement déduit, ARD final et résultat fiscal ;
3. si toutes les branches donnent exactement le même résultat fiscal pertinent : le calcul peut continuer, l'incertitude est conservée dans la trace ;
4. si au moins une branche modifie un résultat fiscal pertinent : `NEEDS_QUALIFICATION`, aucun résultat fiscal définitif.

Principe : `UNKNOWN QUALIFICATION ≠ 0 ≠ B ≠ ACTIVITY`. Le moteur ne choisit jamais arbitrairement la branche la plus favorable ou la plus défavorable. La décision produit porte sur le comportement du moteur face à l'incertitude ; elle ne tranche pas la qualification fiscale.

## Réserve : loyers des biens amortissables et terrain / bâti

`NEEDS_FURTHER_PROOF`. Le § 50 de BOI-BIC-AMT-20-40-10-20 pose une question supplémentaire sur les loyers des biens amortissables. Aucune règle de ventilation appartement / terrain n'est créée ; cette réserve ne doit pas être transformée silencieusement en ventilation du loyer.

## Dépendance F013 v1 / v2

- F013 v2 fournit conceptuellement le bon `L` : loyers acquis N (SAV-034, TRF-0036). État : **IMPLEMENTED BUT OFF**, non branché à F006.
- F013 v1 (production) repose sur les encaissements et peut mélanger d'autres produits dans certains chemins d'import. Le proxy V1 n'est **pas** fiscalement équivalent à `L`.
- Le moteur pur 39 C et son contrat de classification pourront être construits avant ; son branchement productif sur un `L` exact doit tenir compte de F013 v2. Ce Savoir ne réouvre pas F013.

## Contrat d'entrée (sémantique, pas API)

Loyers acquis 39 C ; charges `B` ; charges `ACTIVITY` ; autres produits taxables hors `L` ; montants non qualifiés ; dotation courante ; stock ARD ; déficits antérieurs. Les noms techniques relèvent de l'implémentation.

## Traçabilité

Chaque montant entrant dans `L` ou `B` doit être relié à sa contribution, son bien (ou le niveau activité), sa catégorie, sa qualification, son montant et la raison de sa classification. `ContributionLedger` pourra être étendu pour cela ; `ContributionLedger ≠ general ledger`. `FEC NOT STARTED`.

## Source

BOFiP BOI-BIC-AMT-20-40-10-20 du 1er mars 2017, § 40, § 80 et § 90, citant le 2 du II de l'article 39 C du CGI. Sources de la règle centrale : BOI-BIC-AMT-20-40-10-20 §§ 40 à 100 (§ 70 : charges d'activité ; § 100 : plusieurs biens), BOI-BIC-AMT-20-40-10-30, BOI-BIC-CHAMP-40-20 (location meublée), BOI-BIC-DEF-20-20 (déficits). Ordre de calcul du résultat fiscal : résultat comptable 312/314, réintégration 318 (amortissements excédentaires), puis, pour la projection sur le formulaire, SAV-032 (notice 2033-NOT-SD 2026 : lignes 330, 350, 690, 691 ; formulaire 2031 Bis-SD, cadre I).
