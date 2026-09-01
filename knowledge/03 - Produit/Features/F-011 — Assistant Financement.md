---
id: F-011
title: Assistant Financement
type: feature
status: approved
version: "1.0"
created: 2026-06-30
updated: 2026-06-30
owner: product-owner
priorité: haute
tags: [feature, financement, crédit, emprunt, intérêts, lmnp]
jtbd: [JTBD-003]
profils: [PROF-001, PROF-002, PROF-004, PROF-005]
ux-patterns: [UXP-001]
---

# F-011 — Assistant Financement

---

# Mission

Identifier et isoler, pour chaque exercice fiscal, les charges de financement déductibles liées au(x) emprunt(s) contracté(s) pour ce bien.

Cet Assistant n'est pas un outil de gestion de crédit. Il ne calcule pas le coût total du prêt. Il extrait, pour la période exacte de l'exercice, les intérêts déductibles — et uniquement eux.

**L'Assistant est conditionnel.** Si aucun emprunt n'a financé ce bien, l'Assistant se termine immédiatement après confirmation (chemin skip). Aucune information n'est collectée inutilement.

---

# Valeur utilisateur

À l'issue de cet Assistant, l'utilisateur sait exactement combien il peut déduire au titre de son financement — sans avoir eu à comprendre la différence entre capital et intérêts, ni à refaire les calculs de sa banque.

S'il a un tableau d'amortissement, il l'importe et confirme. S'il ne l'a plus, il répond à quatre questions et obtient le même résultat.

---

# Déclencheur

L'utilisateur accède à l'étape "Financement" de son dossier LMNP, depuis le Workflow Engine, après la complétion de l'Assistant Logement (F-010).

---

# Préconditions

- L'Assistant Logement est terminé (événement `LOGEMENT_TERMINE` reçu)
- La `date_mise_en_service` est connue (produite par F-009 — indispensable pour isoler la période pré-exploitation)
- L'utilisateur est authentifié
- **Cet Assistant peut être entièrement ignoré** si l'utilisateur confirme l'absence de tout emprunt

---

# Job To Be Done

**Référence :** JTBD-003 — Déduire correctement mes charges de financement LMNP *(à documenter dans le KS)*

> Lorsque j'ai financé mon bien LMNP avec un ou plusieurs emprunts,
> je veux que Fiscal AI identifie exactement la part déductible de mes charges de financement pour chaque exercice fiscal,
> afin de maximiser mes charges déductibles sans commettre d'erreur qui exposerait ma déclaration à un contrôle.

**Distinction avec JTBD-001 et JTBD-002 :** JTBD-001 établit l'identité de l'activité. JTBD-002 établit la constitution physique et financière du bien. JTBD-003 établit le coût annuel du financement de ce bien — une charge récurrente, recalculée à chaque exercice.

**Règle fiscale fondamentale (jamais exposée telle quelle à l'utilisateur) :**
Dans le LMNP réel, les intérêts d'emprunt sont déductibles comme charges. Le remboursement du capital ne l'est jamais. La mensualité n'est donc jamais entièrement déductible — seule la partie intérêts l'est. L'Assistant absorbe cette complexité sans jamais demander à l'utilisateur de calculer quoi que ce soit.

---

# Diagnostic de situation

**Principe appliqué :** Constitution P16 (diagnostic avant demande) et P19 (moindre friction).

## Niveau 1 — Y a-t-il un emprunt ?

| Situation | Chemin |
|---|---|
| Aucun emprunt (achat comptant) | Skip immédiat → FINANCEMENT_SKIP |
| Prêt entièrement remboursé avant l'exercice | Skip immédiat (avec confirmation que CRD = 0) |
| Un seul emprunt en cours | Chemin A — prêt unique |
| Plusieurs emprunts en cours | Chemin B — multi-prêts |
| L'utilisateur n'est pas sûr | Chemin C — guidé |

Cette question est posée en langage courant : "Avez-vous financé ce bien avec un crédit ?"

## Niveau 2 — Disponibilité du tableau d'amortissement (par prêt)

| Disponibilité | Chemin de collecte |
|---|---|
| Tableau complet disponible | Import → extraction automatique |
| Tableau perdu ou inaccessible | Reconstruction depuis 4 inputs (capital, taux, durée, date_début) |
| Tableau partiel (renégociation, rachat) | Import partiel + reconstruction des segments manquants |
| Prêt in fine | Saisie directe : capital × taux → intérêts constants, sans tableau |

**Note aux futurs auteurs :**
Contrairement aux assistants précédents où le chemin sans document est un chemin dégradé, ici les deux chemins (avec ou sans tableau) produisent un résultat de précision identique. La reconstruction mathématique depuis 4 inputs est exacte — ce n'est pas une estimation. Le chemin "sans tableau" ne doit jamais être présenté comme inférieur.

---

# Résultat attendu

| Output | Source | Validé par |
|---|---|---|
| `interets_emprunt_exercice` (par prêt, puis agrégé) | Extraction ou reconstruction | Validation Engine (cohérence tableau) |
| `interets_pre_exploitation` (isolés, non déductibles) | Calcul depuis date_mise_en_service | Validation Engine |
| `assurance_emprunt_exercice` (par prêt, puis agrégé) | Extraction ou saisie | Confirmation utilisateur |
| `frais_dossier_deductibles` (si exercice de souscription) | Extraction ou saisie | Confirmation utilisateur |
| `garantie_deductible` (si exercice de souscription) | Extraction ou saisie | Confirmation utilisateur |
| `ira_deductible` (si remboursement anticipé dans l'exercice) | Extraction ou saisie | Confirmation utilisateur |
| `capital_restant_du_31_12` (par prêt, informatif) | Extraction ou calcul | Validation Engine |
| `total_charges_financement_exercice` | Calcul (somme des lignes déductibles) | Confirmation utilisateur |

L'Explanation Engine traduit ce résultat en : "Sur [exercice], vos charges de financement déductibles s'élèvent à €X. Ce montant inclut €Y d'intérêts et €Z d'assurance. Les €W de remboursement de capital ne sont pas déductibles — c'est normal."

---

# Entrées

## Entités

- Dossier LMNP (identifiant, exercice fiscal, état)
- `date_mise_en_service` (produite par F-009 — obligatoire pour l'isolation pré-exploitation)
- Liste des prêts associés au bien (créée ou enrichie par cet Assistant)

## Fields collectés — avec mode d'obtention

| Field | Type | Mode d'obtention | Obligatoire | Note |
|---|---|---|---|---|
| `presence_emprunt` | Boolean | **Demandé — toujours** | Oui | Si faux → skip immédiat |
| `nombre_prets` | Integer | Demandé si présence = vrai | Oui | Déclenche la boucle par prêt |
| `type_pret` | Enum (amortissable/in_fine/variable/relais) | Extrait / Demandé / Déduit | Par prêt | Déduit des caractéristiques si absent |
| `capital_initial` | Montant | Extrait / **Demandé** | Par prêt | Input de reconstruction si pas de tableau |
| `taux_nominal` | % | Extrait / **Demandé** | Par prêt | Input de reconstruction |
| `duree_mois` | Integer | Extrait / **Demandé** | Par prêt | Input de reconstruction |
| `date_premiere_mensualite` | Date | Extraite / **Demandée** | Par prêt | Input de reconstruction |
| `tableau_amortissement` | Table | Extrait (import document) | Non (optionnel) | Si absent → reconstruction |
| `interets_exercice` | Montant | **Calculé** (extraction ou reconstruction) | Par prêt | Jamais saisi manuellement |
| `capital_rembourse_exercice` | Montant | **Calculé** | Par prêt | Informatif — non déductible |
| `crd_31_12` | Montant | **Calculé** | Par prêt | Bilan comptable |
| `assurance_type` | Enum (bancaire/externe) | **Demandé** | Par prêt | Conditionne le mode de collecte |
| `assurance_montant_annuel` | Montant | Extrait / **Demandé** | Par prêt | |
| `frais_dossier` | Montant | Extrait (offre de prêt) / Demandé | Non | Déductible l'année de souscription uniquement |
| `type_garantie` | Enum (hypothèque/IPPD/caution/aucune) | **Demandé** | Par prêt | Détermine le traitement fiscal |
| `commission_caution` | Montant | Extrait (attestation CL) / Demandé | Si caution | Déductible l'année de souscription |
| `ira_montant` | Montant | Extrait / Demandé | Si remb. anticipé | Déductible si exercice de remboursement |
| `date_reneg_ou_rachat` | Date | Demandée | Si applicable | Permet de joindre deux tableaux |

## Moyens possibles (par prêt)

*Particularité de F-011 : les deux premiers moyens produisent un résultat de précision égale. L'ordre reflète la préférence habituelle des utilisateurs, non une hiérarchie de qualité.*

| Moyen | Engines mobilisés | Effort utilisateur |
|---|---|---|
| Import du tableau d'amortissement PDF | Document, OCR, Classification, RT-003, Validation | Faible — confirmation des totaux |
| Reconstruction depuis 4 inputs (sans document) | Question, Calculation, Validation | Faible — 4 chiffres à saisir |
| Import partiel + reconstruction des segments (renégociation) | Document + Question + Calculation | Modéré |
| Saisie des intérêts annuels directement (si connu) | Question, Validation | Modéré — plus risqué (erreur utilisateur) |

## Événements entrants

- `LOGEMENT_TERMINE` (précondition)
- `QUESTION_REPONDUE`
- `DOCUMENT_ANALYSE` (si import d'un tableau)
- `PRET_CONFIGURE` (émis pour chaque prêt complété — déclenche le suivant en multi-prêts)

---

# Sorties

## Entités créées

- `Emprunt[]` : type, capital_initial, taux, durée, date_début, type_garantie, assurance_type
- `EchéancierAnnuel` : par exercice, par prêt — intérêts, capital, CRD, assurance
- `ChargesFinancement` : total déductible de l'exercice, détail par ligne

## Événements produits

- `FINANCEMENT_SKIP` — aucun emprunt confirmé (cas cash)
- `PRET_CONFIGURE` — émis après validation de chaque prêt individuel
- `FINANCEMENT_TERMINE` — tous les prêts configurés, output agrégé validé

## État modifié

`LOGEMENT_CONFIGURE` → `FINANCEMENT_CONFIGURE` (ou `FINANCEMENT_SKIP`)

---

# Engines concernés

| Engine | Rôle dans cet Assistant | Spécificité vs. F-010 |
|---|---|---|
| Workflow Engine | Gère le skip, la boucle par prêt, les transitions d'état | Première boucle répétitive dans notre architecture |
| Document Engine | Reçoit les tableaux d'amortissement (PDF tabulaires) | Format plus structuré que l'acte notarié — mais volume 240+ lignes |
| OCR Engine | Confiance haute attendue (PDF machine) | Vigilance sur : formats propriétaires de banques, vieux PDFs scannés |
| Classification Engine | Reconnaître "Tableau d'amortissement", "Offre de prêt", "Attestation assurance", "Attestation Crédit Logement" | Sous-types probablement absents de la taxonomie actuelle — point de vigilance (2/3) |
| Calculation Engine | **Génère l'échéancier complet depuis 4 inputs (capacité générative nouvelle)** | Première utilisation en mode génératif — non documenté dans les specs actuelles (1/3) |
| Validation Engine | Cohérence interne du tableau + isolation intérêts pré-exploitation | Première validation temporelle (avant/après date_mise_en_service) |
| Question Engine | Explication de la règle capital/intérêts pour PROF-001 avant affichage des résultats | Rôle d'explication contextuelle (2/3 — également observé dans F-010) |
| Explanation Engine | Traduit charges déductibles + capital non déductible en langage simple | Distinction déductible/non-déductible à rendre évidente sans jargon |

**Points de vigilance Engine :**

1. **Calculation Engine — mode génératif.** Jusqu'ici, le Calculation Engine appliquait des formules à des valeurs fournies (TRF-0001 à TRF-0014). Ici, il génère une série temporelle complète (tableau d'amortissement) depuis des inputs minimaux. Cette capacité n'est pas documentée dans les spécifications Engine actuelles. Candidat en observation (1/3).

2. **Classification Engine — sous-types manquants.** La taxonomie de documents ne couvre probablement pas les types spécifiques à cet Assistant (tableau d'amortissement, offre de prêt acceptée, attestation d'assurance emprunteur, attestation Crédit Logement). Seconde occurrence de cette lacune (2/3 — première : sous-types de l'acte notarié dans F-010).

3. **Question Engine — explication contextuelle.** La distinction capital/intérêts doit être expliquée à l'utilisateur AVANT d'afficher le résultat — non comme collecte d'information, mais comme aide à la compréhension. Seconde occurrence de ce rôle étendu (2/3 — première : JUG-001/JUG-002 dans F-010).

---

# Règles fiscales concernées

| Référence | Rôle dans cet Assistant |
|---|---|
| AX-006 (analogue) | Les charges de financement ne sont déductibles qu'à compter de la date de mise en service. Intérêts pré-exploitation = non déductibles pour l'exercice courant. |
| SAV-xxx (à créer) | Intérêts d'emprunt : déductibles comme charges (ligne 23 P) |
| SAV-xxx (à créer) | Capital remboursé : jamais déductible en LMNP réel |
| SAV-xxx (à créer) | IRA (indemnités de remboursement anticipé) : déductibles comme charges l'année du remboursement |
| SAV-xxx (à créer) | Commission de caution Crédit Logement : déductible à la souscription ; restitution fonds mutuel = revenu à déclarer |
| SAV-xxx (à créer) | Assurance emprunteur (bancaire ou en délégation) : déductible comme charge |
| JUG-xxx (à créer) | Frais de dossier bancaire : déductible en charges ou intégré au prix de revient (choix analogue à JUG-001) |

**Alerte KS :** Plusieurs règles fiscales centrales à cet Assistant ne sont pas encore documentées dans le Knowledge System (SAV sur déductibilité des intérêts, capital non déductible, IRA, caution). Ces règles sont des faits fiscaux stables — elles méritent d'être des SAV dans la Zone 01. Ce n'est pas une découverte de conception produit — c'est un manque de documentation métier à combler avant l'implémentation.

---

# Parcours utilisateur

## Niveau 1 — Qualification

```
"Avez-vous financé ce bien avec un crédit ?"
│
├── Non / Remboursé avant l'exercice
│    → Confirmation + traçabilité : "Aucune charge de financement pour cet exercice."
│    → FINANCEMENT_SKIP
│
└── Oui
     └── "Combien de prêts couvrent ce bien sur cet exercice ?"
          ├── 1 prêt    → Boucle prêt (1 fois)
          ├── 2+ prêts  → Boucle prêt (N fois, séquentiellement)
          └── Je ne sais pas → "Avez-vous contracté un prêt séparé pour des travaux ?"
                              → Redirige vers 1 ou 2+
```

## Niveau 2 — Boucle par prêt

```
Pour chaque prêt :

  Avez-vous le tableau d'amortissement de ce prêt ?
  │
  ├── Oui → Import du tableau
  │          Extraction : capital, taux, mensualités, intérêts ligne par ligne
  │          Identification de la plage couvrant l'exercice
  │          Isolation des intérêts avant date_mise_en_service
  │          Confirmation des montants extraits
  │
  ├── Non → "Je vais reconstituer votre tableau depuis quelques informations."
  │          Q1 : Montant emprunté ?
  │          Q2 : Taux d'intérêt annuel ?
  │          Q3 : Durée du prêt (en mois ou en années) ?
  │          Q4 : Date de la première mensualité ?
  │          → Calculation Engine génère l'échéancier complet
  │          → Isolation de la plage exercice + pré-exploitation
  │          → Confirmation
  │
  ├── Prêt in fine → Capital × Taux = intérêts annuels (constants)
  │                  Confirmation du capital et du taux uniquement
  │
  └── Tableau partiel (renégociation / rachat)
       → Import des segments disponibles
       → Date de renégociation / rachat ?
       → Reconstruction des segments manquants
       → Raccordement des deux périodes

  Dans tous les cas :

  Type d'assurance ?
  ├── Bancaire (dans le tableau) → extrait automatiquement
  └── Externe (délégation)       → montant annuel saisi

  Type de garantie ?
  ├── Hypothèque / IPPD → frais intégrés au prix de revient (F-010)
  ├── Caution CL/CAMCA  → commission saisie (déductible) + alerte restitution fonds
  └── Aucune           → rien à déclarer

  Y a-t-il eu un remboursement anticipé ou une renégociation dans l'exercice ?
  ├── Oui → IRA = ? (déductible)
  └── Non → pas de champ supplémentaire

  → Résumé du prêt :
    Intérêts déductibles de l'exercice : €X
    dont pré-exploitation (non déductibles) : €Y
    Assurance déductible : €Z
    Capital remboursé (non déductible) : €W
    CRD au 31/12 : €V

  PRET_CONFIGURE →
```

## Convergence

```
Après configuration de tous les prêts :

Explanation Engine :
"Sur l'exercice [AAAA], vos charges de financement déductibles s'élèvent à €TOTAL,
 dont €X d'intérêts d'emprunt et €Y d'assurance.
 Les €Z de remboursement de capital ne sont pas déductibles — c'est normal et attendu."
[Si pré-exploitation] "€W d'intérêts payés avant votre première mise en location ne sont
 pas déductibles cette année. Vous pouvez les intégrer à vos frais d'acquisition."

Confirmation utilisateur → FINANCEMENT_TERMINE
```

---

# Contraintes métier

- Les intérêts payés avant la `date_mise_en_service` (F-009) ne sont jamais déductibles comme charges de l'exercice. Ils doivent être isolés, quantifiés, et présentés à l'utilisateur avec une explication de leur traitement possible (intégration aux frais d'acquisition).
- Le capital remboursé n'est jamais une charge déductible. Cette vérité ne doit pas apparaître comme un manque — elle doit être expliquée.
- Si deux prêts couvrent le même bien, leurs intérêts et assurances sont additionnés avant présentation.
- Un prêt in fine ne produit aucun remboursement de capital pendant sa durée — le CRD reste constant d'un exercice à l'autre (vérification de cohérence).
- La commission de caution Crédit Logement est déductible uniquement l'année de souscription du prêt. Si l'utilisateur la saisit pour une année ultérieure, alerte.
- Si l'utilisateur saisit manuellement les intérêts de l'exercice sans reconstruction, le Validation Engine doit vérifier la cohérence avec les paramètres du prêt déclarés (capital, taux, durée) — les intérêts ne peuvent pas dépasser `capital × taux`.

---

# Cas limites

| Situation | Comportement attendu |
|---|---|
| Prêt souscrit et remboursé dans le même exercice | Intérêts calculés prorata temporis sur la période effective |
| Exercice en cours avec mois restants | Calcul sur les mois écoulés uniquement — pas de projection |
| Taux variable : changement de taux en cours d'exercice | Deux calculs segmentés + somme |
| Renégociation sans IRA | Nouveau tableau depuis la date de renégociation — aucune pénalité à saisir |
| Assurance changée en cours d'exercice (loi Lemoine) | Deux montants pro-ratisés à additionner |
| Prêt familial sans intérêts | Skip de cet emprunt (aucune charge déductible) + note explicative |
| CRD reconstruit ≠ CRD déclaré sur relevé bancaire | Alerte + demande de vérification — écart possible si remboursement anticipé non signalé |
| Tableau au format propriétaire banque non reconnu | Bascule vers reconstruction depuis 4 inputs |

---

# Dépendances

| Feature | Relation |
|---|---|
| F-009 — Assistant Activité | Fournit `date_mise_en_service` pour l'isolation pré-exploitation |
| F-010 — Assistant Logement | Fournit `prix_revient` pour vérification de cohérence (capital ≤ prix du bien) |
| F-006 — Calcul fiscal | Consomme `total_charges_financement_exercice` pour la liasse P |
| F-012 — Assistant Charges *(à venir)* | Les charges de financement et les charges locatives sont additionnées dans le calcul du résultat fiscal |

---

# Performance

- Reconstruction d'un tableau depuis 4 inputs : synchrone, résultat immédiat.
- Extraction OCR d'un tableau PDF (240 lignes) : asynchrone — l'utilisateur n'est pas bloqué.
- Agrégation multi-prêts : synchrone après configuration de chaque prêt.

---

# Sécurité

- Les données de financement (montant emprunté, taux, CRD) sont soumises au même RLS Supabase que les données fiscales.
- La source de chaque montant (extrait / calculé / saisi) est persistée et non modifiable sans audit trail.

---

# Critères d'acceptation

✓ Un utilisateur sans tableau d'amortissement peut configurer un prêt en répondant à 4 questions et obtient un résultat de même précision qu'un import de document.

✓ Un utilisateur ayant acheté comptant confirme l'absence de crédit en une action et passe à l'étape suivante.

✓ Pour un bien avec deux prêts, les deux sont configurés séquentiellement et leurs charges sont agrégées en un total clair.

✓ Les intérêts payés avant la mise en location sont automatiquement identifiés et présentés à l'utilisateur comme non déductibles, avec explication.

✓ La distinction capital/intérêts est expliquée une fois, clairement, avant d'afficher le résultat — PROF-001 comprend pourquoi le montant déductible est inférieur à ses mensualités.

✓ Pour un prêt in fine, le calcul des intérêts est différent du calcul amortissable et le résultat est cohérent (intérêts constants d'un exercice à l'autre).

---

# Tests

## Cas nominal

Utilisateur (PROF-002) avec un prêt amortissable classique. Il importe son tableau PDF. Le système extrait 12 lignes couvrant l'exercice. La date_mise_en_service est postérieure de 2 mois à la date_premiere_mensualite — 2 mois d'intérêts sont isolés comme pré-exploitation et présentés séparément. Les 10 mois restants sont déductibles. L'assurance bancaire est extraite du tableau. La Validation Engine confirme : intérêts + capital = mensualités × 10. L'Explanation Engine produit la synthèse. Confirmation. FINANCEMENT_TERMINE.

## Cas de reconstruction

Utilisateur (PROF-004) sans tableau. Répond : €200 000 / 1,85% / 240 mois / 15 janvier 2022. Le Calculation Engine reconstruit l'intégralité du tableau. Intérêts de l'exercice = €3 412. CRD au 31/12 = €181 250. Confirmation. Même résultat qu'un import.

## Cas multi-prêts

Utilisateur (PROF-005) avec prêt principal + prêt travaux. Les deux sont configurés séquentiellement. Agrégation : intérêts prêt 1 + intérêts prêt 2 = total déductible. Deux entités `Emprunt` créées.

## Cas skip

Utilisateur déclare "aucun emprunt". Confirmation en un clic. FINANCEMENT_SKIP. Workflow passe à F-012.

---

# Points de vigilance — Knowledge System

**PV-1 — SAV manquants sur la déductibilité des charges de financement**
Les règles fiscales centrales de cet Assistant (intérêts déductibles, capital non déductible, IRA déductible, caution Crédit Logement, assurance déductible) ne sont pas encore documentées dans le Knowledge System. Ce sont des faits fiscaux stables qui doivent être des SAV dans la Zone 01. À créer avant l'implémentation — ce n'est pas une évolution de conception, c'est une documentation métier manquante.

**PV-2 — Classification Engine : sous-types de documents financiers (2/3)**
La taxonomie de documents ne couvre probablement pas les types spécifiques à cet Assistant. Deuxième occurrence de cette lacune (première : sous-types de l'acte notarié / VEFA dans F-010).

**PV-3 — Calculation Engine : mode génératif (1/3)**
La capacité de génération d'un échéancier complet depuis des inputs minimaux est qualitativement différente des calculs documentés (TRF-0001 à TRF-0014). Cette nouvelle responsabilité n'est pas documentée dans les spécifications du Calculation Engine.

**PV-4 — Question Engine : explication contextuelle (2/3)**
Le rôle d'explication de la règle capital/intérêts avant affichage des résultats est une responsabilité qui dépasse la collecte d'information. Deuxième occurrence (première : JUG-001/JUG-002 dans F-010).

---

# Erreurs d'implémentation interdites

- Présenter la mensualité totale comme charge déductible.
- Omettre l'isolation des intérêts pré-exploitation (avant date_mise_en_service).
- Additionner les charges de financement de prêts liés à des biens différents.
- Déduire le remboursement anticipé du capital comme une charge (seul l'IRA est déductible, pas le capital remboursé).
- Calculer les intérêts d'un prêt in fine avec la formule d'un prêt amortissable.
- Présenter un résultat de reconstruction comme une "estimation" — la reconstruction mathématique est exacte.
- Appliquer la commission de caution sur plusieurs exercices si elle n'est déductible qu'à la souscription.
