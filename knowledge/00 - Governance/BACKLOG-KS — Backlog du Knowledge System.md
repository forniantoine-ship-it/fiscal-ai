---
id: BACKLOG-KS
title: Backlog du Knowledge System
type: backlog
status: living-document
version: "1.1"
created: 2026-07-02
updated: 2026-09-20
owner: product-owner
tags: [backlog, gouvernance, knowledge-system, maintenance]
---

# BACKLOG-KS — Backlog du Knowledge System

---

# Principe

Le code révèle. Le Backlog enregistre. Le Knowledge System évolue uniquement lorsque nous décidons de traiter une entrée du Backlog.

Ce document répond à une seule question :

> **Quelles observations révélées par les Feature Cycles n'ont pas été intégrées immédiatement dans le Knowledge System ?**

Ce document n'est pas un registre de dette historique. Il n'hérite pas des questions ouvertes des ADR, des Roadmaps, ou des phases de conception. Ces observations restent dans leurs documents d'origine.

Une entrée n'est traitée que lorsqu'une Feature future en dépend réellement.

---

# Convention

## Priorités

| Niveau | Signification |
|---|---|
| **P1** | Bloquant — sans mise à jour du KS, un prochain Feature Cycle risque une erreur métier ou une décision incorrecte |
| **P2** | Dégradant — sans mise à jour du KS, un prochain Feature Cycle produit une approximation ou une divergence silencieuse |
| **P3** | Enrichissant — sans impact immédiat ; améliore la cohérence à long terme |

## États

| État | Signification |
|---|---|
| **À traiter** | Identifiée, non affectée à un cycle de traitement |
| **En cours** | Traitement en session KS en cours |
| **Résolu** | Document KS mis à jour et validé |
| **Abandonné** | Décision de ne pas traiter, avec justification |

## Origines

| Code | Feature Cycle |
|---|---|
| FC-009 | Feature Cycle F-009 — Assistant Activité |
| FC-010 | Feature Cycle F-010 — Assistant Logement |
| FC-011 | Feature Cycle F-011 — Assistant Financement |
| FC-012 | Feature Cycle F-012 — Assistant Charges |
| AL-2609 | Audit liasse 2033 (septembre 2026) — correctifs 2033-B / frontière F-011↔F-012 |

## Moments de traitement

| Valeur | Signification |
|---|---|
| **Avant FC-XXX** | Doit être traité avant ce Feature Cycle pour ne pas bloquer son implémentation |
| **Session KS** | À traiter lors d'une session de maintenance dédiée |
| **À la demande** | Traité uniquement si le sujet revient activement |

---

# Tableau de pilotage

| ID | Titre | Document | Origine | Priorité | État | Traitement |
|---|---|---|---|---|---|---|
| BKS-001 | Ventilation droits/taxes vs autres frais d'acquisition (déduction immédiate) | SAV-001, TRF-0001, SAV-011 | AL-2609 | P2 | À traiter | À la demande |
| BKS-002 | Classement 2033-B des composantes du financement (garantie/caution encore PROVISOIRE) | SAV-001, SAV-011, TRF-0016, RAI-011 | AL-2609 | P2 | En cours | Avant toute évolution de garantie 242/294 |
| BKS-003 | Identité du prêt dans F-012 et péremption du recouvrement F-011↔F-012 | RAI-000, AX-009, F-011, F-012 | AL-2609 | P3 | À traiter | À la demande |

---

# Entrées actives

## BKS-001 — Ventilation droits/taxes vs autres frais d'acquisition

**Dette produit (décision PO du 2026-09-20) :** « ventilation droits/taxes vs autres frais d'acquisition à collecter si l'option de déduction immédiate doit être supportée complètement ».

- **Situation :** avec l'option B de JUG-001 (déduction immédiate), les frais d'acquisition entrent dans 264 mais 242 (autres charges externes) et 244 (impôts et taxes) ne peuvent pas être ventilées : SAV-001 fixe la composition (droits de mutation, émoluments, débours, frais d'agence acquéreur) mais F-010 ne persiste que des scalaires (`fraisNotaire`, `fraisEnCharges`) ; l'extraction d'acte agrège émoluments/débours/frais d'acte dans `notaryFees` et ignore les droits ; `fraisAgence` n'est jamais collectée.
- **Comportement actuel (conservé) :** 242 et 244 non alimentées, avec la raison `KS / DATA INSUFFICIENT` ; aucune convention arbitraire. 264 reste correct.
- **Champ minimal manquant :** la part de droits et taxes incluse dans les frais d'acquisition (sous-ensemble de `fraisNotaire`, transporté avec `fraisEnCharges`).
- **Décision KS associée :** classement 2033-B de chaque composante (le dossier témoin comptable place les droits de mutation en 244 ; le KS est muet).
- **Non traité tant que :** l'option B doit être supportée complètement. L'option A (défaut recommandé par JUG-001) n'est pas concernée.

## BKS-002 — Classement 2033-B des composantes du financement

- **Contradiction relevée (historique) :** la notice officielle 2033-NOT-SD (2026, p.8) range en ligne 242 « primes d'assurance » et « services bancaires » ; le PCG (secondaire) place l'assurance emprunteur en 616, frais de dossier et commission de caution en 627/6272 ; SAV-001 (approuvé) classe les frais de garantie en « charges financières » ; RAI-011 dit que l'assurance emprunteur « suit les intérêts » (déductibilité, pas classement).
- **Établi (implémentation 2026-09-20) :**
  - intérêts d'emprunt → 294 ;
  - assurance emprunteur bancaire liée au prêt → 294 (BOFiP BOI-BIC-CHG-40-20-20) ;
  - frais de dossier bancaire → 242 ∈ 264 (notice 2033-NOT-SD 2026 « services bancaires ») — presentation Cerfa uniquement, 310 inchangé.
- **Toujours PROVISOIRE / UNRESOLVED :** garantie / caution → reste en 294 (aucune nouvelle convention).
- **Dette produit F010/F011 :** les frais de dossier bancaire doivent être renseignés en F-011 et ne doivent **pas** être intégrés manuellement dans `fraisNotaire` F-010 (SAV-001 les liste conceptuellement dans les frais d'acquisition, mais F-010 n'a pas de champ dédié et le double comptage automatique n'existe pas — risque manuel seulement).

## BKS-003 — Identité du prêt dans F-012 et péremption du recouvrement

- **Non couvert historiquement :** exclusions par libellé hors « Charges diverses ». **Corrigé (2026-09-20) :** document gestion/assurance et saisie famille gestion suivent le même principe montant F-011 (enveloppes assurance + frais de dossier séparées) ; capital de prêt (AX-009) reste refusé.
- **Péremption :** F-011 peut changer après la confirmation de F-012 ; F-006 bloque alors la génération (`chargesAssistant.recouvrementAssuranceF011` et `recouvrementFraisDossierF011`) jusqu'à reconfirmation de F-012.

---

# Entrées résolues

*Aucune.*

---

# Entrées abandonnées

*Aucune.*

---

# Règles de gestion

**Création :** une entrée ne peut être créée que lorsqu'un Feature Cycle ou une implémentation révèle une information absente, ambiguë ou contradictoire dans le Knowledge System. Aucune autre origine n'est valide.

**Suppression :** une entrée n'est supprimée que lorsque la mise à jour correspondante du Knowledge System est terminée. Passer une entrée à "Résolu" sans avoir mis à jour le document KS concerné est interdit.

**Ajout :** toute observation éligible est ajoutée au Backlog avant la clôture du Feature Cycle. Une observation non enregistrée est une observation perdue.

**Périmètre :** seules les observations issues de l'implémentation ont leur place ici. Les questions ouvertes de conception, les ADR en attente de décision, et les points de vigilance identifiés avant l'implémentation restent dans leurs documents d'origine.

**Traitement :** une entrée est traitée lors d'une session KS dédiée, après validation du Product Owner, et uniquement lorsqu'une Feature future en dépend réellement.

**Résolution :** une entrée passe à "Résolu" uniquement après que le document KS concerné a été mis à jour et validé. La modification du code seule ne résout pas une entrée.

**Abandon :** une entrée peut être abandonnée si le besoin disparaît. La justification est obligatoire.

**Priorisation :** révisée avant chaque Feature Cycle. Une entrée P3 peut devenir P1 si un nouvel Assistant la rend critique.
