

Version : 1.0

Statut : 🔒 Référence d'architecture

---

# Objectif

Définir les principes fondamentaux de l'architecture de Fiscal AI.

Ce document constitue la référence absolue pour toute conception et tout développement.

Si une implémentation entre en contradiction avec ce document, c'est l'implémentation qui doit être modifiée.

---

# Principe 1 — Séparation des responsabilités

Chaque composant possède une responsabilité unique.

Aucun moteur ne doit réaliser le travail d'un autre moteur.

---

# Principe 2 — Le Workflow orchestre

Le Workflow Engine est le seul moteur autorisé à piloter l'exécution des autres moteurs.

Aucun moteur ne peut appeler directement un autre moteur.

Toute orchestration passe exclusivement par le Workflow Engine.

---

# Principe 3 — Les moteurs sont spécialisés

Chaque Engine est expert dans un domaine précis.

Un moteur ne peut pas élargir son périmètre fonctionnel pour "rendre service".

---

# Principe 4 — Les moteurs sont indépendants

Chaque moteur doit pouvoir évoluer indépendamment.

Une modification d'un moteur ne doit pas nécessiter de modifier les autres moteurs.

---

# Principe 5 — Les Rules contiennent la connaissance métier

Toute logique fiscale appartient exclusivement aux Rules.

Les Engines exécutent.

Les Rules décident.

---

# Principe 6 — Les données avant les calculs

Aucun calcul n'est autorisé tant que les données nécessaires ne sont pas validées.

---

# Principe 7 — Une seule source de vérité

Une décision n'existe qu'à un seul endroit dans Obsidian.

Toute duplication est interdite.

Une note complète toujours une autre.

Elle ne la remplace jamais.

---

# Principe 8 — Les événements pilotent le système

Les moteurs communiquent exclusivement au moyen d'événements.

Aucun moteur ne possède une connaissance interne du fonctionnement d'un autre moteur.

---

# Principe 9 — Les moteurs ignorent l'interface

Les Engines ne connaissent jamais :

- les écrans ;
    
- les boutons ;
    
- les composants graphiques ;
    
- l'expérience utilisateur.
    

Ils manipulent uniquement des données et des événements.

---

# Principe 10 — L'IA n'est jamais une source de vérité

Claude Code, Cursor ou toute autre IA peuvent proposer.

Ils ne décident jamais.

Toute décision devient officielle uniquement après validation et intégration dans Obsidian.

---

# Principe 11 — Les composants sont déterministes

À données identiques,

Fiscal AI doit toujours produire le même résultat.

Aucun moteur ne doit produire un comportement aléatoire.

---

# Principe 12 — Le cerveau précède le code

Le code n'est jamais la référence.

Obsidian est la référence.

Le code implémente les décisions du cerveau.

Jamais l'inverse.

---

# Principe 13 — Le MVP avant tout

Toute conception doit répondre au besoin du MVP.

Les fonctionnalités futures ne doivent jamais complexifier le MVP.

---

# Principe 14 — Simplicité maximale

À complexité égale,

la solution la plus simple est toujours privilégiée.

Tout composant inutile doit être supprimé.

---

# Principe 15 — Aucun composant omniscient

Aucun moteur ne possède une vision complète du système.

Chaque moteur ne connaît que :

- sa mission ;
    
- ses entrées ;
    
- ses sorties.
    

Le Workflow est le seul à connaître le parcours global.

---

# Principe 16 — Le diagnostic précède la demande

Une étape ne doit jamais commencer par l'hypothèse que l'utilisateur possède un document, une information ou une connaissance particulière.

Elle doit commencer par établir la situation réelle de l'utilisateur.

Cette règle s'applique à toute Feature impliquant une collecte d'information auprès de l'utilisateur.

---

# Principe 17 — Une Feature se définit par son objectif, pas par son moyen

Une Feature est définie par le Job To Be Done qu'elle accomplit pour l'utilisateur.

Les documents, API, formulaires ou saisies manuelles ne sont jamais l'objectif. Ce sont des moyens interchangeables d'atteindre cet objectif.

Toute spécification de Feature qui fige un moyen unique sans justification est incomplète.

---

# Principe 18 — Le parcours n'appartient à aucun Engine

Aucun Engine ne décide de l'ordre, de la formulation ou de l'existence d'une étape du parcours utilisateur.

Les Engines fournissent des capacités. Le parcours les mobilise à sa convenance.

Ce principe complète le Principe 9 : les moteurs ignorent l'interface, et réciproquement, l'interface ne dépend jamais de la structure interne des moteurs.

---

# Principe 19 — Le chemin de moindre friction prévaut

Lorsque plusieurs moyens permettent d'atteindre le même objectif utilisateur, le produit privilégie systématiquement celui qui demande le moins d'effort, de connaissance ou de document à l'utilisateur.

Le moyen le plus simple à implémenter n'est pas nécessairement le moyen à privilégier. C'est le moyen le plus simple pour l'utilisateur qui prévaut.

---

# Critères de validation

Toute nouvelle note doit respecter l'ensemble de ces principes.

Avant de créer une note, les quatre questions suivantes doivent recevoir une réponse positive :

- Claude ne peut pas déduire cette information seul.
    
- Cette décision n'existe pas déjà ailleurs.
    
- Cette information sera réutilisée par plusieurs Features ou plusieurs Engines.
    
- Sans cette note, Claude risque une erreur d'architecture, de conception ou de métier.
    

Si l'une de ces réponses est négative, la note ne doit pas être créée.