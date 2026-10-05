---
id: SAV-028
title: "Les recettes sont les loyers encaissés"
type: savoir
status: deprecated
version: "1.2"
created: 2026-06-29
updated: 2026-10-05
owner: product-owner
source: CGI, Pratique professionnelle
tags: [résultat-fiscal, recettes, encaissement, loyers, legacy-v1]
catégorie: fait
domaine: fiscal
superseded_by: SAV-034
---

# SAV-028 — Les recettes sont les loyers encaissés

🔴 **LEGACY V1 ONLY. Ne constitue plus la règle fiscale canonique du produit cible. Remplacée par [[SAV-034 – Rattachement des loyers à l'exercice (créances et avances)]].**

L'hypothèse ci-dessous (« recettes = loyers encaissés ») est **insuffisante et contredite** par l'audit fiscal FISCAL-PROOF-F013-39C : pour les loyers ordinaires, les encaissements ne sont pas, à eux seuls, les recettes fiscales de l'exercice. Un loyer acquis au titre de N appartient à N même s'il est encaissé en N+1 ; une créance de clôture et une avance reçue interviennent dans le rattachement (`Loyers acquis N = E + CC − CO + AO − AC`).

**CURRENT PRODUCTION :** F013 v1 (assistant conversationnel, pont documentaire historique, ajustements janvier/décembre) reste productif et applique encore cette logique « encaissements ». Ce document n'est conservé que pour **tracer** ce comportement historique, conformément à KS-004. Il ne doit pas être utilisé comme règle de calcul d'un contrat cible, ni cité comme prémisse d'un nouveau développement (suivre `superseded_by`).

Précision : le code F013 v2 (moteur de rapprochement) est implémenté mais **désactivé** ; la bascule productive et celle de F006 sont des tranches distinctes, non réalisées.

---

# Hypothèse historique (archivée)

*Le texte ci-dessous est celui approuvé le 2026-06-29. Il ne reflète plus la règle retenue pour le contrat cible.*

En comptabilité BIC, les recettes locatives correspondent aux loyers effectivement encaissés pendant l exercice (CGI art. 38-2), pas aux loyers facturés. Un loyer de décembre payé en janvier est une recette de l exercice suivant.

*Vérification V2.5.1 : le 2 de l'article 38 du CGI pose le bénéfice net déterminé d'après les résultats d'ensemble des opérations (créances acquises incluses) et son 2 bis rattache les produits à l'exercice de la livraison ou de l'achèvement des prestations (loyers : au fur et à mesure de l'exécution) ; il **ne fonde pas** une règle d'encaissement pour un LMNP au réel. Voir SAV-034.*
