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
 * Chantier 2B — bloc Amortissements (016/042/066/070/074/082/094/048/098/112) :
 * positions ré-extraites indépendamment (PyMuPDF, `page.get_text("words")` +
 * `page.get_drawings()`) contre `assets/2026/2033-sd.pdf` page 1 (chantier
 * d'audit 2A). Même colonne Amort. que 030/086 déjà calibrées : x=479.19
 * (ancrage colonne, inchangé), seul y varie par ligne.
 *
 * Chantier 2D-C — totaux 044 (Brut, même colonne que 028/084, x=372.3) et
 * 096 (Brut, idem) et 176 (NET Passif, même colonne que 120/134/136/137/
 * 142/156, x=566.6) : positions ré-extraites indépendamment (PyMuPDF,
 * chantier 2D-A), même méthode que le chantier 2A.
 *
 * Chantier 2D-E3 — totaux généraux 110 (Brut, même colonne que 028/044/084/
 * 096, x=372.3) et 180 (NET Passif, même colonne que 120/134/136/137/142/
 * 156/176, x=566.6) : positions ré-extraites indépendamment (PyMuPDF,
 * chantier 2D-D), même méthode que le chantier 2A.
 *
 * Chantier P1-B2 — 5 lignes Brut/NET collectées par P1-B1 (064/080/092/174/
 * 175), calibrées indépendamment via `independent-grid-oracle.ts`
 * (`derive2033ACaseBoxes`, pdfjs-dist + pdf-lib, jamais recopié d'un registre
 * ou d'un ancien test) :
 *   - 064/080/092 (Brut) partagent EXACTEMENT la même ligne physique que
 *     066/082/094 (Amort.-Prov.) respectivement déjà calibrées — preuve
 *     directe : les coordonnées Y natives extraites par pdfjs sont
 *     rigoureusement identiques entre chaque paire (064≡066, 080≡082,
 *     092≡094), donc leur `position.y` réutilise SANS AUCUN calcul
 *     supplémentaire celui déjà validé de leur jumelle Amort.-Prov.
 *   - 174/175 (NET, Passif) n'ont aucune jumelle déjà calibrée sur leur
 *     ligne (colonne à une seule case). Leur `position.y` est dérivé par
 *     différence de coordonnées natives (pdfjs) avec 176 (déjà calibrée),
 *     la constante additive (page_height − 9.675) s'annulant exactement
 *     dans une différence entre deux points mesurés par le même outil —
 *     cross-vérifié indépendamment avec 180 comme second point d'ancrage :
 *     les deux chemins de calcul convergent à 0.006 pt près, largement
 *     sous la tolérance de trait de grille (1.5 pt) déjà utilisée par
 *     l'oracle indépendant.
 *
 * Chantier B-FAMILY-4 — 5 lignes famille B collectées par B-FAMILY-2/3
 * (068/072/164/166/172), calibrées indépendamment via
 * `independent-grid-oracle.ts` (`derive2033ACaseBoxes`), même méthode que
 * P1-B2 :
 *   - 068/072 (Brut) partagent EXACTEMENT la même ligne physique que 070/074
 *     (Amort.-Prov.) respectivement déjà calibrées (native(068)=native(070)
 *     =497.996, native(072)=native(074)=483.385) — leur `position.y`
 *     réutilise sans aucun calcul celui déjà validé de leur jumelle.
 *   - 164/166/172 (NET, Passif) n'ont aucune jumelle sur leur ligne. Leur
 *     `position.y` est dérivé par différence de coordonnées natives (pdfjs)
 *     avec 156 (déjà calibrée), cross-vérifié indépendamment avec 176 et 180
 *     comme seconds points d'ancrage : convergence à 0.006 pt près.
 *
 * INTERDIT dans ce registre : toute pseudo-case pour la colonne Net de
 * l'actif (non numérotée). Aucune case numérotée n'est plus structurellement
 * interdite — toutes les gates moteur existent et sont câblées
 * (`gateTotal048/098/112` F4-C/F4-D ; `gateTotal044ActifImmobiliseBrut`/
 * `gateTotal096AvecVentilation`/`gateTotal176AvecVentilation` chantier 2C ;
 * `gateTotal110`/`gateTotal180` chantier 2D-E1).
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
  amort(
    "016",
    234.18,
    "Colonne Amortissements-Provisions. Autres immobilisations incorporelles. Boîte valeur [389.98,480.69]×[230.79,245.58] (chantier 2A, PyMuPDF). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
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
  amort(
    "042",
    263.76,
    "Colonne Amortissements-Provisions. Immobilisations financières. Boîte valeur [389.98,480.69]×[260.37,275.16] (chantier 2A, PyMuPDF). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  amort(
    "048",
    278.58,
    "Colonne Amortissements-Provisions. Total I — Actif immobilisé (= 016+030+042). Boîte valeur [389.98,480.69]×[275.16,289.96] (chantier 2A, PyMuPDF). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  brut(
    "044",
    278.58,
    "Colonne Brut. Total I — Actif immobilisé (= 014+028+040, 010 non applicable). Boîte valeur [283.74,373.80]×[275.16,289.96] (chantier 2D-A, PyMuPDF, même ligne que 048). y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
  ),
  brut(
    "064",
    322.97,
    "Colonne Brut. Avances et acomptes versés sur commandes. Même ligne physique que 066 (Amort.-Prov., déjà calibrée) — coordonnées Y natives identiques (pdfjs, chantier P1-B2, independent-grid-oracle.ts), aucun calcul supplémentaire nécessaire. Boîte valeur [283.74,373.80]×[319.54,334.33]. y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
  ),
  amort(
    "066",
    322.97,
    "Colonne Amortissements-Provisions. Avances et acomptes versés sur commandes. Boîte valeur [389.98,480.69]×[319.54,334.33] (chantier 2A, PyMuPDF). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  brut(
    "068",
    337.46,
    "Colonne Brut. Clients et comptes rattachés. Même ligne physique que 070 (Amort.-Prov., déjà calibrée) — coordonnées Y natives identiques (pdfjs, chantier B-FAMILY-4, independent-grid-oracle.ts : native(068)=native(070)=497.996), aucun calcul supplémentaire nécessaire. Boîte valeur [283.74,373.80]×[334.33,348.60]. y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
  ),
  amort(
    "070",
    337.46,
    "Colonne Amortissements-Provisions. Clients et comptes rattachés. Boîte valeur [389.98,480.69]×[334.33,348.60] (chantier 2A, PyMuPDF). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  brut(
    "072",
    352.08,
    "Colonne Brut. Autres créances. Même ligne physique que 074 (Amort.-Prov., déjà calibrée) — coordonnées Y natives identiques (pdfjs, chantier B-FAMILY-4, independent-grid-oracle.ts : native(072)=native(074)=483.385), aucun calcul supplémentaire nécessaire. Boîte valeur [283.74,373.80]×[348.60,363.40]. y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
  ),
  amort(
    "074",
    352.08,
    "Colonne Amortissements-Provisions. Autres créances. Boîte valeur [389.98,480.69]×[348.60,363.40] (chantier 2A, PyMuPDF). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  brut(
    "092",
    366.87,
    "Colonne Brut. Charges constatées d'avance. Même ligne physique que 094 (Amort.-Prov., déjà calibrée) — coordonnées Y natives identiques (pdfjs, chantier P1-B2, independent-grid-oracle.ts), aucun calcul supplémentaire nécessaire. Boîte valeur [283.74,373.80]×[363.40,378.19]. y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
  ),
  amort(
    "094",
    366.87,
    "Colonne Amortissements-Provisions. Charges constatées d'avance. Boîte valeur [389.98,480.69]×[363.40,378.19] (chantier 2A, PyMuPDF). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  brut(
    "080",
    381.58,
    "Colonne Brut. Valeurs mobilières de placement. Même ligne physique que 082 (Amort.-Prov., déjà calibrée) — coordonnées Y natives identiques (pdfjs, chantier P1-B2, independent-grid-oracle.ts), aucun calcul supplémentaire nécessaire. Boîte valeur [283.74,373.80]×[378.19,392.98]. y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
  ),
  amort(
    "082",
    381.58,
    "Colonne Amortissements-Provisions. Valeurs mobilières de placement. Boîte valeur [389.98,480.69]×[378.19,392.98] (chantier 2A, PyMuPDF). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
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
  amort(
    "098",
    411.17,
    "Colonne Amortissements-Provisions. Total II — Actif circulant (= 066+070+074+082+086+094). Boîte valeur [389.98,480.69]×[407.77,422.57] (chantier 2A, PyMuPDF, confirmé par ligne de grille). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  brut(
    "096",
    411.17,
    "Colonne Brut. Total II — Actif circulant (= 064+068+072+080+084+092, 050/060 non applicables). Boîte valeur [283.74,373.80]×[407.77,422.57] (chantier 2D-A, PyMuPDF, confirmé par ligne de grille, même ligne que 098). y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
  ),
  amort(
    "112",
    426.56,
    "Colonne Amortissements-Provisions. Total général actif (I+II) (= 048+098, jamais 110−180). Boîte valeur [389.98,480.69]×[422.57,438.42] (chantier 2A, PyMuPDF, confirmé par ligne de grille — ligne de total, hauteur 15.86 au lieu de 14.79). y = haut du numéro imprimé (hors zone-numéro [373.80,389.98]).",
  ),
  brut(
    "110",
    426.56,
    "Colonne Brut. Total général actif (I+II) (= 044+096, jamais 112−180). Boîte valeur [283.74,373.80]×[422.57,438.42] (chantier 2D-D, PyMuPDF, confirmé par ligne de grille, même ligne que 112). y = haut du numéro imprimé (hors zone-numéro [268.66,283.74]).",
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
  passifNet(
    "164",
    645.77,
    "Colonne NET. Avances et acomptes reçus sur commandes en cours. Position dérivée par différence de coordonnées Y natives (pdfjs) avec 156 (déjà calibrée) : native(156)=204.398, native(164)=189.686, delta=−14.712 pt reporté sur position.y(156)=631.06 → 645.772, arrondi 645.77. Cross-vérifié avec 176 et 180 comme second/troisième points d'ancrage (accord à 0.006 pt près). Boîte valeur [480.69,568.10]×[642.30,657.09] (chantier B-FAMILY-4, pdfjs+pdf-lib, independent-grid-oracle.ts). y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "166",
    660.36,
    "Colonne NET. Fournisseurs et comptes rattachés. Position dérivée par différence de coordonnées Y natives (pdfjs) avec 156 (déjà calibrée) : native(156)=204.398, native(166)=175.095, delta=−29.303 pt reporté sur position.y(156)=631.06 → 660.363, arrondi 660.36. Cross-vérifié avec 176 et 180 (accord à 0.006 pt près). Boîte valeur [480.69,568.10]×[656.89,671.68] (chantier B-FAMILY-4, pdfjs+pdf-lib, independent-grid-oracle.ts). y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "172",
    676.46,
    "Colonne NET. Dettes fiscales et sociales. Position dérivée par différence de coordonnées Y natives (pdfjs) avec 156 (déjà calibrée) : native(156)=204.398, native(172)=158.994, delta=−45.404 pt reporté sur position.y(156)=631.06 → 676.464, arrondi 676.46. Cross-vérifié avec 176 et 180 (accord à 0.006 pt près). Boîte valeur [480.69,568.10]×[672.99,687.78] (chantier B-FAMILY-4, pdfjs+pdf-lib, independent-grid-oracle.ts ; hauteur de ligne approximée au pas standard, aucune case déjà calibrée n'existe immédiatement sous 172 pour la borner exactement — sans conséquence : la bande de ligne réellement utilisée par l'oracle indépendant, plus large, est celle qui protège les tests). y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "174",
    722.48,
    "Colonne NET. Produits constatés d'avance. Position dérivée par différence de coordonnées Y natives (pdfjs) avec 176 (déjà calibrée) : native(176)=98.194, native(174)=112.986, delta=−14.792 pt reporté directement sur position.y(176)=737.27 → 722.478, arrondi 722.48. Cross-vérifié avec 180 comme second point d'ancrage (accord à 0.006 pt près). Boîte valeur [480.69,568.10]×[721.50,736.30] (chantier P1-B2, pdfjs+pdf-lib, independent-grid-oracle.ts). y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "175",
    707.67,
    "Colonne NET. Autres dettes (couvre notamment le dépôt de garantie locataire — aucun champ dédié séparé, voir P1-B1). Position dérivée par différence de coordonnées Y natives (pdfjs) avec 176 (déjà calibrée) : native(176)=98.194, native(175)=127.799, delta=−29.605 pt reporté directement sur position.y(176)=737.27 → 707.665, arrondi 707.67. Cross-vérifié avec 180 comme second point d'ancrage (accord à 0.006 pt près). Boîte valeur [480.69,568.10]×[675.79,721.50] (chantier P1-B2, pdfjs+pdf-lib, independent-grid-oracle.ts). y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "176",
    737.27,
    "Colonne NET. Total III — Dettes (= 156+164+166+172+174+175, 173 non applicable). Boîte valeur [480.69,568.10]×[733.81,748.61] (chantier 2D-A, PyMuPDF, confirmé par ligne de grille). y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
  passifNet(
    "180",
    752.56,
    "Colonne NET. Total général passif (I+II+III) (= 142+176, 154 non applicable). Boîte valeur [480.69,568.10]×[748.61,764.47] (chantier 2D-D, PyMuPDF, confirmé par ligne de grille, ligne de total, hauteur 15.86). y = haut du numéro imprimé (hors zone-numéro [464.51,480.69]).",
  ),
];
