---
id: SAV-031
title: "Granularité du plafond 39 C en LMNP multi-bien et classification des montants"
type: savoir
status: approved
version: "0.3"
created: 2026-10-02
updated: 2026-10-05
owner: product-owner
source: "CGI art. 39 C, II, 2 et 3 ; CGI art. 156, I, 1° ter ; BOI-BIC-AMT-20-40-10-20, §§ 40 à 100 ; BOI-BIC-AMT-20-40-10-30 ; BOI-BIC-AMT-20-40-10-40 ; BOI-FORM-000038 ; BOI-BIC-CHAMP-40-20 ; BOI-BIC-DEF-20-20, §§ 110 à 130 ; formulaires 2033-SD et notice 2033-NOT-SD 2026"
tags: [résultat-fiscal, article-39-c, lmnp, multi-bien, classification, amortissements, déficits, 2033-b]
catégorie: concept
domaine: fiscal
portée: "Personne physique exerçant une même activité LMNP avec plusieurs biens loués, soumis au 2 du II de l'article 39 C"
justifie: [RAI-014, TRF-0031]
---

# SAV-031 — Granularité du plafond 39 C en LMNP multi-bien et classification des montants

## Périmètre et relation avec SAV-030

Ce Savoir complète SAV-030 pour plusieurs biens loués par la même personne physique dans une même activité LMNP. Il ne fusionne pas les activités de contribuables distincts et ne décrit pas le régime applicable à une personne morale soumise à l'impôt sur les sociétés. L'ordre de SAV-030 reste : **39 C avant imputation des déficits antérieurs**. La règle centrale `C = max(0, L − B)` est portée par SAV-030 ; ce Savoir porte aussi le contrat de classification des montants (section dédiée, 0.2).

## Plafond global des biens concernés

Lorsque plusieurs biens sont soumis à la limite du 2 du II de l'article 39 C, on compare **l'ensemble des loyers acquis et des charges afférentes aux biens loués** avec **l'annuité d'amortissement concernant ces biens**. Le plafond n'est appliqué ni isolément à chaque bien ou logement, ni séparément à chaque immobilisation. Cela confirme l'architecture `properties → contributions → consolidation → ONE F006` : aucun résultat fiscal autonome par bien ; les capacités multi ne sont pas modifiées par ce Savoir. Le montant déductible est limité à la différence positive entre ces loyers et ces charges, sous réserve des autres limites fiscales applicables aux dotations. Le BOI-BIC-AMT-20-40-10-20, § 100, écarte expressément l'application isolée par bien.

Les charges purement liées à l'activité de location, sans être afférentes aux biens loués, ne diminuent pas ce plafond (§ 70). Elles peuvent intervenir dans le résultat fiscal suivant leurs propres règles. Le **résultat global avant amortissement** n'est donc égal à la capacité `C` que si son périmètre de recettes et de charges correspond exactement aux loyers acquis et aux charges afférentes retenus pour ce plafond. Cette égalité est une hypothèse explicite des oracles ci-dessous, pas une identité générale.

## Amortissements écartés : origine par bien

Le **calcul du plafond est global**. Si une fraction de l'annuité est écartée, le § 100 prévoit sa répartition entre les biens concernés. Le BOI-FORM-000038, § 1, impose un état de suivi pour **chaque bien** dont tout ou partie de l'amortissement est écarté. Le total d'activité peut servir à la synthèse, mais ne peut pas remplacer la provenance et le suivi du non-déduit par bien.

Conserver l'origine est également nécessaire pour traiter une cessation de location ou une cession du bien : le 3 du II de l'article 39 C prévoit des conséquences attachées au **bien** concerné. Le présent Savoir ne fixe pas l'algorithme de répartition, de consommation ultérieure ou de sortie d'un stock par bien.

Granularité fiscale obligatoire supplémentaire par immobilisation ou composant *à l'intérieur d'un même logement* : **OFFICIAL EVIDENCE INSUFFICIENT**. Les plans d'amortissement comptables peuvent requérir leur propre détail ; ce constat ne démontre pas une obligation de stock 39 C par composant.

## Charges ACTIVITY communes à l'activité (multi, décision PO 2026-10-05)

Une charge `ACTIVITY` ne diminue pas `C` (§70) ; son attribution à un bien n'est donc **jamais nécessaire** pour calculer la capacité. Elle est portée **au niveau de l'activité**, sans `propertyId` :

- niveau bien (`PropertyFiscalContribution`) : `L`, `B`, `OTHER_PRODUCT` éventuel, traces `propertyId` ;
- niveau activité (`ActivityFiscalContribution`, concept logique) : charges `ACTIVITY` globales, provenance, qualification, source ; **aucun `propertyId` artificiel** ;
- consolidation (`ConsolidatedFiscalInputs`) : somme des `L` et des `B` des biens, `ACTIVITY` d'activité, autres produits, qualifications ; **un seul appel F-006**, une seule capacité globale.

Exemple : bien A (L 10 000, B 2 000), bien B (L 8 000, B 1 000), comptabilité globale `ACTIVITY` 1 000 → `L` global 18 000, `B` global 3 000, `C` 15 000, résultat avant amortissement 14 000. L'`ACTIVITY` n'entre dans aucun `B`, ne réduit pas `C`, ne crée aucune écriture inter-biens.

**Une charge ACTIVITY globale ne reçoit jamais de `propertyId` fictif et n'est jamais répartie** (ni 50/50, ni au prorata des loyers, de la valeur ou des charges) pour satisfaire une structure technique.

**Frontière fail-closed.** Seules les charges communes **définitivement qualifiées `ACTIVITY`** peuvent être ouvertes. Toute charge commune `B`, `B_OR_ACTIVITY` matérielle, `NEEDS_QUALIFICATION`, `OUT_OF_DOMAIN` ou exigeant une allocation par bien reste bloquée (`common_charges_not_supported`) : ce code n'est pas supprimé globalement, il devra évoluer vers une règle plus précise. ADR-011 §1 et §6 (attestation `noCommonCharges`) restent en vigueur tant que ce changement n'est pas implémenté et recetté ; aucune capacité n'est modifiée par ce Savoir.

**FEC (compatibilité conceptuelle).** Une charge d'activité globale appartient à l'activité LMNP ; elle peut ne pas avoir de `propertyId` analytique, mais elle exige une écriture comptable normale et ne crée aucune écriture inter-biens fictive. Le futur FEC reste au niveau activité ; `propertyId` est analytique, non une obligation comptable. FEC : NOT STARTED.

## Déficits antérieurs et ordre de calcul

Les déficits antérieurs de LMNP s'imputent sur les bénéfices ultérieurs d'une activité de location meublée **non professionnelle** de même nature, dans le délai prévu par le CGI art. 156, I, 1° ter. Il ne s'agit pas de stocks fiscalement cantonnés au logement qui a contribué à les produire. Le suivi du déficit est global à l'activité, avec son millésime pour appliquer le délai. L'imputation intervient **après** le plafonnement 39 C et le traitement des amortissements reportés, conformément à SAV-030.

## Projection déclarative

La 2033-B porte le résultat de l'entreprise déclarante : la réintégration des amortissements excédentaires en ligne 318 et les montants de résultat sont des totaux déclaratifs, sans lignes 2033-B distinctes par bien. Le suivi justificatif par bien des amortissements écartés reste requis. La ligne 330 correspond à « Divers à réintégrer » et ne désigne pas, par elle-même, le déficit de l'exercice.

**2033-B IR MAPPING — FURTHER PROOF REQUIRED.** La notice 2033-NOT-SD 2026 mentionne la ligne 350 « Divers à déduire » pour l'imputation de déficits antérieurs d'une entreprise à l'IR ; l'articulation exacte avec les lignes 352/354 et 370/372 et la représentation de SAV-030 doit être examinée dans une preuve séparée. Ce Savoir ne modifie ni SAV-030 ni un mapping 2033-B. *Mise à jour 2026-10-03 : cette preuve séparée est portée par SAV-032 (neutralisation du résultat LMNP non professionnel : 330 / 350 / 352-354 / 370-372, 2031 7a-7b). Elle ne change ni les oracles ci-dessus ni la granularité du plafond 39 C.*

## Contrat de classification des montants (0.2)

Chaque montant est rattaché à **une** classe. Les niveaux de preuve (**DIRECT** / **INFERENCE** / **UNRESOLVED**) sont ceux de 39C-PROOF-2 ; une inférence n'est jamais présentée comme règle officiellement citée.

| Classe | Sens | Effet |
|---|---|---|
| `L` | loyers acquis du périmètre 39 C | augmente `C` |
| `B` | autres charges, hors amortissements, afférentes aux biens loués | diminue `C` |
| `ACTIVITY` | charges déductibles du résultat global, de pure activité (§ 70) | réduit le résultat, pas `C` |
| `OTHER_PRODUCT` | produits taxables hors `L` | augmente le résultat, pas `C` |
| `EXCLUDED` | n'entre ni dans `C` ni dans le résultat via ce circuit | aucun |
| `NEEDS_QUALIFICATION` | nature fiscale non démontrée ou position 39 C non tranchée | fail-closed (SAV-030) |
| `OUT_OF_DOMAIN` | hors périmètre supporté | pas de résultat définitif si matériel |

Produit fiscal imposable ≠ automatiquement `L`.

### Classifications établies

- **L** : loyers ordinaires acquis ; loyers impayés mais acquis ; compléments de loyers correctement rattachés ; loyers reçus d'avance uniquement sur l'exercice auquel ils se rattachent (SAV-034).
- **B** : taxe foncière ; assurance PNO ou directement attachée au bien ; prime GLI directement attachée au bien ; intérêts d'emprunt du bien ; assurance emprunteur du financement ; frais de financement directement rattachables au bien ; gestion locative ; entretien/réparation fiscalement déductible ; charges de copropriété qualifiées charges déductibles afférentes au bien.
- **ACTIVITY** : comptabilité ; logiciel comptable ; service de déclaration fiscale ; frais généraux juridiques/fiscaux concernant l'activité et non le bien ; autres charges démontrées de pure activité. Seule la comptabilité est un exemple doctrinal direct (§ 70).
- **EXCLUDED** : amortissements eux-mêmes ; dépenses capitalisées (évite la double déduction) ; dépôt de garantie normalement remboursable ; charges non déductibles ; apports et virements internes.

### Qualifications non tranchées (NEEDS_QUALIFICATION / UNRESOLVED / OUT_OF_DOMAIN)

Les sources officielles consultées n'ont pas permis de décider les catégories suivantes. Le Product Owner ne les tranche pas ; seul le comportement du moteur est décidé (fail-closed, SAV-030).

- **CFE** : voir la section « CFE » ci-dessous (décision du Product Owner du 2026-10-05). Elle n'est jamais classée automatiquement en `B`.
- Frais bancaires génériques ; agios et commissions non qualifiés ; régularisations de revenus non qualifiées ; remboursements génériques ; CAF / tiers payant dont la nature fiscale n'est pas démontrée ; versement plateforme net ; dépôt de garantie conservé ; frais d'acquisition passés immédiatement en charges si leur position 39 C n'est pas démontrée ; charges de pré-exploitation selon nature et période ; perte exceptionnelle ; autres catégories « divers » non qualifiées.

### CFE (décision PO 2026-10-05, après 39C-PROOF-3)

Preuve : aucune source officielle actuelle ne classe la CFE pour l'article 39 C (BOI-BIC-AMT-20-40-10-20 §60/§70, version 2017, ne la cite pas). La version du 12/09/2012 du §70 citait « la taxe professionnelle dès lors qu'elle est liée à l'activité de location » parmi les charges de pure activité ; la CFE (CGI art. 1447 : due par l'exploitant pour son activité ; art. 1647 D : cotisation minimum unique, au principal établissement, selon le chiffre d'affaires ou les recettes ; art. 1467 : valeur locative des biens dont le redevable a disposé ; BOI-IF-CFE-20-20-10-10 §30 et §80 : biens donnés en location imposables chez le locataire, locaux d'habitation non retenus) converge vers l'activité sans qu'une phrase actuelle le dise.

| Cas | Fait requis | Classe | Niveau de preuve |
|---|---|---|---|
| A — CFE établie sur la **base minimum**, ou logement loué hors base de la CFE | `cfeBaseKind = MINIMUM` | `ACTIVITY` : réduit le résultat, **pas** `C` | `STRONG_INFERENCE` (jamais DIRECT) |
| B — CFE assise sur la **valeur locative du bien loué** | `cfeBaseKind = RENTAL_VALUE` | `B_OR_ACTIVITY` → `NEEDS_QUALIFICATION` si matériel | `AMBIGUOUS` |
| C — **base inconnue** | `cfeBaseKind = UNKNOWN` | `B_OR_ACTIVITY`, moteur de matérialité | `UNRESOLVED` |

Matérialité (SAV-030, fail-closed) : si `B` et `ACTIVITY` ne changent aucun `D`, `H`, ARD, résultat ni déficit pertinent → `COMPUTED_UNRESOLVED_IMMATERIAL` ; sinon `NEEDS_QUALIFICATION`, aucun résultat définitif. **Jamais de classement automatique de la CFE en `B`.** Le client ne choisit jamais « B ou ACTIVITY » : on lui demande uniquement un fait : « votre avis de CFE est-il calculé sur une base minimum, ou sur la valeur locative d'un établissement ? ». Il n'est pas établi ici que l'avis de CFE permette d'extraire ce fait automatiquement (à vérifier sur des avis réels) ; sinon la réponse reste une déclaration du client.

Contrat de qualification (sémantique) : `{ sourceId (avis CFE), exercice, cfeBaseKind ∈ {MINIMUM, RENTAL_VALUE, UNKNOWN}, provenance ∈ {document, déclaration}, sourceFingerprint, réponse datée }` ; périmée si le montant, le document, l'exercice ou la nature changent ; absence de réponse = `UNKNOWN`.

### Règles de qualification précisées

- **Frais bancaires.** Le libellé « frais bancaires » est insuffisant. Frais démontrés liés au financement d'un bien → `B`. Frais généraux de compte / d'activité, si cette nature est démontrée → `ACTIVITY`. Nature inconnue → `NEEDS_QUALIFICATION`.
- **GLI.** Prime GLI : `B` lorsqu'elle est directement attachée au risque locatif du bien. Indemnité GLI : **jamais ajoutée automatiquement à `L`** (double reconnaissance possible du loyer impayé déjà acquis) ; `OUT_OF_DOMAIN` ou `NEEDS_QUALIFICATION` selon le modèle retenu.
- **Copropriété.** Un appel de fonds de copropriété ≠ automatiquement `B`. Une fois qualifié : charge courante déductible afférente au bien → `B` ; avance ou fonds travaux non encore déductible → hors `B` ; dépense capitalisée → hors `B`, via amortissement ; charge récupérable → cohérence et symétrie avec `L` requises.

### Réserve

Terrain / bâti : `NEEDS_FURTHER_PROOF` (BOI-BIC-AMT-20-40-10-20, § 50). Aucune ventilation appartement / terrain du loyer n'est créée par ce Savoir.

### Traçabilité

Tout montant dans `L` ou `B` : contribution, bien ou niveau activité, catégorie, qualification, montant, raison de classification (SAV-030). `ContributionLedger ≠ general ledger` ; `FEC NOT STARTED`.

## Oracles multi-bien

Hypothèses communes (oracles historiques, sans `ACTIVITY` ni `OTHER_PRODUCT`) : une même personne physique et une même activité LMNP ; tous les montants « avant amortissement » ci-dessous correspondent exclusivement aux loyers acquis moins les autres charges afférentes aux biens soumis au 39 C ; aucune autre correction fiscale, aucun stock d'amortissements reportés et aucun déficit antérieur. Les dotations sont admissibles au regard des autres règles fiscales.

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
- [BOI-BIC-AMT-20-40-10-30, § 10](https://bofip.impots.gouv.fr/bofip/4555-PGP.html/identifiant=BOI-BIC-AMT-20-40-10-30-20120912) : déduction de l'ARD « en sus de l'annuité normale ». CFE : CGI art. 1447, 1467, 1647 D ; BOI-IF-CFE-10-20-20-30 ; BOI-IF-CFE-20-20-10-10 ; BOI-BIC-AMT-20-40-10-20 version du 12/09/2012 (§70).
- [CGI, article 156, I, 1° ter](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053544806/2026-04-19) et [BOI-BIC-DEF-20-20, §§ 110 à 130](https://bofip.impots.gouv.fr/bofip/2011-PGP.html/identifiant=BOI-BIC-DEF-20-20-20120912) : déficits LMNP.
- [2033-SD 2026](https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5394.pdf) et [notice 2033-NOT-SD 2026](https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5395.pdf) : rubriques déclaratives et point à instruire sur la ligne 350.
