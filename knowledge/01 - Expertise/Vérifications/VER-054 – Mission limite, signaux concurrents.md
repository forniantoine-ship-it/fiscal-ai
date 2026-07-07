---
id: VER-054
title: "Mission limite, signaux concurrents"
type: vérification
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [mission-engine, priorisation, vérification, limite]
cible: TRF-0033
catégorie: limite
vérifie: [TRF-0033]
---

# VER-054 — Mission limite, signaux concurrents

## Scénario

`statut_dossier = INFORMATIONS_MANQUANTES`, `nombre_anomalies = 2`, `question_en_attente` renseigné, `derniere_mise_a_jour` = il y a 20 jours (au-delà du seuil de relance de 14 jours).

Trois signaux sont actifs simultanément : anomalie, question en attente, et inactivité prolongée. Résultat attendu : le départage reste déterministe selon l'ordre fixé par DEC-001 — `mission_active = corriger_anomalie` (priorité 1), jamais `repondre_question` ni `relancer_client`. `éléments_bloquants` référence les deux anomalies actives.
