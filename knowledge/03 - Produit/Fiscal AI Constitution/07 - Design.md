Version : 0.2

Statut : 🟡 Draft — mis à jour le 10/07/2026 (DEC-026 à DEC-032, sprint UX-001), correspond à l'Article VII de la Fiscal AI Constitution

---

# Décision validée (DEC-014)

Le dashboard disparaît.

L'accueil devient un parcours, composé de trois chapitres plein écran.

---

# Convergence avec UXP-004 (résolue le 08/07/2026 — DEC-018)

[UXP-004 — Le Parcours d'Accueil](../../UX/UXP-004%20—%20Le%20Dashboard.md) *(anciennement « Le Dashboard »)* portait déjà, en v1.0, le « directeur de mission » du client — situation, raison, action, suite, une seule action prioritaire, ne jamais exposer un vide. Le Product Owner a tranché (DEC-018) : la disparition du Dashboard classique (DEC-014) est une **évolution de ce concept**, pas un conflit fonctionnel.

UXP-004 a été mis à jour en v2.0 : il décrit désormais cette même mission portée par les trois chapitres de cet article, avec le Chapitre 1 — Le Conseiller comme porteur principal de la mécanique situation → raison → action → suite. Aucune duplication ne subsiste (Principe 7 de la [Constitution du Cerveau Fiscal AI](../../00%20-%20Governance/Constitution%20du%20Cerveau%20Fiscal%20AI.md)).

---

# Principes validés

## Chapitre 1 — Le Conseiller

Le Chapitre 1 est un accueil, pas un espace de travail : il accueille, rassure, explique, recommande. Il ne lance jamais directement une page métier (DEC-026) — le bouton principal fait défiler vers le Chapitre 2, il n'ouvre jamais Activité, Logement ou une autre page métier.

Deux cartes, deux responsabilités non interchangeables (DEC-028) : une carte principale, unique point focal, qui répond à « Que faisons-nous maintenant ? » ; une carte Conseiller, plus petite et plus discrète, qui répond à « Que dois-je savoir ? » sans jamais reformuler la priorité déjà annoncée. Les deux proviennent d'une source unique de vérité — jamais deux calculs indépendants pouvant diverger.

Le Conseiller observe avant de répondre (DEC-027) : il s'exprime par une observation proactive sur le dossier, jamais par une question ouverte du type « Que souhaitez-vous faire ? ». C'est la relation de l'Article I rendue perceptible (DEC-036) : Fiscal AI prépare, l'utilisateur ne s'organise jamais lui-même.

Beaucoup de vide. Le scroll emmène naturellement au chapitre suivant.

## Chapitre 2 — Les Espaces de travail

Les cartes deviennent des espaces.

Le Chapitre 2 raconte la progression réelle du dossier, il ne décide plus de la priorité (DEC-029, révise la logique « carte active unique » posée initialement dans cet article et confirmée par DEC-023). Une étape devient accessible dès qu'elle est atteinte dans le parcours recommandé, puis le reste définitivement — l'utilisateur peut y revenir, corriger, compléter. Le Conseiller (Chapitre 1) continue de recommander la priorité du moment ; le Chapitre 2 se contente de la montrer, sans jamais empêcher l'accès à ce qui a déjà été découvert.

Sa représentation visuelle obéit au principe fixé par ADR-007 (révise DEC-034) : la carte centrale ne représente plus « l'étape suivante » d'une séquence, mais le sujet que le Conseiller décide de poser devant l'utilisateur maintenant ; les autres sujets du dossier restent au repos, jamais énumérés dans leur totalité. Seuls cinq gestes sont autorisés — présenter, rapprocher, retirer, ranger, rappeler — jamais tourner, glisser ou constituer un carrousel. La forme visuelle exacte (cercle, table, ou autre) reste volontairement ouverte ; voir ADR-007 pour le raisonnement complet.

## Chapitre 3 — Le Coffre-fort Fiscal AI

Les documents sont présentés dans un environnement évoquant immédiatement la sécurité.

Ne jamais représenter un coffre-fort. Évoquer la sécurité par la matière, les mots et la construction visuelle.

Le chapitre raconte la confiance (protection, confidentialité, conservation) avant de montrer les documents (DEC-030). Les documents sont regroupés par exercice fiscal ; les onglets par exercice n'apparaissent qu'à partir du moment où plusieurs exercices existent réellement — jamais d'onglet vide dès la première année.

---

# Documents associés

Cet article s'appuie sur des documents dédiés, pour respecter le Principe 7 (une décision, un seul endroit) :

- [Design Language](Design%20Language.md) — document fondateur, guide d'intention : comment penser chaque écran (08/07/2026, DEC-019).
- [Language System](Language%20System.md) — l'intention de chaque composant.
- [Color Philosophy](Color%20Philosophy.md) — la signification des couleurs.
- [Scroll Narrative](Scroll%20Narrative.md) — le principe du scroll comme changement de contexte, et l'intention de chaque chapitre (Comprendre / Agir / Retrouver).
- [Visual References](Visual%20References/) — emplacements de maquettes d'inspiration, jamais des spécifications.

---

# À compléter

La manière dont le Chapitre 3 évoque concrètement la sécurité « par la matière, les mots et la construction visuelle » — au-delà de l'interdiction de représenter un coffre-fort littéral — n'a pas été détaillée au-delà de ce qui figure dans Color Philosophy. À enrichir lors d'une prochaine séance plutôt que d'être complété par interprétation.
