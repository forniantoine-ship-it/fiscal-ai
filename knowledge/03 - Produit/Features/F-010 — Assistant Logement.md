---
id: F-010
title: Assistant Logement
type: feature
status: approved
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
priorité: critique
tags: [feature, logement, bien, amortissement, lmnp]
jtbd: [JTBD-002]
profils: [PROF-001, PROF-002, PROF-004, PROF-005]
ux-patterns: [UXP-001, UXP-002]
---

# F-010 — Assistant Logement

---

# Mission

Établir le portrait complet du bien — nature de l'acquisition, coût total, constitution physique — afin que Fiscal AI puisse calculer la base amortissable, décomposer le plan d'amortissement et ne manquer aucune déduction à laquelle l'utilisateur a droit.

Cet Assistant n'est pas un formulaire de saisie. C'est le moteur d'établissement du prix de revient et de la base amortissable. Toute question posée à l'utilisateur doit être directement au service de TRF-0001 (prix de revient), TRF-0002 (ventilation terrain/bâti) ou TRF-0009 (composants).

---

# Valeur utilisateur

À l'issue de cet Assistant, l'utilisateur comprend — sans jargon — combien son bien s'amortit chaque année et sur quelle durée. Il sait que Fiscal AI a pris en compte la totalité de ce que lui a coûté ce bien.

Il n'a jamais eu à penser en termes de "composants", de "VNC" ou de "méthode par composants".

---

# Déclencheur

L'utilisateur accède à l'étape "Logement" de son dossier LMNP, depuis le Workflow Engine, après la complétion de l'Assistant Activité (F-009).

---

# Préconditions

- L'Assistant Activité est terminé (événement `ACTIVITE_TERMINE` reçu)
- La `date_mise_en_service` est connue (produite par F-009 — utilisée pour TRF-0011)
- L'utilisateur est authentifié
- Aucun Assistant Logement n'est en cours sur ce dossier

---

# Job To Be Done

**Référence :** JTBD-002 — Établir la base amortissable de mon bien *(à documenter dans le KS)*

> Lorsque je dois déclarer un bien que je possède ou que j'ai acquis en LMNP,
> je veux que Fiscal AI comprenne exactement comment ce bien a été acquis, ce qu'il m'a coûté et comment il est constitué physiquement,
> afin de calculer correctement mes amortissements et de n'omettre aucune déduction à laquelle j'ai droit.

**Distinction avec JTBD-001 :** JTBD-001 établit l'identité de l'activité (qui déclare, depuis quand, sous quel régime). JTBD-002 établit l'objet de l'activité (quoi est déclaré, pour combien, avec quelle structure). Les deux Jobs sont indépendants mais JTBD-002 s'appuie sur la `date_mise_en_service` produite par JTBD-001.

---

# Diagnostic de situation

**Principe appliqué :** Constitution P16 — le diagnostic précède la demande.
**Patterns mobilisés :** UXP-001 (Diagnostic de situation), UXP-002 (Exposition d'un Jugement à l'utilisateur — *statut : candidat, non encore documenté dans le KS*)

## Niveau 1 — Nature de l'acquisition

La première question de cet Assistant identifie **comment ce bien est entré dans le patrimoine de l'utilisateur**. Ce choix conditionne entièrement la logique de calcul du prix de revient.

| Situation | Logique de calcul | Chemin |
|---|---|---|
| Achat dans l'ancien | Prix + frais d'acquisition + mobilier → TRF-0001 standard | Chemin A |
| Achat dans le neuf | Idem mais frais réduits (2-3%) + TVA possible | Chemin A (variante neuf) |
| VEFA (achat sur plan) | Appels de fonds successifs + PV de livraison → date de mise en service = livraison | Chemin B |
| Héritage ou donation | Valeur vénale à la date de succession/donation → pas de prix d'achat | Chemin C |
| Résidence principale convertie | Valeur vénale au jour de la conversion → amortissement depuis la conversion uniquement | Chemin C (variante conversion) |
| Bien en indivision | Tous les montants proratisés à la quote-part de l'utilisateur | Chemin A ou C + facteur de prorata |
| Autre / Je ne sais pas | Mode assisté | Chemin D |

Cette question se formule en langage courant, sans jargon juridique. L'utilisateur reconnaît sa situation sans avoir à connaître les termes "VEFA" ou "valeur vénale".

## Niveau 2 — Disponibilité de l'information (dans chaque chemin)

Une fois la nature de l'acquisition identifiée, l'Assistant cherche le moyen de moindre effort pour obtenir l'information (Constitution P19).

Pour le Chemin A (achat standard) :
- L'utilisateur a son acte notarié → import et extraction automatique
- L'utilisateur n'a pas l'acte → saisie guidée avec estimations SAV-002 (frais) et SAV-003 (terrain/bâti)
- L'utilisateur a l'acte mais la ventilation terrain/bâti est absente → extraction partielle + estimation SAV-003

Pour le Chemin B (VEFA) :
- Les appels de fonds sont documentés → saisie du total ou import des relevés
- Le PV de livraison est disponible → extraction de la date de livraison

Pour le Chemin C (héritage/donation/conversion) :
- La déclaration de succession ou l'acte de donation est disponible → extraction de la valeur vénale
- Aucun document n'est disponible → valeur estimée par l'utilisateur avec avertissement explicite sur les risques

---

# Résultat attendu

À la fin de l'Assistant Logement, trois outputs sont produits et validés :

| Output | Transformation source | Validé par |
|---|---|---|
| `prix_revient` | TRF-0001 | Validation Engine + confirmation utilisateur |
| `base_amortissable_bâti` | TRF-0002 | Validation Engine (terrain + bâti = total) |
| `plan_amortissement` | TRF-0009 à TRF-0014 | Validation Engine (sum(composants) = base_bâti) + confirmation utilisateur |

L'utilisateur a reçu une explication en langage simple du résultat (dotation annuelle, durée de vie moyenne du plan, répartition par composant).

Deux Jugements ont été exposés à l'utilisateur avec leurs alternatives et ont fait l'objet d'un choix documenté : JUG-001 (intégration ou déduction des frais) et JUG-002 (ventilation terrain/bâti si absente de l'acte).

---

# Entrées

## Entités

- Dossier LMNP (identifiant, exercice fiscal, état)
- `date_mise_en_service` (produite par F-009 — utilisée pour le prorata TRF-0011 si première année)

## Fields collectés — avec mode d'obtention

| Field | Type | Mode d'obtention | Obligatoire | Note |
|---|---|---|---|---|
| `nature_acquisition` | Enum | **Demandé — toujours** | Oui | Conditionne tout le parcours |
| `prix_achat` | Montant | Extrait / Demandé / Estimé | Oui (sauf héritage) | Valeur vénale pour héritage/conversion |
| `date_acquisition` | Date | Extraite / Demandée | Oui | Pour Chemin B : date de livraison, pas de signature |
| `frais_acquisition` | Montant | Extrait / **Estimé (SAV-002)** / Demandé | Oui | Défaut : 7-8% (ancien), 2-3% (neuf) |
| `montant_mobilier` | Montant | Extrait / Estimé / Demandé | Non (mais recommandé) | Améliore la précision de TRF-0001 |
| `choix_frais` | Enum (intégré/déduit) | **JUG-001 — exposé à l'utilisateur** | Oui | Impact fiscal direct |
| `valeur_terrain` | Montant | Extraite / **Estimée (SAV-003)** / Demandée | Oui | Rarement dans l'acte |
| `valeur_bati` | Montant | Calculée (prix_revient - valeur_terrain) | Oui | Toujours calculée |
| `choix_ventilation` | Source (acte/estimation/déclaration) | **JUG-002 — exposé si estimation** | Oui | Traçabilité de la source |
| `type_bien` | Enum (appartement/maison/autre) | Extrait / Demandé | Oui | Détermine la grille A ou B (JUG-004) |
| `surface` | m² | Extraite / Demandée | Non (informatif) | Aide à la cohérence |
| `adresse` | String | Extraite / Demandée | Oui | Utilisée pour SAV-003 (localisation) |
| `quote_part_indivision` | % | **Demandé si indivision** | Si applicable | Proratise tous les montants |
| `grille_composants` | Enum (A/B) | **Déduit de type_bien (JUG-004)** | Oui | Jamais demandé à l'utilisateur |
| `durees_composants[]` | Années[] | **Defaults SAV-005** + ajustement optionnel | Oui | Standards proposés, modifiables |

**Règle fondamentale pour les futurs auteurs :**
Ne jamais demander à l'utilisateur ce que le système peut déduire ou calculer. La grille de composants se déduit du type de bien. Les durées standard se déduisent de SAV-005. La base amortissable bâti se calcule depuis les deux valeurs précédentes. L'utilisateur ne voit jamais ces étapes intermédiaires — il voit le résultat.

## Moyens possibles (adaptés à la nature de l'acquisition)

*Contrairement à F-009 où les moyens étaient équivalents, ici ils dépendent de la nature de l'acquisition. Cette interdépendance est une différence structurelle avec l'Assistant Activité.*

| Chemin | Moyen optimal | Engines mobilisés |
|---|---|---|
| Achat standard, acte disponible | Import acte notarié → extraction automatique | Document, OCR, Classification, RT-003, Validation |
| Achat standard, acte absent | Saisie guidée + estimations SAV-002/SAV-003 proposées | Question, Validation, Calculation |
| VEFA | Saisie du total des appels de fonds + date de livraison | Question, Validation |
| Héritage/conversion | Saisie de la valeur vénale + document de succession si disponible | Question, Document (optionnel), Validation |
| Bien déjà partiellement amorti | Import du plan d'amortissement existant (format à définir) | Document (optionnel), Validation |

**Point de vigilance — extraction depuis l'acte notarié :**
Un acte notarié peut mentionner le prix à plusieurs endroits (compromis rappelé dans l'acte, prix final, éventuellement différents). Le Resolver de RT-003 doit appliquer une règle de priorité entre ces occurrences. Cette règle n'est pas documentée dans RT-001. *Voir section "Points de vigilance" en fin de document.*

## Événements entrants

- `ACTIVITE_TERMINE` (précondition)
- `QUESTION_REPONDUE` (chaque réponse utilisateur fait progresser l'Assistant)
- `DOCUMENT_ANALYSE` (si l'utilisateur importe un acte notarié)
- `JUGEMENT_CONFIRME` (chaque fois qu'un Jugement est validé par l'utilisateur)

---

# Sorties

## Fields créés ou mis à jour

Tous les Fields de la section "Fields collectés", avec source tracée (extrait / estimé / saisi / déduit / choix utilisateur).

## Entités créées

- `AmortissementPlan` : composants[], dotation_annuelle, durée_plan, VNC_initiale, date_début
- `PrixRevient` : prix_achat, frais_acquisition, mobilier, total (= TRF-0001 output)
- `VentilationBien` : valeur_terrain, valeur_bâti, source_ventilation, méthode (JUG-002 output)

## Événements produits

- `LOGEMENT_PROFILE_COMPLETE` — prix_revient et ventilation validés
- `PLAN_AMORTISSEMENT_GENERE` — plan complet produit et validé par TRF-0014
- `JUGEMENT_JUG001_CONFIRME` — choix frais documenté
- `JUGEMENT_JUG002_CONFIRME` — ventilation terrain/bâti documentée
- `LOGEMENT_TERMINE` — tous les outputs validés, Workflow peut passer à l'étape suivante

## État modifié

`ACTIVITE_IDENTIFIEE` → `LOGEMENT_CONFIGURE`

---

# Engines concernés

| Engine | Rôle dans cet Assistant | Spécificité vs. F-009 |
|---|---|---|
| Workflow Engine | Orchestre les deux niveaux de branchement et les transitions d'état | Plus de branches parallèles à gérer |
| Document Engine | Reçoit et stocke l'acte notarié (20 à 80 pages) | Volume et complexité bien supérieurs à l'INPI |
| OCR Engine | Extrait le texte de l'acte — confiance variable selon qualité du document | Confiance OCR doit être tracée champ par champ |
| Classification Engine | Identifie "Acte notarié de vente" vs. "Acte de succession" vs. "PV de livraison VEFA" | Sous-types non documentés dans la taxonomie actuelle — *voir Points de vigilance* |
| Validation Engine | Deux validations cross-fields obligatoires : terrain+bâti=total ; sum(composants)=base_bâti | Validations multi-Fields, non décrites dans ENG-005 |
| Question Engine | Présente les Jugements JUG-001 et JUG-002 avec alternatives et recommandation | **Nouvelle responsabilité : aide à la décision** — non encore dans ENG-006 |
| Calculation Engine | Exécute TRF-0001, TRF-0002, TRF-0009 à TRF-0014 en séquence | Rôle central, le plus complexe de tous les Assistants |
| Explanation Engine | Traduit le plan d'amortissement complet en langage simple | Résultat plus complexe à vulgariser que le prorata de F-009 |

**Points de vigilance Engine :**

1. **Classification Engine — sous-types manquants.** La taxonomie actuelle reconnaît "Acte notarié" génériquement. Les sous-types (vente standard / succession / VEFA) requièrent des règles d'extraction différentes. Ce n'est pas un nouveau type — c'est une granularité manquante dans le type existant.

2. **Question Engine — aide à la décision.** La spécification ENG-006 décrit la collecte d'information manquante. Présenter un Jugement avec ses alternatives et une recommandation est une responsabilité plus riche — aide à la décision, pas simple collecte. Cette extension de responsabilité n'est pas documentée dans ENG-006.

3. **Capacité d'estimation encadrée.** Quand la ventilation terrain/bâti est absente, le système propose une estimation basée sur SAV-003. Le Calculation Engine produit l'estimation, le Question Engine la présente pour confirmation. La chaîne fonctionne — mais la responsabilité de l'estimation n'est formalisée dans aucune spécification Engine.

---

# Transformations et Axiomes concernés

| Référence | Rôle dans cet Assistant |
|---|---|
| AX-001 | Le terrain n'est jamais amortissable — justifie la ventilation obligatoire |
| AX-004 | Amortissement linéaire uniquement — contraint la méthode du plan |
| AX-005 | Méthode par composants obligatoire — justifie TRF-0009 |
| AX-007 | VNC ≥ 0 toujours — garde-fou de TRF-0014 |
| JUG-001 | Frais intégrés au prix de revient ou déduits en charges — exposé à l'utilisateur |
| JUG-002 | Ventilation terrain/bâti quand absente de l'acte — exposé à l'utilisateur |
| JUG-004 | Grille de composants (A = appartement, B = maison) — déduit du type de bien, jamais demandé |
| JUG-005 | Durées d'amortissement par composant — standards par défaut, modifiables |
| SAV-002 | Frais de notaire ≈ 7-8% (ancien) / 2-3% (neuf) — utilisé pour l'estimation si frais absents |
| SAV-003 | Ratios terrain/bâti par localisation et type — utilisé pour l'estimation si ventilation absente |
| SAV-005 | Fourchettes de durées par composant — source des standards proposés |
| SAV-007 | Grilles A et B de décomposition du bâti — source des composants et pourcentages |
| TRF-0001 | Calcul du prix de revient — output principal de cet Assistant |
| TRF-0002 | Ventilation terrain/bâti → base amortissable bâti |
| TRF-0009 | Décomposition bâti en composants avec montants et durées |
| TRF-0011 | Prorata première année — si `date_mise_en_service` tombe dans l'exercice courant |
| TRF-0012 | Plan d'amortissement annuel complet |
| TRF-0014 | Validation du plan (VNC ≥ 0, sum(composants) = prix_revient) |

---

# Parcours utilisateur

## Niveau 1 — Identification de la nature de l'acquisition

```
QUESTION D'ORIENTATION : "Comment avez-vous acquis ce bien ?"
(formulée en langage courant — sans termes juridiques)
│
├── Achat (ancien ou neuf)          → Chemin A
├── Achat sur plan (VEFA)           → Chemin B
├── Héritage ou donation            → Chemin C
├── Résidence principale convertie  → Chemin C (variante)
├── Bien en indivision              → Chemin A ou C + facteur indivision
└── Autre / Je ne sais pas          → Chemin D (assisté)
```

## Niveau 2 — Collecte des informations dans chaque chemin

### Chemin A — Achat standard

```
L'utilisateur a-t-il l'acte notarié ?
│
├── Oui → Import de l'acte
│         Extraction : prix, date, frais, surface, adresse, ventilation (si présente)
│         Confirmation champ par champ
│         → Si ventilation absente : estimation SAV-003 proposée + JUG-002 exposé
│         → Si mobilier absent : question sur montant estimé
│         → JUG-001 exposé (frais inclus ou déduits) avec recommandation
│
├── Partiellement → Champs extraits confirmés + champs manquants saisis
│
└── Non → Saisie guidée
           Prix (depuis mémoire ou relevé bancaire)
           Frais : estimation SAV-002 proposée (7-8% ou 2-3%) + confirmation
           Ventilation : estimation SAV-003 proposée + JUG-002 exposé
           JUG-001 exposé

         ↓ (tous les chemins convergent)

Calcul automatique TRF-0001 → prix_revient
Calcul automatique TRF-0002 → base_amortissable_bâti
Déduction automatique de la grille (JUG-004 depuis type_bien)
Calcul automatique TRF-0009 → composants avec durées SAV-005
Calcul automatique TRF-0012 → plan_amortissement
Validation TRF-0014 → cohérence du plan

Explication (Explanation Engine) :
"Votre bien s'amortit pour €X par an sur une durée de Y ans en moyenne.
 Voici comment ce montant est réparti entre les différents composants."

Confirmation utilisateur → LOGEMENT_TERMINE
```

### Chemin B — VEFA

```
Saisie du total des appels de fonds (ou import des relevés)
Saisie ou extraction de la date de livraison (= date_acquisition pour VEFA)
Vérification que date_livraison ≤ date_mise_en_service (F-009)
→ Convergence vers le calcul commun (mêmes étapes que Chemin A après la saisie)
```

### Chemin C — Héritage / Donation / Conversion

```
Saisie de la valeur vénale à la date de l'événement
(déclaration de succession, acte de donation, ou estimation pour conversion)
Avertissement explicite : cette valeur est la base de tous les amortissements.
Si document disponible → import et extraction
Si pas de document → saisie manuelle avec confirmation explicite du risque
→ Convergence vers le calcul commun
```

### Chemin D — Assisté (situation inconnue)

```
Questions simples en langage courant pour déterminer la nature de l'acquisition
→ Redirige vers Chemin A, B ou C
```

---

# Contraintes métier

- `valeur_terrain + valeur_bâti` doit être égal à `base_totale` avant amortissement (AX-001 — le terrain = 0% amortissable mais doit être comptabilisé). Si l'équation ne tient pas, erreur bloquante.
- `sum(montants_composants)` doit être égal à `valeur_bâti` (TRF-0014). Écart tolérance : 0€.
- La `valeur_terrain` ne peut jamais dépasser 40% du `prix_revient` sans alerte (hors cas exceptionnels documentés).
- `date_acquisition` ≤ `date_mise_en_service` toujours (on ne peut pas louer avant d'avoir acquis).
- Pour un bien en indivision, tous les montants sont proratisés à la `quote_part_indivision` avant tout calcul. Un oubli de proratisation est une erreur interdite.
- JUG-001 et JUG-002 doivent être tracés dans le dossier avec le choix effectué et la date — ils ne peuvent pas être implicites.

---

# Cas limites

| Situation | Comportement attendu |
|---|---|
| Ventilation terrain/bâti absente de l'acte | Estimation SAV-003 proposée, JUG-002 exposé, confirmation obligatoire avant calcul |
| Prix mentionné à deux endroits de l'acte (compromis vs. acte) | Alerte au Validation Engine, question de clarification, l'utilisateur choisit la valeur à retenir |
| Mobilier inclus dans le prix mais non détaillé | Question sur estimation du mobilier avec explication de son impact (durée d'amortissement plus courte) |
| valeur_terrain > 40% du prix_revient | Alerte non bloquante avec explication — l'utilisateur peut confirmer s'il a une raison (terrain exceptionnel) |
| sum(composants) ≠ base_bâti après calcul TRF-0009 | Erreur bloquante — le plan ne peut pas être validé sans cohérence. Arrondi toléré jusqu'à 1€ |
| Bien déjà partiellement amorti (import de plan existant) | Option d'import du plan existant plutôt que recalcul. Plan importé soumis à TRF-0014 pour validation. |
| Bien en VEFA dont la livraison est postérieure à l'exercice déclaré | Aucun amortissement pour l'exercice courant. Avertissement explicite. Plan prêt pour l'exercice de livraison. |
| Quote-part indivision non entière (ex : 33,33%) | Arrondi à 2 décimales. Traçabilité de l'arrondi dans le journal de calcul. |

---

# Dépendances

| Feature | Relation |
|---|---|
| F-009 — Assistant Activité | Précède obligatoirement. Fournit `date_mise_en_service` pour TRF-0011 |
| F-003 — Importer les documents | Partage l'infrastructure d'import si l'utilisateur importe l'acte notarié |
| F-011 — Assistant Crédit *(à venir)* | Consomme `prix_revient` pour calculer le ratio financement/acquisition |
| F-012 — Assistant Charges *(à venir)* | Le plan d'amortissement produit ici est la source de la dotation annuelle |
| F-006 — Calcul fiscal | Consomme `plan_amortissement` et `dotation_annuelle` pour TRF-0030 et TRF-0031 |

---

# Performance

- Extraction d'un acte notarié (OCR + Classification + Extraction) : traitement asynchrone — l'utilisateur n'est pas bloqué en attente.
- Calcul du plan d'amortissement (TRF-0001 à TRF-0014) : synchrone, résultat affiché immédiatement après saisie des dernières données.
- Estimation SAV-003 (ventilation terrain/bâti) : synchrone, instantanée.

---

# Sécurité

- Toutes les données du bien (prix, adresse, valeur) sont soumises à RLS Supabase identique aux données fiscales.
- La source de chaque Field (extrait / estimé / saisi / déduit / choix JUG) est persistée et non modifiable a posteriori sans audit trail.
- Les choix de Jugements (JUG-001, JUG-002) sont tracés avec leur date et leur justification.

---

# Critères d'acceptation

✓ Un utilisateur avec son acte notarié peut compléter l'Assistant Logement en moins de 5 minutes.

✓ Un utilisateur sans acte notarié peut compléter l'Assistant sans être bloqué, avec des estimations SAV-002 et SAV-003 clairement signalées comme telles.

✓ JUG-001 et JUG-002 sont exposés à l'utilisateur avec leurs alternatives avant tout calcul définitif.

✓ L'utilisateur voit son plan d'amortissement exprimé en langage simple (dotation annuelle, durée) — sans jamais voir le terme "composants" ou "VNC".

✓ La validation TRF-0014 est exécutée systématiquement : sum(composants) = base_bâti, ou erreur bloquante.

✓ Pour un bien en indivision, la quote-part est appliquée à tous les montants avant tout calcul.

✓ La source de chaque Field est tracée dans le dossier.

---

# Tests

## Cas nominal

Un utilisateur (PROF-002) importe son acte notarié. Le système extrait le prix (€280 000), les frais (€19 500), la surface (58m²) et l'adresse. La ventilation terrain/bâti est absente. Le système propose une estimation de 15% terrain (SAV-003 — appartement en zone urbaine dense) et expose JUG-002 avec explication. L'utilisateur confirme. JUG-001 est exposé — l'utilisateur choisit d'intégrer les frais. TRF-0001 produit un prix de revient de €299 500. TRF-0002 produit €44 925 terrain / €254 575 bâti. TRF-0009 décompose le bâti selon Grille A. TRF-0014 valide la cohérence. L'Explanation Engine produit : "Votre bien s'amortit pour €X/an sur 30 ans en moyenne." L'utilisateur confirme. LOGEMENT_TERMINE.

## Cas limites

- Acte avec deux prix différents → alerte + sélection utilisateur
- ventilation terrain absente → estimation proposée, confirmation obligatoire
- sum(composants) ≠ base_bâti de 50€ (arrondi) → erreur bloquante, investigation
- Bien en indivision 50% → tous les montants divisés par deux, traçabilité

## Cas d'erreur

- Acte non reconnu par le Classification Engine → bascule vers saisie manuelle
- OCR de mauvaise qualité (document scanné, pages de travers) → confiance faible signalée, confirmation renforcée demandée
- valeur_terrain > prix_revient (incohérence grave) → erreur bloquante

---

# Points de vigilance — Knowledge System

Ces points ne constituent pas des évolutions du KS. Ce sont des lacunes identifiées qui devront être adressées avant l'implémentation.

**PV-1 — Taxonomie Classification Engine : sous-types acte notarié**
La taxonomie actuelle reconnaît "Acte notarié" génériquement. Les sous-types (vente standard / succession / VEFA) requièrent des règles d'extraction différentes. Ce point était déjà identifié en R-003.

**PV-2 — RT-001 Resolver : priorité entre occurrences multiples d'un Field**
Un acte notarié peut contenir le prix à plusieurs endroits avec des valeurs potentiellement divergentes. Le Resolver doit avoir une règle de priorité documentée. Candidat à une évolution de RT-001 — validé en mission R-005.

**PV-3 — ENG-006 : aide à la décision sur les Jugements**
La présentation de JUG-001 et JUG-002 avec alternatives et recommandation dépasse la responsabilité actuelle du Question Engine ("collecter les informations manquantes"). Cette extension mérite d'être documentée dans ENG-006.

---

# Erreurs d'implémentation interdites

- Confondre `date_acquisition` et `date_mise_en_service` (produite par F-009) dans le calcul de TRF-0011.
- Appliquer le taux de frais SAV-002 sans proposer la confirmation à l'utilisateur.
- Calculer le plan d'amortissement sans avoir résolu JUG-001 et JUG-002.
- Omettre la proratisation pour un bien en indivision.
- Valider un plan d'amortissement où sum(composants) ≠ base_bâti (même à 1€ près — au-delà du seuil d'arrondi toléré).
- Présenter le plan d'amortissement en termes de "composants" à l'utilisateur sans traduction en langage simple.
- Utiliser la valeur fiscale du cadastre comme prix de revient (ce n'est pas le prix d'achat).
