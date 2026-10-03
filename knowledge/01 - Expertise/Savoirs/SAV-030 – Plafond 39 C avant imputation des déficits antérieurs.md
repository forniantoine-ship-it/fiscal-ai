---
id: SAV-030
title: "Plafond 39 C avant imputation des déficits antérieurs"
type: savoir
status: approved
version: "1.1"
created: 2026-10-02
updated: 2026-10-03
owner: product-owner
source: "BOFiP BOI-BIC-AMT-20-40-10-20 du 1er mars 2017, § 40, § 80 et § 90 ; CGI art. 39 C, II, 2 ; formulaire 2033-SD 2026 ; notice 2033-NOT-SD 2026"
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

## Ordre

1. Le plafond de déductibilité de l'article 39 C est le résultat avant amortissement. Le stock de déficits antérieurs n'entre pas dans ce plafond.
2. La dotation de l'exercice est déductible dans cette limite. L'excédent est non déductible : réintégration (ligne 318 du 2033-B) et amortissement réputé différé.
3. Le stock d'amortissements réputés différés antérieurs est consommé dans le reliquat du même plafond.
4. Le solde est le **résultat LMNP avant déficits antérieurs** (grandeur métier `resultatFiscalAvantDeficits` de F-006). Cette grandeur alimente la case 7a de la 2031-SD lorsqu'elle est positive. Elle n'est **pas** directement la ligne 352/354 de la 2033-B-SD : voir SAV-032.
5. Les déficits antérieurs sont imputés ensuite, les plus anciens d'abord, sur le seul bénéfice restant (AX-016).
6. Le solde est le résultat fiscal après imputation (grandeur métier `resultatFiscal` de F-006).

La ligne 360 de la notice 2033-NOT-SD 2026 est réservée aux sociétés à l'impôt sur les sociétés. Elle ne porte pas l'imputation des déficits LMNP à l'IR.

## Distinction grandeur métier / lignes du Cerfa (correction 1.1)

La rédaction 1.0 associait directement l'étape 4 aux lignes 352/354 et l'étape 6 aux lignes 370/372 de la 2033-B-SD. Cette association est **corrigée** : pour une activité LMNP exclusive, le résultat non professionnel est neutralisé dans la 2033-B (déficit réintégré en 330, bénéfice déduit en 350) et les lignes 352/354 et 370/372 valent 0 (SAV-032). L'ordre de calcul ci-dessus (étapes 1 à 6) décrit le calcul métier de F-006, inchangé ; seule sa projection sur le Cerfa est précisée par SAV-032.

## Source

BOFiP BOI-BIC-AMT-20-40-10-20 du 1er mars 2017, § 40, § 80 et § 90, citant le 2 du II de l'article 39 C du CGI. Ordre de calcul du résultat fiscal : résultat comptable 312/314, réintégration 318 (amortissements excédentaires), puis, pour la projection sur le formulaire, SAV-032 (notice 2033-NOT-SD 2026 : lignes 330, 350, 690, 691 ; formulaire 2031 Bis-SD, cadre I).
