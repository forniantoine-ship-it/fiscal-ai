Version : 0.2

Statut : 🟡 Draft — premier jet, séance du 08/07/2026, support de l'Article VII — Design et du [Design Language](Design%20Language.md)

---

# Origine

Ce document naît de la séance fondatrice du 08/07/2026, en complément de l'Article VII — Design de la Fiscal AI Constitution (cf. DEC-014).

---

# Principe directeur

Chaque composant possède une intention.

Chaque composant représente une étape de la conversation. Jamais une simple boîte graphique.

---

# Composants validés

| Composant | Intention | Ce qu'il dit à l'utilisateur |
|---|---|---|
| **Hero** | La conversation. | — |
| **Workspace Card** | Un espace de travail. | « Voici vos espaces de travail. » |
| **Vault** | Le coffre documentaire. | « Vos documents sont protégés. » |
| **Action Button** | La décision principale. | « C'est ici que je vous accompagne. » |
| ~~**Timeline**~~ | ~~Le parcours.~~ *(obsolète, voir ADR-007)* | — |

⚠ **« Timeline » est un nom obsolète depuis ADR-007 (10/07/2026, Niveau 4 — Fondateur)** : ce composant présupposait une séquence temporelle, contraire au principe retenu pour le Chapitre 2 (la carte centrale représente ce que le Conseiller pose devant l'utilisateur, pas une position dans un ordre). Un nouveau nom et une nouvelle formulation « Ce qu'il dit » devront être posés au moment où la forme visuelle définitive du Chapitre 2 sera tranchée — non anticipés ici par interprétation.

La colonne « Ce qu'il dit » (DEC-019, 08/07/2026) est le test de validation d'un composant : s'il ne peut pas être résumé par une phrase que l'utilisateur comprendrait, son intention n'est pas assez claire. Hero n'a pas reçu de formulation explicite pendant la séance — à compléter plutôt que d'être interprété.

---

# À compléter

Les spécifications visuelles opérationnelles de chaque composant (états, tailles, comportements) ne sont pas traitées par ce document, par construction : conformément au Claude-Handoff, aucune spécification finale ne doit être produite avant la validation du premier écran. Ce document reste au niveau de l'intention, pas de l'implémentation.

Les formulations « Ce qu'il dit » pour Hero et Timeline restent à valider lors d'une prochaine séance.
