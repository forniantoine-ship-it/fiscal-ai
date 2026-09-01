---
id: F-009
title: Assistant Activité
type: feature
status: approved
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
priorité: critique
tags: [feature, activité, lmnp, onboarding]
jtbd: [JTBD-001]
profils: [PROF-001, PROF-002, PROF-003, PROF-004, PROF-005]
ux-patterns: [UXP-001]
---

# F-009 — Assistant Activité

> **Note aux futurs auteurs de Features**
> Ce document est le modèle de référence pour tous les Assistants de Fiscal AI.
> Chaque section est obligatoire. Aucun raccourci n'est autorisé.
> Une section vide signifie que la réflexion n'est pas terminée — pas que l'information est absente.

---

# Mission

Permettre à tout investisseur LMNP, quelle que soit sa situation administrative, d'établir l'identité de son activité et ses paramètres fondamentaux — sans jamais présupposer qu'il possède un document, un numéro ou une connaissance particulière.

---

# Valeur utilisateur

À l'issue de cet Assistant, l'utilisateur sait exactement ce que Fiscal AI a retenu de son activité, pourquoi, et comment cela impacte ses calculs.

Il comprend — en langage simple — que la date de début de sa location conditionne ses amortissements de première année.

Il n'a pas eu à chercher un document qu'il ne possédait pas.

---

# Déclencheur

L'utilisateur accède à l'étape "Activité" de son dossier LMNP, depuis le Workflow Engine, après la création du dossier (F-001).

---

# Préconditions

- Le dossier est créé (état : DOSSIER_CREE ou INFORMATIONS_GENERALES)
- L'utilisateur est authentifié
- Aucun Assistant Activité n'est en cours sur ce dossier

---

# Job To Be Done

**Référence :** [[JTBD-001 — Déclarer mon activité LMNP au régime réel]]

> Lorsque je dois produire ma déclaration fiscale LMNP au régime réel,
> je veux que mon activité soit correctement identifiée et que ses paramètres de départ soient enregistrés,
> afin que tous mes calculs fiscaux reposent sur des données exactes et défendables.

**Pourquoi ce Job précède tout autre :** les paramètres établis ici — notamment la date de mise en service — alimentent directement le calcul du prorata de première année (TRF-0011) et délimitent la période de pré-exploitation (TRF-0022). Une erreur ici se propage silencieusement à tous les calculs aval. C'est le fondement du dossier.

---

# Diagnostic de situation

**Principe appliqué :** Constitution P16 — le diagnostic précède la demande.
**Pattern mobilisé :** [[UXP-001 — Diagnostic de situation]]

Avant toute collecte d'information, l'Assistant identifie la situation structurelle de l'utilisateur.

## Situations structurelles couvertes

| Situation | Profil principal | Chemin optimal |
|---|---|---|
| Activité déjà immatriculée, SIRET connu | PROF-002 | Saisie du SIRET → auto-récupération API SIRENE |
| Activité déjà immatriculée, SIRET inconnu | PROF-001, PROF-004 | Recherche par nom + adresse → sélection |
| Activité déjà immatriculée, document disponible | PROF-001, PROF-002 | Import attestation INPI |
| Activité jamais immatriculée, bien déjà loué | PROF-003 | Guidance vers régularisation INPI + poursuite en parallèle |
| Activité jamais immatriculée, bien pas encore loué | Tout profil | Date prévisionnelle de mise en location |
| Situation incertaine | PROF-001, PROF-004 | Mode assisté : questions simples pour déterminer la situation |

## Question d'orientation (structure — non prescriptive sur la formulation)

La première interaction de cet Assistant est une question d'orientation permettant à l'utilisateur de se reconnaître dans l'une des situations ci-dessus.

Cette question ne demande ni document, ni numéro, ni connaissance technique. Elle demande un état de fait que tout propriétaire bailleur peut évaluer sans préparation.

*La formulation exacte de cette question est une hypothèse de design (UXP-001 — statut 🟡). Elle sera validée lors de la conception détaillée de l'interface.*

---

# Résultat attendu

À la fin de l'Assistant Activité, les données suivantes sont enregistrées et validées :

| Donnée | Statut requis | Source possible |
|---|---|---|
| SIRET | Présent et valide (clé de Luhn) | API SIRENE / document INPI / saisie manuelle |
| Date de début d'activité officielle | Présente | API SIRENE / document INPI / saisie manuelle |
| **Date de mise en service effective** | **Présente et confirmée par l'utilisateur** | **Déclarée par l'utilisateur — non extractible automatiquement** |
| Régime fiscal | Présent | API SIRENE / document INPI / sélection utilisateur |
| Code APE | Présent | API SIRENE / document INPI |

**Note aux futurs auteurs :** identifier systématiquement les données que le système peut obtenir automatiquement et celles qui nécessitent impérativement une déclaration utilisateur. Cette distinction conditionne la conception du Question Engine.

L'utilisateur a reçu une explication de l'impact de la date de mise en service sur ses calculs (rôle de l'Explanation Engine).

---

# Entrées

## Entités

- Dossier LMNP (identifiant, exercice fiscal, état)
- Bien immobilier (si déjà renseigné en F-002 — utilisé pour pré-remplissage adresse lors de la recherche SIRENE)

## Fields collectés

| Field | Type | Obligatoire | Note |
|---|---|---|---|
| siret | String(14) | Oui | Validé par clé de Luhn |
| date_debut_activite | Date | Oui | Date d'immatriculation officielle |
| date_mise_en_service | Date | Oui | Date de première mise en location effective — toujours demandée explicitement |
| regime_fiscal | Enum (réel_simplifié / réel_normal) | Oui | |
| code_ape | String(5) | Non — vérification | Doit être 6820A ou 6820B pour LMNP |
| forme_juridique | String | Non | Informatif |

**Distinction critique : date_debut_activite ≠ date_mise_en_service**

La `date_debut_activite` est la date d'immatriculation administrative (INPI, CFE, ou déclaration). La `date_mise_en_service` est la date de première location meublée effective.

Ces deux dates peuvent différer. C'est la `date_mise_en_service` qui s'applique pour AX-006 et TRF-0011. Elle ne peut jamais être extraite d'un document — elle doit être déclarée par l'utilisateur et confirmée.

## Moyens possibles

*Classés par effort utilisateur croissant. Le produit privilégie le moyen de moindre effort disponible pour chaque situation (Constitution P19).*

| Rang | Moyen | Effort utilisateur | Engines mobilisés | Conditions |
|---|---|---|---|---|
| 1 | SIRET saisi → auto-récupération API SIRENE | Minimal (14 chiffres) | Validation Engine | SIRET connu de l'utilisateur |
| 2 | Recherche par nom + adresse → sélection dans API SIRENE | Faible (informations toujours connues) | Question Engine, Validation Engine | SIRET inconnu, mais activité immatriculée |
| 3 | Import attestation INPI → extraction automatique | Moyen (retrouver et importer un document) | Document Engine, OCR Engine, Classification Engine, Validation Engine | Document disponible |
| 4 | Saisie manuelle de tous les champs | Élevé (connaissance de chaque information) | Validation Engine | Fallback universel |
| 5 | Guidance vers immatriculation INPI | Spécifique (chemin de régularisation) | Question Engine | Activité non immatriculée, bien déjà loué |

**Note aux futurs auteurs :** pour chaque Assistant, identifier les 3 à 5 moyens d'obtenir l'information principale. Le moyen 1 doit toujours être le chemin présenté en premier. Le moyen de fallback doit toujours exister.

## Événements entrants

- DOSSIER_CREE (déclenche l'initialisation de l'Assistant)
- QUESTION_REPONDUE (chaque réponse utilisateur fait progresser l'Assistant)
- DOCUMENT_ANALYSE (si l'utilisateur a choisi le moyen 3 — import de document)

---

# Sorties

## Fields créés ou mis à jour

Tous les Fields listés dans la section "Fields collectés" ci-dessus, avec leur source de provenance tracée (API SIRENE / document INPI / saisie manuelle / déduction).

## Entités modifiées

- Dossier LMNP : champs activité renseignés, état mis à jour

## Événements produits

- `ACTIVITE_IDENTIFIEE` — émis quand SIRET, date_debut_activite et regime_fiscal sont validés
- `MISE_EN_SERVICE_CONFIRMEE` — émis quand date_mise_en_service est déclarée et confirmée par l'utilisateur
- `ACTIVITE_TERMINE` — émis quand tous les Fields requis sont validés et l'utilisateur a reçu l'explication du prorata

## États modifiés

`INFORMATIONS_GENERALES` → `ACTIVITE_IDENTIFIEE`

---

# Engines concernés

| Engine | Rôle dans cet Assistant | Obligatoire |
|---|---|---|
| Workflow Engine | Orchestre la progression entre les branches du parcours | Oui |
| Validation Engine | Valide le format SIRET (clé de Luhn), la cohérence du code APE, la cohérence des dates | Oui |
| Question Engine | Pose la question d'orientation, les questions de clarification, et la question sur la date de mise en service | Oui |
| Explanation Engine | Explique l'impact de la date de mise en service sur le prorata de première année | Oui |
| Document Engine | Reçoit et stocke l'attestation INPI si l'utilisateur choisit le moyen 3 | Si moyen 3 |
| OCR Engine | Extrait le texte de l'attestation INPI | Si moyen 3 |
| Classification Engine | Identifie le document comme "Attestation d'immatriculation INPI" | Si moyen 3 |

**Point de vigilance :** le type "Attestation d'immatriculation INPI" n'est pas encore dans la taxonomie du Classification Engine. Ce point doit être résolu avant l'implémentation du moyen 3. La taxonomie appartient au Knowledge System — toute extension doit être proposée avant modification du code.

---

# Transformations et Axiomes concernés

| Référence | Rôle dans cet Assistant |
|---|---|
| AX-006 | L'amortissement débute à la date de mise en service — justifie pourquoi date_mise_en_service est obligatoire |
| AX-011 | Les charges de pré-exploitation sont déductibles si l'intention locative est démontrée — la date délimite la période |
| TRF-0011 | Calcul du prorata de première année — prend date_mise_en_service en entrée |
| TRF-0022 | Délimitation de la période de pré-exploitation — prend date_debut_activite et date_mise_en_service en entrée |

**Note aux futurs auteurs :** lister ici uniquement les Transformations et Axiomes *directement sollicités* par cet Assistant. Les Transformations en aval (TRF-0023 à TRF-0025, TRF-0031…) appartiennent aux Features qui les exécutent.

---

# Parcours utilisateur

*Ce parcours est un arbre de décision, pas une séquence linéaire. Chaque branche correspond à une situation identifiée dans le Diagnostic de situation.*

```
┌─────────────────────────────────────────────────────┐
│  QUESTION D'ORIENTATION                             │
│  (pattern UXP-001 — formulation à valider)          │
└──────────────────┬──────────────────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
  [Déjà déclaré] [Pas sûr]  [Pas encore]
       │           │           │
       │           │           ├── [Bien déjà loué]
       │           │           │   → Guidance immatriculation INPI
       │           │           │   → Poursuite avec date prévisionnelle
       │           │           │
       │           │           └── [Bien pas encore loué]
       │           │               → Saisie date prévisionnelle de mise en location
       │           │
       │           └── Recherche assistée (nom + adresse)
       │               → Résultats SIRENE → sélection → Branche A
       │               → Aucun résultat → Branche D (saisie manuelle)
       │
       ├── [SIRET connu]
       │   → Saisie SIRET
       │   → Auto-récupération API SIRENE
       │   → Confirmation des données récupérées
       │   → ↓ Étape commune
       │
       ├── [Document INPI disponible]
       │   → Import document
       │   → OCR + Classification + Extraction
       │   → Confirmation des données extraites
       │   → ↓ Étape commune
       │
       └── [Rien de tout ça]
           → Saisie manuelle guidée champ par champ
           → ↓ Étape commune

           ↓ ÉTAPE COMMUNE (tous les chemins convergent ici)

┌─────────────────────────────────────────────────────┐
│  QUESTION : date de mise en service effective       │
│  "Quand avez-vous loué ce bien pour la première     │
│   fois — ou quand prévoyez-vous de le louer ?"      │
│                                                     │
│  Toujours posée, quel que soit le chemin emprunté.  │
│  Non extractible automatiquement.                   │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  EXPLICATION (Explanation Engine)                   │
│  "Votre activité a démarré le [date INPI].          │
│   Votre bien était disponible à la location le      │
│   [date mise en service]. Cela correspond à [N]     │
│   jours sur l'exercice, soit un prorata de [X%]     │
│   pour vos amortissements de première année."       │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  VALIDATION et CONFIRMATION                         │
│  "Ces informations sont-elles correctes ?"          │
│  → L'utilisateur confirme ou corrige                │
└──────────────────┬──────────────────────────────────┘
                   ▼
            ACTIVITE_TERMINE
            → Workflow passe à l'étape suivante
```

**Note aux futurs auteurs :** tout parcours d'Assistant doit être représenté comme un arbre. La section "Parcours utilisateur" n'est pas une liste d'étapes numérotées — c'est une carte de toutes les situations possibles et de la façon dont chacune converge vers le résultat attendu.

---

# Contraintes métier

- La `date_mise_en_service` ne peut jamais être antérieure à la `date_debut_activite`. Si c'est le cas, le Validation Engine lève une alerte et le Question Engine clarifie avec l'utilisateur.
- La `date_mise_en_service` ne peut jamais être antérieure à la date de l'acte notarié (si F-002 est renseignée). Même traitement.
- Si le code APE récupéré n'est ni 6820A ni 6820B, le Validation Engine alerte et demande une confirmation — l'activité peut ne pas être du LMNP standard.
- Le régime fiscal doit être "réel simplifié" ou "réel normal". Si une autre valeur est extraite d'un document, le Question Engine demande une clarification.
- Aucun calcul de prorata (TRF-0011) n'est effectué avant que `date_mise_en_service` soit confirmée par l'utilisateur.

---

# Cas limites

| Situation | Comportement attendu |
|---|---|
| SIRET saisi invalide (clé de Luhn incorrecte) | Erreur immédiate avec explication, nouvelle saisie demandée |
| API SIRENE indisponible | Bascule automatique vers les alternatives (import document ou saisie manuelle), sans exposer l'erreur technique à l'utilisateur |
| Plusieurs résultats SIRENE pour le même nom + adresse | Présentation des résultats, demande de sélection à l'utilisateur |
| Document INPI non reconnu par le Classification Engine | Proposition de saisie manuelle, sans blocage |
| date_mise_en_service dans une année fiscale différente de l'exercice déclaré | Alerte du Validation Engine, explication à l'utilisateur, pas de blocage |
| Activité non immatriculée, bien déjà loué | Guidance vers immatriculation INPI, poursuite possible avec date prévisionnelle marquée comme "à confirmer" |
| Utilisateur corrige les données auto-récupérées depuis SIRENE | La correction est conservée, la source est tracée comme "modifiée par l'utilisateur" |

---

# Dépendances

| Feature | Relation |
|---|---|
| F-001 — Création d'un dossier LMNP | Précède obligatoirement cet Assistant |
| F-002 — Création d'un bien immobilier | Si renseignée avant cet Assistant, l'adresse du bien est utilisée pour la recherche SIRENE |
| F-006 — Calcul fiscal | Consomme date_mise_en_service (TRF-0011) et date_debut_activite (TRF-0022) |
| F-007 — Génération de la déclaration | Utilise le SIRET pour la liasse fiscale |

---

# Performance

- Récupération API SIRENE : réponse attendue en moins de 2 secondes. Au-delà, basculer vers les alternatives sans attendre.
- Extraction d'un document INPI (OCR + Classification) : traitement asynchrone, l'utilisateur n'est pas bloqué en attente.
- Validation du SIRET (clé de Luhn) : synchrone, instantanée, côté client.

---

# Sécurité

- Le SIRET est une donnée publique — pas de restriction de stockage particulière.
- La date de mise en service est une donnée personnelle liée au dossier fiscal — soumise à RLS Supabase comme toutes les données du dossier.
- Aucune donnée issue de l'API SIRENE n'est stockée sans confirmation explicite de l'utilisateur.
- La traçabilité de la source de chaque Field (API / document / saisie manuelle / correction utilisateur) est obligatoire et persistée.

---

# Critères d'acceptation

✓ Un utilisateur avec un SIRET peut compléter l'Assistant Activité en moins de 2 minutes.

✓ Un utilisateur sans SIRET peut compléter l'Assistant Activité sans être bloqué.

✓ Un utilisateur dont l'activité n'est pas immatriculée est guidé vers la régularisation sans être bloqué dans son dossier.

✓ La date de mise en service est toujours demandée explicitement, quel que soit le chemin emprunté.

✓ L'Explanation Engine produit une explication du prorata de première année avant la confirmation finale.

✓ Toutes les sources des Fields sont tracées (API / document / saisie / correction).

✓ La validation SIRET (clé de Luhn) est effectuée avant tout appel à l'API SIRENE.

✓ L'Assistant fonctionne correctement si l'API SIRENE est indisponible.

---

# Tests

## Cas nominal

Un utilisateur (PROF-002) saisit son SIRET. L'API SIRENE retourne ses données. Il confirme. Il déclare que sa mise en service est postérieure de 3 semaines à son immatriculation. L'Explanation Engine calcule le prorata et l'explique. Il confirme. ACTIVITE_TERMINE est émis.

## Cas limites

- SIRET invalide → message d'erreur clair, nouvelle tentative possible
- API SIRENE indisponible → bascule vers alternatives sans message d'erreur technique
- date_mise_en_service < date_debut_activite → alerte Validation Engine + clarification Question Engine
- Code APE ≠ 6820A/B → alerte + confirmation demandée

## Cas d'erreur

- Abandon en cours de parcours → progression sauvegardée, reprise possible
- Document INPI non reconnu → bascule vers saisie manuelle
- Conflit entre date INPI et date acte notarié → Question Engine clarifie, date confirmée par l'utilisateur prime

---

# Erreurs d'implémentation interdites

- Utiliser la `date_debut_activite` (immatriculation) à la place de la `date_mise_en_service` dans TRF-0011 sans confirmation utilisateur.
- Bloquer l'utilisateur si l'API SIRENE est indisponible.
- Bloquer l'utilisateur si l'activité n'est pas encore immatriculée.
- Calculer le prorata avant que `date_mise_en_service` soit confirmée.
- Afficher le SIRET ou des termes techniques sans explication dans l'interface utilisateur.
- Stocker des données SIRENE sans traçabilité de la source.
- Demander l'import d'un document comme unique point d'entrée.
