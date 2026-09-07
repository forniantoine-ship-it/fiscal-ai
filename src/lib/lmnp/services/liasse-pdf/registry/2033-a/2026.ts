/**
 * Registre visuel — 2033-A-SD, millésime 2026 (Cerfa 15948*08, page 1/7).
 *
 * P1-PDF-02-C — premier vertical slice. Huit cases uniquement, calibrées
 * par P1-PDF-02-B (CONFIRMED_VECTOR sur `assets/2026/2033-sd.pdf` page 1).
 *
 * Convention identique au 2033-B (`registry/2033-b/2026.ts`) :
 *   - `position` en `topLeft` (origine HAUT-GAUCHE, y croissant vers le bas) ;
 *   - `align: "right"` → `position.x` = bord DROIT de la zone d'écriture ;
 *   - `position.y` = haut du glyphe (le renderer convertit via `coordinates.ts` :
 *     `y_pdf = page_height − (y + 9.675)`) ;
 *   - `width` = largeur utile, inset de sécurité par rapport aux filets ;
 *   - jamais la zone-numéro (à gauche de la boîte de valeur).
 *
 * Boîtes de VALEUR P1-PDF-02-B (PyMuPDF) — référence, non recopier telles
 * quelles dans `position` :
 *   Brut  : [283.74, 373.80]  w=90.06
 *   Amort : [389.98, 480.69]  w=90.71
 *   NET   : [480.69, 568.10]  w=87.41
 *
 * Ancrage registry (bord droit − inset 1.5 pt) :
 *   Brut  : x=372.3
 *   Amort : x=479.19
 *   NET   : x=566.6
 *
 * INTERDIT dans ce registre : 112, 110, 180, 044, 048, 096, 098,
 * 176, et toute pseudo-case pour la colonne Net de l'actif (non numérotée).
 */
import type { CerfaVisualMapping } from "../../types";
import { topLeft } from "../../types";

const FORM = "2033-A-SD" as const;
const MILLESIME = 2026;

function brut(caseId: string, y: number, note: string): CerfaVisualMapping {
  return {
    form: FORM,
    millesime: MILLESIME,
    caseId,
    page: 1,
    position: topLeft(372.3, y),
    width: 86,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note,
  };
}

function amort(caseId: string, y: number, note: string): CerfaVisualMapping {
  return {
    form: FORM,
    millesime: MILLESIME,
    caseId,
    page: 1,
    position: topLeft(479.19, y),
    width: 86,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note,
  };
}

function passifNet(caseId: string, y: number, note: string): CerfaVisualMapping {
  return {
    form: FORM,
    millesime: MILLESIME,
    caseId,
    page: 1,
    position: topLeft(566.6, y),
    width: 84,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note,
  };
}

export const registry2033A2026: readonly CerfaVisualMapping[] = [
  brut(
    "028",
    248.97,
    "Colonne Brut. Immobilisations corporelles. Boîte valeur P1-PDF-02-B [283.74,373.80]×[245.58,260.37]. y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
  ),
  amort(
    "030",
    248.97,
    "Colonne Amortissements-Provisions. Immobilisations corporelles. Boîte valeur P1-PDF-02-B [389.98,480.69]×[245.58,260.37]. y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  brut(
    "084",
    396.37,
    "Colonne Brut. Disponibilités. Boîte valeur P1-PDF-02-B [283.74,373.80]×[392.98,407.77]. y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
  ),
  amort(
    "086",
    396.37,
    "Colonne Amortissements-Provisions. Disponibilités. Boîte valeur P1-PDF-02-B [389.98,480.69]×[392.98,407.77]. y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  passifNet(
    "120",
    468.87,
    "Colonne NET. Capital social ou individuel. Boîte valeur P1-PDF-02-B [480.69,568.10]×[465.39,480.19]. y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "134",
    542.77,
    "Colonne NET. Report à nouveau. Boîte valeur P1-PDF-02-B [480.69,568.10]×[539.36,554.15]. y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "136",
    557.56,
    "Colonne NET. Résultat de l'exercice. Boîte valeur P1-PDF-02-B [480.69,568.10]×[554.15,568.94]. y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "137",
    572.38,
    "Colonne NET. Subventions d'investissement. Boîte valeur P1-PDF-02-B [480.69,568.10]×[568.94,583.74]. y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "142",
    601.68,
    "Colonne NET. Total I — Capitaux propres. Boîte valeur P1-PDF-02-B [480.69,568.10]×[598.53,612.80]. y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "156",
    631.06,
    "Colonne NET. Emprunts et dettes assimilées. Boîte valeur P1-PDF-02-B [480.69,568.10]×[627.59,642.38]. y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
];
