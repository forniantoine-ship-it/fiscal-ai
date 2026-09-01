---
id: MCP-001
title: Fiscal AI Knowledge API Specification
type: standard
status: approved
version: "1.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Ontologie Fiscal AI
tags: [mcp, api, knowledge-system, runtime, specification]
depends_on:
  hard: [ONTOLOGY, RT-001, RT-002]
  soft: []
---

# MCP-001 — Fiscal AI Knowledge API Specification

---

# 1. Objectif

Définir le contrat public du serveur MCP (Model Context Protocol) de Fiscal AI.

Ce serveur expose la connaissance du Knowledge System à tout LLM sans révéler la structure interne du Vault. Le LLM interagit avec des concepts métier (Axiomes, Savoirs, Jugements, Raisonnements, Transformations, Vérifications), jamais avec des fichiers Markdown.

---

# 2. Principes

- Le MCP expose la connaissance, jamais les fichiers.
- Chaque réponse est auto-suffisante : le LLM n'a pas besoin de contexte préalable.
- Chaque réponse inclut la traçabilité complète (contrainte C12).
- Le MCP ne modifie jamais le Knowledge System. Il est en lecture seule.
- Les mutations sont proposées via des outils dédiés et nécessitent une validation humaine.
- Le MCP respecte la hiérarchie d'autorité : Axiome > Savoir > Jugement > Raisonnement > Transformation > Vérification.

---

# 3. Convention de nommage des outils

```
fiscal_{domaine}_{action}
```

Exemples : `fiscal_axiom_list`, `fiscal_transformation_execute`, `fiscal_observation_submit`.

---

# 4. Outils — Consultation du Knowledge System

## 4.1 fiscal_axiom_list

### Objectif

Lister tous les Axiomes applicables à un régime fiscal donné.

### Paramètres

```json
{
  "scope": "lmnp"
}
```

| Paramètre | Type | Obligatoire | Description |
|---|---|---|---|
| scope | string | Non | Filtre par portée. Si absent, retourne tous les axiomes. |

### Réponse

```json
{
  "axioms": [
    {
      "id": "AX-001",
      "statement": "Le terrain ne s'amortit jamais.",
      "scope": "tout-bic",
      "legal_source": "CGI art. 39-C",
      "status": "approved"
    }
  ],
  "count": 3,
  "filtered_by_scope": "lmnp"
}
```

### Erreurs

| Code | Description |
|---|---|
| UNKNOWN_SCOPE | La portée demandée n'existe pas |

### Objets utilisés

Axiome (AX-xxx)

### Traçabilité

Aucune — lecture seule, pas de données de dossier.

---

## 4.2 fiscal_knowledge_get

### Objectif

Récupérer un objet du Knowledge System par son identifiant, quel que soit son type.

### Paramètres

```json
{
  "id": "TRF-0001"
}
```

| Paramètre | Type | Obligatoire | Description |
|---|---|---|---|
| id | string | Oui | Identifiant de l'objet (AX-, SAV-, JUG-, RAI-, TRF-, VER-) |

### Réponse

```json
{
  "id": "TRF-0001",
  "type": "transformation",
  "title": "Calcul du prix de revient",
  "status": "approved",
  "version": "2.0",
  "content": {
    "objective": "Déterminer le coût total d'acquisition...",
    "inputs": [...],
    "outputs": [...],
    "logic": "...",
    "conditions": { "formal": "...", "natural": "..." },
    "guards": [...]
  },
  "relations": {
    "fonde": ["AX-002", "AX-003"],
    "paramètre": ["JUG-001", "JUG-003"],
    "requiert": ["SAV-001", "SAV-004"],
    "précède": ["TRF-0002"],
    "vérifie": [],
    "justifie": ["RAI-001"]
  }
}
```

### Erreurs

| Code | Description |
|---|---|
| NOT_FOUND | L'identifiant n'existe pas dans le Knowledge System |
| DEPRECATED | L'objet est deprecated. La réponse inclut le champ `superseded_by`. |

### Objets utilisés

Tout type de l'ontologie.

### Traçabilité

Aucune — lecture seule.

---

## 4.3 fiscal_knowledge_search

### Objectif

Rechercher des objets du Knowledge System par critères.

### Paramètres

```json
{
  "type": "transformation",
  "tags": ["lmnp", "acquisition"],
  "status": "approved",
  "query": "prix de revient"
}
```

| Paramètre | Type | Obligatoire | Description |
|---|---|---|---|
| type | string | Non | Filtre par type d'objet |
| tags | string[] | Non | Filtre par tags (intersection) |
| status | string | Non | Filtre par statut |
| query | string | Non | Recherche textuelle dans le titre et le contenu |

### Réponse

```json
{
  "results": [
    {
      "id": "TRF-0001",
      "type": "transformation",
      "title": "Calcul du prix de revient",
      "status": "approved",
      "tags": ["lmnp", "acquisition", "prix-de-revient"],
      "relevance": 0.95
    }
  ],
  "count": 1,
  "filters_applied": { "type": "transformation", "tags": ["lmnp", "acquisition"] }
}
```

### Erreurs

| Code | Description |
|---|---|
| INVALID_TYPE | Le type demandé n'existe pas dans l'ontologie |
| NO_RESULTS | Aucun objet ne correspond aux critères |

---

## 4.4 fiscal_reasoning_get

### Objectif

Récupérer un Raisonnement complet avec toutes ses prémisses résolues (Axiomes et Savoirs chargés, pas seulement référencés).

### Paramètres

```json
{
  "id": "RAI-001"
}
```

### Réponse

```json
{
  "id": "RAI-001",
  "title": "Construction de la base amortissable",
  "objective": "Déterminer la base sur laquelle l'amortissement du bâti sera calculé",
  "premises_resolved": [
    { "id": "AX-001", "type": "axiome", "statement": "Le terrain ne s'amortit jamais." },
    { "id": "AX-002", "type": "axiome", "statement": "Le prix de revient inclut les frais d'acquisition." },
    { "id": "SAV-001", "type": "savoir", "statement": "Les frais comprennent droits de mutation, émoluments..." }
  ],
  "steps": [
    { "order": 1, "description": "Identifier la date d'acquisition", "exit_condition": "une date existe" },
    { "order": 2, "description": "Identifier le prix d'acquisition", "exit_condition": "un montant existe" }
  ],
  "conclusion": "La base amortissable = prix de revient - mobilier - terrain",
  "exit_condition": "Un montant unique, positif, justifié",
  "transformations_justified": ["TRF-0001", "TRF-0002"]
}
```

### Erreurs

| Code | Description |
|---|---|
| NOT_FOUND | Le Raisonnement n'existe pas |
| INCOMPLETE_PREMISES | Une prémisse référencée n'existe pas dans le Knowledge System (violation C5) |

---

## 4.5 fiscal_judgement_get

### Objectif

Récupérer un Jugement avec ses alternatives, son choix retenu et ses conséquences.

### Paramètres

```json
{
  "id": "JUG-001"
}
```

### Réponse

```json
{
  "id": "JUG-001",
  "title": "Traitement des frais d'acquisition",
  "question": "Les frais sont-ils intégrés au prix de revient ou déduits en charges ?",
  "alternatives": [
    {
      "label": "A — Intégration au prix de revient",
      "pros": "Déduction étalée et sûre",
      "cons": "Impact annuel faible"
    },
    {
      "label": "B — Déduction immédiate en charges",
      "pros": "Déduction immédiate",
      "cons": "Inutile si résultat déjà négatif"
    }
  ],
  "recommended_choice": "A",
  "justification": "Dans 90% des cas LMNP, le résultat de la première année est nul ou négatif...",
  "confidence": "haute",
  "reversible": true,
  "owner": "utilisateur",
  "impacts": ["TRF-0001"]
}
```

---

# 5. Outils — Exécution des Transformations

## 5.1 fiscal_transformation_execute

### Objectif

Exécuter une Transformation avec des données concrètes et retourner le résultat avec la trace complète.

### Paramètres

```json
{
  "transformation_id": "TRF-0001",
  "inputs": {
    "prix_acquisition": 180000,
    "mobilier_inclus": false,
    "frais_notaire": 14400,
    "frais_agence": 5000,
    "frais_agence_charge": "acquéreur",
    "choix_traitement_frais": "intégration"
  },
  "dossier_id": "dossier-2025-001",
  "exercice": 2025
}
```

| Paramètre | Type | Obligatoire | Description |
|---|---|---|---|
| transformation_id | string | Oui | Identifiant de la Transformation |
| inputs | object | Oui | Valeurs concrètes des entrées |
| dossier_id | string | Oui | Identifiant du dossier client |
| exercice | number | Non | Exercice fiscal (pour les Transformations pluriannuelles) |

### Réponse

```json
{
  "transformation_id": "TRF-0001",
  "status": "success",
  "outputs": {
    "prix_revient": 199400,
    "montant_mobilier_isolé": 0,
    "frais_en_charges": 0
  },
  "confidence": "certaine",
  "trace": {
    "axioms_verified": ["AX-002", "AX-003"],
    "judgements_applied": [
      { "id": "JUG-001", "choice": "intégration", "source": "input" }
    ],
    "reasoning": "RAI-001",
    "inputs_sourced": [
      { "field": "prix_acquisition", "value": 180000, "origin": "user_input" },
      { "field": "frais_notaire", "value": 14400, "origin": "user_input" }
    ],
    "guards_passed": [
      { "guard": "prix_revient > 0", "result": true, "value": 199400 },
      { "guard": "frais < prix * 0.15", "result": true, "value": 0.108 }
    ],
    "executed_at": "2026-06-29T10:30:00Z"
  }
}
```

### Erreurs

| Code | Description |
|---|---|
| TRANSFORMATION_NOT_FOUND | La Transformation n'existe pas |
| MISSING_INPUT | Une entrée obligatoire est absente. Inclut `missing_fields`. |
| PRECONDITION_FAILED | Une précondition formelle n'est pas satisfaite. Inclut `failed_condition`. |
| GUARD_VIOLATION | Un garde-fou est violé. Inclut `violated_guard` et `severity` (warning ou blocking). |
| AXIOM_VIOLATION | Le résultat contredit un Axiome. Toujours bloquant. Inclut `axiom_id`. |

### Traçabilité (C12)

Chaque exécution produit un enregistrement contenant :
- Les entrées avec leur origine (Observation, Candidate Value, saisie utilisateur, Transformation précédente)
- Les Jugements appliqués avec leur valeur
- Les Axiomes vérifiés
- Les gardes-fous évalués
- Le Raisonnement justificatif
- L'horodatage
- L'identifiant du dossier

---

## 5.2 fiscal_transformation_chain

### Objectif

Exécuter une chaîne de Transformations dans l'ordre défini par les relations `précède`. Permet d'exécuter TRF-0001 puis TRF-0002 en un seul appel.

### Paramètres

```json
{
  "start_transformation": "TRF-0001",
  "end_transformation": "TRF-0002",
  "inputs": {
    "prix_acquisition": 180000,
    "mobilier_inclus": true,
    "montant_mobilier": 8000,
    "frais_notaire": 14400,
    "choix_traitement_frais": "intégration",
    "ratio_terrain": 0.20
  },
  "dossier_id": "dossier-2025-001"
}
```

### Réponse

```json
{
  "chain": ["TRF-0001", "TRF-0002"],
  "status": "success",
  "final_outputs": {
    "prix_revient": 186400,
    "montant_mobilier_isolé": 8000,
    "frais_en_charges": 0,
    "valeur_terrain": 35680,
    "valeur_bâti": 142720,
    "base_amortissable_bâti": 142720
  },
  "steps": [
    {
      "transformation_id": "TRF-0001",
      "status": "success",
      "outputs": { "prix_revient": 186400, "montant_mobilier_isolé": 8000, "frais_en_charges": 0 }
    },
    {
      "transformation_id": "TRF-0002",
      "status": "success",
      "outputs": { "valeur_terrain": 35680, "valeur_bâti": 142720, "base_amortissable_bâti": 142720 }
    }
  ],
  "trace": { ... }
}
```

### Erreurs

| Code | Description |
|---|---|
| NO_PATH | Aucun chemin `précède` n'existe entre start et end |
| CHAIN_INTERRUPTED | Une Transformation intermédiaire a échoué. Inclut `failed_at` et l'erreur. |

---

# 6. Outils — Observations et Résolution

## 6.1 fiscal_observation_submit

### Objectif

Soumettre une Observation brute extraite d'un document. Le MCP interprète l'Observation en Candidate Values.

### Paramètres

```json
{
  "document_id": "doc-acte-001",
  "raw_value": "195 000 €",
  "location": "page 3, section Prix et paiement",
  "extraction_method": "ocr",
  "extraction_confidence": "haute",
  "context": "Le prix de la vente est fixé à la somme de CENT QUATRE VINGT QUINZE MILLE EUROS"
}
```

### Réponse

```json
{
  "observation": {
    "id": "OBS-002",
    "document_id": "doc-acte-001",
    "raw_value": "195 000 €",
    "extraction_confidence": "haute"
  },
  "candidate_values": [
    {
      "id": "CV-002a",
      "target_field": "FIELD-002",
      "target_field_label": "Prix d'acquisition",
      "interpreted_value": 195000,
      "confidence": "haute",
      "interpretation_method": "directe",
      "status": "proposée"
    },
    {
      "id": "CV-002b",
      "target_field": "FIELD-002",
      "target_field_label": "Prix d'acquisition",
      "interpreted_value": null,
      "confidence": "modérée",
      "interpretation_method": "contextuelle",
      "status": "proposée",
      "note": "Le montant pourrait inclure du mobilier. Vérification nécessaire."
    }
  ],
  "requires_user_input": true,
  "question": "Le prix de 195 000 € inclut-il du mobilier ?"
}
```

### Erreurs

| Code | Description |
|---|---|
| DOCUMENT_NOT_FOUND | Le document référencé n'existe pas |
| UNPARSEABLE_VALUE | La valeur brute n'a pas pu être interprétée |

---

## 6.2 fiscal_candidate_validate

### Objectif

Valider ou rejeter une Candidate Value.

### Paramètres

```json
{
  "candidate_id": "CV-002a",
  "action": "validate",
  "validated_by": "utilisateur",
  "correction": null
}
```

| Paramètre | Type | Obligatoire | Description |
|---|---|---|---|
| candidate_id | string | Oui | Identifiant de la Candidate Value |
| action | enum | Oui | `validate`, `reject`, `correct` |
| validated_by | string | Oui | Qui valide |
| correction | object | Si action=correct | Nouvelle valeur et justification |

### Réponse

```json
{
  "candidate_id": "CV-002a",
  "status": "validée",
  "field": "FIELD-002",
  "value": 195000,
  "confidence": "certaine",
  "promoted": true,
  "promotion_reason": "Validation utilisateur sur extraction haute confiance"
}
```

---

## 6.3 fiscal_resolve_inputs

### Objectif

Résoudre toutes les entrées d'une Transformation à partir des Candidate Values validées. Identifie les entrées manquantes.

### Paramètres

```json
{
  "transformation_id": "TRF-0001",
  "dossier_id": "dossier-2025-001"
}
```

### Réponse

```json
{
  "transformation_id": "TRF-0001",
  "status": "incomplete",
  "resolved_inputs": [
    {
      "input_name": "prix_acquisition",
      "value": 180000,
      "source": { "candidate_id": "CV-002b", "observation_id": "OBS-002", "document_id": "doc-acte-001" },
      "confidence": "certaine"
    },
    {
      "input_name": "frais_notaire",
      "value": 14400,
      "source": { "candidate_id": "CV-004", "observation_id": "OBS-004", "document_id": "doc-acte-001" },
      "confidence": "certaine"
    }
  ],
  "missing_inputs": [
    {
      "input_name": "choix_traitement_frais",
      "required": true,
      "source_type": "jugement",
      "judgement_id": "JUG-001",
      "question": "Les frais d'acquisition sont-ils intégrés au prix de revient ou déduits en charges ?"
    }
  ],
  "ready_to_execute": false
}
```

---

# 7. Outils — Vérification

## 7.1 fiscal_verification_run

### Objectif

Exécuter une Vérification sur une Transformation avec ses données de test.

### Paramètres

```json
{
  "verification_id": "VER-001"
}
```

### Réponse

```json
{
  "verification_id": "VER-001",
  "transformation_id": "TRF-0001",
  "category": "nominal",
  "status": "pass",
  "expected": { "prix_revient": 199400, "montant_mobilier_isolé": 0, "frais_en_charges": 0 },
  "actual": { "prix_revient": 199400, "montant_mobilier_isolé": 0, "frais_en_charges": 0 },
  "discrepancies": []
}
```

### Erreurs

| Code | Description |
|---|---|
| VERIFICATION_NOT_FOUND | La Vérification n'existe pas |
| TRANSFORMATION_ERROR | La Transformation sous-jacente a échoué |
| MISMATCH | Le résultat ne correspond pas à l'attendu. Inclut `discrepancies`. |

## 7.2 fiscal_verification_suite

### Objectif

Exécuter toutes les Vérifications associées à une Transformation.

### Paramètres

```json
{
  "transformation_id": "TRF-0001"
}
```

### Réponse

```json
{
  "transformation_id": "TRF-0001",
  "total": 5,
  "passed": 5,
  "failed": 0,
  "results": [
    { "id": "VER-001", "category": "nominal", "status": "pass" },
    { "id": "VER-002", "category": "limite", "status": "pass" },
    { "id": "VER-003", "category": "erreur", "status": "pass" },
    { "id": "VER-004", "category": "nominal", "status": "pass" },
    { "id": "VER-005", "category": "limite", "status": "pass" }
  ],
  "coverage": { "nominal": 2, "limite": 2, "erreur": 1, "exclusion": 0 }
}
```

---

# 8. Outils — Proposition d'évolution

## 8.1 fiscal_knowledge_propose

### Objectif

Proposer une évolution du Knowledge System. Le MCP enregistre la proposition mais ne l'applique jamais. Une validation humaine est requise.

### Paramètres

```json
{
  "action": "create",
  "type": "savoir",
  "proposed_content": {
    "id": "SAV-005",
    "title": "Seuil LMNP",
    "statement": "Le seuil LMNP est de 23 000 € de recettes annuelles...",
    "category": "seuil",
    "domain": "fiscal",
    "source": "CGI art. 155-IV"
  },
  "justification": "Découvert lors de l'implémentation du filtre d'éligibilité. Cette connaissance n'existait pas dans le Vault.",
  "discovered_during": "Développement de TRF-0014"
}
```

| Paramètre | Type | Obligatoire | Description |
|---|---|---|---|
| action | enum | Oui | `create`, `update`, `deprecate` |
| type | string | Oui | Type d'objet de l'ontologie |
| proposed_content | object | Oui | Contenu proposé |
| justification | string | Oui | Pourquoi cette évolution est nécessaire |
| discovered_during | string | Non | Contexte de découverte |

### Réponse

```json
{
  "proposal_id": "PROP-001",
  "status": "pending_review",
  "message": "Proposition enregistrée. Validation humaine requise avant intégration."
}
```

### Traçabilité

La proposition est stockée mais jamais appliquée automatiquement. Elle apparaît dans la file de revue du Product Owner.

---

# 9. Outils — Cohérence

## 9.1 fiscal_consistency_check

### Objectif

Vérifier la cohérence du Knowledge System. Détecte les violations des contraintes de l'ontologie.

### Paramètres

```json
{
  "scope": "all"
}
```

| Paramètre | Type | Obligatoire | Description |
|---|---|---|---|
| scope | enum | Non | `all`, `axioms`, `transformations`, `verifications`, `relations` |

### Réponse

```json
{
  "status": "warnings",
  "checks": [
    { "constraint": "C3", "status": "pass", "message": "Toutes les Transformations ont 3+ Vérifications" },
    { "constraint": "C5", "status": "warning", "message": "RAI-002 référence SAV-010 qui n'existe pas" },
    { "constraint": "C6", "status": "pass", "message": "Aucun cycle détecté dans les relations précède/requiert" },
    { "constraint": "C7", "status": "pass", "message": "Aucune relation contredit active" }
  ],
  "violations": 0,
  "warnings": 1
}
```

---

# 10. Règles transversales

## 10.1 Authentification

Le MCP opère dans le contexte d'un dossier client. Tout appel incluant un `dossier_id` est scopé à ce dossier. Les outils de consultation du Knowledge System (sections 4 et 7) ne nécessitent pas de dossier.

## 10.2 Idempotence

Tous les outils de consultation sont idempotents. `fiscal_transformation_execute` est idempotent (même entrées = même résultat, contrainte C8). `fiscal_observation_submit` n'est pas idempotent (crée un nouvel objet à chaque appel).

## 10.3 Versioning

Chaque réponse inclut la version de l'objet retourné. Si un objet est deprecated, la réponse inclut `superseded_by` avec l'identifiant du remplaçant.

## 10.4 Format des erreurs

```json
{
  "error": {
    "code": "MISSING_INPUT",
    "message": "L'entrée obligatoire 'prix_acquisition' est absente.",
    "details": {
      "missing_fields": ["prix_acquisition"],
      "transformation_id": "TRF-0001"
    }
  }
}
```
