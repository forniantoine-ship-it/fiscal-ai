---
id: ADR-012
title: "Contrat F013 v2 : source unique, snapshot v3 et fail-closed"
type: adr
status: pending-decision
version: "1.1"
created: 2026-10-05
updated: 2026-10-05
owner: product-owner
tags: [adr, f013, snapshot, fail-closed, inventaire, multi-biens, lmnp]
triggers: [F013-V2.1, F013-V2.2, F013-V2.2.1, F013-V2.3, F013-HOTFIX-1, F013-V2.4]
éclaire: [F-013, SAV-034, TRF-0036, ADR-011]
---

# ADR-012 — Contrat F013 v2 : source unique, snapshot v3 et fail-closed

# Statut

🟡 **En attente de décision (régularisation).** Les décisions ci-dessous ont **déjà été implémentées dans le code** (F013-V2.1 à V2.4, désactivées en production) avant d'être formalisées ici. Cet ADR les consigne pour qu'elles ne vivent pas uniquement dans des rapports de mission. La revue adversariale, la vérification des conditions A et B de GOUV-001 (occurrences, cause racine commune) et la décision du Product Owner restent à faire. Il ne modifie ni code ni Knowledge approuvé.

# Contexte

Le contrat F013 v1 prend les encaissements comme base des recettes ([[SAV-028 – Les recettes sont les loyers encaissés]], `LEGACY V1 ONLY`). Le contrat cible F013 v2 ([[SAV-034 – Rattachement des loyers à l'exercice (créances et avances)]], [[TRF-0036 – Rattachement des loyers ordinaires à l'exercice (F013 v2)]]) ajoute un état durable par bien et exercice (faits, révision, confirmation) qu'un ancien client ne comprend pas, et plusieurs représentations concurrentes d'une même réalité (créance de clôture au bilan, par exemple).

# Décisions consignées

1. **Source unique de l'inventaire locatif.** `rentReconciliationV2` est l'unique propriétaire éditable des quatre soldes (CO, CC, AO, AC). Le bilan consomme en lecture seule une projection de l'inventaire de clôture. *Alternatives écartées :* un objet `rentalInventory` séparé (second stockage à synchroniser) ; copier CC dans le bilan avec édition indépendante (deux vérités).
2. **Snapshot v3, additif.** Un workspace portant des données F013 v2 (à plat ou par bien) est stocké en schema version 3 ; sans ces données, v1 (mono) et v2 (scopé multi-bien) sont inchangés. Les enrichissements additifs de l'état F013 v2 (observations documentaires, inventaire) restent v3 ; v4 n'est justifiée que par une incompatibilité structurelle.
3. **Anti-downgrade.** Les clients antérieurs (version maximale lue : 2) refusent de lire ou de réécrire du v3 ; la garde client refuse toute baisse de version ; le trigger SQL `lmnp_prevent_snapshot_schema_downgrade` refuse `new.schema_version < old.schema_version` (voir ADR-011). *Preuve distante non rechecked dans ces missions : à vérifier avant toute activation.*
4. **Garde de clôture fail-closed.** Tant que la continuité `CC(N) → CO(N+1)` / `AC(N) → AO(N+1)` n'existe pas, la clôture et la création de N+1 sont refusées pour tout workspace portant F013 v2 (code `f013_v2_continuity_not_supported`), aux niveaux précondition, préparation, orchestrateur client et serveur, y compris à soldes nuls (un zéro transporté sans règle serait un faux marqueur). La clôture d'un dossier v1 est inchangée.
5. **Proposition ≠ validation.** Une donnée extraite ou proposée ne devient jamais validée automatiquement ni au rechargement ; la restauration rejette (sans le promouvoir) un champ `VALIDATED` non justifié par une correction utilisateur.
6. **Autorité de calcul unique.** Le moteur F013 v2 seul calcule les loyers acquis ; aucun autre composant ne reproduit la formule.
7. **Scope de bien.** Une source de revenus scopée à un bien ne contribue qu'à ce bien ; pas d'attribution implicite en multi. Le pont v1 peut être scopé par `propertyId` (HOTFIX-1).
8. **Invalidation sur les faits.** La dépendance des sorties (génération, RFS, liasse) porte sur les faits et la révision, pas sur le total ; elle réutilise le mécanisme d'invalidation existant.

# Hypothèses implicites (à cibler par la revue adversariale)

- Une version de schéma suffit à empêcher un ancien client de détruire des données qu'il ne comprend pas (garde client + trigger SQL **supposé** appliqué à distance).
- Fournir un solde au bilan seulement s'il est validé pour **chaque** bien est le bon niveau d'exigence pour un bilan consolidé.
- Un dossier ayant activé F013 v2 peut rester non clôturable le temps de la tranche de continuité.
- La vue effective du bilan (la valeur de l'inventaire remplace une saisie bilan indépendante de la même nature) est préférable à un verrouillage de la saisie bilan : à confirmer à la bascule.

# Conséquences

- F013 v2 ne peut pas être activé sans (a) la preuve distante du trigger de non-régression de version, (b) la continuité N → N+1 ou une décision explicite sur les dossiers non clôturables, (c) la neutralisation des saisies de bilan concurrentes.
- Risque connu : la confirmation globale `tiers.dettes = NUL_CONFIRME` entre en conflit avec une avance locative.


# Revue adversariale (F013-V2.5.1, 2026-10-05)

*Conduite par l'agent d'implémentation (IA), qui est aussi l'auteur des décisions : elle n'est donc pas indépendante. Le Product Owner doit la contre-vérifier ; cet ADR n'est pas approuvé par son auteur.*

## Décision fiscale ≠ décision d'architecture

- **Décision fiscale** (portée par SAV-034, preuve officielle établie) : le rattachement des loyers par créances et avances, et l'identité dérivée. **Elle n'est pas l'objet de cet ADR.** Un défaut de l'architecture ne remet pas en cause la règle ; un défaut de la règle ne se corrige pas par l'architecture.
- **Décisions d'architecture** (objet de cet ADR) : 1 à 8 ci-dessus. Aucune ne crée de règle fiscale : ce sont des conventions de fiabilité (états, garde, version de schéma).

## Challenge de chaque décision

| # | Décision | Attaque | Réponse / constat | Verdict |
|---|---|---|---|---|
| 1 | Source unique `rentReconciliationV2` | un second stockage serait plus simple pour le bilan | deux sources éditables divergent (démontré : 3 saisies possibles avant V2.4) ; la vue effective ne détruit pas la saisie bilan | tient |
| 1b | Vue effective « l'inventaire remplace la saisie bilan » | masque une saisie utilisateur | listée dans `superseded`, non détruite en stockage ; à confirmer à la bascule (verrouiller l'UI) | tient, point ouvert |
| 2 | Snapshot v3 additif | un champ optionnel suffirait sans version | un ancien client réécrirait en perdant la donnée : la version est la seule barrière que ce client respecte | tient |
| 3 | Anti-downgrade (client + SQL) | repose sur un trigger distant | **non rechecked** dans ces missions (information historique : appliqué sur le projet DEV/STAGING désigné par le PO). Sans le trigger, seule la garde client protège | **tient sous condition** : preuve distante avant activation |
| 4 | Clôture fail-closed y compris à soldes nuls | bloque des dossiers pourtant « sans conséquence » | zéro transporté sans règle = faux marqueur de continuité ; contrat de continuité désormais prouvé (SAV-034) mais non implémenté | tient jusqu'à F013-V2.6 |
| 5 | Proposition ≠ validation | alourdit l'UX | c'est la barrière contre la promotion silencieuse ; la restauration rejette sans réparer | tient |
| 6 | Moteur unique | un calcul local au bilan serait plus rapide | duplication = divergence ; test statique que la projection ne reproduit pas la formule | tient |
| 7 | Scope `propertyId` | l'attribution implicite évite une saisie | contamination A/B démontrée sur le pont v1 (1 700 € au lieu de 1 000 €) | tient |
| 8 | Invalidation sur les faits | sur-invalide à total constant | exemple E 12 000 / CC 0 → E 11 000 / CC 1 000 : inventaire de bilan différent à total égal | tient |

## Pré-mortem (si cette architecture échoue)

1. Le trigger SQL n'est pas appliqué à distance et un ancien client réécrit un snapshot : **perte de faits** → condition d'activation 3.
2. Des dossiers activés ne peuvent plus être clôturés avant F013-V2.6 : **blocage utilisateur** → ne pas activer avant la continuité.
3. La saisie de bilan concurrente reste visible et trompe l'utilisateur : **incohérence perçue** → verrouiller à la bascule.
4. La clé de version v3 devient un attracteur (« tout en v3 ») : exiger une justification structurelle avant v4.

## Conditions de GOUV-001

- Condition A (trois occurrences) et condition B (cause racine commune) : **non vérifiées formellement** — décisions prises par tranches successives avant la formalisation. Le Product Owner peut lever cette condition en connaissance de cause (régularisation).
- Revue adversariale : faite (ci-dessus), non indépendante.

## Prêt pour décision du Product Owner ?

**Oui, sous conditions d'activation** : (1) preuve distante du trigger SQL ; (2) continuité F013-V2.6 ou décision explicite sur les dossiers non clôturables ; (3) neutralisation des saisies de bilan concurrentes. Ces conditions bloquent **l'activation**, pas l'approbation des principes.

# Questions ouvertes

- Faut-il un niveau de décision supérieur (activation, tarification, migration de dossiers v1) ?
- Quelle règle pour les dossiers clôturés avant l'activation de la continuité ?
- Références officielles de SAV-034 : jointes en V2.5.1 (sources officielles, paragraphes et versions consultés le 2026-10-05) ; textes de loi Légifrance lus par extraction automatique, à reconfirmer.
