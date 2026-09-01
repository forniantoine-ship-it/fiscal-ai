# ROADMAP

Dernière mise à jour : 01/09/2026

## Chantier stratégique — Fiscal AI Constitution

Statut : 🟢 Terminé (v1) — 08/07/2026 (DEC-024)

Objectif :
Définir les fondations philosophiques, UX, relationnelles et comportementales du produit.

Ce chantier a été prioritaire avant la reprise du développement de l'interface. Il est désormais considéré comme terminé en version 1.

Sous-parties (toutes rédigées, premier jet) :

- Préambule
- Article I — La Relation
- Article II — Pourquoi nous existons
- Article III — Personnalité
- Article IV — Principes de conception
- Article V — Parcours émotionnel
- Article VI — La Conversation
- Article VII — Design
- Design Language (document fondateur)
- Language System, Color Philosophy, Scroll Narrative, Visual References

⚠ **Article VIII — Gouvernance produit reste non rédigé**, hors du périmètre de ce v1 — à confirmer par le Product Owner (cf. DEC-024).

Voir `03 - Produit/Fiscal AI Constitution/`.

---

## Chantier stratégique — Conception de l'interface utilisateur

Statut : 🟡 En cours — dashboard narratif livré sur branche `sprint/dashboard-narrative-premium` ; validation produit et convergence Ch2 (ADR-007/009) en cours

Objectif :
Traduire la Constitution Produit v1 en interface. Le parcours d'accueil trois chapitres est implémenté ; la mise en scène définitive du Chapitre 2 reste à trancher.

Jalons atteints sur la branche (septembre 2026) :

- ✅ Dashboard narratif trois chapitres (`09ec232`)
- ✅ Lab scène conseiller ADR-009 — `/lab/advisor-scene` (`2120f58`)
- 🟡 Chapitre 2 : carousel production (transitoire, vs ADR-007)
- 🟡 Chapitre 3 : coffre-fort v1 sans regroupement par exercice

Ordre des travaux historique (DEC-025) — état au 01/09/2026 :

1. UX ✓ (juillet 2026)
2. UI ✓ (partiel — dashboard livré)
3. PRD — non formalisé
4. Développement ✓ (partiel — six commits poussés)
5. Validation ← en cours

Voir `00 - Governance/Pilotage/CURRENT_SPRINT.md.md`.

---

## Phase 1 — MVP LMNP (EN COURS)

Sprint 001A (Convergence Runtime ↔ Wizards) clôturé le 07/07/2026 — convergence partielle, routes `/assistants/*` toujours présentes.

Objectif :
Permettre à un utilisateur de déposer ses documents et d'obtenir une véritable liasse fiscale.

Progression : qualitative — pas de pourcentage unique retenu (voir PROJECT_STATE). Le chiffre historique « 55 % » n'a pas été recalculé.

Epic

✅ Création dossier

✅ Upload documents

✅ OCR (renforcé — `61edcdf`)

🟡 Extraction (charges/taxe foncière durcies — `7ec564c`)

🟢 Validation (gate F-006/F-007 — `72e6750`)

🟢 Calcul fiscal

🟢 Génération liasse

🟡 Export client (résumé PDF + liasse texte — `72e6750`)

🔴 Téléchargement officiel PDF

🔴 Paiement

Jalons techniques récents (branche `sprint/dashboard-narrative-premium`) :

- ✅ Dashboard narratif 3 chapitres
- ✅ OCR / document text hardening
- ✅ Déclaration / validation (gate + exports intermédiaires)
- ✅ Charges / taxe foncière
- ✅ F-009 completeness parity (`inpiConfirmedAt`)
- ✅ Advisor-scene lab (ADR-009)

Prochaines étapes (sans planning imposé) :

- Validation produit du dashboard narratif
- Résolution dette Chapitre 2 (carousel → scène ADR-009)
- Compléter Chapitre 3 (regroupement par exercice, DEC-030)
- PDF officiel et paiement
- Convergence Runtime ↔ Wizards là où elle bloque encore

---

## Phase 2

Assistant IA

Explications

Questions intelligentes

---

## Phase 3

Cabinet comptable

Multi activités

SCI

LMP

---

## Phase 4

SaaS

Paiement réel

Télétransmission

Cabinets partenaires