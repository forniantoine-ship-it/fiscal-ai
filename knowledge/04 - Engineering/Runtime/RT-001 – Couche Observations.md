---
id: RT-001
title: Couche Observations
type: standard
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Ontologie Fiscal AI
tags: [runtime, observations, extraction, données]
depends_on:
  hard: [ONTOLOGY]
  soft: [ARCH-001]
---

# RT-001 — Couche Observations

---

# 1. Objectif

Définir le mécanisme par lequel les données du monde réel (documents, déclarations utilisateur) entrent dans le système formel (Transformations de l'ontologie).

La couche Observations est le pont entre les documents du client et les calculs fiscaux.

---

# 2. Architecture à trois étapes

```
Document (PDF, image, saisie)
    ↓ extraction
Observation (fait brut constaté)
    ↓ interprétation
Candidate Value (proposition de valeur pour un Field)
    ↓ résolution
Valeur d'entrée (consommée par une Transformation)
```

Chaque étape est indépendante, traçable et réversible.

---

# 3. Observation

## Définition

Un fait brut extrait d'une source. L'Observation rapporte ce qu'elle a lu, tel qu'elle l'a lu. Elle ne connaît pas les Fields du domaine. Elle ne fait aucune interprétation.

## Propriétés

| Propriété | Type | Obligatoire | Description |
|---|---|---|---|
| id | string (OBS-xxx) | Oui | Identifiant unique |
| document_id | string | Oui | Document source |
| valeur_brute | string | Oui | Texte exact extrait |
| localisation | string | Oui | Position dans le document |
| méthode_extraction | enum | Oui | ocr, parsing_structuré, ia_extraction, manuelle |
| confiance_extraction | enum | Oui | certaine, haute, modérée, faible |
| horodatage | datetime | Oui | Quand l'extraction a eu lieu |
| contexte | string | Non | Texte environnant pour aider l'interprétation |

## Cycle de vie

```
créée → interprétée → (consommée par des Candidate Values)
créée → invalidée (extraction erronée)
```

Une Observation n'est jamais modifiée. Si l'extraction est erronée, elle est invalidée et une nouvelle Observation est créée.

---

# 4. Candidate Value

## Définition

Une proposition de valeur pour un Field du domaine, produite par l'interprétation d'une Observation. La Candidate Value fait le lien entre le fait brut et le modèle de données.

Une même Observation peut produire plusieurs Candidate Values concurrentes.

## Propriétés

| Propriété | Type | Obligatoire | Description |
|---|---|---|---|
| id | string (CV-xxx) | Oui | Identifiant unique |
| observation_id | string | Oui | Observation source |
| champ_cible | ID de Field | Oui | Le Field que cette valeur renseigne |
| valeur_interprétée | typé selon Field | Oui | Valeur convertie |
| confiance | enum | Oui | certaine, haute, modérée, faible |
| méthode_interprétation | enum | Oui | directe, contextuelle, inférée, utilisateur |
| alternatives | liste de CV-id | Non | Autres interprétations possibles |
| statut | enum | Oui | proposée, validée, rejetée, remplacée |
| validée_par | string | Si validée | Qui ou quoi a validé |

## Méthodes d'interprétation

| Méthode | Description | Exemple |
|---|---|---|
| directe | Correspondance évidente entre texte et Field | "Prix de vente : 180 000 €" → FIELD-002 |
| contextuelle | Le contexte du document guide l'interprétation | "Montant total" dans la section Prix → FIELD-002 |
| inférée | La valeur est déduite par raisonnement | Frais = 8% du prix → bien ancien (FIELD-024) |
| utilisateur | L'utilisateur fournit ou confirme la valeur | Saisie manuelle ou confirmation |

## Cycle de vie

```
proposée → validée → (consommée par la Résolution)
proposée → rejetée (incohérence ou meilleure alternative)
validée → remplacée (l'utilisateur corrige)
```

---

# 5. Résolution

## Définition

Le processus qui, pour chaque entrée d'une Transformation, sélectionne la meilleure Candidate Value validée. La Résolution n'est pas un objet stocké — c'est un processus exécuté au moment où la Transformation a besoin de ses entrées.

## Règles de résolution

### Règle 1 — Confiance maximale

Parmi les Candidate Values validées pour un Field, retenir celle avec la confiance la plus élevée.

### Règle 2 — Priorité documentaire

En cas d'égalité de confiance, la source documentaire prévaut sur la déclaration utilisateur.

Ordre de priorité :
1. Document officiel (acte notarié, avis d'imposition)
2. Document professionnel (tableau d'amortissement bancaire, facture)
3. Déclaration utilisateur
4. Inférence système

### Règle 3 — Promotion par validation croisée

Si deux sources indépendantes produisent la même valeur, la confiance est promue :
- haute + haute → certaine
- modérée + modérée → haute
- faible + faible → modérée

### Règle 4 — Blocage en cas de contradiction

Si deux Candidate Values validées pour le même Field ont des valeurs différentes à confiance égale, le système bloque et demande un arbitrage utilisateur.

### Règle 5 — Entrée manquante

Si aucune Candidate Value validée n'existe pour une entrée obligatoire, la Transformation ne peut pas s'exécuter. Le système identifie le champ manquant et déclenche une collecte.

---

# 6. Confiance d'extraction par source

| Source | Méthode | Confiance par défaut |
|---|---|---|
| Acte notarié | Parsing structuré | Certaine |
| Acte notarié | OCR + IA | Haute |
| Facture | OCR + IA | Haute |
| Tableau d'amortissement bancaire | Parsing structuré | Certaine |
| Déclaration utilisateur | Saisie | Modérée |
| Estimation utilisateur | Saisie | Faible |

---

# 7. Validation automatique par cohérence

Le système peut valider automatiquement une Candidate Value en vérifiant sa cohérence avec d'autres Observations ou Savoirs :

| Vérification | Savoir mobilisé | Action |
|---|---|---|
| Frais notaire / Prix = 7-8% | SAV-002 | Promeut la confiance si cohérent |
| Frais notaire / Prix = 2-3% | SAV-002 | Promeut + infère bien neuf |
| Frais notaire / Prix > 15% | SAV-002 | Dégrade la confiance, alerte |
| Mobilier > 30% du prix | JUG-003 gardes | Bloque, demande justification |

---

# 8. Traçabilité complète

Chaque valeur utilisée par une Transformation est traçable jusqu'au document source :

```
Résultat fiscal
    ← TRF-0008 (résultat fiscal)
        ← TRF-0001 (prix de revient)
            ← prix_acquisition = 180000
                ← CV-002b (validée, confiance: certaine)
                    ← OBS-002 (valeur_brute: "195 000 €", page 3)
                        ← Document: acte_notarié_2025.pdf
```

Cette chaîne complète est exigée par la contrainte C12 de l'ontologie.

---

# 9. Relation avec l'ontologie

Les Observations et Candidate Values ne sont pas des concepts de l'ontologie. Ce sont des composants du Runtime.

| Ontologie | Runtime |
|---|---|
| Transformation (logique de calcul) | Exécution (calcul concret) |
| Field (définition de donnée) | Candidate Value (valeur concrète) |
| Savoir (fait vérifié) | Observation (fait constaté) |
| Vérification (cas de test) | Résultat de test (passe/échoue) |

L'ontologie dit quoi calculer et comment. Le Runtime fait le calcul avec les données réelles.

---

# 10. Flux complet — Exemple Acquisition

```
1. Client uploade acte_notarié_2025.pdf
2. Document Engine → OCR Engine → texte extrait
3. Classification Engine → identifié : acte notarié

4. Extraction → Observations brutes :
   OBS-001 : "15 mars 2025" (page 1, confiance: haute)
   OBS-002 : "195 000 €" (page 3, section Prix, confiance: haute)
   OBS-003 : "12 rue des Lilas, 69003 Lyon" (page 2, confiance: haute)
   OBS-004 : "14 400 €" (décompte notaire, confiance: haute)

5. Interprétation → Candidate Values :
   CV-001 : FIELD-001 = 2025-03-15 (directe, confiance: haute)
   CV-002a : FIELD-002 = 195000 (directe, confiance: haute)
   CV-002b : FIELD-002 = 180000 (inférée: mobilier possible, confiance: modérée)
   CV-003 : FIELD-007 = "12 rue des Lilas, 69003 Lyon" (directe, confiance: haute)
   CV-004 : FIELD-006 = 14400 (directe, confiance: haute)

6. Cohérence automatique :
   14400 / 195000 = 7.4% → cohérent SAV-002 (ancien) → CV-002a promue certaine
   14400 / 180000 = 8.0% → aussi cohérent → pas de discrimination automatique

7. Question Engine :
   "Le prix de 195 000 € inclut-il du mobilier ?"
   → Utilisateur répond : oui, mobilier estimé 15 000 €
   → CV-002a rejetée, CV-002b validée (valeur ajustée : 180000)
   → CV-005 : FIELD-mobilier = 15000 (utilisateur, confiance: modérée)

8. Résolution :
   prix_acquisition = 180000 (CV-002b, certaine après confirmation)
   frais_notaire = 14400 (CV-004, certaine)
   mobilier_inclus = true (CV-005)
   montant_mobilier = 15000 (CV-005)

9. TRF-0001 s'exécute → prix_revient = 179400
10. TRF-0002 s'exécute → base_amortissable_bâti = 131520

Chaque chiffre traçable jusqu'à la page du PDF.
```
