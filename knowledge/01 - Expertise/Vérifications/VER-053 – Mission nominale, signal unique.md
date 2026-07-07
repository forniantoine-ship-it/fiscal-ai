---
id: VER-053
title: "Mission nominale, signal unique"
type: vérification
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [mission-engine, priorisation, vérification, nominal]
cible: TRF-0033
catégorie: nominal
vérifie: [TRF-0033]
---

# VER-053 — Mission nominale, signal unique

## Scénario

`statut_dossier = CALCUL_TERMINE`, `nombre_anomalies = 0`, `question_en_attente` absent, `derniere_mise_a_jour` = il y a 2 jours.

Aucun signal concurrent n'est actif. Résultat attendu : `mission_active = consulter_resultat`, `priorité = 4`, `responsable = client`, `action_recommandée = "Consultez votre résultat"`.
