---
id: VER-056
title: "Relance sur un état de construction non initialement couvert"
type: vérification
status: draft
version: "1.0"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [mission-engine, priorisation, vérification, limite, régression]
cible: TRF-0033
catégorie: limite
vérifie: [TRF-0033]
---

# VER-056 — Relance sur un état de construction non initialement couvert

## Scénario

`statut_dossier = BIEN_COMPLETE`, `nombre_anomalies = 0`, `question_en_attente` absent, `derniere_mise_a_jour` = il y a 20 jours (au-delà du seuil de 14 jours).

Ce cas vérifie la correction apportée à DEC-001 (v1.1) : BIEN_COMPLETE fait partie de la phase de construction du Dossier et désigne le client comme responsable — il doit donc déclencher une relance, contrairement à la version initiale de la politique qui l'excluait sans justification. Résultat attendu : `mission_active = relancer_client`, `priorité = 3`, `responsable = client`.
