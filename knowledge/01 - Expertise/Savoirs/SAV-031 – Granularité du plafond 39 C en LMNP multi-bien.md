---
id: SAV-031
title: "Granularité du plafond 39 C en LMNP multi-bien"
type: savoir
status: approved
version: "0.1"
created: 2026-10-02
updated: 2026-10-03
owner: product-owner
source: "CGI art. 39 C, II, 2 et 3 ; CGI art. 156, I, 1° ter ; BOI-BIC-AMT-20-40-10-20, §§ 40 à 100 ; BOI-BIC-AMT-20-40-10-40 ; BOI-FORM-000038 ; BOI-BIC-DEF-20-20, §§ 110 à 130 ; formulaires 2033-SD et notice 2033-NOT-SD 2026"
tags: [résultat-fiscal, article-39-c, lmnp, multi-bien, amortissements, déficits, 2033-b]
catégorie: concept
domaine: fiscal
portée: "Personne physique exerçant une même activité LMNP avec plusieurs biens loués, soumis au 2 du II de l'article 39 C"
justifie: [RAI-014, TRF-0031]
---

# SAV-031 — Granularité du plafond 39 C en LMNP multi-bien

## Périmètre et relation avec SAV-030

Ce Savoir complète SAV-030 pour plusieurs biens loués par la même personne physique dans une même activité LMNP. Il ne fusionne pas les activités de contribuables distincts et ne décrit pas le régime applicable à une personne morale soumise à l'impôt sur les sociétés. L'ordre de SAV-030 reste : **39 C avant imputation des déficits antérieurs**.

## Plafond global des biens concernés

Lorsque plusieurs biens sont soumis à la limite du 2 du II de l'article 39 C, on compare **l'ensemble des loyers acquis et des charges afférentes aux biens loués** avec **l'annuité d'amortissement concernant ces biens**. Le plafond n'est appliqué ni isolément à chaque bien ou logement, ni séparément à chaque immobilisation. Le montant déductible est limité à la différence positive entre ces loyers et ces charges, sous réserve des autres limites fiscales applicables aux dotations. Le BOI-BIC-AMT-20-40-10-20, § 100, écarte expressément l'application isolée par bien.

Les charges purement liées à l'activité de location, sans être afférentes aux biens loués, ne diminuent pas ce plafond (§ 70). Elles peuvent intervenir dans le résultat fiscal suivant leurs propres règles. Le **résultat global avant amortissement** n'est donc égal au plafond 39 C que si son périmètre de recettes et de charges correspond exactement aux loyers acquis et aux charges afférentes retenus pour ce plafond. Cette égalité est une hypothèse explicite des oracles ci-dessous, pas une identité générale.

## Amortissements écartés : origine par bien

Le **calcul du plafond est global**. Si une fraction de l'annuité est écartée, le § 100 prévoit sa répartition entre les biens concernés. Le BOI-FORM-000038, § 1, impose un état de suivi pour **chaque bien** dont tout ou partie de l'amortissement est écarté. Le total d'activité peut servir à la synthèse, mais ne peut pas remplacer la provenance et le suivi du non-déduit par bien.

Conserver l'origine est également nécessaire pour traiter une cessation de location ou une cession du bien : le 3 du II de l'article 39 C prévoit des conséquences attachées au **bien** concerné. Le présent Savoir ne fixe pas l'algorithme de répartition, de consommation ultérieure ou de sortie d'un stock par bien.

Granularité fiscale obligatoire supplémentaire par immobilisation ou composant *à l'intérieur d'un même logement* : **OFFICIAL EVIDENCE INSUFFICIENT**. Les plans d'amortissement comptables peuvent requérir leur propre détail ; ce constat ne démontre pas une obligation de stock 39 C par composant.

## Déficits antérieurs et ordre de calcul

Les déficits antérieurs de LMNP s'imputent sur les bénéfices ultérieurs d'une activité de location meublée **non professionnelle** de même nature, dans le délai prévu par le CGI art. 156, I, 1° ter. Il ne s'agit pas de stocks fiscalement cantonnés au logement qui a contribué à les produire. Le suivi du déficit est global à l'activité, avec son millésime pour appliquer le délai. L'imputation intervient **après** le plafonnement 39 C et le traitement des amortissements reportés, conformément à SAV-030.

## Projection déclarative

La 2033-B porte le résultat de l'entreprise déclarante : la réintégration des amortissements excédentaires en ligne 318 et les montants de résultat sont des totaux déclaratifs, sans lignes 2033-B distinctes par bien. Le suivi justificatif par bien des amortissements écartés reste requis. La ligne 330 correspond à « Divers à réintégrer » et ne désigne pas, par elle-même, le déficit de l'exercice.

**2033-B IR MAPPING — FURTHER PROOF REQUIRED.** La notice 2033-NOT-SD 2026 mentionne la ligne 350 « Divers à déduire » pour l'imputation de déficits antérieurs d'une entreprise à l'IR ; l'articulation exacte avec les lignes 352/354 et 370/372 et la représentation de SAV-030 doit être examinée dans une preuve séparée. Ce Savoir ne modifie ni SAV-030 ni un mapping 2033-B. *Mise à jour 2026-10-03 : cette preuve séparée est portée par SAV-032 (neutralisation du résultat LMNP non professionnel : 330 / 350 / 352-354 / 370-372, 2031 7a-7b). Elle ne change ni les oracles ci-dessus ni la granularité du plafond 39 C.*

## Oracles multi-bien

Hypothèses communes : une même personne physique et une même activité LMNP ; tous les montants « avant amortissement » ci-dessous correspondent exclusivement aux loyers acquis moins les autres charges afférentes aux biens soumis au 39 C ; aucune autre correction fiscale, aucun stock d'amortissements reportés et aucun déficit antérieur. Les dotations sont admissibles au regard des autres règles fiscales.

| Montants (€) | Oracle 1 : bien A | Oracle 1 : bien B | Oracle 2 : bien A | Oracle 2 : bien B |
|---|---:|---:|---:|---:|
| Loyers moins charges afférentes, avant amortissement | +10 000 | -3 000 | +3 000 | +4 000 |
| Dotation aux amortissements | 0 | 4 000 | 4 000 | 0 |

Dans **chacun** des deux oracles : total des loyers moins charges afférentes = +7 000 € ; plafond 39 C = 7 000 € ; dotations totales = 4 000 € ; amortissement déductible = 4 000 € ; amortissement écarté = 0 € ; réintégration 318 au titre du 39 C = 0 € ; résultat global avant déficits antérieurs = +3 000 €.

La répartition des mêmes totaux admissibles entre les biens ne change donc pas le plafond ni le résultat fiscal global dans ces deux cas. Ces chiffres ne définissent pas un « résultat fiscal par bien ». Si un autre cas produit un amortissement écarté, celui-ci doit être attribué et suivi par bien.

## Sources officielles

- [CGI, article 39 C, II, 2 et 3](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000029355753/2020-12-21) : limite, report, cessation de location et cession.
- [BOI-BIC-AMT-20-40-10-20, §§ 40 à 100](https://bofip.impots.gouv.fr/bofip/4527-PGP.html/identifiant=BOI-BIC-AMT-20-40-10-20-20170301) : périmètre des loyers et charges (§§ 50 à 70), limite (§§ 80 à 90), plusieurs biens et répartition du non-déduit (§ 100).
- [BOI-FORM-000038, § 1](https://bofip.impots.gouv.fr/bofip/4547-PGP.html/identifiant=BOI-FORM-000038-20130826) et [BOI-BIC-AMT-20-40-10-40](https://bofip.impots.gouv.fr/bofip/4545-PGP.html/identifiant=BOI-BIC-AMT-20-40-10-40-20130826) : suivi des amortissements écartés.
- [CGI, article 156, I, 1° ter](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053544806/2026-04-19) et [BOI-BIC-DEF-20-20, §§ 110 à 130](https://bofip.impots.gouv.fr/bofip/2011-PGP.html/identifiant=BOI-BIC-DEF-20-20-20120912) : déficits LMNP.
- [2033-SD 2026](https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5394.pdf) et [notice 2033-NOT-SD 2026](https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5395.pdf) : rubriques déclaratives et point à instruire sur la ligne 350.
