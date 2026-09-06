/**
 * Registre visuel — 2031-SD, millésime 2026 (Cerfa 11085*28).
 *
 * AUCUNE RÈGLE FISCALE ICI. Chaque ligne dit uniquement "si le mapper
 * (`assembleForm2031SD`, src/runtime/capabilities/f007/assemble-form-2031.ts,
 * INCHANGÉ par cette mission) produit cette case, voici où et comment
 * l'écrire". Ne décide jamais qu'une case doit exister.
 *
 * Calibrage : coordonnées mesurées directement sur le PDF officiel vierge
 * (`assets/2026/2031-sd.pdf`, page 1) par recherche de texte (labels), et
 * validées quand possible par comparaison avec le dossier témoin réel
 * (Elsa Bouvard, Liasse-2025 JD2M, télétransmission EDI acceptée) — dont la
 * géométrie de page s'est révélée IDENTIQUE au Cerfa officiel au centième de
 * point près. Voir `CalibrationConfidence` (types.ts) pour la portée exacte
 * de chaque niveau de confiance : "estimee-par-symetrie" et "a-calibrer" ne
 * sont pas des erreurs, ce sont des niveaux de preuve différents,
 * documentés pour qu'une revue humaine sache où regarder en priorité avant
 * mise en production.
 *
 * Page 1 du formulaire logique "2031-SD" = page 1 de l'asset partagé
 * `2031-sd.pdf` (voir asset-manifest.ts).
 */
import type { CerfaVisualMapping } from "../../types";
import { topLeft } from "../../types";

const FORM = "2031-SD" as const;
const MILLESIME = 2026;

export const registry2031SD2026: readonly CerfaVisualMapping[] = [
  // --- Cadre A — Identification ---------------------------------------
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "A_SIREN",
    page: 1,
    position: topLeft(169.1, 210.2),
    width: 136,
    height: 9,
    fontSize: 8,
    align: "left",
    format: "chiffres-repartis",
    digitPositions: [169.1, 183.6, 199.1, 214.6, 229.1, 244.2, 259.6, 274.6, 289.7],
    calibration: "mesure-empirique",
    note:
      "9 cases-chiffres mesurées individuellement sur le dossier témoin (SIREN 104545108 → '1'@169.1, '0'@183.6, ... '8'@289.7, tous à y=210.6). Le Cerfa officiel imprime le SIREN chiffre par chiffre dans des cases séparées, jamais une chaîne continue.",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "A_DENOMINATION",
    page: 1,
    position: topLeft(123.1, 163.0),
    width: 170,
    height: 9,
    fontSize: 9,
    align: "left",
    format: "texte",
    calibration: "mesure-empirique",
    note:
      "Confirmé sur le dossier témoin : 'BOUVARD ELSA' écrit exactement à ce point (123.1,163.0). Largeur bornée par le début de la boîte 'Adresse du déclarant' à x=299.2 sur la même bande verticale.",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "A_ADRESSE_ENTREPRISE",
    page: 1,
    position: topLeft(123.1, 175.6),
    width: 170,
    height: 9,
    fontSize: 9,
    align: "left",
    format: "texte",
    calibration: "mesure-empirique",
    note:
      "Confirmé : '15 Rue Saint-Germain' à ce point. LIMITE CONNUE — le Cerfa officiel réserve une 2e ligne (y≈194.7) pour code postal + ville, non modélisée ici : `identite.adresseEntreprise` est une chaîne unique côté Fiscal AI. La valeur complète est donc écrite sur une seule ligne à cette position, potentiellement plus longue que prévu par le Cerfa pour la seule voie — voir limites restantes du rapport final.",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "A_EXERCICE_DEBUT",
    page: 1,
    position: topLeft(119.0, 112.6),
    width: 195,
    height: 9,
    fontSize: 9,
    align: "left",
    format: "date",
    calibration: "mesure-empirique",
    note: "Confirmé : '01/02/2025' à ce point exact sur le dossier témoin.",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "A_EXERCICE_FIN",
    page: 1,
    position: topLeft(119.9, 124.8),
    width: 195,
    height: 9,
    fontSize: 9,
    align: "left",
    format: "date",
    calibration: "mesure-empirique",
    note: "Confirmé : '31/12/2025' à ce point exact sur le dossier témoin.",
  },

  // --- Case "Régime réel simplifié" (cadre haut de page) ---------------
  // P0 sécurisation — remplace l'estimation précédente. Mesuré directement
  // sur le Cerfa officiel vierge : les rectangles de fond grisé de la ligne
  // "Régime simplifié d'imposition / ou réel normal" laissent un blanc net
  // entre x=446.857 et x=462.475 (y=115.424-125.829) — c'est la case à
  // cocher elle-même (confirmé par inspection des primitives vectorielles
  // `re` du PDF officiel, pas par un texte). Glyphe centré dans cette boîte.
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "D_REGIME_REEL_SIMPLIFIE",
    page: 1,
    position: topLeft(454.666, 115.424),
    width: 15.6,
    height: 10.4,
    fontSize: 9,
    align: "center",
    format: "case-a-cocher",
    calibration: "mesure-empirique",
    note:
      "Boîte de case à cocher mesurée sur le Cerfa officiel vierge (assets/2026/2031-sd.pdf, page 1) : blanc entre deux rectangles de fond grisé, x=[446.857, 462.475], y=[115.424, 125.829]. Position = centre de la boîte (454.666). Remplace l'estimation par symétrie de la mission précédente.",
  },

  // --- Cadre C — Récapitulation des éléments d'imposition ---------------
  // P0 sécurisation (troisième passe, suite audit indépendant Cursor/Grok,
  // CONFIRMÉ) — la ligne "1. Résultat fiscal" N'EST PAS un cadre fusionné.
  // L'affirmation "un seul séparateur vertical à x=504.6, aucun séparateur
  // interne Col.1/Col.2" des missions précédentes était FAUSSE : elle a pris
  // le séparateur DROIT de la ligne (504.6, qui sépare Col.2 du bord de
  // page) pour l'unique séparateur, en manquant que ce même x=504.6 est en
  // réalité le séparateur INTERNE Col.1/Col.2, et qu'un second séparateur
  // existe à x=571.5 (bord droit réel de la page/tableau).
  //
  // Reconfirmé indépendamment (PyMuPDF `get_drawings()` ET parsing des
  // opérateurs `m`/`l`/`S` du flux de contenu pdf-lib, sur
  // `assets/2026/2031-sd.pdf`, page 1) : la ligne "1. Résultat fiscal" a
  // EXACTEMENT la même structure verticale que la ligne "4. Bénéfice
  // imposable" juste en dessous — quatre séparateurs verticaux traversent
  // la bande y=[266,276] de cette ligne : x=24.53 (marge gauche page),
  // x=432.31 (fin colonne label), x=504.6 (séparateur INTERNE Col.1/Col.2),
  // x=571.5 (bord droit page). Confirmé aussi par les en-têtes de colonne
  // eux-mêmes : "Col. 1" est imprimé centré sur [432.3,504.6] (x=448.3-468.6)
  // et "Col. 2" centré sur [504.6,571.5] (x=527.9-548.2) — sans ambiguïté.
  //
  // Boîte Col.1 (bénéfice) = [432.31, 504.6] ; boîte Col.2 (déficit) =
  // [504.6, 571.5]. Les deux cases ont donc des positions DISTINCTES, pas
  // partagées — la valeur "0" du dossier témoin à x≈502.9 est bien celle de
  // Col.1 (juste avant son bord droit à 504.6), pas une case fusionnée.
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "C_L1_COL1",
    page: 1,
    position: topLeft(502.9, 264.8),
    width: 70,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "Position inchangée par la correction P0 (troisième passe) : x=502.9 reste correcte — c'est la borne droite réelle de la boîte Col.1 [432.31,504.6], confirmée par la valeur '0' du dossier témoin ET par les séparateurs vectoriels du Cerfa officiel. Ce qui a changé : cette entrée n'est PLUS partagée avec C_L1_COL2 (voir cette entrée) — l'ancienne justification ('cadre fusionné, une seule case') était une erreur de lecture de la grille, corrigée après audit indépendant. " +
      "MISE À JOUR (correction fiscale aa765cb) : C_L1_COL1 = report de la case 370 du 2033-B-SD (`resultatFiscal` si >0) — même valeur que I_7A par construction du dossier LMNP mono-activité, ce n'est pas une duplication erronée. C_L1_COL2, elle, ne duplique plus I_7B depuis cette même correction : voir son entrée ci-dessous.",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "C_L1_COL2",
    page: 1,
    position: topLeft(569.8, 264.8),
    width: 65,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "CORRECTION P0 (audit indépendant Cursor/Grok, confirmé) : x=502.9 (valeur des missions précédentes, identique à C_L1_COL1) faisait écrire Col.1 et Col.2 EXACTEMENT au même point — deux cases distinctes rendues superposées. Reconfirmé indépendamment sur le Cerfa officiel vierge : Col.2 est une boîte séparée [504.6,571.5], bord droit réel = 571.5 (bord droit du tableau). Nouvelle position = bord droit de cette boîte, avec la même marge d'inset que C_L1_COL1 par rapport à son propre bord (504.6-502.9=1.7pt ; 571.5-1.7=569.8). " +
      "MISE À JOUR (correction fiscale aa765cb) : C_L1_COL2 ne reporte plus `deficitNouveau` — elle lit désormais `resultatFiscal` (si <0), exactement comme la case 372 du 2033-B-SD dont elle est le report (voir map-2031-recapitulation.ts). Cette condition n'est jamais vraie avec le F-006 actuel (`resultatFiscal` toujours ≥0, TRF-0031) : C_L1_COL2 reste géométriquement calibrée et testée (tests/position-oracle.test.ts, fixture synthétique) mais n'est exercée par aucun scénario réel aujourd'hui. Le déficit LMNP non professionnel (`deficitNouveau`) est réintégré ailleurs — case 330 du 2033-B-SD (calibrée, rendue) et case I_7B/I_AUTRES_LMNP_DEFICIT du Cadre 7 — jamais ici.",
  },
  // Cadre 7 (BIC non professionnels) — boîtes Bénéfice/Déficit mesurées
  // directement sur le Cerfa officiel vierge : 4 séparateurs verticaux
  // (x=253.8, 313.7, 383.8, 446.9) découpent la ligne en label|bénéfice|
  // (marge)|déficit. Boîte bénéfice = [253.8, 313.7] ; boîte déficit =
  // [383.8, 446.9] (confirmée en outre par la valeur réelle du dossier
  // témoin, à l'intérieur de cette boîte).
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "I_7A",
    page: 1,
    position: topLeft(313.7, 574.6),
    width: 55,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "CORRECTION P0 : remplace l'estimation par symétrie de la mission précédente. Position = bord droit réel de la boîte 'Bénéfice' mesurée sur le Cerfa officiel vierge (x=313.7, séparateurs à 253.8/313.7/383.8/446.9). Jamais exercée par le dossier témoin (déficitaire) ; couverte par un scénario synthétique bénéficiaire dédié (voir tests/scenario-beneficiaire.test.ts).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "I_7B",
    page: 1,
    position: topLeft(441.0, 574.6),
    width: 76,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note: "Confirmé au point : '9862' écrit exactement là sur le dossier témoin (cadre 7.dont BIC non professionnels — b DÉFICIT).",
  },
];
