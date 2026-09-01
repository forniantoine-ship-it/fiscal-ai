---
id: RT-003
title: Document Intelligence Pipeline
type: standard
status: approved
version: "2.0"
created: 2026-06-29
updated: 2026-06-29
owner: product-owner
source: Ontologie Fiscal AI
tags: [runtime, document, pipeline, architecture, observations]
depends_on:
  hard: [RT-001, RT-002, ONTOLOGY]
  soft: [MCP-001]
---

# RT-003 — Document Intelligence Pipeline

---

# 1. Objectif

Définir l'architecture officielle qui transforme un document brut en données exploitables par le Runtime Engine.

Ce document est une vérité architecturale. Toute implémentation doit s'y conformer.

---

# 2. Le pipeline

```
Document (fichier brut)
    ↓ structuration
Document Model (représentation structurée)
    ↓ extraction
Extraction (information brute extraite)
    ↓ constat
Observation (fait exploitable)
    ↓ interprétation
Candidate Value (proposition de valeur pour un Field)
    ↓ résolution
Resolved Field (vérité résolue, traçable)
    ↓ exécution
Transformation (calcul fiscal)
    ↓ orchestration
Runtime (résultat fiscal complet)
```

Huit niveaux. Chaque niveau a une responsabilité unique, consomme la sortie du précédent et alimente le suivant. Aucun saut de niveau n'est autorisé.

---

# 3. Rôle de chaque niveau

## 3.1 Document

**Responsabilité** : représenter un fichier brut fourni par le client.

**Consomme** : un fichier (PDF, image, scan, tableur).

**Produit** : un identifiant unique, le fichier stocké, les métadonnées techniques (format, taille, nombre de pages).

**Interdit** :
- Interpréter le contenu.
- Connaître la structure interne du fichier.
- Cibler un Field.

Le Document est un conteneur opaque. Il ne sait pas ce qu'il contient.

---

## 3.2 Document Model

**Responsabilité** : représenter la structure interne du document. Le Document Model est la vue structurée que tous les extracteurs consomment.

**Consomme** : le fichier brut du Document.

**Produit** : une représentation structurée contenant :
- les pages (numéro, dimensions)
- les blocs de texte (contenu, coordonnées, confiance OCR)
- les tableaux (lignes, colonnes, cellules, coordonnées)
- les zones détectées (en-tête, corps, signature, tampon)
- les métadonnées structurelles (langue détectée, orientation, qualité du scan)

**Interdit** :
- Interpréter le sens du contenu.
- Cibler un Field.
- Produire des valeurs typées.
- Connaître les règles fiscales.

Le Document Model voit la forme, jamais le fond.

**Invariant** : le Document Model est la seule représentation du document utilisée en aval. Aucun extracteur ne lit le fichier brut — il lit le Document Model.

---

## 3.3 Extraction

**Responsabilité** : extraire une information brute du Document Model. L'Extraction détecte un morceau d'information sans le comprendre.

**Consomme** : le Document Model (blocs, tableaux, zones).

**Produit** : un fragment d'information brut :
- valeur textuelle extraite
- localisation complète (page, bloc, coordonnées)
- méthode d'extraction (OCR, parsing structuré, vision, GPT)
- confiance d'extraction

**Interdit** :
- Connaître les Fields du domaine.
- Interpréter la valeur.
- Produire un fait exploitable (c'est le rôle de l'Observation).
- Créer une Candidate Value.

L'Extraction voit des caractères à un emplacement. Elle ne sait pas ce qu'ils signifient.

**Distinction avec l'Observation** : l'Extraction dit "j'ai trouvé '180 000 €' à la page 3, bloc 7, coordonnées (120, 340)". L'Observation dit "il y a un montant de 180 000 € dans la section Prix de ce document". L'Extraction est mécanique. L'Observation est sémantique.

---

## 3.4 Observation

**Responsabilité** : constater un fait exploitable à partir d'une ou plusieurs Extractions. L'Observation enrichit l'Extraction brute avec un contexte qui la rend utilisable.

**Consomme** : une ou plusieurs Extractions + le contexte du Document Model (quelle section, quel type de document).

**Produit** : un fait exploitable :
- valeur brute (string)
- localisation (héritée de l'Extraction)
- contexte sémantique (ex: "section Prix et paiement d'un acte notarié")
- confiance (héritée ou ajustée par le contexte)
- provenance immuable (chaîne complète)

**Interdit** :
- Connaître les Fields du domaine.
- Interpréter la valeur comme donnée typée.
- Cibler un champ.
- Valider la cohérence.
- Connaître les règles fiscales.

L'Observation est agnostique du domaine. Elle sait qu'elle a trouvé un montant dans une section de prix, mais elle ne sait pas que c'est un prix d'acquisition.

---

## 3.5 Candidate Value

**Responsabilité** : proposer une interprétation d'une Observation pour un Field spécifique du domaine.

**Consomme** : une Observation + la connaissance du modèle de données (Fields).

**Produit** : un identifiant, le Field ciblé, la valeur interprétée (typée), la méthode d'interprétation, une confiance, un statut (proposée, validée, rejetée, remplacée), des alternatives éventuelles.

**Interdit** :
- Résoudre un conflit entre Candidates.
- Décider quelle Candidate est retenue.
- Exécuter un calcul fiscal.
- Modifier l'Observation source.

La Candidate propose. Elle ne décide pas.

---

## 3.6 Resolved Field

**Responsabilité** : représenter la vérité résolue pour un Field donné, avec sa traçabilité complète.

**Consomme** : les Candidate Values validées + les règles de résolution + les Jugements applicables.

**Produit** : la valeur retenue, la confiance finale, la règle de résolution, la Candidate retenue, les Observations sources, la justification, la provenance complète.

**Interdit** :
- Créer de nouvelles Observations ou Candidates.
- Exécuter un calcul fiscal.
- Modifier une Candidate.

**Contrainte** : un seul Resolved Field par Field et par dossier.

---

## 3.7 Transformation

**Responsabilité** : transformer des données d'entrée en résultat selon une logique métier documentée dans le Knowledge System.

**Consomme** : des Resolved Fields + des structured inputs + des sorties de Transformations précédentes.

**Produit** : des valeurs calculées + une trace d'exécution.

**Interdit** :
- Lire un document ou un Document Model.
- Créer des Observations ou des Extractions.
- Résoudre une ambiguïté documentaire.
- Contenir de la logique non documentée dans le Knowledge System.

---

## 3.8 Runtime

**Responsabilité** : orchestrer l'exécution complète d'un dossier.

**Consomme** : un DossierInput complet.

**Produit** : un RuntimeReport.

**Interdit** :
- Résoudre une ambiguïté documentaire.
- Exécuter un calcul fiscal directement.
- Valider une Candidate.
- Modifier le Knowledge System.

---

# 4. Frontières

## 4.1 Document ↔ Document Model

Le Document est un fichier opaque. Le Document Model est sa représentation structurée.

**Frontière** : le Document ne connaît pas sa structure interne. Le Document Model la connaît mais ne sait pas ce qu'elle signifie.

**Règle** : un Document produit exactement un Document Model.

## 4.2 Document Model ↔ Extraction

Le Document Model fournit la structure (pages, blocs, tableaux). L'Extraction détecte les fragments d'information dans cette structure.

**Frontière** : le Document Model ne sait pas quels fragments sont intéressants. L'Extraction le sait mais ne sait pas ce qu'ils signifient.

**Règle** : un Document Model produit zéro ou plusieurs Extractions. Une Extraction provient d'exactement un Document Model.

## 4.3 Extraction ↔ Observation

L'Extraction fournit un fragment brut avec sa localisation. L'Observation ajoute le contexte sémantique.

**Frontière** : l'Extraction est mécanique (OCR, parsing). L'Observation est contextuelle (cette valeur est dans la section Prix d'un acte notarié).

**Règle** : une Extraction produit zéro ou une Observation. Une Observation provient d'une ou plusieurs Extractions (un fait peut nécessiter de combiner plusieurs fragments).

## 4.4 Observation ↔ Candidate Value

L'Observation rapporte un fait. La Candidate l'interprète pour un Field.

**Frontière** : l'Observation ne connaît pas les Fields. La Candidate les connaît mais ne sait pas si son interprétation est correcte.

**Règle** : une Observation produit zéro ou plusieurs Candidates. Une Candidate provient d'exactement une Observation.

## 4.5 Candidate Value ↔ Resolved Field

La Candidate propose. Le Resolved Field retient.

**Frontière** : la Candidate ne sait pas si elle sera retenue. Le Resolved Field est définitif.

**Règle** : plusieurs Candidates pour un même Field, un seul Resolved Field.

## 4.6 Resolved Field ↔ Transformation

Le Resolved Field fournit une entrée. La Transformation calcule.

**Frontière** : le Resolved Field ne sait pas quel calcul sera fait. La Transformation ne sait pas d'où vient la valeur.

## 4.7 Transformation ↔ Runtime

La Transformation calcule. Le Runtime orchestre.

**Frontière** : la Transformation ne connaît pas sa place dans la chaîne. Le Runtime la connaît.

---

# 5. Provenance immuable

Chaque Observation conserve une chaîne de provenance complète et immuable :

```
Document (id, nom du fichier)
    → Page (numéro)
        → Bloc / Zone (coordonnées, type)
            → Extraction (id, méthode, confiance)
                → Observation (id, rawValue, contexte)
```

Cette chaîne est propagée intégralement jusqu'au Resolved Field :

```
Resolved Field
    → Candidate (id, méthode d'interprétation)
        → Observation (id, rawValue)
            → Extraction (id, méthode)
                → Bloc (coordonnées)
                    → Page (numéro)
                        → Document (id, nom)
```

**Invariant** : la provenance ne peut jamais être modifiée après création. Si une Observation est invalidée, elle est marquée comme telle mais sa provenance reste intacte pour l'audit.

**Invariant** : la provenance est suffisante pour qu'un humain puisse ouvrir le document original, naviguer jusqu'à la page et au bloc exact, et vérifier visuellement la valeur extraite.

---

# 6. Invariants

**I-01** : Le Document Model est la seule représentation du document utilisée en aval. Aucun extracteur ne lit le fichier brut.

**I-02** : Une Extraction ne crée jamais directement une Candidate Value. Elle passe toujours par une Observation.

**I-03** : Une Observation est toujours agnostique du domaine.

**I-04** : Une Candidate cible toujours exactement un Field.

**I-05** : Un Resolved Field est unique par Field et par dossier.

**I-06** : Une Transformation ne lit jamais directement un document, un Document Model ou une Extraction.

**I-07** : Le Runtime ne résout jamais une ambiguïté documentaire.

**I-08** : Chaque valeur du résultat fiscal est traçable jusqu'au document source via la provenance immuable.

**I-09** : Les Jugements sont des Resolved Fields comme les autres.

**I-10** : Le pipeline est idempotent.

**I-11** : Le pipeline est incrémental.

**I-12** : La provenance est immuable après création.

---

# 7. Responsabilités interdites

| Niveau | Interdit |
|---|---|
| Document | Connaître sa structure interne, interpréter |
| Document Model | Interpréter le sens, cibler un Field |
| Extraction | Connaître les Fields, interpréter, créer une Candidate |
| Observation | Connaître les Fields, interpréter comme donnée typée, calculer |
| Candidate | Résoudre un conflit, décider, calculer |
| Resolved Field | Créer des Observations/Candidates, calculer |
| Transformation | Lire un document/Model/Extraction, résoudre des ambiguïtés |
| Runtime | Résoudre des ambiguïtés, calculer, modifier le Knowledge System |
| Resolver | Créer des Candidates ou Observations, calculer |

---

# 8. Flux complet

```
CLIENT UPLOADE UN PDF
    ↓
┌─────────────────────────────────┐
│ DOCUMENT                         │
│ Stockage, métadonnées techniques│
│ Produit : Document (id, fichier)│
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│ DOCUMENT MODEL                   │
│ OCR / Vision / Parsing          │
│ Produit : pages, blocs,         │
│ tableaux, zones, coordonnées    │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│ EXTRACTION                       │
│ Détection de fragments          │
│ "180 000 €" bloc 7, (120,340)   │
│ Produit : Extraction[]           │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│ OBSERVATION                      │
│ Contextualisation               │
│ "montant dans section Prix      │
│  d'un acte notarié"             │
│ Produit : Observation[]          │
│ + provenance immuable            │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│ INTERPRÉTATION                   │
│ "180 000 €" → prix_acquisition? │
│ Produit : CandidateValue[]       │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│ VALIDATION + RÉSOLUTION         │
│ Cohérence, validation humaine   │
│ Sélection, promotion            │
│ Injection des Jugements         │
│ Produit : ResolvedField[]        │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│ EXÉCUTION                        │
│ TRF-0001 → TRF-0002 → ...      │
│ Produit : outputs par TRF        │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│ RUNTIME REPORT                   │
│ Résultat fiscal intermédiaire   │
│ Trace complète                   │
│ Provenance de chaque chiffre    │
└─────────────────────────────────┘
```

---

# 9. Points d'extension

## 9.1 OCR

**S'insère dans** : Document → Document Model.

Convertit un PDF scanné en blocs de texte avec coordonnées. Alimente le Document Model.

## 9.2 Vision (multimodal)

**S'insère dans** : Document → Document Model.

Analyse visuelle complémentaire à l'OCR : détection de tableaux, signatures, tampons, mise en page. Enrichit le Document Model.

## 9.3 Extraction GPT

**S'insère dans** : Document Model → Extraction, ou Extraction → Observation.

Utilise un LLM pour détecter des fragments ou pour contextualiser des Extractions en Observations. Ne produit jamais directement une Candidate.

## 9.4 RAG

**S'insère dans** : Observation → Candidate Value.

Enrichit le contexte d'interprétation en récupérant les Axiomes et Savoirs pertinents du Knowledge System.

## 9.5 Multi-documents

**Transparent** : le pipeline traite chaque document indépendamment. Le Resolver gère naturellement les Candidates provenant de documents différents pour le même Field.

## 9.6 Multi-langues

**S'insère dans** : Document → Document Model.

La langue est une métadonnée du Document Model. Les extracteurs s'adaptent à la langue détectée.

## 9.7 Validation humaine

**S'insère entre** : Candidate Value et Resolved Field.

L'utilisateur valide, corrige ou rejette des Candidates. Déjà modélisé dans le système actuel.

---

# 10. Règle d'or du pipeline

Chaque chiffre produit par Fiscal AI doit pouvoir répondre automatiquement à cinq questions :

1. **Dans quel document ?** → Document (id, nom, format)
2. **Où exactement ?** → Provenance (page, bloc, coordonnées)
3. **Comment extrait ?** → Extraction (méthode, confiance)
4. **Pourquoi cette valeur ?** → Resolved Field (règle, Jugement, alternatives rejetées)
5. **Quel calcul ?** → Transformation (id, logique, gardes-fous)

Si un chiffre ne peut pas répondre à ces cinq questions, il ne doit pas exister dans le système.
