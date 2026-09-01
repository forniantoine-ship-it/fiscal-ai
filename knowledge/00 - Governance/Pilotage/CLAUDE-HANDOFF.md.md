# HANDOFF

Session

01/09/2026

## Reprise agent — état du dépôt au 01/09/2026

### Git

| Élément | Valeur |
|---|---|
| Branche active | `sprint/dashboard-narrative-premium` |
| HEAD local | `986ea26` — `docs(governance): add ADR-007–009 and Fiscal AI Constitution v1` |
| `origin/sprint/dashboard-narrative-premium` | `32b184b` — **6 commits code en retard sur HEAD** |
| Avance locale | **1 commit** (knowledge normatif `986ea26`, non poussé) |
| Commits sur la branche depuis `ac9eb55` | **7** au total (6 poussés + 1 local knowledge) |

**Ne pas confondre** : `986ea26` est le HEAD local ; le remote est encore à `32b184b`. Les six commits code ci-dessous sont déjà sur `origin` ; seul `986ea26` est en avance locale.

### Six commits code poussés (`09ec232` → `32b184b`)

1. `09ec232` — dashboard narratif 3 chapitres + carousel Ch2 + vault Ch3
2. `61edcdf` — OCR / document text hardening
3. `72e6750` — déclaration : gate F-006/F-007, RFS, exports client
4. `7ec564c` — charges / taxe foncière
5. `2120f58` — lab `/lab/advisor-scene` (ADR-009)
6. `32b184b` — parité complétude F-009 (`inpiConfirmedAt`)

### Working tree (non committé au 01/09/2026)

Modifiés : fichiers pilotage + UXP-004 (synchronisation septembre), `activite-product.ts`, `engine/index.ts`, `knowledge/.obsidian/workspace.json`

Non trackés : `.claude/`, `scripts/`, `CHATGPT_HANDOFF.md`

Staging : vide

### Déjà livré sur la branche

- `/dashboard` : trois chapitres plein écran (Conseiller, workflow carousel, coffre-fort)
- Chapitre 1 aligné DEC-026–028 : scroll vers Ch2, deux cartes, `resolveDashboardHeroState`
- Pipeline déclaration/validation avec exports intermédiaires (PDF résumé client, liasse `.txt`)
- Lab scène conseiller isolé (`/lab/advisor-scene`) conforme à l'architecture ADR-009
- Test parité `inpiConfirmedAt` cross-consumers (dashboard, dossier-status, etc.)

### Dettes connues

- **Chapitre 2** : carousel production (`workflow-carousel-engine`) = étape transitoire, pas le modèle final ADR-007 ; cible explorée dans le lab ADR-009
- **Chapitre 3** : pas de regroupement par exercice fiscal (DEC-030 incomplet)
- **Convergence** : routes `/assistants/*` toujours utilisées depuis le workflow
- **Exports** : PDF officiel 🔴 ; paiement 🔴
- **Knowledge** : pilotage + UXP-004 synchronisés au 01/09/2026 (modifications locales non committées) ; commit normatif `986ea26` non poussé

### Prochaine étape recommandée

1. Finaliser et committer le bloc pilotage + UXP-004 synchronisé (après relecture).
2. Pousser `986ea26` puis le commit pilotage quand validé.
3. Revue produit dashboard : valider Ch1, trancher dette Ch2 (carousel vs migration lab ADR-009).
4. Ne pas toucher ADR-007/008/009 ni Constitution (`986ea26`) sans décision explicite.

### Documents de référence immédiats

- `PROJECT_STATE.md.md` — état global 01/09/2026
- `CURRENT_SPRINT.md.md` — sprint `dashboard-narrative-premium`
- `UXP-004 — Le Dashboard.md` — intention v2.3 + état d'implémentation septembre
- `DECISIONS.md.md` — DEC-007–039 + note septembre 2026

---

## Historique — session 10/07/2026 (clôture)

Session consacrée à la clôture de l'étape UX du Sprint UX-001 (Acte I — Le Conseiller). Point de départ : un audit UX complet et sans complaisance du dashboard existant (posture Lead Product Designer, sans attachement au travail déjà réalisé), qui a révélé que les trois chapitres racontaient trois histoires visuelles et fonctionnelles différentes plutôt qu'une seule narration continue.

Plusieurs allers-retours de challenge avec le Product Owner ont ensuite convergé vers une architecture stable, actée par DEC-026 à DEC-032 : le Chapitre 1 est redéfini comme un accueil pur (jamais un espace de travail, ne lance jamais de page métier) ; le Conseiller devient une présence qui observe le dossier avant de répondre plutôt qu'un menu de questions déguisé ; les deux cartes du Chapitre 1 ont des rôles distincts et non redondants, issus d'une source unique de vérité ; le Chapitre 2 abandonne la logique carte active/inactive pour un modèle de progression où toute étape atteinte reste accessible ; le Chapitre 3 devient un véritable coffre-fort documentaire avec récit de confiance et regroupement par exercice fiscal.

UXP-004 est mis à jour en v2.1 et l'Article VII — Design en v0.2 pour refléter ces décisions. DEC-023 (« carte active unique ») est explicitement révisée par DEC-029.

## Résumé (08/07/2026, séance précédente)

## Résumé

Cette séance fondatrice, complémentaire à celle du 07/07/2026, s'est terminée sur la clôture complète du chantier Constitution Produit.

L'Article I — La Relation et l'Article VI — La Conversation sont rédigés. L'Article VII — Design est ouvert avec le Langage Visuel du produit : **le dashboard disparaît**, remplacé par un accueil en trois chapitres plein écran (Le Conseiller, Les Espaces de travail, Le Coffre-fort Fiscal AI). Le document fondateur Design Language est créé (guide d'intention, pas un guide UI), avec Language System, Color Philosophy, Scroll Narrative et Visual References en support.

En clôture de séance : le conseiller est confirmé omniprésent (toutes les pages) et intégré à l'interface (jamais un avatar, jamais une fenêtre de chat séparée) ; les illustrations sont contextuelles par page ; les trois chapitres, la carte active unique et le Coffre-fort sont ratifiés comme structure officielle.

**La Constitution Produit v1 est déclarée terminée (DEC-024).** ⚠ Article VIII — Gouvernance produit reste non rédigé, hors périmètre de ce v1 — à confirmer par le Product Owner à la prochaine séance.

Détail : DEC-012 à DEC-025 (DECISIONS.md.md), et `03 - Produit/Fiscal AI Constitution/` (Article I, Article VI, Article VII, Design Language, premier jet).

## Sprints clôturés

- Sprint 001A — Convergence Runtime ↔ Wizards (clôturé le 07/07/2026).
- Sprint — Product Identity (clôturé le 08/07/2026) : Constitution Produit v1 terminée.
- Sprint UX-001 — Le Conseiller (juillet 2026) : étape UX close le 10/07/2026 ; développement dashboard repris en septembre sur `sprint/dashboard-narrative-premium`.

## Sprint actuel (01/09/2026)

**Sprint `dashboard-narrative-premium`** — voir section « Reprise agent » ci-dessus et `CURRENT_SPRINT.md.md`.

> ⚠ **Historique ci-dessous** : les sections « Sprint actuel » et « Interdiction absolue » datent du 10/07/2026 et ne reflètent plus l'état du code depuis `09ec232`.

## Sprint actuel (10/07/2026 — historique)

Objectif : concevoir et implémenter le premier chapitre de l'expérience utilisateur.

Livrable : le premier écran complet (Acte I — Le Conseiller). Aucun autre écran ne doit être développé avant sa validation.

## Prochaine étape du projet

L'étape UX du Chapitre 1 est close (DEC-026 à DEC-032). Le sprint entre dans sa phase UI/développement pour le Chapitre 1 uniquement.

**Ordre des travaux (DEC-025)** :

1. UX ✓ (Acte I, 10/07/2026)
2. UI ← en cours
3. PRD
4. Développement
5. Validation

**Objectif courant : traduire les décisions UX du Chapitre 1 en interface, à partir de l'existant (composants Design System déjà tokenisés, moteur d'état `resolveDashboardHeroState`), sans réinventer ce qui fonctionne déjà.**

## Interdiction absolue

Aucune implémentation UI ne devra être réalisée sur les Chapitres 2 ou 3 avant la validation complète du Chapitre 1.

Les principes structurels de progression (Chapitre 2, DEC-029) et de coffre-fort documentaire (Chapitre 3, DEC-030) sont actés au niveau du Knowledge System mais n'entrent pas dans le périmètre d'implémentation de ce sprint.

Les futurs écrans devront découler de la Constitution, jamais l'inverse.

## Travaux suivants

- Acte I — Le Conseiller : UI puis PRD puis développement puis validation (UX clos le 10/07/2026)
- Chapitre 2 (modèle de progression, DEC-029) et Chapitre 3 (coffre-fort documentaire, DEC-030) : traitement graphique et implémentation, hors périmètre du sprint courant
- Article VIII — Gouvernance produit (hors périmètre v1, à confirmer — DEC-024)

## Point d'attention gouvernance

Ces décisions (DEC-007 à DEC-025) modifient des principes qui gouverneront toutes les décisions produit futures. Selon GOUV-001, cela en fait potentiellement des décisions de Niveau 4 — Fondateur, qui appellent normalement une ADR, une revue adversariale et un pré-mortem avant d'être considérées comme définitivement actées. Elles sont pour l'instant enregistrées telles quelles, à la demande explicite du Product Owner ; une formalisation ultérieure via une ADR de Niveau 4 est recommandée si le temps le permet.

Point additionnel, résolu : DEC-014 (le dashboard disparaît) avait d'abord été traitée comme une contradiction non résolue avec UXP-004. Le Product Owner a tranché (DEC-018) : il s'agit d'une évolution du même concept, pas d'un conflit fonctionnel. UXP-004 a été mis à jour en v2.0 pour décrire le parcours narratif en trois chapitres, en conservant intégralement sa philosophie d'origine.

Point additionnel de clôture : le pourcentage MVP n'a pas été fusionné avec la maturité produit (voir PROJECT_STATE) faute de méthodologie de pondération validée — à confirmer par le Product Owner si un pourcentage global unique est souhaité.

Point additionnel (10/07/2026) : DEC-026 à DEC-032 révisent un principe déjà ratifié en DEC-023 (carte active unique → modèle de progression). Comme pour DEC-007 à DEC-025, ces décisions sont enregistrées telles quelles à la demande explicite du Product Owner, sans ADR de Niveau 4 formelle à ce stade (GOUV-001) ; une formalisation ultérieure reste recommandée si le temps le permet, en particulier parce que DEC-029 modifie un principe déjà confirmé une fois (DEC-023), ce qui est le type de changement que GOUV-001 cherche à tracer explicitement plutôt que par simple accumulation d'entrées.
