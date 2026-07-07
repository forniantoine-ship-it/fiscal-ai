---
id: RT-002
title: Runtime Adapter
type: standard
status: review
version: "1.5"
created: 2026-06-29
updated: 2026-07-06
owner: product-owner
source: Ontologie Fiscal AI, Audit TRF-0001 vs Code
tags: [runtime, adapter, mapping, pipeline]
depends_on:
  hard: [RT-001, ONTOLOGY]
  soft: [ARCH-001]
---

# RT-002 — Runtime Adapter

---

# 1. Objectif

Formaliser la correspondance entre le pipeline logiciel existant du projet Next.js et le modèle ontologique du Knowledge System.

Ce document ne modifie ni le code ni l'ontologie. Il établit le dictionnaire de traduction entre les deux mondes afin que les évolutions futures convergent progressivement.

---

# 2. Pourquoi ce document existe

Le projet Next.js a été développé avant la formalisation de l'ontologie. Il possède son propre vocabulaire et sa propre architecture de données. L'ontologie a été conçue indépendamment, à partir du raisonnement de l'expert-comptable.

Les deux systèmes décrivent la même réalité avec des mots différents. Ce document est le Rosetta Stone entre les deux.

---

# 3. Mapping des concepts

## 3.1 Pipeline de données

| Ontologie (RT-001) | Code (Next.js) | Correspondance | Écarts |
|---|---|---|---|
| Observation | `Extraction` | Structurellement similaire. Les deux représentent un fait extrait d'un document. | L'Extraction cible directement un `FieldKey`. L'Observation est agnostique du domaine. L'Extraction ne passe pas par une phase d'interprétation ambiguë. |
| Candidate Value | `ValidationItem` | Partiellement. Un ValidationItem propose une valeur pour un FieldKey avec un statut de validation. | Le ValidationItem fusionne interprétation et validation en un seul objet. L'ontologie les sépare. Le ValidationItem n'a pas d'alternatives explicites. |
| Résolution | `LedgerEntry` | Partiellement. Un LedgerEntry est la valeur finale retenue après validation. | Le LedgerEntry porte des métadonnées de traçabilité (`sourceDocumentIds`, `origin`). Mais il ne référence pas les Candidate Values rejetées. La trace des alternatives est perdue. |
| Transformation | — | **Absent.** Aucun objet du code ne représente une Transformation formelle. | Les calculs sont dispersés dans les composants React et les services. Aucune séparation entre la logique métier et l'interface. |
| Vérification | — | **Absent.** Aucun objet du code ne représente un cas de test métier formel. | Des tests techniques existent (sanitize-storage-filename.test.ts) mais aucun test métier traçable vers une Transformation. |

## 3.2 Types de données

| Ontologie (Fields) | Code (`FieldKey`) | Correspondance | Écarts |
|---|---|---|---|
| FIELD-001 (Date d'acquisition) | `acquisitionDate` (dans LogementFormValues) | Aligné | Pas dans le FIELD_REGISTRY central |
| FIELD-002 (Prix d'acquisition) | `propertyPurchasePrice` (dans LogementFormValues) | **Divergence sémantique.** Le code exclut déjà frais/travaux/mobilier du prix. Le Vault considère le prix brut. | Le code a fait un choix implicite (isolation préalable) que le Vault modélise comme une étape explicite (TRF-0001). |
| FIELD-003 (Valeur du terrain) | — | **Absent du code.** | Pas de champ, pas de calcul, pas de collecte. |
| FIELD-004 (Valeur du bâti) | `AmortissementComponent` (agrégé) | **Indirect.** La valeur du bâti est implicite dans la somme des composants d'amortissement. | Pas de champ atomique. La valeur est dérivée, pas stockée. |
| FIELD-006 (Frais d'acquisition) | `notaryFees` (dans LogementFormValues) | **Partiel.** Seuls les frais de notaire sont collectés. Les frais d'agence sont absents. | Le code ne distingue pas frais de notaire / frais d'agence / frais de dossier. |
| FIELD-007 (Adresse) | `address` (dans LogementFormValues) | Aligné | |
| FIELD-009 (Code postal) | `postalCode` | Aligné | |
| FIELD-010 (Ville) | `city` | Aligné | |
| FIELD-012 (Type de bien) | `propertyType` | **Divergence de taxonomie.** Vault : appartement, maison, résidence services. Code : appartement, maison, meublé-tourisme, chambre-hôte, non-classé. | Le code mélange type de bien (appartement/maison) et type d'exploitation (tourisme/hôte). |
| FIELD-013 (Surface habitable) | `surface` | Aligné | |
| FIELD-024 (État du bien) | — | **Absent du code.** Neuf/ancien non collecté. | |

## 3.3 Concepts métier

| Ontologie | Code | Correspondance |
|---|---|---|
| Axiome (AX-xxx) | — | **Absent.** Aucun axiome n'est référencé dans le code. Les contraintes sont implicites dans la logique applicative. |
| Savoir (SAV-xxx) | — | **Absent.** Les connaissances factuelles (taux, seuils, fourchettes) sont codées en dur dans les composants ou les prompts IA. |
| Jugement (JUG-xxx) | — | **Absent.** Les choix (ventilation, traitement des frais) sont soit figés dans le code, soit délégués à l'IA sans formalisation. |
| Raisonnement (RAI-xxx) | Pipeline de composants (LogementDocumentStep → extraction → validation → amortissement) | **Implicite.** L'ordre d'exécution existe mais il est codé dans le routing et les composants, pas dans une connaissance formelle. |

## 3.4 bis Cycle de vie du dossier — FiscalYearStatus → STATE-001

Ajouté en v1.1, à l'occasion de la Phase 1 de la migration runtime vers STATE-001 (Cycle de vie d'un dossier).

Le code possédait déjà, avant cette migration, un statut de dossier à 6 valeurs (`FiscalYearStatus` : `draft`, `collecting_documents`, `analyzing`, `pending_validation`, `ready_to_close`, `closed`), produit par une fonction pure existante (`resolveFiscalYearStatus`, `src/lib/lmnp/engine/workspace-progress.ts`) et réellement maintenu par le reducer à chaque transition (`touchFiscalYear`). Ce n'était pas un champ vestigial — une vérification initiale, fondée sur un seul point de lecture, l'avait laissé penser à tort ; une vérification des points d'écriture a montré le contraire.

**Principe retenu : une seule logique de dérivation des états fonctionnels du dossier.**

`resolveFiscalYearStatus()` reste l'unique propriétaire de la lecture des documents, des validations et de `canClose`. Une nouvelle fonction, `deriveStatutDossier()` (`src/lib/lmnp/engine/dossier-status.ts`), ne relit jamais ces signaux — elle consomme uniquement `fiscalYear.status` déjà résolu, et l'affine vers les 13 états de STATE-001 à l'aide des seuls signaux non portés par `FiscalYearStatus` (timestamps de confirmation par Feature pour subdiviser `draft` ; timestamps de clôture pour subdiviser `closed`).

| `FiscalYearStatus` | États STATE-001 dérivés | Signal de raffinement utilisé |
|---|---|---|
| `draft` | DOSSIER_CREE, INFORMATIONS_GENERALES, BIEN_EN_COURS, DOCUMENTS_EN_ATTENTE | `regimeConfirmedAt`, `inpiConfirmedAt`, `logementConfirmedAt` |
| `collecting_documents` | DOCUMENTS_IMPORTES | aucun (correspondance directe) |
| `analyzing` | ANALYSE_DOCUMENTAIRE | aucun (correspondance directe) |
| `pending_validation` | INFORMATIONS_MANQUANTES | aucun (correspondance directe) |
| `ready_to_close` | DOSSIER_COMPLET | aucun (correspondance directe) |
| `closed` | CALCUL_TERMINE, DECLARATION_GENEREE, DOSSIER_TERMINE | `declarationGeneratedAt`, `transmittedAt` |

**Deux états de STATE-001 ne sont jamais produits par cette dérivation — approximations runtime, pas des règles métier révisées :**

- **BIEN_COMPLETE** : transitoire. `FiscalYearStatus` reste `draft` tant qu'aucun document n'est arrivé ; dès que `logementConfirmedAt` est renseigné, l'état dérivé passe directement à DOCUMENTS_EN_ATTENTE.
- **CALCUL_EN_COURS** : non observable. Le calcul fiscal est une fonction pure synchrone, sans état intermédiaire persisté dans le runtime actuel.

Ces deux limites sont documentées dans le code (`dossier-status.ts`) et ici de façon identique, pour qu'un futur changement d'architecture (calcul asynchrone, étape Bien explicitement distincte) sache exactement où et pourquoi l'approximation a été prise.

### Ce qu'une divergence avec resolveDeclarationProgress signifie — et ce qu'elle ne signifie pas

Ajouté en v1.2, à l'issue de la Phase 2 (shadow comparison) de la migration. La comparaison entre la dérivation STATE-001 et `resolveDeclarationProgress()` (`declaration-progress.ts`) a révélé un scénario réel : un Dossier peut avoir `fiscalYear.status = "closed"` (documents traités, validations résolues) alors que `resolveDeclarationProgress` reste bloqué sur une étape antérieure au paiement (SIREN, régime social, TVA non renseignés).

**Ce n'est pas une incohérence à corriger.** Ce sont deux concepts distincts, dont l'écart est normal et attendu :

- **la complétude métier du Dossier** (`FiscalYearStatus`, puis STATE-001 après raffinement) — l'état du travail que l'IA et le Validation Engine ont accompli sur le contenu du Dossier (documents, anomalies, validations) ;
- **la progression de l'utilisateur dans le parcours de déclaration** (`resolveDeclarationProgress`) — l'exhaustivité du formulaire administratif que l'utilisateur doit lui-même compléter (identité, régime social, TVA, paiement, signature, télétransmission) pour produire la liasse.

Un Dossier "complet" au premier sens n'implique pas que l'utilisateur ait terminé le second. Ces deux mécanismes ne doivent jamais être réconciliés artificiellement — ni en enrichissant `FiscalYearStatus`/STATE-001 des signaux du parcours de déclaration, ni l'inverse. Ce sont deux sources de vérité légitimes, chacune sur son propre périmètre. Documenté de façon identique dans le code (`dossier-status-shadow.ts`).

### document-journey-progress.ts — absence de duplication avec STATE-001

Ajouté en v1.3, à l'issue de la qualification de la Phase 4.1 (migration runtime). Une lecture complète de `document-journey-progress.ts` (7 fonctions : `isDocumentJourneyStarted`, `isDocumentStepComplete`, `isDocumentJourneyComplete`, `inpiJourneyHref`, `resolveCurrentDocumentStepId`, `resolveCurrentDocumentStepHref`, `getDocumentJourneyProgress`) a montré que ce module **ne duplique pas STATE-001** et n'a donc pas été migré.

**STATE-001 décrit la phase métier du Dossier** : trois états génériques pour la période documentaire (DOCUMENTS_EN_ATTENTE, DOCUMENTS_IMPORTES, ANALYSE_DOCUMENTAIRE), sans distinction de catégorie de document.

**`document-journey-progress.ts` décrit la granularité opérationnelle du parcours documentaire** : lequel, parmi 7 catégories précises (INPI, logement, crédit immobilier, bail, taxe foncière, assurance, factures travaux), reste à fournir, avec appariement par motif de nom de fichier et routage vers l'écran d'upload correspondant.

Faire déléguer ce module à `deriveStatutDossier()` aurait, au choix, supprimé une capacité réelle (savoir précisément quelle pièce manque) ou obligé STATE-001 à porter une granularité par catégorie de document qu'aucun besoin réel n'a justifiée — contraire à DIR-001. Ce module reste donc inchangé, non migré, et cette absence de migration est un choix documenté, pas un oubli.

### businessStepsComplete() vs DOSSIER_COMPLET — deux responsabilités distinctes, en observation

Ajouté en v1.4, à l'issue de la qualification de la Phase 4.2 (migration runtime). `resolveDashboardHeroState()` contient une logique de priorisation ad hoc réelle (une cible de migration légitime, à la différence de la Phase 4.1), mais son critère de complétude, `businessStepsComplete()` (`workflow-progression.ts`), n'a pas été remplacé par `DOSSIER_COMPLET` (STATE-001) : une vérification a montré que les deux répondent à des questions différentes.

- **`businessStepsComplete()`** : l'utilisateur a-t-il confirmé chaque étape guidée (Activité, Logement, Crédit, Revenus, Charges, Amortissement) — via `declarationDraft.xxxConfirmedAt`.
- **`DOSSIER_COMPLET`** (`fiscalYear.status === "ready_to_close"`, via `journeyFlags.dossierDone`) : les documents requis par type (`DocumentType`) ont-ils été fournis et analysés, sans alerte bloquante ni validation en attente.

Un dossier peut satisfaire l'un sans l'autre — notamment via les options de saisie manuelle proposées par certains Assistants (ex. F010LogementAssistant, "Non, je saisirai les montants"), qui confirment une étape sans que le document requis correspondant ait été fourni et analysé.

**Aucune fusion n'est effectuée.** Une comparaison en parallèle (`dossier-completeness-shadow.ts`), sans effet sur le comportement du produit, mesure la convergence des deux notions sur des dossiers réels. Ni l'une ni l'autre n'est déclarée prioritaire tant que l'observation n'aura pas démontré qu'une fusion est légitime.

## 3.4 Architecture d'exécution

| Ontologie (Engines) | Code | Correspondance |
|---|---|---|
| Document Engine (ENG-002) | `uploadDocument.ts`, `DocumentsWorkspace.tsx` | Aligné structurellement |
| OCR Engine (ENG-003) | `/api/lmnp/ocr/route.ts`, `/api/lmnp/ocr/vision-text/route.ts` | Aligné |
| Classification Engine (ENG-004) | `classify-document.ts`, `resolve-document-classification.ts` | Aligné |
| Question Engine (ENG-006) | `LogementProfileFields.tsx`, `CreditFinancingFields.tsx` | **Implicite.** Les formulaires jouent le rôle du Question Engine mais sans formalisation des questions manquantes. |
| Calculation Engine (ENG-007) | — | **Absent pour l'acquisition.** Les calculs d'amortissement existent partiellement mais le prix de revient n'est jamais calculé. |
| Validation Engine (ENG-005) | `recomputeAlerts()` (`src/lib/lmnp/engine/alerts.ts`) | **Partiel.** Produit un rapport agrégé (`Alert[]`) consommé par le reste du runtime. Une seconde vérification de cohérence documentaire existe séparément et ne rejoint pas ce rapport — voir note ci-dessous. |

### Validation Engine (ENG-005 v2) — deux sorties runtime distinctes pour une seule prévue

Ajouté en v1.5, à la suite de l'approbation d'ENG-005 v2 (Validation Engine : exécution de Rules de validation agrégées en un Validation Report unique).

Le runtime contient aujourd'hui deux mécanismes de validation, non reliés entre eux :

- **`recomputeAlerts()`** (`src/lib/lmnp/engine/alerts.ts`) — opère sur `EngineContext`, l'agrégat du dossier (documents, `validationItems`, `ledgerEntries`, flags dérivés). Il fusionne plusieurs vérifications internes (présence documentaire requise, cohérence prêt/attestation, confiance des `validationItems`, complétude des champs requis) via `dedupeAlerts()`, et produit `Alert[]` — la seule sortie de validation aujourd'hui consommée en aval : `journey.ts` (décision `dossierDone`/`canClose`), `workspace-progress.ts` (`openAlertCount`), ainsi que `confidence.ts` et `assistant-brief.ts` à titre informatif (conforme à KS-ENG §3.7). C'est la sortie runtime la plus proche du Validation Report d'ENG-005 v2.

- **`detectDocumentInconsistencies()`** (`src/lib/lmnp/ocr/coherence.ts`) — opère sur un seul document, au moment de son extraction (`map-to-extractions.ts`), avant toute agrégation au niveau du dossier. Il produit `DocumentInconsistency[]`, stocké dans `DocumentOcrMeta.inconsistencies` et lu uniquement par `DocumentValidationCard.tsx`. Ce résultat n'atteint jamais `EngineContext`, `Alert[]`, ni aucun consommateur en aval.

Le type `AlertCode` (`src/lib/lmnp/types/domain.ts`) déclare deux codes, `A06_UNRESOLVED_CONFLICT` et `A08_DOCUMENT_INCONSISTENCY`, qu'aucune des deux implémentations ne produit aujourd'hui.

Une vérification de présence plus étroite, `isLogementProfileIncomplete()` (`src/lib/lmnp/services/logement-profile.ts`), existe également, limitée aux champs du tunnel Logement. Elle ne couvre ni la cohérence documentaire ni le dossier dans son ensemble et ne constitue pas, à elle seule, l'implémentation du Validation Engine.

État réel, sans anticipation de convergence : ENG-005 v2 prévoit un Validation Report unique, quel que soit le nombre de Rules de validation exécutées. Le runtime actuel en produit deux, dont un seul (`Alert[]`) rejoint effectivement le Workflow et les composants informatifs. Ce document constate cet écart ; il ne prescrit aucune unification.

---

# 4. Mapping détaillé du flux Acquisition

## 4.1 Ce que le code fait aujourd'hui

```
1. Upload acte notarié → Document stocké (IndexedDB + Supabase)
2. OCR → Texte extrait (/api/lmnp/ocr)
3. Classification → documentType: "notary_deed"
4. Extraction IA → Extraction[] (prix, adresse, date)
5. Affichage formulaire → LogementProfileFields
6. Utilisateur confirme → LogementFormValues sauvegardées
7. Background extraction → PropertyBackgroundExtraction
   (acquisitionPrice, notaryFees, furnitureAmount, amortizationHints)
8. Fin du tunnel Logement → logementConfirmedAt
```

## 4.2 Ce que l'ontologie prévoit

```
1. Upload acte notarié → Document reçu
2. OCR → Texte extrait
3. Classification → Type identifié
4. Extraction → Observations brutes (agnostiques du domaine)
5. Interprétation → Candidate Values (ciblant des Fields)
6. Validation automatique → Cohérence vérifiée (SAV-002 : frais 7-8%)
7. Questions ciblées → Données manquantes collectées
8. Résolution → Valeurs d'entrée de TRF-0001
9. TRF-0001 → prix_revient, montant_mobilier_isolé, frais_en_charges
10. TRF-0002 → valeur_terrain, valeur_bâti, base_amortissable_bâti
11. Vérifications → VER-001 à VER-005
```

## 4.3 Écarts séquentiels

| Étape ontologie | Étape code | Écart |
|---|---|---|
| 4. Observations brutes (agnostiques) | 4. Extraction ciblant un FieldKey | Le code saute l'étape d'interprétation. L'extraction cible directement un champ. Les cas ambigus (mobilier dans le prix) ne sont pas gérés. |
| 5. Candidate Values avec alternatives | — | **Absent.** Le code ne produit qu'une seule interprétation par extraction. Pas d'alternatives. |
| 6. Validation par cohérence (SAV-002) | — | **Absent.** Le code ne vérifie pas que les frais de notaire sont cohérents avec le prix. |
| 7. Questions ciblées sur les manques | 5. Formulaire complet affiché | Le code affiche tous les champs. L'ontologie ne pose que les questions nécessaires. |
| 9. TRF-0001 (prix de revient) | — | **Absent.** Le code ne calcule pas le prix de revient. |
| 10. TRF-0002 (ventilation) | 7. amortizationHints (texte) | Le code produit un hint textuel. L'ontologie produit des valeurs calculées et traçables. |
| 11. Vérifications formelles | — | **Absent.** |

---

# 5. Stratégie de convergence

Ce document ne prescrit pas de refactoring. Il identifie les chemins de convergence progressive.

## 5.1 Convergence immédiate (sans refactoring)

| Action | Impact |
|---|---|
| Ajouter les FieldKeys d'acquisition au FIELD_REGISTRY (`property.purchasePrice`, `property.notaryFees`, `property.agencyFees`, `property.condition`, `property.furnitureIncluded`, `property.furnitureAmount`) | Aligne le registre de champs avec le Vault. Aucun calcul ajouté. |
| Ajouter la validation de cohérence frais/prix dans `isLogementProfileIncomplete()` | Implémente SAV-002 sans modifier l'architecture. |
| Documenter les Jugements implicites du code (ex: le prix exclut déjà le mobilier → JUG implicite) | Rend visible ce qui est caché. |

## 5.2 Convergence à moyen terme (refactoring ciblé)

| Action | Impact |
|---|---|
| Créer un service `computeAcquisitionCost()` implémentant TRF-0001 | Le prix de revient devient un calcul formel. |
| Créer un service `computeLandBuildingSplit()` implémentant TRF-0002 | La ventilation devient un calcul structuré. |
| Connecter les sorties de ces services au pipeline d'amortissement existant | Les composants d'amortissement reçoivent une base traçable. |
| Ajouter le choix intégration/déduction des frais (JUG-001) dans le formulaire | L'utilisateur peut exercer ce Jugement. |

## 5.3 Convergence à long terme (architecture cible)

| Action | Impact |
|---|---|
| Séparer Extraction et Interprétation (Observation → Candidate Value) | Les cas ambigus sont gérés explicitement. |
| Implémenter les gardes-fous de TRF-0001 et TRF-0002 | Les valeurs aberrantes sont détectées automatiquement. |
| Implémenter la traçabilité complète (C12) : chaque LedgerEntry pointe vers sa Candidate Value, son Observation et son document | La chaîne de preuve est complète jusqu'au PDF. |
| Référencer les Axiomes dans le code (commentaires ou constantes nommées) | Les contraintes fondamentales sont visibles et protégées. |

---

# 6. Dictionnaire de traduction

Pour la communication entre le Vault et le code, les termes suivants sont équivalents :

| Terme Vault (Ontologie) | Terme Code (Next.js) | Notes |
|---|---|---|
| Observation | Extraction (partiel) | Le code n'a pas de phase brute/interprétée |
| Candidate Value | ValidationItem (partiel) | Le code ne gère pas les alternatives |
| Résolution | LedgerEntry (partiel) | Le code perd la trace des rejets |
| Transformation | — (à créer) | Service de calcul formel |
| Vérification | — (à créer) | Test métier formel |
| Axiome | — (implicite) | Contrainte codée en dur |
| Savoir | — (dispersé) | Valeur codée en dur dans les prompts ou composants |
| Jugement | — (implicite ou absent) | Choix figé ou délégué à l'IA |
| Raisonnement | Routing + composants | Ordre d'exécution implicite |
| Field (FIELD-xxx) | FieldKey + LogementFormValues | Deux registres non unifiés |
| Entity (ENT-xxx) | Types TypeScript (Property, LmnpDocument, etc.) | Structurellement aligné |
| Engine (ENG-xxx) | API routes + services | Aligné pour OCR/Classification, absent pour Calculation |
| State (STATE-001, Cycle de vie du dossier) | `FiscalYearStatus` (6 valeurs) + `deriveStatutDossier()` (raffinement, v1.1) | Partiel — 11 des 13 états produits ; BIEN_COMPLETE et CALCUL_EN_COURS non observables (cf. §3.4 bis) |

---

# 7. Règle d'or de la convergence

Le code ne doit jamais contredire l'ontologie.

Si le code implémente un comportement non documenté dans le Vault, ce comportement doit être :
1. Identifié comme un écart.
2. Proposé comme évolution du Knowledge System.
3. Validé par le Product Owner.
4. Documenté dans le Vault.
5. Puis seulement maintenu dans le code.

Un comportement non documenté n'est pas un feature — c'est une dette de connaissance.
