---
id: SAV-029
title: "Composition de la liasse LMNP réel simplifié"
type: savoir
status: approved
version: "1.0"
created: 2026-09-02
updated: 2026-09-04
owner: product-owner
source: DGFiP — Notice n° 2033-NOT-SD (Cerfa 50448#26, millésime 2024) ; BOFiP BOI-BIC-DECLA-30-20-10
tags: [liasse, composition, 2031, 2033, régime-réel-simplifié, bic, ir]
catégorie: fait
domaine: fiscal
éclaire: [TRF-0034]
---

# SAV-029 — Composition de la liasse LMNP réel simplifié

## Objet

Documenter, pour une entreprise individuelle LMNP relevant des BIC au régime réel simplifié et imposée à l'IR, la liste des formulaires composant la liasse fiscale annuelle à produire, et leur caractère obligatoire ou conditionnel.

Ce document ne définit aucune règle de calcul ni aucun mapping vers les cases d'un formulaire — voir « Relation avec les futures règles de mapping ».

## Périmètre

Entreprise individuelle (personne physique, sans forme sociétaire), activité de location meublée non professionnelle, régime réel simplifié BIC, imposition à l'IR.

Exclut explicitement : LMP, micro-BIC, IS, régime réel normal, SCI, et toute autre activité BIC hors LMNP.

## Composition de la liasse

| Formulaire | Rôle | Applicabilité |
|---|---|---|
| 2031-SD | Déclaration de résultats | Obligatoire |
| 2033-A-SD | Bilan simplifié | Obligatoire, sauf dispense de bilan applicable (voir « 2033-A — dispense de bilan ») |
| 2033-B-SD | Compte de résultat simplifié | Obligatoire |
| 2033-C-SD | Immobilisations — amortissements — plus-values — moins-values | Obligatoire |
| 2033-D-SD | Relevé des provisions — amortissements dérogatoires — déficits reportables | Obligatoire (voir « 2033-D — formulaire obligatoire, contenu partiellement non servi ») |
| 2033-E-SD | Détermination des effectifs et de la valeur ajoutée | Conditionnel (voir « 2033-E — condition d'applicabilité ») |
| 2033-F-SD | Composition du capital social | Hors périmètre — entreprise individuelle |
| 2033-G-SD | Filiales et participations | Hors périmètre — entreprise individuelle |

## 2033-A — dispense de bilan

La dispense de production du tableau 2033-A-SD (article 302 septies A bis VI du CGI) s'applique aux exploitants individuels dont le **chiffre d'affaires de l'année civile précédente** n'excède pas :

- 176 000 € HT pour les entreprises d'achat-revente, de fourniture de logement ou de denrées à emporter ou à consommer sur place ;
- 61 000 € HT pour les autres activités.

Ce seuil, portant sur l'année civile précédente, ne concerne que le tableau 2033-A. Il ne dispense d'aucun autre tableau et ne doit pas être confondu avec le seuil et la période de référence de 2033-E (voir ci-dessous).

## 2033-D — formulaire obligatoire, contenu partiellement non servi

Le formulaire 2033-D-SD doit être produit systématiquement par toute entreprise individuelle au régime réel simplifié, au même titre que 2033-B et 2033-C, sans condition de chiffre d'affaires.

Son Cadre II « Déficits reportables » est normalement destiné aux seules entreprises relevant de l'impôt sur les sociétés : pour une entreprise à l'IR, le report de déficit s'effectue via la déclaration de revenus n° 2042-SD, pas via ce cadre. Une exception résiduelle existe pour un stock d'amortissements réputés différés antérieur au 1er janvier 2004 non encore apuré — non pertinente pour une activité récente.

**Cette absence de contenu dans un cadre spécifique ne rend jamais le formulaire optionnel.** La distinction porte sur le contenu interne d'un formulaire par ailleurs obligatoire, jamais sur son applicabilité.

## 2033-E — condition d'applicabilité

Le formulaire 2033-E-SD doit être produit lorsque le chiffre d'affaires réalisé par l'entreprise **au cours de l'exercice clos** — et non de l'année civile précédente — est supérieur à **152 500 € HT**.

Si l'exercice a une durée différente de 12 mois, le chiffre d'affaires est ramené à 12 mois avant comparaison au seuil.

Cette condition détermine l'applicabilité du formulaire lui-même, pas seulement le contenu d'une case interne — à la différence de la nuance documentée pour 2033-D.

Aucune règle de calcul du chiffre d'affaires applicable à ce seuil n'est définie par le présent document. La question de savoir quelle donnée du modèle Fiscal AI peut servir de base à cette condition — et selon quelles modalités d'annualisation — reste à spécifier dans une future règle de calcul dédiée.

## Exclusions explicites

- 2033-F-SD, 2033-G-SD : hors périmètre pour une entreprise individuelle, quel que soit le chiffre d'affaires.
- 2042-C-PRO, 2042-SD : hors périmètre du présent document.
- Formulaires liés à l'IS, au régime réel normal, ou à des dispositifs spécifiques (jeunes entreprises innovantes, zones franches, crédit-bail, réévaluation légale, etc.) : hors périmètre.

## Relation avec 2031-SD

2031-SD est le document pivot de la déclaration de résultats ; les tableaux 2033 en sont les annexes, obligatoires ou conditionnelles selon les règles ci-dessus. Le présent document ne documente que la liste et l'applicabilité de ces annexes — jamais leur contenu case par case.

## Relation avec les futures règles de mapping

Ce document ne contient et ne doit jamais contenir de règle de correspondance champ vers case, ni aucune spécification technique. Le mapping FiscalResult/Identité vers les cases Cerfa du 2031-SD est documenté exclusivement dans TRF-0034. Les tableaux 2033 feront l'objet de Transformations dédiées si leur génération est un jour implémentée — ce document n'anticipe ni leur existence ni leur contenu.
