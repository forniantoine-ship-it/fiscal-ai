---
id: RAI-000
title: Frontières entre flux métier
type: raisonnement
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [raisonnement, flux, frontières, architecture]
objectif: "Documenter les interfaces entre les flux métier du Knowledge System"
prémisses: []
conclusion: "Chaque flux produit des sorties consommées par le flux suivant. Les frontières sont explicites."
condition_de_sortie: "Toutes les interfaces entre flux sont documentées"
---

# RAI-000 — Frontières entre flux métier

## Acquisition → Amortissements

Le flux Acquisition produit :

| Sortie | Transformation source | Type |
|---|---|---|
| `prix_revient` | TRF-0001 | montant |
| `montant_mobilier_isolé` | TRF-0001 | montant |
| `base_amortissable_bâti` | TRF-0002 | montant |
| `valeur_terrain` | TRF-0002 | montant |

Le flux Amortissements consomme :

| Entrée | Transformation cible | Provenance |
|---|---|---|
| `base_amortissable_bâti` | TRF-0009 | TRF-0002 |
| `montant_mobilier_isolé` | TRF-0010 | TRF-0001 |

**Règle** : le flux Amortissements ne recalcule jamais la base amortissable. Si la base change (correction de l'acquisition), le flux Acquisition est relancé et le flux Amortissements est reconstruit à partir des nouvelles sorties.

## Amortissements → Résultat fiscal

Le flux Amortissements produit :

| Sortie | Transformation source | Type |
|---|---|---|
| `plan_amortissement` | TRF-0012 | tableau complet |
| `total_annuel_exercice` | TRF-0012 | montant |
| `plan_validé` | TRF-0014 | booléen |

Le flux Résultat fiscal (à modéliser) consommera `total_annuel_exercice` comme dotation déductible, sous réserve de la règle de plafonnement (l'amortissement ne crée pas de déficit — AX futur).

## Charges déductibles → Résultat fiscal

Le flux Charges produit :

| Sortie | Transformation source | Type |
|---|---|---|
| `total_charges_déductibles` | TRF-0020 | montant |
| `détail_par_catégorie` | TRF-0020 | tableau |
| `charges_cohérentes` | TRF-0021 | booléen |

Le flux Résultat fiscal (à modéliser) consommera `total_charges_déductibles` pour calculer le résultat avant amortissement.

**Règle** : le flux Charges ne calcule jamais le résultat fiscal. Il produit uniquement le total des charges déductibles.

## Charges déductibles → Amortissements (routage)

Quand une dépense est qualifiée comme immobilisation (TRF-0015, `destination_flux = amortissements`), elle sort du flux Charges et entre dans le flux Amortissements. Elle est transmise avec son montant, sa nature et sa date.

**Règle** : le flux Charges ne traite jamais les immobilisations. Il les détecte et les route.

## Travaux → Amortissements

Le flux Travaux (à modéliser) produira des immobilisations qui alimenteront le plan d'amortissement comme composants supplémentaires. Le Jugement JUG-007 (composant renouvelé) sera complété à ce moment.

## Pré-exploitation → Charges déductibles + Travaux

Le flux Pré-exploitation couvre la période entre l'acquisition et la mise en location.

Il produit :

| Sortie | Transformation source | Type |
|---|---|---|
| `période_pré_exploitation` | TRF-0022 | objet (début, fin, durée, existe) |
| `intérêts_pré_immo` | TRF-0023 | montant |
| `assurance_pré_immo` | TRF-0023 | montant |
| `intérêts_pré_travaux` | TRF-0024 | montant |
| `dépenses_classées` | TRF-0025 | liste (destination: charges / immobilisation / travaux) |

Les dépenses classées comme **charges déductibles** alimentent le flux Charges (TRF-0020).

Les dépenses classées comme **travaux** sont transmises au flux Travaux (à modéliser) avec leur montant, nature et date.

Les dépenses classées comme **immobilisation** (intérêts immobilisés — cas rare, JUG-011) alimentent le prix de revient (TRF-0001).

**Règle** : le flux Pré-exploitation ne calcule jamais le résultat fiscal. Il qualifie et oriente.

## Pré-exploitation → Amortissements

La date de fin de la période pré-exploitation (= date de mise en location) est consommée par RAI-003 comme date de début de l'amortissement.

## Travaux → Amortissements

Le flux Travaux produit :

| Sortie | Transformation source | Type |
|---|---|---|
| `travaux_en_charge` | TRF-0026 | liste de dépenses (destination = charges) |
| `travaux_immobilisables` | TRF-0026 | liste de dépenses (destination = amortissements) |
| `composants_sortis` | TRF-0027 | liste de { composant, vnc_sortie, perte_exceptionnelle } |
| `nouveaux_composants` | TRF-0028 | liste de { label, montant, durée, dotation_annuelle, date_début } |

Le flux Amortissements consomme `nouveaux_composants` et les intègre au plan d'amortissement (TRF-0012).

Le flux Charges consomme `travaux_en_charge` et les intègre à la totalisation (TRF-0020). Il consomme aussi `composants_sortis` (la perte exceptionnelle est une charge de l'exercice).

**Règle** : le flux Travaux ne calcule jamais l'amortissement. Il produit uniquement les composants avec leur montant et durée.

## Pré-exploitation → Travaux

Le flux Pré-exploitation transmet au flux Travaux les travaux détectés pendant la période pré-exploitation avec leur montant, nature et date. Le flux Travaux les qualifie de la même manière que les travaux post-exploitation. La date d'amortissement des composants issus de travaux pré-exploitation est la date de mise en service (RAI-003).

## Tous les domaines → Résultat fiscal

Le domaine Résultat fiscal est un moteur d'orchestration. Il consomme les sorties validées de tous les autres domaines.

| Entrée | Source | Transformation |
|---|---|---|
| `total_recettes` | Recettes | TRF-0029 |
| `total_charges_déductibles` | Charges | TRF-0020 |
| `charges_pré_exploitation` | Pré-exploitation | TRF-0025 |
| `total_annuel_exercice` (amortissement) | Amortissements | TRF-0012 |
| `perte_exceptionnelle` | Travaux | TRF-0027 |

Le domaine Résultat fiscal produit :

| Sortie | Transformation | Type |
|---|---|---|
| `résultat_fiscal` | TRF-0031 | montant |
| `fiscal_result` | TRF-0032 | objet FiscalResult complet |
| `stock_déficits_mis_à_jour` | TRF-0031 | liste par millésime |
| `stock_amort_reportés_mis_à_jour` | TRF-0031 | montant |

**Règle** : le domaine Résultat fiscal ne recalcule jamais les charges, les amortissements ni les travaux. Il consomme uniquement les sorties validées. Si une entrée change, le domaine source est relancé d'abord.

L'objet `fiscal_result` (TRF-0032) est le point d'entrée unique pour la future génération de la liasse fiscale.
