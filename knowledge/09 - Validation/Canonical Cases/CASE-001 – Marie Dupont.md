---
id: CASE-001
title: Marie Dupont – Appartement T2 Lyon
type: validation
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
tags: [validation, canonical, lmnp, bout-en-bout]
---

# CASE-001 — Marie Dupont – Appartement T2 Lyon

Dossier canonique de validation du Knowledge System.

Toute Transformation exécutée sur ce dossier doit produire exactement les sorties documentées ci-dessous. Toute divergence est une régression.

---

# 1. Profil client

| Propriété | Valeur |
|---|---|
| Nom | Marie Dupont |
| Situation | Salariée, premier investissement LMNP |
| Régime | LMNP réel simplifié |
| Exercice fiscal | 2025 |

---

# 2. Le bien

| Propriété | Valeur |
|---|---|
| Type | Appartement T2 |
| Surface | 45 m² |
| Étage | 3ème |
| Copropriété | Oui |
| Construction | 1985 |
| Localisation | 12 rue des Lilas, 69003 Lyon |
| État | Ancien |

---

# 3. Acquisition

| Propriété | Valeur |
|---|---|
| Date de signature | 15 mars 2025 |
| Prix d'acquisition | 180 000 € |
| Frais de notaire | 14 400 € |
| Frais d'agence | 5 000 € (charge acquéreur) |
| Mobilier inclus dans le prix | Non |
| Mobilier acheté séparément | 8 000 € (lot, factures disponibles) |

---

# 4. Financement

| Propriété | Valeur |
|---|---|
| Prêt immobilier | 160 000 € |
| Durée | 20 ans |
| Taux | 3,2% |
| Mensualité | 905 € |
| Intérêts sept-déc 2025 | 1 367 € (estimé — flux Pré-exploitation non modélisé) |
| Assurance emprunteur sept-déc 2025 | 180 € (estimé — flux Pré-exploitation non modélisé) |

---

# 5. Exploitation

| Propriété | Valeur |
|---|---|
| Date de mise en location | 1er septembre 2025 |
| Loyer | 750 €/mois charges comprises |
| Type de bail | Meublé classique |
| Recettes sept-déc 2025 | 3 000 € (4 mois × 750 €) |

---

# 6. Charges de l'exercice 2025

| Dépense | Montant | Qualification | Catégorie |
|---|---|---|---|
| Intérêts emprunt (sept-déc) | 1 367 € | charge | intérêts_emprunt |
| Assurance emprunteur (sept-déc) | 180 € | charge | assurance_emprunt |
| Copropriété (provisions annuelles) | 1 800 € | charge | copropriété |
| Taxe foncière (hors TEOM récupérée) | 830 € | charge | taxe_foncière |
| Assurance PNO | 180 € | charge | assurance_pno |
| Expert-comptable | 500 € | charge | gestion |
| CGA | 150 € | charge | gestion |
| Plombier | 180 € | charge | entretien |
| Serrurier | 100 € | charge | entretien |
| **Total** | **5 287 €** | | |

---

# 7. Jugements appliqués

| Jugement | Choix retenu | Valeur |
|---|---|---|
| JUG-001 | Intégration des frais au prix de revient | intégration |
| JUG-002 | Ratio terrain Lyon (ville moyenne) | 20% |
| JUG-003 | Non applicable (mobilier séparé avec factures) | — |
| JUG-004 | Grille standard 6 composants | SAV-007 |
| JUG-005 | Durées standard | 50/25/25/25/15/15 |
| JUG-006 | Lot unique 7 ans (mobilier < 10 000 €) | 7 ans |
| JUG-008 | Toutes dépenses qualifiées en charges | charge |
| JUG-010 | Première année, pas de régularisation | provisions totales |

---

# 8. Résultats attendus par Transformation

## TRF-0001 — Calcul du prix de revient

| Sortie | Valeur attendue |
|---|---|
| prix_revient | **199 400 €** |
| montant_mobilier_isolé | 0 € |
| frais_en_charges | 0 € |

Vérification : prix (180 000) + frais notaire (14 400) + frais agence (5 000) = 199 400. ✓

---

## TRF-0002 — Ventilation terrain/bâti

| Sortie | Valeur attendue |
|---|---|
| valeur_terrain | **39 880 €** |
| valeur_bâti | **159 520 €** |
| base_amortissable_bâti | **159 520 €** |

Vérification : 199 400 × 0,20 = 39 880. 199 400 × 0,80 = 159 520. Terrain + bâti = 199 400. ✓

---

## TRF-0009 — Décomposition du bâti en composants

| Composant | % | Montant | Durée | Dotation annuelle |
|---|---|---|---|---|
| Gros œuvre | 50% | 79 760,00 € | 50 ans | 1 595,20 € |
| Toiture | 10% | 15 952,00 € | 25 ans | 638,08 € |
| Électricité | 10% | 15 952,00 € | 25 ans | 638,08 € |
| Plomberie | 10% | 15 952,00 € | 25 ans | 638,08 € |
| Étanchéité | 5% | 7 976,00 € | 15 ans | 531,73 € |
| Agencements | 15% | 23 928,00 € | 15 ans | 1 595,20 € |
| **Total** | **100%** | **159 520,00 €** | | **5 636,37 €** |

Vérification : somme montants = 159 520. Somme % = 100. ✓

---

## TRF-0010 — Amortissement du mobilier

| Label | Montant | Durée | Dotation annuelle |
|---|---|---|---|
| Mobilier (lot) | 8 000,00 € | 7 ans | 1 142,86 € |

Source : Observations (factures), pas TRF-0001.

---

## TRF-0011 — Prorata première année

| Paramètre | Valeur |
|---|---|
| Date début | 1er septembre 2025 |
| Méthode | Jours |
| Nombre de jours | 122 (1 sept – 31 déc) |
| Ratio | 122 / 365 = **0,334247** |

| Composant | Dotation annuelle | Dotation proratisée |
|---|---|---|
| Gros œuvre | 1 595,20 € | **533,22 €** |
| Toiture | 638,08 € | **213,29 €** |
| Électricité | 638,08 € | **213,29 €** |
| Plomberie | 638,08 € | **213,29 €** |
| Étanchéité | 531,73 € | **177,77 €** |
| Agencements | 1 595,20 € | **533,22 €** |
| Mobilier | 1 142,86 € | **382,02 €** |
| **Total** | **6 779,23 €** | **2 266,10 €** |

---

## TRF-0012 — Assemblage du plan d'amortissement

| Propriété | Valeur attendue |
|---|---|
| Nombre de lignes | 7 |
| Total brut | **167 520 €** (159 520 bâti + 8 000 mobilier) |
| Total annuel exercice 2025 | **2 266,10 €** |

---

## TRF-0014 — Vérification de cohérence

| Garde-fou | Résultat |
|---|---|
| total_brut == base_amortissable_bâti + montant_mobilier_total | 167 520 == 159 520 + 8 000 ✓ |
| Toutes VNC ≥ 0 | ✓ |
| Toutes dotations ≥ 0 | ✓ |

---

## TRF-0015 — Qualification des dépenses

| Dépense | Qualification | Destination |
|---|---|---|
| Intérêts emprunt | charge | charges |
| Assurance emprunteur | charge | charges |
| Copropriété | charge | charges |
| Taxe foncière | charge | charges |
| Assurance PNO | charge | charges |
| Expert-comptable | charge | charges |
| CGA | charge | charges |
| Plombier | charge | charges |
| Serrurier | charge | charges |

9 dépenses, 9 charges, 0 immobilisation, 0 rejet.

---

## TRF-0016 — Intérêts et assurance

| Sortie | Valeur attendue |
|---|---|
| intérêts_déductibles | **1 367 €** (sept-déc, estimé) |
| assurance_déductible | **180 €** (sept-déc, estimé) |

Note : les intérêts de mars à août relèvent du flux Pré-exploitation (non modélisé). Les valeurs ci-dessus sont des estimations au prorata.

---

## TRF-0017 — Copropriété

| Sortie | Valeur attendue |
|---|---|
| copropriété_déductible | **1 800 €** |

Première année : provisions totales déduites, pas de régularisation.

---

## TRF-0018 — Taxe foncière

| Sortie | Valeur attendue |
|---|---|
| taxe_foncière_déductible | **830 €** |

Calcul : 950 - 120 (TEOM récupérée) = 830.

---

## TRF-0020 — Totalisation

| Catégorie | Montant |
|---|---|
| Intérêts d'emprunt | 1 367 € |
| Assurance emprunteur | 180 € |
| Copropriété | 1 800 € |
| Taxe foncière | 830 € |
| Assurance PNO | 180 € |
| Gestion | 650 € |
| Entretien | 280 € |
| **Total charges déductibles** | **5 287 €** |

---

## TRF-0021 — Cohérence des charges

| Vérification | Résultat |
|---|---|
| Charges / Recettes | 5 287 / 3 000 = 176% |
| Alerte | Non (première année, normal) |

---

# 9. Résumé pour le flux Résultat fiscal (à modéliser)

| Donnée | Valeur | Source |
|---|---|---|
| Recettes | 3 000 € | 4 mois × 750 € |
| Charges déductibles | 5 287 € | TRF-0020 |
| Amortissement calculé | 2 266,10 € | TRF-0012 |

Résultat avant amortissement = 3 000 - 5 287 = **-2 287 €** (déficit).

L'amortissement ne s'applique pas (le résultat est déjà négatif). L'intégralité de l'amortissement (2 266,10 €) est reportée.

---

# 10. Limites connues

| # | Limite | Impact |
|---|---|---|
| 1 | Intérêts intercalaires (mars-août) non traités | Flux Pré-exploitation non modélisé |
| 2 | Prorata charges financières estimé | Idem |
| 3 | Recettes non formalisées en Transformation | Flux Résultat fiscal non modélisé |
| 4 | Résultat fiscal non calculé | Idem |
| 5 | Réduction CGA non traitée | Flux dédié non modélisé |

---

# 11. Utilisation comme référence

Ce dossier est la référence officielle du Knowledge System.

Toute modification d'une Transformation doit être vérifiée contre les valeurs de CASE-001.

Si une Transformation produit un résultat différent de celui documenté ici, c'est soit :
- une régression (la Transformation a été modifiée incorrectement) ;
- une évolution volontaire (la connaissance a changé, CASE-001 doit être mis à jour).

Dans les deux cas, la divergence doit être signalée et documentée avant toute validation.

---

# 12. Données machine (YAML canonique)

Cette section est la seule source consommée par le Validation Engine. Le Markdown ci-dessus est destiné à la lecture humaine.

```yaml
case:
  id: CASE-001
  title: Marie Dupont – Appartement T2 Lyon
  exercice: 2025

  chain:
    - id: TRF-0001
      inputs:
        prix_acquisition: 180000
        mobilier_inclus: false
        frais_notaire: 14400
        frais_agence: 5000
        frais_agence_charge: acquéreur
        choix_traitement_frais: intégration
      expected_outputs:
        prix_revient: 199400
        montant_mobilier_isolé: 0
        frais_en_charges: 0

    - id: TRF-0002
      inputs:
        prix_revient: 199400
        montant_mobilier_isolé: 0
        ratio_terrain: 0.20
      expected_outputs:
        valeur_terrain: 39880
        valeur_bâti: 159520
        base_amortissable_bâti: 159520

    - id: TRF-0009
      inputs:
        base_amortissable_bâti: 159520
        grille_composants:
          - composant: gros_oeuvre
            pourcentage: 50
            durée: 50
          - composant: toiture
            pourcentage: 10
            durée: 25
          - composant: electricite
            pourcentage: 10
            durée: 25
          - composant: plomberie
            pourcentage: 10
            durée: 25
          - composant: etancheite
            pourcentage: 5
            durée: 15
          - composant: agencements
            pourcentage: 15
            durée: 15
      expected_outputs:
        composants_bâti:
          - composant: gros_oeuvre
            montant: 79760
            durée: 50
            dotation_annuelle: 1595.20
          - composant: toiture
            montant: 15952
            durée: 25
            dotation_annuelle: 638.08
          - composant: electricite
            montant: 15952
            durée: 25
            dotation_annuelle: 638.08
          - composant: plomberie
            montant: 15952
            durée: 25
            dotation_annuelle: 638.08
          - composant: etancheite
            montant: 7976
            durée: 15
            dotation_annuelle: 531.73
          - composant: agencements
            montant: 23928
            durée: 15
            dotation_annuelle: 1595.20
        total_dotation_annuelle: 5636.37

    - id: TRF-0010
      inputs:
        montant_mobilier_total: 8000
        mode: lot
        durée_moyenne: 7
      expected_outputs:
        composants_mobilier:
          - label: "Mobilier (lot)"
            montant: 8000
            durée: 7
            dotation_annuelle: 1142.86

    - id: TRF-0011
      inputs:
        date_debut_amortissement: "2025-09-01"
        méthode_prorata: jours
        exercice_fiscal: 2025
      expected_outputs:
        nombre_jours: 122
        ratio: 0.334247
        dotations_proratisées:
          gros_oeuvre: 533.19
          toiture: 213.28
          electricite: 213.28
          plomberie: 213.28
          etancheite: 177.73
          agencements: 533.19
          mobilier_lot: 382.0
        total_proratisé: 2265.95

    - id: TRF-0012
      inputs:
        date_debut_amortissement: "2025-09-01"
        exercice_fiscal: 2025
      expected_outputs:
        nombre_lignes: 7
        total_brut: 167520

    - id: TRF-0014
      inputs: from_chain
      expected_outputs:
        plan_validé: true

    - id: TRF-0015
      inputs:
        dépenses:
          - nature: intérêts_emprunt
            montant: 1367
            lien_activité: true
          - nature: assurance_emprunt
            montant: 180
            lien_activité: true
          - nature: copropriété
            montant: 1800
            lien_activité: true
          - nature: taxe_foncière
            montant: 950
            lien_activité: true
          - nature: assurance_pno
            montant: 180
            lien_activité: true
          - nature: expert_comptable
            montant: 500
            lien_activité: true
          - nature: cga
            montant: 150
            lien_activité: true
          - nature: plombier
            montant: 180
            lien_activité: true
          - nature: serrurier
            montant: 100
            lien_activité: true
      expected_outputs:
        qualifications:
          charges: 9
          immobilisations: 0
          rejets: 0

    - id: TRF-0016
      inputs:
        intérêts_annuels: 1367
        assurance_annuelle: 180
      expected_outputs:
        intérêts_déductibles: 1367
        assurance_déductible: 180

    - id: TRF-0018
      inputs:
        taxe_foncière_totale: 950
        teom: 120
        teom_récupérée: true
      expected_outputs:
        taxe_foncière_déductible: 830

    - id: TRF-0017
      inputs:
        provisions_annuelles: 1800
        première_année: true
      expected_outputs:
        copropriété_déductible: 1800

    - id: TRF-0020
      inputs:
        intérêts_emprunt: 1367
        assurance_emprunt: 180
        copropriété: 1800
        taxe_foncière: 830
        assurance_pno: 180
        gestion: 650
        entretien: 280
      expected_outputs:
        total_charges_déductibles: 5287
        détail:
          intérêts_emprunt: 1367
          assurance_emprunt: 180
          copropriété: 1800
          taxe_foncière: 830
          assurance_pno: 180
          gestion: 650
          entretien: 280

    - id: TRF-0021
      inputs:
        total_charges_déductibles: 5287
        recettes_estimées: 3000
      expected_outputs:
        charges_cohérentes: true
        anomalies: []
```
