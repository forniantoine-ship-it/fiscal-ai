---
id: GOUV-001
title: Gouvernance des décisions
type: governance
status: approved
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
tags: [governance, decisions, adr, process]
depends_on: [Constitution du Cerveau Fiscal AI]
---

# GOUV-001 — Gouvernance des décisions

---

# Pourquoi ce document existe

La Constitution décrit ce qui doit être.

Elle ne décrit pas comment nous décidons de le faire évoluer.

Ce vide a une conséquence : sans processus explicite, les décisions importantes sont prises de la même manière que les décisions triviales — par approbation implicite, sans challenge structuré, sans traçabilité.

Ce document comble ce vide.

Il ne remplace pas la Constitution. Il gouverne la manière dont la Constitution, les Engines, le Knowledge System et le code évoluent.

Il s'applique à lui-même : toute évolution de GOUV-001 suit le processus qu'il décrit.

---

# I. Les quatre niveaux de décision

Toutes les décisions ne méritent pas le même niveau de rigueur.

La classification pertinente n'est pas le domaine de la décision (architecture, produit, métier) mais son **irréversibilité** et son **périmètre d'impact**.

## Niveau 1 — Opérationnel

**Définition :** décision localisée à un seul artefact, corrigeable à tout moment sans impact sur les autres composants.

**Exemples :** ajouter un champ à une Feature, enrichir la taxonomie d'un type de document, corriger une valeur dans un SAV existant, ajouter un exemple à un Jugement.

**Processus :** action directe. Aucune ADR. Aucune revue adversariale. Cohérence avec le KS vérifiée avant application.

**Règle :** si la correction de cette décision prend moins d'une heure et n'affecte qu'un seul document, c'est une décision de Niveau 1.

---

## Niveau 2 — Fonctionnel

**Définition :** décision qui crée ou modifie une capacité visible — une Feature, un Assistant, un Profil, un JTBD. Réversible avec effort. Impact limité à un périmètre fonctionnel défini.

**Exemples :** concevoir F-012, créer PROF-006, ajouter un UX Pattern, définir un nouveau JTBD.

**Processus :** document Feature ou artefact Produit complet. Aucune ADR. Cohérence avec le KS et la Constitution vérifiée.

**Règle :** si la décision modifie ce que le produit peut faire pour l'utilisateur, sans modifier comment le système fonctionne en dessous, c'est une décision de Niveau 2.

---

## Niveau 3 — Structural

**Définition :** décision qui modifie un contrat d'Engine, une pipeline de traitement, une règle d'architecture, ou un élément du KS dont dépendent plusieurs Features ou Engines. Coûteuse à inverser. Périmètre d'impact : plusieurs composants.

**Exemples :** étendre le contrat du Classification Engine, modifier RT-003, ajouter un nouveau type de nœud à l'ontologie, créer un nouveau Engine.

**Processus :** ADR obligatoire. Revue adversariale obligatoire. Décision Product Owner.

**Règle :** si la modification d'une décision de Niveau 3 impose de modifier au moins deux Engines ou deux Features, c'est bien une décision de Niveau 3.

---

## Niveau 4 — Fondateur

**Définition :** décision qui modifie les principes qui gouvernent toutes les autres décisions. Impact : tout le système, présent et futur. Essentiellement irréversible — tout ce qui a été construit sous l'ancien principe devra être réexaminé.

**Exemples :** ajouter un principe à la Constitution, modifier l'ontologie de base (les types AX, SAV, JUG…), modifier GOUV-001, changer la définition des rôles.

**Processus :** ADR obligatoire. Revue adversariale obligatoire avec trace explicite de qui l'a conduite. Pré-mortem obligatoire. Date de revisitation fixée au moment de la décision. Décision Product Owner.

**Règle :** si la décision modifie une règle qui s'applique à toutes les décisions futures, c'est une décision de Niveau 4.

---

# II. Le cycle de vie complet d'une décision

Ce cycle s'applique aux Niveaux 3 et 4. Pour les Niveaux 1 et 2, il est condensé en une action directe.

## Étape 1 — Signal

Quelque chose résiste. Une règle manque. Un Engine atteint sa limite. Une Feature révèle une lacune du KS. Ce n'est pas encore un problème formalisé — c'est une observation.

Le signal est enregistré dans le **Registre d'observations** avec : date, contexte, occurrence numérotée (1/3…).

**Règle :** un signal non enregistré n'existe pas. La mémoire conversationnelle est insuffisante pour les signaux à long terme.

## Étape 2 — Classification

À quel niveau appartient cette décision ?

Si Niveau 1 ou 2 : action directe, fin du cycle.

Si Niveau 3 ou 4 : le signal entre dans le Registre et accumule des occurrences.

## Étape 3 — Validation des occurrences

Avant de déclencher une ADR, deux conditions doivent être satisfaites :

**Condition A — Trois occurrences.** Le même problème a été observé trois fois.

**Condition B — Même cause racine.** Test obligatoire : la même solution résoudrait-elle les trois occurrences ? Si non, les occurrences décrivent des problèmes distincts. Elles sont décomptées séparément. L'ADR ne peut être rédigée que pour le problème dont les trois occurrences partagent la même cause.

**Avertissement :** trois symptômes similaires ne constituent pas trois occurrences du même problème. La ressemblance de surface est trompeuse. Seule la cause racine commune valide le décompte.

## Étape 4 — Rédaction de l'ADR

L'ADR documente :
- le problème précis (pas le symptôme — le problème)
- les causes identifiées
- toutes les solutions envisagées avec leurs avantages et inconvénients
- la solution recommandée et sa justification
- les conséquences attendues sur les composants existants
- les questions ouvertes qui subsistent après la décision

L'ADR n'est pas un argument en faveur d'une solution. C'est un raisonnement complet qui include les raisons de ne pas choisir cette solution.

## Étape 5 — Cartographie des hypothèses

Avant la revue adversariale, les hypothèses sur lesquelles repose l'ADR doivent être rendues explicites.

Toute ADR de Niveau 3 ou 4 comporte une liste des hypothèses implicites. La revue adversariale les cible en premier.

**Exemples d'hypothèses implicites :** "les trois occurrences décrivent le même problème" (ADR-001, non vérifiée), "le Workflow Engine peut produire ce payload sans connaissance métier" (ADR-002, gap non résolu).

## Étape 6 — Revue adversariale

**Objectif :** trouver les raisons de rejeter l'ADR. Pas l'améliorer.

**Posture obligatoire :** le réviseur adopte explicitement le rôle de destructeur. Cette posture doit être documentée ("revue conduite en posture de Principal Software Architect").

**Critères de la revue :**
- Les hypothèses tiennent-elles ?
- Le décompte des occurrences est-il valide (même cause racine) ?
- La solution résout-elle le problème complet ou seulement une partie ?
- Les conséquences sur les composants existants ont-elles été correctement évaluées ?
- Existe-t-il une solution plus simple qui résoudrait le même problème ?

**Issue possible A — Faille fatale identifiée :** l'ADR est rejetée. La faille est documentée. Le signal retourne au Registre d'observations, reclassifié.

**Issue possible B — Tradeoffs identifiés, aucune faille fatale :** l'ADR passe à la décision avec ses incertitudes explicitement documentées. La décision n'est pas parfaite — aucune décision de Niveau 3 ne l'est. Elle est prise en connaissance de ses limites.

**Limite connue de ce processus :** dans notre configuration actuelle, l'IA rédige l'ADR et conduit la revue adversariale. Il s'agit d'un changement de posture, pas d'un changement d'acteur. Cette limite est structurelle et ne peut pas être éliminée dans la configuration actuelle. Elle doit être compensée par la rigueur explicite de la posture et par la vigilance du Product Owner lors de la décision.

## Étape 7 — Pré-mortem (Niveau 4 uniquement)

Avant la décision, imaginer que la décision a été prise, implémentée, et a échoué.

Quelle est la cause de l'échec la plus probable ?

Si cette cause peut être anticipée : soit la décision est révisée, soit la mitigation est documentée dans l'ADR.

Le pré-mortem cible ce que la revue adversariale ne peut pas voir : les erreurs de contexte, pas les erreurs de logique.

## Étape 8 — Décision

La décision appartient exclusivement au Product Owner.

Elle ne peut pas être déléguée à l'IA. L'IA recommande. Le Product Owner décide.

La décision est documentée dans l'ADR avec : la date, le choix retenu, la justification, et — pour les Niveaux 3 et 4 — une date de revisitation obligatoire.

## Étape 9 — Mise à jour du KS

Le Knowledge System est mis à jour en cohérence avec la décision.

L'ordre est impératif : KS d'abord, code ensuite. Jamais l'inverse.

## Étape 10 — Vérification d'alignement

Toute décision de Niveau 3 ou 4 impose une vérification explicite : les composants existants (Features, Engines, code) sont-ils cohérents avec la nouvelle décision ?

Les divergences identifiées sont enregistrées comme signaux de Niveau 1 ou 2.

## Étape 11 — Clôture

L'ADR est archivée avec son statut final (acceptée / rejetée / supersédée).

Pour les Niveaux 3 et 4 : la date de revisitation est enregistrée dans le Registre des décisions actives.

---

# III. Approbation, Validation, Décision

Ces trois concepts sont distincts. Les confondre est la source principale de décisions fragiles.

## Approbation

"Cela me semble juste."

Subjective. Basée sur la perception. Rapide. Peut être donnée sans analyse. Insuffisante seule pour toute décision de Niveau 3 ou 4.

L'approbation ne remplace pas la validation.

## Validation

"Cela satisfait nos critères."

Objective. Basée sur des tests définis à l'avance. La revue adversariale est l'instrument de validation pour les ADRs. La validation vérifie que le raisonnement est solide — elle ne garantit pas que la décision est correcte.

La validation est nécessaire mais non suffisante.

## Décision

"Nous nous engageons sur ce chemin en assumant ses conséquences."

Consciente des limites identifiées. Irréversible à court terme. Appartient au Product Owner. Ne peut pas être une approbation déguisée.

Une décision sans validation préalable est une hypothèse non testée.

Une validation sans décision est une analyse sans engagement.

---

# IV. Les rôles

## Product Owner

Seul décideur pour les Niveaux 2, 3 et 4.

Il propose, il challenge, il arbitre les tradeoffs non résolus, il assume les conséquences.

Il ne peut pas déléguer la décision — mais il peut et doit s'appuyer sur la recommandation de l'Architecte.

## Principal AI Architect

Il propose les solutions. Il conduit la revue adversariale avec une posture explicitement différente de celle du proposant. Il recommande — il ne décide pas.

Sa double position (proposant et réviseur) est une limite structurelle assumée et compensée par l'explicitation de la posture et la vigilance du Product Owner.

## Knowledge System

Il ne décide pas. Il valide passivement : une décision qui violerait un principe existant du KS est signalée lors de la vérification d'alignement. Il absorbe les décisions validées et les rend disponibles pour toutes les décisions futures.

## Code

Il n'initie pas de décision. Il signale les divergences avec le KS (via les tests, les types, les erreurs). Il exécute les décisions validées. Il ne modifie jamais le KS — c'est toujours l'inverse.

---

# V. Le rôle du doute

Le doute n'est pas un obstacle à la décision. C'est un instrument de qualité.

## La revue adversariale et ses limites

La revue adversariale teste la logique interne de l'ADR. Elle ne voit pas :

- Les erreurs de paradigme : si proposant et réviseur partagent les mêmes présupposés, aucun ne voit les erreurs de cadre. Ces erreurs sont les plus coûteuses.

- L'inconnu inconnu : on ne peut pas réfuter ce qu'on n'a pas encore pensé à formuler.

- Les erreurs temporelles : une décision valide aujourd'hui peut devenir fausse dans six mois.

## Les instruments complémentaires

**Cartographie des hypothèses :** rendre explicites les présupposés implicites avant la revue adversariale. Cibler ces présupposés en priorité.

**Pré-mortem :** imaginer l'échec avant de décider. Identifier la cause la plus probable. Différent de la revue adversariale — basé sur les scénarios, pas sur la logique.

**Revisitation temporelle :** toute décision de Niveau 3 ou 4 est réexaminée après un délai prédéfini (défini au moment de la décision). Le réexamen ne signifie pas que la décision change — il signifie qu'elle est consciemment réaffirmée ou révisée à la lumière du contexte nouveau.

## Sur la culture du doute

L'objectif n'est pas de défendre les décisions que nous avons prises.

L'objectif est de construire les meilleures décisions possibles.

Un système de gouvernance qui protège ses décisions passées contre toute remise en question est un système qui s'ossifie. Un système qui questionne toutes ses décisions indéfiniment ne converge pas.

L'équilibre : les décisions validées sont stables jusqu'à leur date de revisitation. La revisitation est systématique, pas optionnelle.

---

# VI. Les frontières

## Ce que gouverne chaque couche

| Couche | Question à laquelle elle répond | Change quand |
|---|---|---|
| **Constitution** | Quels principes ne doivent jamais être violés ? | Un principe est découvert ou un existant est violé |
| **Gouvernance (GOUV)** | Comment les décisions importantes sont-elles prises ? | Le processus de décision doit lui-même évoluer |
| **Méthodologie** | Comment fait-on le travail au quotidien ? | Les règles opérationnelles changent |
| **ADR** | Pourquoi cette décision spécifique a-t-elle été prise ? | Jamais — un ADR est un artefact historique immuable |

## Test pratique

- "Cela ne devrait jamais être violé, quelle que soit la situation" → **Constitution**
- "Cela gouverne comment nous prenons les décisions" → **Gouvernance**
- "C'est une règle pour le travail quotidien" → **Méthodologie**
- "C'est la trace d'une décision que nous avons prise" → **ADR**

## Ce que GOUV-001 ne fait pas

GOUV-001 ne dit pas quelles décisions prendre.

Il dit comment les prendre.

Il ne remplace pas le jugement — il le structure.

---

# VII. Les limites connues de ce document

Tout système de gouvernance a des angles morts. Voici ceux de GOUV-001 au moment de sa rédaction.

**Limite 1 — Un seul décideur.** Le Product Owner décide seul. Aucun mécanisme ne le challenge sur des décisions qu'il prendrait sans consultation. Dans une équipe humaine, ce risque est mitigé par la délibération collective. Dans notre configuration, il est mitigé uniquement par la rigueur de la revue adversariale.

**Limite 2 — L'IA comme proposant et réviseur.** La revue adversariale conduite par la même entité qui a produit l'ADR a une limite intrinsèque. Cette limite est structurelle et assumée. Elle est compensée par l'explicitation de la posture, mais pas éliminée.

**Limite 3 — Registre d'observations.** Les signaux en cours d'accumulation (1/3, 2/3) sont enregistrés dans `05 - Workspace/REGISTRE-OBSERVATIONS.md`, pour qu'ils survivent aux changements de session plutôt que de vivre uniquement dans la mémoire conversationnelle.

**Limite 4 — Pas de détection automatique de divergence.** Quand le code diverge du KS, aucun mécanisme automatique ne le détecte au niveau de la gouvernance. La vérification d'alignement (Étape 10) est manuelle.

Ces limites ne sont pas des raisons de rejeter GOUV-001. Elles sont des signaux pour ses futures évolutions.

---

# VIII. Principes de gouvernance

Trois principes synthétisent ce document.

**Une décision n'est pas validée parce qu'elle semble juste. Elle est validée parce qu'elle a résisté à une tentative sérieuse de la réfuter.**

**Trois occurrences d'un symptôme ne constituent pas trois occurrences du même problème. La cause racine doit être vérifiée avant toute ADR.**

**Approuver n'est pas valider. Valider n'est pas décider. Ces trois opérations sont distinctes et ne peuvent pas être substituées l'une à l'autre.**

---

# Critères d'acceptation de GOUV-001

GOUV-001 s'applique à lui-même.

Ce document a été soumis à une revue adversariale avant sa rédaction finale.

Les attaques suivantes ont été tentées et n'ont pas abouti à un rejet :

- "Ce document crée une régression infinie — P20 doit se valider lui-même" → la circularity est inhérente à tout système de gouvernance cohérent ; GOUV-001 est un axiome de départ explicitement choisi, non un principe dérivé.

- "La revue adversariale peut être jouée superficiellement" → vrai pour tout principe de gouvernance ; GOUV-001 crée un standard, pas un automatisme. Le fait que le standard puisse être imité ne le rend pas inutile.

- "Le seuil entre Niveau 2 et Niveau 3 n'est pas toujours clair" → vrai ; la règle de test ("si la correction impose de modifier au moins deux Engines ou deux Features") est une heuristique, pas une frontière absolue. Les cas limites sont tranchés par le Product Owner.

Ces trois attaques n'invalident pas GOUV-001. Elles en constituent les limites connues.
