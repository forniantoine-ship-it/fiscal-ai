---
id: F-014
title: Assistant Amortissements
type: feature
status: approved
version: "1.0"
created: 2026-07-01
updated: 2026-07-01
owner: product-owner
famille: CONCLUSION
tags: [assistant, amortissements, lmnp, conclusion, plan-amortissement]
depends_on: [F-009, F-010, F-011, F-012]
consumed_by: [F-006]
---

# F-014 — Assistant Amortissements

---

# Invariant fondamental

F-014 ne construit pas le plan d'amortissement.

Le plan est produit par le Calculation Engine à partir des données issues de F-010 (base amortissable, composants) et de F-012 (travaux à amortir), en appliquant les règles du Knowledge System.

Au moment où F-014 s'ouvre, le plan existe déjà.

**F-014 reçoit un plan calculé. Il le présente, l'explique et recueille la validation de l'utilisateur.**

Toute modification du plan — si elle est nécessaire — est une modification en amont (F-010 ou F-012), pas en F-014.

---

# 1. Job To Be Done

> "J'ai tout donné. Montrez-moi que vous avez fait votre partie."

L'utilisateur a fourni toutes les informations nécessaires dans les Assistants précédents. Il arrive maintenant pour recevoir la confirmation que sa situation a été traitée entièrement et correctement — sans avoir à comprendre le mécanisme.

Ce besoin est universel. Il s'exprime dans toute relation où une personne délègue quelque chose de complexe à un expert. Elle ne veut pas refaire le raisonnement. Elle veut voir la preuve que le travail a été fait à sa place.

Dans le contexte LMNP : l'amortissement est la promesse centrale du régime réel. L'utilisateur l'a entendu de son agent, de son banquier, parfois de son comptable. F-014 est le moment où cette promesse devient visible, tangible, chiffrée.

---

# 2. Profils concernés

## PROF-001 — Première année de déclaration

Le plan n'a jamais été présenté ni validé. F-014 présente le plan complet, avec prorata temporis si la mise en service a eu lieu en cours d'année. C'est l'interaction la plus riche — et la seule où la validation est structurante.

## PROF-002 — Années suivantes, plan inchangé

Le plan a été validé en PROF-001. Aucun nouveau travail à amortir n'a été transmis par F-012. F-014 affiche les dotations de l'exercice en cours — interaction légère, pas de re-validation du plan.

## PROF-003 — Années suivantes, plan modifié

Le plan de base est validé, mais F-012 a transmis de nouveaux éléments à amortir (travaux de l'exercice). F-014 présente le plan existant et l'ajout, distingue l'ancienne base de la nouvelle, recueille une confirmation.

---

# 3. Diagnostic de situation

À l'ouverture de F-014, Fiscal AI dispose de :

**Depuis F-009 :**
- Régime fiscal (réel — F-014 n'existe pas en régime micro)
- Date de mise en service
- Exercice fiscal déclaré

**Depuis F-010 :**
- Prix de revient total
- Ventilation terrain / bâti (JUG-002 appliqué)
- Base amortissable par composant (gros œuvre, toiture, installations, agencements)
- Valeur du mobilier si intégré

**Depuis F-011 :**
- Frais d'acquisition : statut intégré ou déduit (JUG-001 appliqué)
- Si intégrés → déjà inclus dans la base de F-010

**Depuis F-012 :**
- Travaux qualifiés "à amortir" (zéro ou plusieurs)

**Depuis le Calculation Engine (input direct de F-014) :**
- Plan d'amortissement complet : dotation par composant, total exercice, plan pluriannuel
- Prorata temporis appliqué si première année

Le système sait tout. F-014 ne pose aucune question avant de présenter le résultat.

---

# 4. Parcours utilisateur

## PROF-001 — Première année

```
[ÉCRAN PRINCIPAL]
Titre : "Vos amortissements pour [exercice]"
Sous-titre en langage courant (voir section UX)
Total dotations exercice : X €
→ "Voir le détail par composant" (dépliable)
→ "Voir le plan complet sur [N] ans" (optionnel, caché par défaut)
→ "Quelque chose vous semble incorrect ?" (chemin de contestation)
→ [Valider]

[DÉTAIL PAR COMPOSANT - optionnel]
Pour chaque composant :
  - Nom courant (pas de jargon)
  - Valeur de base
  - Durée retenue
  - Dotation annuelle
  - Bouton "Expliquer ce choix" (Explanation Engine)

[PLAN PLURIANNUEL - optionnel]
Tableau : année / dotation / cumul / valeur nette comptable
Visible sur demande uniquement

[VALIDATION]
Bouton unique : "Je valide ce plan"
→ Statut : plan_validated
→ F-006 peut consommer les dotations

[CHEMIN DE CONTESTATION]
"Quelque chose vous semble incorrect ?"
→ Question de diagnostic : "Quel composant pose problème ?"
→ Renvoi ciblé vers F-010 pour correction
→ Recalcul automatique à retour
→ Retour sur F-014 avec plan mis à jour
```

## PROF-002 — Années suivantes, plan inchangé

```
[ÉCRAN SIMPLIFIÉ]
Titre : "Amortissements [exercice]"
Message : "Votre plan est inchangé depuis [année de validation]."
Dotations de l'exercice : X €
→ "Voir le détail" (même vue que PROF-001)
→ [Confirmer]
```

Pas de re-validation complète. Confirmation légère.

## PROF-003 — Plan modifié par nouveaux travaux

```
[ÉCRAN PRINCIPAL]
Titre : "Vos amortissements pour [exercice]"
Section A : Plan existant (validé) — dotations inchangées
Section B : Nouveaux éléments (travaux de l'exercice) — présentation identique
Total consolidé : X €
→ [Valider le nouveau plan]
```

---

# 5. Workflow

```
START
│
├─ Vérifier : plan_amortissement disponible ?
│     Non → Erreur : F-010 non complété (blocking)
│     Oui → continuer
│
├─ Déterminer le profil
│     PROF-001 : première_annee = true
│     PROF-002 : plan_validé = true AND pas de nouveaux éléments F-012
│     PROF-003 : plan_validé = true AND nouveaux éléments F-012 présents
│
├─ Charger le plan calculé (Calculation Engine output)
│
├─ Présenter le résultat (mode selon profil)
│
├─ Explanation Engine disponible à la demande (tous profils)
│
├─ Chemin de contestation disponible (PROF-001 et PROF-003)
│     → Diagnostic → renvoi F-010 → recalcul → retour F-014
│
├─ Recueillir la validation
│
└─ OUTPUT : contrat de validation → F-006
```

---

# 6. Capabilities mobilisées

| Capability | Rôle dans F-014 | Invoquée par F-014 ? |
|---|---|---|
| Calculation Engine | Produit le plan avant l'ouverture de F-014 | Non — résultat déjà disponible |
| Explanation Engine | Explique composants, durées, prorata, formule | Oui — à la demande |
| Validation Engine | Enregistre le statut de validation | Oui — au moment de la confirmation |
| Workflow Engine | Orchestre la navigation et le renvoi vers F-010 | Oui — si contestation |

**Note :** Le Calculation Engine n'est pas invoqué par F-014. Il est invoqué en amont, avant l'ouverture de l'Assistant. F-014 consomme son output — il ne le déclenche pas.

---

# 7. Contracts

## Input Contract — reçu du Calculation Engine

```typescript
type PlanAmortissement = {
  exercice: number
  premiere_annee: boolean
  mois_exploitation: number | null        // si prorata temporis
  total_dotations_exercice: number
  composants: ComposantAmortissement[]
  nouveaux_elements: ComposantAmortissement[]  // depuis F-012, vide si aucun
  plan_validé_precedemment: boolean
  annee_validation_initiale: number | null
}

type ComposantAmortissement = {
  id: string
  nom_courant: string                     // ex: "Structure du bâtiment"
  nom_technique: string                   // ex: "Gros œuvre"
  base_amortissable: number
  duree_ans: number
  dotation_annuelle_pleine: number
  dotation_exercice: number               // proratisée si première année
  est_proratisee: boolean
  ks_artifacts: string[]                  // références KS ayant justifié la durée
  plan_pluriannuel: LignePlan[]
}

type LignePlan = {
  annee: number
  dotation: number
  cumul_amortissements: number
  valeur_nette_comptable: number
}
```

## Output Contract — transmis à F-006

```typescript
type ValidationAmortissements = {
  status: 'validated' | 'contested'
  exercice: number
  total_dotations: number                 // valeur consommée par F-006
  validated_at: string                    // ISO timestamp
  plan_version: string                    // pour traçabilité
}
```

---

# 8. Inputs / Outputs

## Inputs

| Source | Donnée | Obligatoire |
|---|---|---|
| Calculation Engine | PlanAmortissement | Oui — bloquant |
| F-009 | exercice, date_mise_en_service | Oui |
| F-010 | Existence vérifiée indirectement via le plan | Oui |

## Outputs

| Destination | Donnée | Condition |
|---|---|---|
| F-006 | total_dotations, status = validated | Après validation |
| F-010 | Signal de contestation + composant ciblé | Si contestation |
| Obsidian (trace) | plan_version, validated_at | Systématique |

---

# 9. UX

## Principes

**Principe 1 — Le résultat avant le mécanisme.**

L'utilisateur voit d'abord ce que ça change pour lui (dotation totale, impact sur le résultat fiscal), pas comment c'est calculé. Le détail est disponible, pas imposé.

**Principe 2 — Le langage courant d'abord.**

"Gros œuvre" → "Structure du bâtiment". "Prorata temporis" → "Calcul au prorata de votre première année de location". Le jargon fiscal est accessible mais jamais en premier plan.

**Principe 3 — L'explication est toujours disponible, jamais obligatoire.**

Chaque chiffre peut être expliqué. L'utilisateur qui fait confiance valide sans tout lire. L'utilisateur anxieux peut creuser chaque ligne.

**Principe 4 — La contestation est un service, pas une alarme.**

"Quelque chose vous semble incorrect ?" — formulé comme une invitation, pas comme un signal d'erreur. Contester est normal, pas inquiétant.

## Textes clés (Explanation Engine — scripts)

**EXP-F014-01 — Pourquoi on amortit le bâtiment mais pas le terrain**
> "Un bâtiment perd de la valeur avec le temps — il s'use, vieillit, nécessite des travaux. Fiscalement, vous pouvez déduire cette usure progressive sur plusieurs années. Le terrain, lui, ne s'use pas — sa valeur reste stable. C'est pourquoi seul le bâtiment entre dans le calcul."

**EXP-F014-02 — Pourquoi cette durée pour ce composant**
> "La durée de [N] ans pour [composant] est définie par l'administration fiscale selon la nature de l'élément. Elle représente la durée de vie normale estimée de cet élément dans un bien immobilier."

**EXP-F014-03 — Prorata temporis (première année)**
> "Votre bien a été mis en location en [mois] [année]. Vous ne pouvez déduire que les amortissements correspondant aux mois effectivement loués — soit [N] mois sur 12. La première année est donc partielle ; les suivantes seront complètes."

**EXP-F014-04 — Comment lire le plan pluriannuel**
> "Ce tableau montre comment vos amortissements s'accumulent chaque année. La 'Valeur nette comptable' est la valeur fiscale restante de votre bien. Elle diminue chaque année jusqu'à atteindre zéro — à ce moment, les amortissements s'arrêtent automatiquement."

**EXP-F014-05 — Impact sur votre résultat fiscal**
> "Ces [X €] d'amortissements viennent réduire votre résultat imposable. Plus le total est élevé, plus votre charge fiscale est faible — voire nulle ou déficitaire."

---

# 10. Cas limites

## CL-001 — Plan non disponible à l'ouverture

**Cause :** F-010 non complété ou Calculation Engine en erreur.

**Traitement :** Blocage explicite. Message : "Votre plan d'amortissement n'est pas encore prêt. Completez l'étape [Logement] pour continuer." Renvoi vers F-010.

**Ce n'est pas un cas F-014 à gérer** — c'est une précondition non remplie.

---

## CL-002 — Aucun travaux transmis par F-012

**Cause :** F-012 n'a retenu aucun élément à amortir (cas fréquent pour un bien récemment acquis sans travaux).

**Traitement :** Le plan ne contient que les composants issus de F-010. Aucun traitement spécifique — c'est le cas standard. Ne pas mentionner l'absence de travaux si l'utilisateur n'a rien remarqué.

---

## CL-003 — Contestation d'un composant

**Cause :** L'utilisateur estime qu'un composant est mal valorisé (base trop haute, durée incohérente).

**Traitement :**
1. Identifier le composant contesté (question de diagnostic)
2. Expliquer la source de la valeur (ks_artifacts — lien vers F-010 ou KS)
3. Si l'erreur est dans F-010 : renvoi ciblé vers F-010 pour correction
4. Recalcul automatique à retour
5. Retour sur F-014 avec plan mis à jour

**Ce que F-014 ne fait pas :** modifier lui-même une valeur. Il identifie la source de l'écart et renvoie vers elle.

---

## CL-004 — Contestation de la durée d'un composant

**Cause :** L'utilisateur pense que la durée retenue est inexacte.

**Traitement :**
1. EXP-F014-02 explique la durée et sa source (KS)
2. Si l'utilisateur maintient la contestation : enregistrer comme SAV candidate
3. Appliquer la durée standard du KS (conservative default)
4. Poursuivre avec la validation

**Remarque :** les durées sont définies par le KS. F-014 ne les négocie pas. Une contestation persistante de durée est une question SAV, pas un blocage de conception.

---

## CL-005 — PROF-002, plan parfaitement identique à l'année précédente

**Traitement :** Affichage simplifié. Pas de re-présentation de tout le plan. Message de continuité + dotations de l'exercice + confirmation légère.

---

## CL-006 — Bien mis en service le 1er janvier (prorata = 12/12)

**Traitement :** Aucun prorata à appliquer. dotation_exercice = dotation_annuelle_pleine. Pas de mention du prorata dans l'interface — inutile et anxiogène.

---

## CL-007 — Mobilier à amortir (durée plus courte que le bâtiment)

**Traitement :** Composant présenté séparément avec sa durée propre. EXP-F014-02 adapté. Aucune interaction utilisateur supplémentaire — même pattern que les autres composants.

---

# 11. Revue adversariale

## Attaque 1 — "F-014 est trop passif. L'utilisateur doit pouvoir choisir ses durées."

**Réponse :** Non. Les durées sont définies par le KS sur la base de la doctrine fiscale. Présenter un choix de durée à l'utilisateur reviendrait à lui demander de prendre une décision qu'il n't pas les moyens de prendre. Le rôle de Fiscal AI est précisément de porter cette décision. Si un utilisateur veut déroger à la durée standard, c'est une situation expert-comptable — pas un cas F-014.

## Attaque 2 — "Le chemin de contestation est complexe. Un utilisateur ne saura pas s'il doit contester."

**Réponse :** La contestation n'est pas le parcours principal. Elle est disponible, pas prescrite. La formulation ("quelque chose vous semble incorrect ?") cible uniquement les utilisateurs qui ont déjà une intuition d'erreur. Les autres valident sans passer par là. La complexité du chemin de contestation est délibérée — elle doit être un peu coûteuse pour filtrer les fausses alertes.

## Attaque 3 — "Le plan pluriannuel ne sert à rien si on ne le montre pas."

**Réponse :** Le plan pluriannuel sert à la traçabilité interne et à la confiance de l'utilisateur qui veut comprendre l'engagement long terme. Il est disponible, pas imposé. L'imposer à tous serait une erreur UX — la majorité des utilisateurs ne sait pas lire un tableau d'amortissement et l'exposition de 40 lignes crée de l'anxiété, pas de la confiance.

## Attaque 4 — "F-014 ne valide pas les calculs — il fait confiance au Calculation Engine sans vérification."

**Réponse :** Correct, et intentionnel. F-014 est un assistant de présentation, pas de vérification. La vérification des calculs appartient aux tests automatisés du Calculation Engine, pas à l'interface utilisateur. Un assistant qui vérifie lui-même ce qu'il présente crée une responsabilité architecturale circulaire.

## Attaque 5 — "Si l'utilisateur conteste et retourne dans F-010, comment revient-il dans F-014 ?"

**Réponse :** Le Workflow Engine gère la navigation. Après correction en F-010, le plan est recalculé et F-014 est ré-ouvert avec le plan mis à jour. C'est une responsabilité du Workflow Engine, pas de F-014. F-014 ne doit pas mémoriser l'état de contestation — il reçoit toujours un plan frais.

---

# 12. Definition of Done

- [x] Problème utilisateur identifié — "J'ai tout donné. Montrez-moi que vous avez fait votre partie."
- [x] Famille d'Assistant connue — CONCLUSION (confirmé, premier cas empirique de la famille)
- [x] Invariant fondateur posé — F-014 reçoit, présente, fait valider. Il ne construit rien.
- [x] Workflow validé — 3 profils couverts (première année, années suivantes, plan modifié)
- [x] Contracts identifiés — Input (PlanAmortissement), Output (ValidationAmortissements)
- [x] Capabilities identifiées — Explanation Engine (central), Validation Engine, Workflow Engine
- [x] 7 cas limites documentés
- [x] Revue adversariale passée — 5 attaques, 5 réponses
- [x] Feature prête pour implémentation dans Cursor

---

# Observations (non bloquantes)

**OBS-F014-01 — Précision du Contract entre F-010 et Calculation Engine**

F-010 produit une base amortissable. Le Calculation Engine consomme cette base pour produire le plan. La précision du format de transfert (composants, valeurs, identifiants) devra être vérifiée lors de l'implémentation. Ce n'est pas un blocage de conception — c'est un point d'attention pour Cursor.

**OBS-F014-02 — Durées définies par le KS**

Ce design suppose que le KS définit des durées standard uniques par composant, pas des fourchettes. Si l'implémentation révèle que le KS définit des fourchettes (ex : 40 à 50 ans pour le gros œuvre), un choix de durée devra être géré — probablement par le Workflow Engine avant l'ouverture de F-014, pas dans F-014 lui-même.
