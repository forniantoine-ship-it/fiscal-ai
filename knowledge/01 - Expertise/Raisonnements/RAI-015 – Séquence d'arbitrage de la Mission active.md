---
id: RAI-015
title: "Séquence d'arbitrage de la Mission active"
type: raisonnement
status: draft
version: "1.1"
created: 2026-07-05
updated: 2026-07-05
owner: product-owner
tags: [raisonnement, mission-engine, priorisation, arbitrage]
objectif: "Documenter l'ordre dans lequel les signaux d'un Dossier doivent être examinés pour déterminer la Mission active"
prémisses: [DEC-001]
conclusion: "Un unique signal déterministe est retenu, dans l'ordre fixé par DEC-001"
condition_de_sortie: "Une Mission unique est produite pour tout jeu de signaux, y compris en cas d'absence de signal actif"
justifie: [TRF-0033]
---

# RAI-015 — Séquence d'arbitrage de la Mission active

## Étapes

1. Vérifier si une anomalie bloquante existe (FIELD-046 > 0). Si oui → Mission = corriger l'anomalie référencée, arrêter la séquence.
2. Sinon, vérifier si une question ou un Jugement est en attente (FIELD-090 renseigné). Si oui → Mission = répondre, arrêter la séquence.
3. Sinon, vérifier si le Dossier est dans un état de la phase de construction (antérieur à DOSSIER_COMPLET) dont la Mission par défaut désigne le client comme responsable — DOSSIER_CREE, INFORMATIONS_GENERALES, BIEN_EN_COURS, BIEN_COMPLETE, DOCUMENTS_EN_ATTENTE, INFORMATIONS_MANQUANTES — et si l'inactivité dépasse le seuil fixé par DEC-001. Si oui → Mission = relancer le client, arrêter la séquence. Ce périmètre est celui fixé par DEC-001 (v1.1) ; il exclut délibérément CALCUL_TERMINE et DECLARATION_GENEREE, dont l'inactivité relève d'un besoin distinct, non couvert par cette séquence.
4. Sinon, dériver la Mission par défaut à partir du statut courant du Dossier (FIELD-037 / STATE-001), selon la table de correspondance documentée dans TRF-0033.

Chaque étape est exclusive des suivantes : dès qu'une étape retient une Mission, les étapes suivantes ne sont pas évaluées. Cette exclusivité garantit qu'une seule Mission est produite, jamais plusieurs.

L'ordre des étapes 1 à 3 est fixé par DEC-001. Il n'est pas rejoué à chaque exécution — il est une propriété stable de TRF-0033 tant que DEC-001 n'est pas révisée.
