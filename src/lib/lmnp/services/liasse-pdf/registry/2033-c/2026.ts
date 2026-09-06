/**
 * Registre visuel — 2033-C-SD, millésime 2026 (Cerfa 15948*08, page 3/7 de
 * `assets/2026/2033-sd.pdf`, page 1 du formulaire lui-même).
 *
 * GO-1/GO-2 — huit cases, calibrées par lecture directe des filets
 * vectoriels et du texte imprimé du Cerfa officiel (PyMuPDF, `get_text
 * ("words")` + `get_drawings()`), croisée avec la méthode déjà établie de ce
 * projet (`tests/independent-grid-oracle.ts`, pdf-lib + pdfjs-dist — voir
 * `tests/position-oracle.test.ts`, describe "2033-C-SD").
 *
 * Convention identique au 2033-A/2033-B (`registry/2033-a/2026.ts`,
 * `registry/2033-b/2026.ts`) :
 *   - `position` en `topLeft` (origine HAUT-GAUCHE, y croissant vers le bas) ;
 *   - `align: "right"` → `position.x` = bord DROIT de la zone d'écriture,
 *     avec un inset de sécurité de 1.5pt par rapport au filet de grille ;
 *   - `position.y` = haut du numéro de case imprimé (glyphe "426", "490",
 *     etc.), jamais le haut de la ligne du tableau ;
 *   - `width` = largeur utile de la boîte de valeur, inset de sécurité par
 *     rapport aux filets de gauche/droite ;
 *   - jamais la zone-numéro (à gauche de la boîte de valeur).
 *
 * Boîtes de VALEUR mesurées (filets vectoriels réels, page 3 de l'asset) —
 * référence, non recopiées telles quelles dans `position` :
 *   Cadre I  "début exercice"      (490) : [184.18, 248.15]
 *   Cadre I  "augmentations"       (492) : [264.15, 329.27]
 *   Cadre I  "fin d'exercice" (426/476/496) : [425.20, 490.22]
 *   Cadre II "début exercice"      (570) : [248.15, 313.77]
 *   Cadre II "dotations exercice"  (572) : [329.27, 394.73]
 *   Cadre II "fin d'exercice"      (576) : [490.22, 559.38]
 * Lignes (haut du numéro imprimé) :
 *   Terrains (426)                : y=148.93
 *   Mobilier (476)                : y=226.15
 *   Cadre I TOTAL (490/492/496)   : y=254.74
 *   Cadre II TOTAL (570/572/576)  : y=421.05
 *
 * INTERDIT dans ce registre : 420/422/424 (Terrains, colonnes autres que fin
 * d'exercice), 470/472/474 (Mobilier, idem), 494/574 (Diminutions), toute
 * case de détail par catégorie (400-486/500-566), Cadre III (plus-values/
 * moins-values, cessions).
 */
import type { CerfaVisualMapping } from "../../types";
import { topLeft } from "../../types";

const FORM = "2033-C-SD" as const;
const MILLESIME = 2026;
const PAGE = 1;

function cell(caseId: string, x: number, width: number, y: number, note: string): CerfaVisualMapping {
  return {
    form: FORM,
    millesime: MILLESIME,
    caseId,
    page: PAGE,
    position: topLeft(x, y),
    width,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note,
  };
}

export const registry2033C2026: readonly CerfaVisualMapping[] = [
  cell(
    "426",
    488.72,
    61,
    148.93,
    "Cadre I. Terrains. Colonne « fin d'exercice ». Boîte valeur [425.20,490.22]. y = haut du numéro imprimé (hors zone-numéro [412.00,425.20]).",
  ),
  cell(
    "476",
    488.72,
    61,
    226.15,
    "Cadre I. Autres immobilisations corporelles (Mobilier). Colonne « fin d'exercice ». Boîte valeur [425.20,490.22]. y = haut du numéro imprimé (hors zone-numéro [412.00,425.20]).",
  ),
  cell(
    "490",
    246.65,
    60,
    254.74,
    "Cadre I. TOTAL. Colonne « début d'exercice ». Boîte valeur [184.18,248.15]. y = haut du numéro imprimé (hors zone-numéro [168.18,184.18]).",
  ),
  cell(
    "492",
    327.77,
    61,
    254.74,
    "Cadre I. TOTAL. Colonne « augmentations ». Boîte valeur [264.15,329.27]. y = haut du numéro imprimé (hors zone-numéro [248.15,264.15]).",
  ),
  cell(
    "496",
    488.72,
    61,
    254.74,
    "Cadre I. TOTAL. Colonne « fin d'exercice ». Boîte valeur [425.20,490.22]. y = haut du numéro imprimé (hors zone-numéro [412.00,425.20]).",
  ),
  cell(
    "570",
    312.27,
    61,
    421.05,
    "Cadre II. TOTAL. Colonne « début d'exercice ». Boîte valeur [248.15,313.77]. y = haut du numéro imprimé (hors zone-numéro [234.20,248.15]).",
  ),
  cell(
    "572",
    393.23,
    61,
    421.05,
    "Cadre II. TOTAL. Colonne « dotations de l'exercice ». Boîte valeur [329.27,394.73]. y = haut du numéro imprimé (hors zone-numéro [315.79,329.27]).",
  ),
  cell(
    "576",
    557.88,
    65,
    421.05,
    "Cadre II. TOTAL. Colonne « fin d'exercice ». Boîte valeur [490.22,559.38]. y = haut du numéro imprimé (hors zone-numéro [476.99,490.22]).",
  ),
];
