---
id: TRF-0033
title: Priorisation de la Mission active du Dossier
type: rule
status: draft
version: "1.1"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
source: DEC-001, ADR-006
tags: [mission-engine, priorisation, dossier, produit]
catégorie: classification
fonde: []
éclaire: []
paramètre: [DEC-001]
requiert: []
précède: []
justifie: []
vérifie: []
contredit: []
dérive_de: []
remplace: []
conditions:
  formelle: "dossier existe AND statut_dossier ∈ énumération STATE-001"
  naturelle: "S'applique à tout Dossier actif au régime LMNP réel, à tout instant de son cycle de vie"
entrées:
  - nom: statut_dossier
    type: "énumération (STATE-001)"
    rôle: null
    produit_par: Workflow Engine
    obligatoire: true
  - nom: nombre_anomalies
    type: entier
    rôle: null
    produit_par: Validation Engine
    obligatoire: true
  - nom: question_en_attente
    type: "référence (nullable)"
    rôle: null
    produit_par: Question Engine
    obligatoire: false
  - nom: derniere_mise_a_jour
    type: date-heure
    rôle: null
    produit_par: Système
    obligatoire: true
  - nom: date_du_jour
    type: date-heure
    rôle: null
    produit_par: Système
    obligatoire: true
sorties:
  - nom: mission_active
    type: énumération
    confiance: héritée
  - nom: priorité
    type: entier
    confiance: héritée
  - nom: justification
    type: texte
    confiance: héritée
  - nom: responsable
    type: énumération
    confiance: héritée
  - nom: éléments_bloquants
    type: "liste de références"
    confiance: héritée
  - nom: action_recommandée
    type: "texte (nullable)"
    confiance: héritée
  - nom: date_calcul
    type: date-heure
    confiance: héritée
gardes:
  - "exactement une mission_active est produite par exécution, jamais deux, jamais zéro si statut_dossier est valide"
  - "si nombre_anomalies > 0 ET question_en_attente renseigné simultanément, mission_active = corriger_anomalie (l'anomalie prime, DEC-001)"
  - "si statut_dossier n'appartient pas à l'énumération STATE-001, aucune mission_active n'est produite"
  - "action_recommandée est renseignée si et seulement si responsable = client"
input_fields: [FIELD-037, FIELD-046, FIELD-090, FIELD-036]
output_fields: [FIELD-091, FIELD-092, FIELD-093, FIELD-094, FIELD-095, FIELD-096, FIELD-097]
fiscal_regime: lmnp-reel
---

# TRF-0033 — Priorisation de la Mission active du Dossier

---

# 1. Objectif

Déterminer, pour un Dossier donné, l'unique Mission la plus utile à communiquer maintenant — parmi plusieurs signaux concurrents produits par d'autres composants — et produire sa priorité, sa justification, son responsable et son action recommandée.

Cette Transformation est la fondation métier du Mission Engine (ENG-009, à spécifier). Elle ne contient aucune logique d'orchestration ni d'interface : c'est une connaissance métier exécutable, indépendante de tout Engine qui viendra l'appliquer.

---

# 2. Description

Un Dossier peut, à un instant donné, présenter simultanément plusieurs signaux : une anomalie non corrigée, une question en attente, une inactivité prolongée, ou simplement un état d'avancement normal. Cette Transformation ne détecte, ne calcule et ne qualifie aucun de ces signaux elle-même — ils lui sont fournis, déjà qualifiés, par le Workflow Engine, le Validation Engine et le Question Engine. Son rôle unique est de les départager selon un ordre documenté, et de produire une seule Mission.

## Sur la responsabilité unique de cette Transformation

Une première analyse avait envisagé de scinder ce besoin en deux Transformations distinctes : une pour "qualifier" les signaux, une pour les "prioriser". Après vérification, cette scission n'est pas justifiée : les entrées de cette Transformation (`statut_dossier`, `nombre_anomalies`, `question_en_attente`, `derniere_mise_a_jour`) sont déjà des Fields existants ou nouvellement créés, produits par d'autres composants — il n'y a aucune logique métier de "qualification" à documenter ici, seulement une lecture de Fields déjà qualifiés. La seule logique métier réelle est l'arbitrage lui-même, qui tient dans une unique Transformation, conformément au principe "une Rule = une responsabilité unique" (KS-TRF §9) : cette Transformation a une responsabilité, pas deux.

---

# 3. Conditions d'application

- S'applique à tout Dossier existant, dont le `statut_dossier` appartient à l'énumération de [[STATE-001 – Cycle de vie d'un dossier]].
- S'applique uniquement au régime `lmnp-reel`. Toute extension à un autre régime fiscal nécessite une instance dédiée de cette Transformation, avec sa propre Decision de priorisation (cf. §7 Exceptions).
- Fréquence d'exécution : à chaque événement susceptible de modifier un des signaux d'entrée (transition de statut, anomalie levée ou corrigée, question posée ou répondue), ou à la demande d'un composant informatif.

---

# 4. Données d'entrée

| Field | Obligatoire | Source | Description |
|---|---|---|---|
| FIELD-037 (statut_dossier) | Oui | Workflow Engine | État courant du Dossier, selon STATE-001 |
| FIELD-046 (nombre_anomalies) | Oui | Validation Engine | Nombre d'anomalies actives sur le Dossier |
| FIELD-090 (question_en_attente) | Non | Question Engine | Référence vers une question ou un Jugement en attente, si applicable |
| FIELD-036 (derniere_mise_a_jour) | Oui | Système | Date de la dernière modification du Dossier, utilisée pour dériver l'inactivité |

---

# 5. Traitement

Le calcul suit la séquence documentée par [[RAI-015 – Séquence d'arbitrage de la Mission active]], dont l'ordre est paramétré par [[DEC-001 – Politique de priorisation des Missions]].

```
SI nombre_anomalies > 0 :
    mission_active = corriger_anomalie
    priorité = 1
    responsable = client
    éléments_bloquants = référence(s) vers les anomalies actives
    action_recommandée = "Corriger les éléments signalés dans votre dossier"

SINON SI question_en_attente est renseigné :
    mission_active = repondre_question
    priorité = 2
    responsable = client
    éléments_bloquants = référence vers la question ou le Jugement en attente
    action_recommandée = "Répondre à la question en attente"

SINON SI statut_dossier ∈ {DOSSIER_CREE, INFORMATIONS_GENERALES, BIEN_EN_COURS, BIEN_COMPLETE, DOCUMENTS_EN_ATTENTE, INFORMATIONS_MANQUANTES}
   ET (date_du_jour − derniere_mise_a_jour) ≥ seuil_inactivité :
    // Périmètre et seuil (14 jours) fixés par DEC-001 v1.1 :
    // tout état de la phase de construction du Dossier (antérieur à DOSSIER_COMPLET)
    // dont la Mission par défaut désigne le client comme responsable.
    mission_active = relancer_client
    priorité = 3
    responsable = client
    action_recommandée = "Reprendre le dossier là où il a été laissé"

SINON :
    (mission_active, responsable, action_recommandée) = table_correspondance(statut_dossier)
    priorité = 4

Dans tous les cas :
    justification = texte en langage naturel correspondant à mission_active (cf. FIELD-093)
    date_calcul = maintenant()
```

## Table de correspondance — statut_dossier → Mission par défaut

Cette table traduit chaque état de STATE-001 en Mission communicable. Elle ne comporte aucune alternative à arbitrer — chaque état n'a qu'une seule Mission par défaut possible — ce n'est donc ni un Jugement ni une Decision, seulement une traduction déterministe.

| statut_dossier | mission_active | responsable | action_recommandée |
|---|---|---|---|
| DOSSIER_CREE | decrire_le_bien | client | "Commencez par décrire votre situation" |
| INFORMATIONS_GENERALES | decrire_le_bien | client | "Renseignez les informations générales de votre dossier" |
| BIEN_EN_COURS | decrire_le_bien | client | "Terminez la description de votre bien" |
| BIEN_COMPLETE | importer_documents | client | "Importez vos documents" |
| DOCUMENTS_EN_ATTENTE | importer_documents | client | "Importez vos documents" |
| DOCUMENTS_IMPORTES | attendre_analyse | système | (absente) |
| ANALYSE_DOCUMENTAIRE | attendre_analyse | système | (absente) |
| INFORMATIONS_MANQUANTES | repondre_question | client | "Répondez aux questions en attente" |
| DOSSIER_COMPLET | attendre_calcul | système | (absente) |
| CALCUL_EN_COURS | attendre_calcul | système | (absente) |
| CALCUL_TERMINE | consulter_resultat | client | "Consultez votre résultat" |
| DECLARATION_GENEREE | consulter_declaration | client | "Consultez votre déclaration" |
| DOSSIER_TERMINE | cloturer_dossier | — | (absente) |

Note : `INFORMATIONS_MANQUANTES` produit `repondre_question` par défaut ; en pratique ce statut coexiste presque toujours avec un `question_en_attente` actif, auquel cas l'étape 2 de la séquence l'aura déjà traité avant que cette table ne soit consultée.

---

# 6. Données de sortie

| Field | Description |
|---|---|
| FIELD-091 (mission_active) | Catégorie de Mission retenue |
| FIELD-092 (priorité) | Rang de la Mission retenue, selon DEC-001 |
| FIELD-093 (justification) | Explication en langage naturel |
| FIELD-094 (responsable) | Qui doit agir : client, ia, système, collaborateur |
| FIELD-095 (éléments_bloquants) | Références vers les anomalies ou questions à l'origine de la Mission, si applicable |
| FIELD-096 (action_recommandée) | Action unique proposée si responsable = client |
| FIELD-097 (date_calcul) | Horodatage du calcul |

---

# 7. Exceptions

- **Régime fiscal autre que `lmnp-reel`** : cette instance de la Transformation ne s'applique pas. Un régime différent (SCI, Holding, IS…) nécessite sa propre instance de TRF, avec sa propre Decision de priorisation — conformément au principe de scoping par régime déjà établi pour toutes les Rules du Knowledge System.
- **Mission "attendre une réponse de l'administration"** : identifiée dans ADR-006 comme besoin futur, mais non représentable ici. Aucun état de STATE-001 ne couvre la période postérieure à DOSSIER_TERMINE. Explicitement hors périmètre de cette version — cf. ADR-006 §6, qui documente déjà cette limite.
- **Relance des états CALCUL_TERMINE et DECLARATION_GENEREE** : un client inactif après ces états ne déclenche aucune Mission de relance dans cette version. DEC-001 (v1.1) exclut délibérément ces deux états du périmètre de `relancer_client`, car l'inactivité y relève d'une hésitation à la décision d'achat (UXP-004, état "Résultat prêt"), pas d'un abandon de construction du dossier — une Mission distincte serait nécessaire pour ce cas, non définie ici.

---

# 8. Cas particuliers

- **Dossier fraîchement créé** : `derniere_mise_a_jour` égale la date de création (garanti par FIELD-036) — l'inactivité est nulle, la Mission de relance ne peut jamais se déclencher à la création.
- **Plusieurs anomalies actives simultanément** : `nombre_anomalies` > 1 ne change rien à la logique de priorité — la Mission reste `corriger_anomalie`, et `éléments_bloquants` référence l'ensemble des anomalies actives, pas seulement la première détectée.

---

# 9. Cas d'erreur

- **`statut_dossier` absent ou hors énumération STATE-001** : aucune Mission n'est produite. La Transformation signale une anomalie de cohérence amont plutôt que d'inventer une Mission par défaut arbitraire — STATE-001 garantit déjà qu'*"un dossier ne peut être que dans un seul état"* reconnu ; une valeur hors énumération est un défaut du Workflow Engine, pas un cas normal à absorber silencieusement.
- **`derniere_mise_a_jour` postérieure à `date_du_jour`** : incohérence temporelle. La Transformation refuse de calculer une inactivité négative et signale une anomalie plutôt que de produire un résultat silencieusement erroné.

---

# 10. Sources légales

Aucune. Cette Transformation ne repose sur aucun texte fiscal. Son autorité vient de [[DEC-001 – Politique de priorisation des Missions]] (Decision produit) et d'ADR-006 (Decision architecture), conformément à la hiérarchie des sources d'autorité de KS-003 §5.1, qui place les Decisions internes au niveau 4 — sous la loi, la doctrine et la jurisprudence, mais au-dessus d'une simple convention de code non documentée.

---

# 11. Tests métier

Vérifications associées (minimum requis par l'Ontologie C3 : 1 nominal, 1 limite, 1 erreur) :

- [[VER-053 – Mission nominale, signal unique]]
- [[VER-054 – Mission limite, signaux concurrents]]
- [[VER-055 – Mission erreur, statut de dossier invalide]]
- [[VER-056 – Relance sur un état de construction non initialement couvert]] (cas de non-régression sur DEC-001 v1.1)

---

# Note sur les dépendances transversales

Cette Transformation appartient à la zone 01 - Expertise et utilise, à ce titre, le vocabulaire relationnel de l'Ontologie (`paramètre`, `justifie`…) plutôt que celui de KS-003, conformément à ONTOLOGY.md §5. Le champ `paramètre: [DEC-001]` référence toutefois un objet Decision (zone 00 - Governance, vocabulaire KS-003), et non un Jugement au sens strict de l'Ontologie — l'Ontologie ne définit `paramètre` que pour la relation Jugement → Transformation. Il s'agit ici d'une extension raisonnable par analogie (une Decision produit joue, vis-à-vis d'une Transformation, exactement le rôle qu'un Jugement fiscal joue pour une Transformation fiscale), mais ce n'est pas un cas formellement couvert par l'Ontologie actuelle. Ce point est signalé pour mémoire ; il ne bloque pas cette Transformation et pourra être traité dans une future normalisation du vocabulaire relationnel, comme convenu pour les autres observations mineures de cette séquence.
