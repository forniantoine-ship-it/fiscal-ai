/**
 * Registre visuel — 2033-A-SD, millésime 2026 — VIDE À DESSEIN.
 *
 * Périmètre de cette mission (GO implémentation, "commencer par le minimum
 * fiable") : ne couvrir QUE les formulaires déjà branchés sur cette couche
 * PDF (2031-SD, 2031-bis-SD, 2033-B-SD).
 *
 * PRÉCISION (correction P0, audit indépendant Cursor/Grok, point A09) : un
 * mapper fiscal RÉEL existe bel et bien pour 2033-A-SD
 * (`src/runtime/capabilities/rfs/projection/map-2033a.ts`) et produit déjà
 * des `CerfaCase[]` pour certaines cases (résultat de l'exercice, emprunts,
 * immobilisations corporelles brut/net via 028/030/136/156 — voir ce fichier
 * pour le détail exact). Ce qui manque n'est PAS le mapper : c'est le
 * registre visuel de CETTE couche (les coordonnées PDF), pour le PASSIF en
 * particulier, où le mapper lui-même documente ne pas pouvoir équilibrer le
 * bilan aujourd'hui (pas de trésorerie, pas de créances/dettes de tiers —
 * voir audit "Dossier témoin", section capital individuel/report à nouveau).
 * Construire un registre de coordonnées PDF pour des cases que le mapper ne
 * produit pas encore serait fabriquer une couverture qui n'existe pas — mais
 * ne pas confondre "registre PDF absent" avec "mapper fiscal absent".
 *
 * Le fond de page officiel existe déjà (`asset-manifest.ts` référence sa
 * page dans `assets/2026/2033-sd.pdf`) : cette entrée vide documente
 * l'intention d'étendre ici, quand le registre visuel sera calibré pour les
 * cases que le mapper produit déjà.
 */
import type { CerfaVisualMapping } from "../../types";

export const registry2033A2026: readonly CerfaVisualMapping[] = [];
