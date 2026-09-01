# Sprint 001A — Convergence Runtime ↔ Wizards (CLÔTURÉ le 07/07/2026)

Nom

Convergence Runtime ↔ Wizards

Objectif

Faire fonctionner le parcours utilisateur complet sans utiliser les pages /assistants.

Travaux réalisés le 07/07/2026 (clôture)

- Migration du Knowledge System (Obsidian → dépôt Git)
- Nettoyage Cursor
- Alignement MCP
- Gouvernance (DEC-007 à DEC-011, ouverture de la Fiscal AI Constitution)

Interdictions respectées

Pas de refactoring global.

Pas de nouvelle feature.

Pas de dette technique.

---

# Sprint — Product Identity (CLÔTURÉ le 08/07/2026)

Objectif

Construire la Constitution de Fiscal AI avant la refonte de l'expérience utilisateur.

Travaux réalisés le 07/07/2026

✓ Pourquoi nous existons

✓ Personnalité

✓ Principes de conception

✓ Parcours émotionnel

Travaux réalisés le 08/07/2026

✓ La Relation (Article I)

✓ La Conversation (Article VI)

✓ Design — Langage Visuel (Article VII)

✓ Design Language (Language System, Color Philosophy)

✓ Experience System (Scroll Narrative)

✓ Visual References (emplacements vides)

✓ UXP-004 fait évoluer en v2.0 (Dashboard → parcours narratif à trois chapitres), philosophie conservée

✓ Design Language (document fondateur, DEC-019/DEC-020) : guide d'intention — une intention par écran, le vide comme outil, typographie, illustrations fonctionnelles, animations qui expliquent, le conseiller sans avatar, question finale de validation

✓ Clôture de séance (DEC-021 à DEC-025) : le conseiller omniprésent et intégré à l'interface, les illustrations contextuelles par page, ratification des trois chapitres comme structure officielle, Constitution Produit v1 déclarée terminée

Travaux non repris dans ce sprint (transférés)

- Article VIII — Gouvernance produit (hors périmètre v1, à confirmer — voir DEC-024)

Interdictions respectées

Aucune implémentation UI n'a été réalisée avant la fin de ce sprint.

---

# Sprint UX-001 — Le Conseiller (OUVERT le 08/07/2026)

Objectif

Concevoir et implémenter le premier chapitre de l'expérience utilisateur.

Livrable

Le premier écran complet (Acte I — Le Conseiller).

Ordre des travaux (DEC-025)

1. UX
2. UI
3. PRD
4. Développement
5. Validation

Interdiction absolue

Aucun autre écran ne doit être développé avant la validation du premier écran.

## Avancement — 10/07/2026

Étape UX close pour le Chapitre 1, à l'issue d'un audit UX puis de plusieurs allers-retours de challenge avec le Product Owner (DEC-026 à DEC-032) : rôle de l'Accueil clarifié, rôle du Conseiller clarifié (présence qui observe, jamais un menu), rôles distincts des deux cartes avec source unique de vérité, direction artistique validée.

Deux clarifications structurelles ont dû être étendues aux Chapitres 2 et 3 pour que le Chapitre 1 reste cohérent avec le reste du parcours (abandon de la logique carte active/inactive au profit d'un modèle de progression — DEC-029 ; coffre-fort documentaire avec récit de confiance et regroupement par exercice — DEC-030). **Ces clarifications sont des principes actés, pas une implémentation** : conformément à l'interdiction absolue ci-dessus, seul le Chapitre 1 passe en phase UI/développement à ce stade. Les Chapitres 2 et 3 restent non développés au-delà de ce qui existe déjà.

Le sprint entre maintenant dans sa phase UI pour le Chapitre 1 (étape 2 de l'ordre des travaux DEC-025).

Le scroll narratif (DEC-033) est resserré (`scrollSnapType: mandatory`) uniquement entre Chapitre 1 et Chapitre 2. Deux sujets sont explicitement reportés à un futur sprint dédié au Coffre-fort : le passage du Chapitre 3 en panneau plein écran, et le scroll interne « façon Apple » pour tout chapitre dont le contenu dépasse la hauteur du viewport.

## Révision de principe — 10/07/2026 (ADR-007)

La représentation du Chapitre 2 validée en sprint (roue de progression, DEC-034) est révisée avant toute implémentation réelle — aucun code de la roue n'avait été construit, seule la décision de principe existait. ADR-007 (Niveau 4 — Fondateur) remplace le mécanisme de rotation par un principe plus abstrait : la carte centrale représente ce que le Conseiller pose devant l'utilisateur maintenant, cinq gestes seulement sont permis (présenter, rapprocher, retirer, ranger, rappeler), la forme visuelle définitive (table, cercle, autre) reste ouverte et devra être confirmée explicitement par le Product Owner avant tout prompt d'implémentation détaillé. Voir ADR-007 pour le raisonnement complet, la revue adversariale et le pré-mortem.

## Clôture partielle — 10/07/2026 (suite)

DEC-035 à DEC-039 et ADR-008/ADR-009 actent la direction Chapitre 2 (relation, émotion, architecture six couches). Voir DECISIONS.md.md.

> ⚠ **Historique** : à cette date, l'interdiction absolue « Chapitre 1 seul » était encore en vigueur. Elle a été dépassée en septembre 2026 par l'implémentation du dashboard narratif complet — voir sprint courant ci-dessous.

---

# Sprint `dashboard-narrative-premium` (EN COURS — branche active au 01/09/2026)

Branche : `sprint/dashboard-narrative-premium`

Objectif

Livrer et valider le parcours d'accueil narratif trois chapitres sur `/dashboard`, en cohérence avec la Constitution et les ADR, tout en durcissant le tunnel déclaration et la fiabilité documentaire.

## Livré sur la branche (commits poussés `09ec232` → `32b184b`)

✓ Dashboard narratif trois chapitres (`09ec232`)

- Chapitre 1 — Le Conseiller : deux cartes (ratio ~70/30), bouton principal scroll vers Chapitre 2, `resolveDashboardHeroState` comme source unique hero
- Chapitre 2 — Espaces de travail : carousel workflow premium (`workflow-carousel-engine`) avec modèle de progression
- Chapitre 3 — Coffre-fort : `VaultSection` avec récit de confiance et liste documentaire
- Scroll narratif : `FullHeightChapters`, snap mandatory entre chapitres

✓ Pipeline déclaration / validation (`72e6750`)

- Gate génération F-006/F-007 (`declaration-generation-gate`)
- Persistance RFS sur le draft
- Résumé client PDF + export liasse texte (pas le PDF officiel)

✓ OCR document text (`61edcdf`)

✓ Charges / taxe foncière (`7ec564c`)

✓ Parité complétude F-009 — `inpiConfirmedAt` (`32b184b`)

✓ Lab scène conseiller — `/lab/advisor-scene` (`2120f58`)

- Prototype ADR-009 : Composition Strategy, Lighting System, Motion Engine, gestures
- Isolé du dashboard production et du tunnel navigation

## En validation / dette connue

🟡 Chapitre 2 production : carousel transitoire en tension avec ADR-007 (cible = scène ADR-009, explorée dans le lab)

🟡 Chapitre 3 : pas encore de regroupement par exercice fiscal ni d'onglets conditionnels (DEC-030 partiel)

🟡 Conversation System : contenus et ton du Conseiller encore partiellement hérités du tunnel (DEC-031 toujours ouvert)

🟡 Convergence Runtime ↔ Wizards : routes `/assistants/*` toujours actives depuis le workflow

🔴 PDF officiel téléchargeable, paiement, télétransmission

## Prochaines priorités (ordre indicatif, non planifié en dates)

1. Revue produit du dashboard narratif trois chapitres (alignements Ch1, écart Ch2, gaps Ch3).
2. Décider du chemin Ch2 : itérer le carousel, migrer vers le lab ADR-009, ou hybride.
3. Poursuivre convergence tunnel sans régression sur la source unique `inpiConfirmedAt`.
4. Pousser le commit knowledge normatif `986ea26` quand le bloc pilotage sera validé.

## Références

- ADR-007 — gestes Chapitre 2, pas de carousel comme modèle final
- ADR-009 — architecture six couches (lab)
- UXP-004 v2.3 + section « État d'implémentation — septembre 2026 »
- PROJECT_STATE.md.md — synthèse technique au 01/09/2026