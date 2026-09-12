# Skill — Cerfa PDF

Le Cerfa officiel est une référence documentaire : ne pas modifier le fond officiel pour faire correspondre le code.

## Distinguer

- donnée métier ;
- projection ;
- registry / coordonnées ;
- rendering.

## Vérifier lorsque pertinent

- valeur ;
- présence ;
- position ;
- page ;
- nombre de pages.

## Principes

- Privilégier les oracles indépendants lorsqu'ils existent.
- Vérifier la sortie PDF finale lorsque le chantier concerne le rendu.
- Ne pas documenter toutes les coordonnées Cerfa ici — ce Skill reste une interface légère, pas un catalogue.

## Chargement des fonds PDF (runtime Next.js / Turbopack)

- Sous Turbopack, `__dirname` peut devenir un chemin virtuel — ne jamais l'utiliser pour résoudre un fond PDF lu via `fs`.
- Préférer une résolution stable depuis `process.cwd()` lorsque le contrat d'exécution suppose la racine du projet — documenter explicitement cette hypothèse dans le code.
- En build/runtime Next.js avec file tracing, déclarer les assets non importés (lus via `fs`) dans `outputFileTracingIncludes`, pour la route concernée précisément.
- Les tests sur un fond PDF doivent vérifier, au-delà de sa présence : hash canonique (oracle), signature `%PDF-`, nombre de pages.
