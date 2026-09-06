/**
 * Registre visuel — 2031-bis-SD, millésime 2026 (annexe au Cerfa 11085*28).
 * Voir 2031-sd/2026.ts pour la méthode de calibrage.
 *
 * Page 1 du formulaire logique "2031-bis-SD" = page 2 de l'asset partagé
 * `2031-sd.pdf` (voir asset-manifest.ts) — cadre I "BIC non professionnels".
 */
import type { CerfaVisualMapping } from "../../types";
import { topLeft } from "../../types";

const FORM = "2031-bis-SD" as const;
const MILLESIME = 2026;

export const registry2031Bis2026: readonly CerfaVisualMapping[] = [
  // P0 sécurisation — remplace l'estimation par symétrie. Mesuré directement
  // sur le Cerfa officiel vierge : la table "Détermination du résultat de
  // l'exercice" a 2 séparateurs verticaux (x=375.7, 470.9) qui découpent
  // label | Bénéfice [375.7,470.9] | Déficit [470.9, marge droite]. Bord
  // droit réel de la boîte Bénéfice = 470.9.
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "I_AUTRES_LMNP_BENEFICE",
    page: 1,
    position: topLeft(470.9, 736.8),
    width: 90,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "CORRECTION P0 : remplace l'estimation par symétrie de la mission précédente. Position = bord droit réel de la boîte 'Bénéfice' mesurée sur le Cerfa officiel vierge (séparateurs verticaux à x=375.7 et x=470.9). Jamais exercée par le dossier témoin (déficitaire) ; couverte par un scénario synthétique bénéficiaire dédié (voir tests/scenario-beneficiaire.test.ts).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "I_AUTRES_LMNP_DEFICIT",
    page: 1,
    position: topLeft(553.4, 736.8),
    width: 76,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "Confirmé au point : '9862' écrit exactement à ce point sur le dossier témoin, ligne 'Autres locations meublées non professionnelles', colonne Déficit.",
  },
];
