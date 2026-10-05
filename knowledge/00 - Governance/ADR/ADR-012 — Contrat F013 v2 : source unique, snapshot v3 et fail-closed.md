---
id: ADR-012
title: "Contrat F013 v2 : source unique, snapshot v3 et fail-closed"
type: adr
status: pending-decision
version: "1.0"
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

# Questions ouvertes

- Faut-il un niveau de décision supérieur (activation, tarification, migration de dossiers v1) ?
- Quelle règle pour les dossiers clôturés avant l'activation de la continuité ?
- Références officielles (CGI/BOFiP) de SAV-034 à joindre avant approbation.
