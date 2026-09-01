---
id: ADR-008
title: La signature produit comme second critère d'évaluation — amende l'Article IV (DEC-009)
type: adr
status: rejected
version: "1.0"
created: 2026-07-10
updated: 2026-07-10
owner: product-owner
niveau_gouvernance: 4 — Fondateur (GOUV-001)
tags: [adr, constitution, article-iv, ataraxia, signature-produit]
amende: []
superseded_by: [DEC-036]
date_revisitation: n/a — ADR rejetée, close le sujet
---

# ADR-008 — La signature produit comme second critère d'évaluation

---

# Statut

🔴 **Rejetée par le Product Owner (10/07/2026).** Décision explicite : la charge mentale reste le **principe directeur unique** de la Constitution (DEC-009, non amendé). Aucun second critère constitutionnel n'est introduit.

Le Product Owner a précisé l'intention réelle derrière sa demande initiale, plus étroite que ce que cette ADR avait anticipé : il ne s'agissait pas de rechercher l'originalité pour elle-même, mais de rendre perceptible, dans les espaces d'accueil et d'orientation, la relation déjà actée par l'Article I — La Relation (DEC-012) : *Fiscal AI prépare le travail de l'utilisateur, il ne lui demande jamais de s'organiser lui-même.* La différenciation du produit doit être une **conséquence** de cette relation correctement exprimée, jamais un objectif poursuivi pour lui-même.

Cette clarification est enregistrée par **DEC-036**, qui étend l'Article I plutôt que d'amender l'Article IV — voir ce document pour la décision retenue. La présente ADR est conservée comme trace du raisonnement qui a mené à écarter la voie du "second principe constitutionnel", conformément à GOUV-001 (« un ADR est un artefact historique immuable »).

---

# 1. Le problème

## 1.1 Ce qui est en tension, textuellement

L'Article IV (03 - Principes de conception) pose un **"Principe directeur unique validé"** (DEC-009) : "Toutes les décisions produit devront être évaluées selon leur capacité à réduire la charge mentale de l'utilisateur."

Le principe désormais exprimé par le Product Owner ajoute une condition supplémentaire, non subordonnée dans sa formulation actuelle : une solution peut satisfaire pleinement ce critère unique et être malgré tout jugée insuffisante si elle manque de signature différenciante. Le mot "unique" cesse d'être exact si un second critère devient, lui aussi, une condition de suffisance.

## 1.2 Le cas concret qui rend le problème réel, pas théorique

Lors de l'exploration du Chapitre 2 (10/07/2026), le concept "liste verticale" a été identifié comme la solution la plus sûre en charge mentale — lisible d'un seul regard, sans second axe de scroll, la moins coûteuse à exécuter correctement. Elle a aussi été explicitement écartée comme signature, parce que sa forme est proche d'un registre déjà vu ailleurs. Sous le principe actuel (DEC-009 seul), rien n'interdisait de la retenir. Sous le nouveau principe, tel qu'énoncé, elle devient insuffisante par construction — alors même qu'elle gagnerait le critère qui était, jusqu'ici, l'unique étoile polaire du produit.

## 1.3 La deuxième tension, avec DEC-019

DEC-019 (Design Language) pose : "Fiscal AI ne cherche jamais à impressionner, il cherche à rassurer." Un principe qui exige la reconnaissabilité immédiate et rejette toute solution "réutilisable telle quelle" peut, sans garde-fou, glisser vers la recherche de spectacle — exactement ce que la métaphore de la roue (DEC-034, révisée par ADR-007) a illustré : différenciante, mémorable, et structurellement fragile parce que construite pour se faire remarquer plutôt que pour servir.

---

# 2. Options envisagées

## Option A — Adopter le nouveau critère tel quel, sans hiérarchie explicite

**Avantages :** fidélité littérale à la formulation du Product Owner.
**Inconvénients :** laisse deux critères de suffisance en conflit potentiel non arbitré ; ouvre la porte à ce que "signature" justifie une solution plus complexe cognitivement, ce que rien dans le texte actuel n'empêche explicitement.
**Rejetée** : une ADR qui documente une contradiction sans la résoudre n'est pas une décision, c'est un constat.

## Option B — Rejeter le nouveau critère, maintenir DEC-009 comme unique étoile polaire

**Avantages :** aucune ambiguïté, cohérence totale avec le texte existant.
**Inconvénients :** ignore une intention explicitement exprimée par le Product Owner, sans justification suffisante pour l'écarter — le besoin de différenciation est réel et documenté par plusieurs sessions de travail sur la métaphore du Chapitre 2.
**Rejetée** : ne répond pas à la demande, se contente de protéger le texte existant contre toute évolution.

## Option C — Hiérarchiser explicitement : charge mentale = contrainte dure, signature = critère d'optimisation subordonné

La charge mentale reste la condition nécessaire, jamais négociable — aucune solution qui l'augmente ne peut être retenue au nom de la différenciation. Entre plusieurs solutions qui la satisfont de façon équivalente, la plus différenciante est préférée. La différenciation ne peut jamais se substituer à la réduction de charge mentale ; elle ne s'exerce qu'à l'intérieur de ce qui la respecte déjà.

**Avantages :** résout la contradiction textuelle sans rejeter l'intention du Product Owner ; rend la règle applicable de façon reproductible (elle donne un ordre de priorité explicite en cas de conflit, condition posée par GOUV-001 §V pour toute décision de Niveau 4) ; reste cohérente avec DEC-019 si on y ajoute la clause de la relation (section 3).
**Inconvénients :** demande de renoncer à la formulation littérale du Product Owner ("même si elle respecte les autres principes UX" laisse entendre une suffisance indépendante) — nécessite sa confirmation explicite plutôt qu'une application automatique.

**Recommandée**, sous réserve de la décision du Product Owner en section 3.

---

# 3. Décision proposée (en attente de confirmation)

## Le principe directeur devient double, hiérarchisé

1. **Critère nécessaire, non négociable : la charge mentale.** Aucune décision produit ne peut l'augmenter au nom de la différenciation. C'est la reformulation exacte de DEC-009 — non affaiblie par cette ADR.
2. **Critère d'optimisation, subordonné : la signature produit.** Entre plusieurs solutions satisfaisant également le premier critère, celle qui constitue une interaction immédiatement reconnaissable comme appartenant à Fiscal AI est préférée. Une solution directement transposable telle quelle dans un SaaS générique doit être considérée comme perfectible, pas comme automatiquement rejetée si aucune alternative ne fait mieux sur le premier critère.

## Le garde-fou contre la dérive vers le spectacle

La signature doit venir de **la relation** que le produit entretient avec le client (ce qu'il fait pour lui, sans qu'il ait à le demander), jamais du **spectacle** (une forme qui se remarque pour elle-même). Test opérationnel, à appliquer à toute proposition future : *"Ce qui différencie cette solution, est-ce un service que personne d'autre ne rend, ou une apparence que personne d'autre n'a choisie ?"* Seule la première réponse valide la signature au sens de cette ADR — cohérent avec DEC-019.

## Renommage de l'Article IV

Le "Principe directeur unique validé" (03 - Principes de conception) doit être renommé pour ne plus affirmer une unicité qui ne serait plus exacte, tout en gardant explicite la hiérarchie entre les deux critères — pas deux étoiles polaires égales, une contrainte et une optimisation.

---

# 4. Revue adversariale

*Posture : Principal AI Architect, mandat de trouver les raisons de rejeter cette ADR.*

**Attaque 1 — "Subordonner la signature à la charge mentale revient à la vider de sa portée : en pratique, la charge mentale gagnera toujours, et le nouveau critère ne changera jamais aucune décision."**
Partiellement fondée. C'est un risque réel si "équivalence" sur le premier critère est interprétée trop strictement (deux solutions sont rarement rigoureusement égales en charge mentale). Mitigation nécessaire, non résolue par cette ADR seule : accepter qu'une différence marginale et mesurée de charge mentale (pas une dégradation significative) puisse être compensée par un gain de signature important — sans quoi le Product Owner a raison de soupçonner que le critère reste cosmétique. Cette marge d'appréciation devra être tranchée cas par cas, consciemment, pas mécaniquement.

**Attaque 2 — "Le test relation/spectacle est lui-même subjectif et peut être retourné pour justifier n'importe quoi."**
Non réfutée entièrement. Comme tout test qualitatif de ce Knowledge System (cf. JUDGEMENT_STANDARDS), il dépend du jugement de qui l'applique. Il n'élimine pas l'arbitraire, il le rend explicite et discutable — ce qui est la fonction que ce type de test remplit déjà ailleurs dans le projet (ex. la colonne "Ce qu'il dit" du Language System).

**Issue de la revue :** aucune faille fatale. Un point de vigilance (Attaque 1) documenté, à surveiller lors de l'application, pas résolu par la règle elle-même.

---

# 5. Pré-mortem

**Hypothèse d'échec la plus probable :** dans six mois, "c'est pour la signature" devient l'argument qui fait accepter une complexité supplémentaire à chaque revue de sprint, la hiérarchie de la section 3 étant citée en principe mais non appliquée en pratique faute d'un exemple concret de refus. **Mitigation :** le premier cas où ce principe s'applique réellement (la forme visuelle du Chapitre 2, laissée ouverte par ADR-007) doit documenter explicitement, dans son propre ADR ou DEC, une solution rejetée précisément parce qu'elle dégradait la charge mentale au nom de la signature — pour que la hiérarchie ait un précédent concret, pas seulement un texte.

---

# 6. Conséquences

## Si acceptée

- L'Article IV (03 - Principes de conception) est mis à jour : le principe n'est plus qualifié d'"unique", la hiérarchie à deux niveaux y est inscrite.
- Toute future évaluation de travaux sur le Dashboard (et, par extension du texte du Product Owner, potentiellement au-delà) applique les deux critères dans cet ordre.
- Le test relation/spectacle devient un outil de revue explicite, à appliquer aux futures propositions (y compris la forme visuelle du Chapitre 2, encore ouverte).

## Hors périmètre

- Cette ADR ne tranche pas si le nouveau critère s'applique uniquement au Dashboard (formulation initiale du Product Owner) ou à l'ensemble du produit (formulation plus générale de son message). Cette portée doit être explicitée par le Product Owner au moment de la décision.

---

# Conclusion

Le principe que vous avez formulé est légitime et documenté par l'expérience réelle de ce projet (quatre tentatives infructueuses sur le Chapitre 2 avant la table). Il ne peut cependant pas être ajouté tel quel au Knowledge System sans entrer en contradiction ouverte avec le mot "unique" de DEC-009 et avec l'esprit de DEC-019. Cette ADR propose de le rendre cohérent en le subordonnant, pas en l'amoindrissant — la décision finale, y compris sur la marge d'appréciation de l'Attaque 1, reste au Product Owner.
