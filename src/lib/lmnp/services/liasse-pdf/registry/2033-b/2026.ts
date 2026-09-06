/**
 * Registre visuel — 2033-B-SD, millésime 2026 (Cerfa 15948*08, page 2/7).
 * Voir 2031-sd/2026.ts pour la méthode de calibrage.
 *
 * P0 sécurisation (deuxième passe) — chaque coordonnée ci-dessous a été
 * re-vérifiée individuellement sur le PDF officiel vierge
 * (`assets/2026/2033-sd.pdf`) : recherche des séparateurs de grille
 * vectoriels (`re`/`l`) autour de chaque case, confirmation croisée avec la
 * valeur réellement écrite sur le dossier témoin quand elle existe. Deux
 * cases (300, 350) n'avaient d'abord pas pu être confirmées avec une
 * certitude suffisante et avaient été RETIRÉES du périmètre supporté plutôt
 * qu'approximées — les deux ont depuis été recalibrées et intégrées par des
 * micro-jalons dédiés (voir leurs entrées ci-dessous et `excluded-cases.ts`,
 * désormais vide pour ce formulaire/millésime).
 *
 * P0 sécurisation (troisième passe, suite audit indépendant Cursor/Grok) —
 * la case 372 était mal positionnée (x=426.9, dans la boîte du NUMÉRO de
 * case "372" et non dans sa boîte de VALEUR) : voir la note de l'entrée 372
 * ci-dessous pour la mesure corrigée et sa méthode.
 *
 * Deux familles de position confirmées (séparateurs verticaux mesurés sur le
 * Cerfa officiel, confirmés par deux méthodes indépendantes : PyMuPDF
 * `get_drawings()` et parsing direct des opérateurs `m`/`l`/`S` du flux de
 * contenu pdf-lib) :
 *  - Colonne "valeur" principale (produits/charges/résultat comptable) :
 *    bord DROIT constant à x≈507.3.
 *  - Bloc "RÉINTÉGRATIONS/RÉSULTAT FISCAL" (cases 312/314, 318, 370/372) :
 *    séparateurs à x=347.5 (fin colonne label) / 361.89 / 425.955 / 440.307 /
 *    506.45 (bord droit page). Découpage réel : [347.5,361.89] = numéro de
 *    case "312"/"370" ; [361.89,425.955] = boîte VALEUR bénéfice (312/370) ;
 *    [425.955,440.307] = numéro de case "314"/"372" (PAS une boîte de
 *    valeur) ; [440.307,506.45] = boîte VALEUR déficit (314/372).
 */
import type { CerfaVisualMapping } from "../../types";
import { topLeft } from "../../types";

const FORM = "2033-B-SD" as const;
const MILLESIME = 2026;

export const registry2033B2026: readonly CerfaVisualMapping[] = [
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "218",
    page: 1,
    position: topLeft(507.3, 105.5),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note: "Confirmé : '5100' au dossier témoin (Production vendue — Services).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "232",
    page: 1,
    position: topLeft(507.3, 164.2),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note: "Confirmé : '5100' au dossier témoin (Total des produits d'exploitation).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "242",
    page: 1,
    position: topLeft(507.3, 222.9),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "Confirmé : '6250' au dossier témoin (Autres charges externes). Le mapper actuel (map-2033b.ts) ne produit cette case que si `rfs.emprunts` est défini — LIMITE CONNUE déjà documentée dans le code du mapper, non modifiée ici : la valeur du dossier témoin agrège des charges (copropriété, assurances) que le mapper actuel ne ventile pas encore vers cette case (cf. audit 'Dossier témoin', écart P1).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "244",
    page: 1,
    position: topLeft(506.5, 234.6),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "Confirmé : '4210' au dossier témoin (Impôts, taxes — droits de mutation). Le mapper actuel NE PRODUIT PAS cette case (cf. audit 'Dossier témoin', écart P1) : entrée conservée pour quand elle le sera, sans effet tant qu'aucune CerfaCase '244' n'existe.",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "254",
    page: 1,
    position: topLeft(507.3, 269.8),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note: "Confirmé : '3720' au dossier témoin (Dotations aux amortissements).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "264",
    page: 1,
    position: topLeft(507.3, 317.6),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note: "Confirmé : '14180' au dossier témoin (Total des charges d'exploitation).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "270",
    page: 1,
    position: topLeft(507.3, 330.6),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "Confirmé : '(9080)' au dossier témoin (Résultat d'exploitation). Depuis la correction P0 du formatter, un nombre négatif est désormais rendu entre parenthèses — plus de divergence de représentation avec le dossier de référence sur cette case.",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "294",
    page: 1,
    position: topLeft(507.3, 342.6),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note: "Confirmé : '4602' au dossier témoin (Charges financières).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "318",
    page: 1,
    position: topLeft(426.4, 448.2),
    width: 76,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note: "Confirmé : '3720' au dossier témoin (Amortissements excédentaires — réintégration art. 39C).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "310",
    page: 1,
    position: topLeft(507.3, 411.0),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note: "Confirmé : '(13681)' au dossier témoin (Bénéfices ou pertes — résultat comptable).",
  },
  // Cases 312/314 (résultat comptable après report) — boîtes confirmées sur
  // le Cerfa officiel vierge : séparateurs verticaux à x=347.5/361.9/426.0/
  // 440.3 découpent la ligne en label | boîte 312 [361.9,426.0] | (marge) |
  // boîte 314 [440.3, ~507]. Bord droit de la boîte 312 = 426.0.
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "312",
    page: 1,
    position: topLeft(426.0, 424.8),
    width: 60,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "CORRECTION P0 : remplace l'estimation par symétrie de la mission précédente (qui recopiait par erreur la position de 314). Position = bord droit réel de la boîte '312' mesurée sur le Cerfa officiel vierge (séparateurs à x=361.9 et x=426.0). Jamais exercée par le dossier témoin (déficitaire) ; couverte par un scénario synthétique bénéficiaire dédié (voir tests/scenario-beneficiaire.test.ts).",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "314",
    page: 1,
    position: topLeft(507.0, 424.8),
    width: 85,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note: "Confirmé : '13681' au dossier témoin (report du déficit comptable, col.2).",
  },
  // Cases 370/372 (résultat fiscal après imputation) — même famille de
  // boîtes que 312/314 (séparateurs identiques : 347.5/361.9/426.0/440.3),
  // confirmée indépendamment sur une seconde ligne du même bloc.
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "370",
    page: 1,
    position: topLeft(426.0, 787.8),
    width: 60,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "CORRECTION P0 : remplace l'estimation par symétrie de la mission précédente. Position = bord droit réel de la boîte '370' mesurée sur le Cerfa officiel vierge — même famille de séparateurs que 312 (x=361.9/426.0), confirmée sur une ligne indépendante. Exercée uniquement si resultatFiscal>0 (mapper existant) ; couverte par le scénario synthétique bénéficiaire.",
  },
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "372",
    page: 1,
    position: topLeft(507.0, 787.8),
    width: 66,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "CORRECTION P0 (audit indépendant Cursor/Grok, confirmé) : x=426.9 (valeur des missions précédentes) tombait dans la boîte du NUMÉRO DE CASE '372' lui-même [425.955, 440.307], pas dans sa boîte de VALEUR — le mapper aurait écrit 9862 dans la colonne bénéfice (370) et sur l'étiquette '372'. Reconfirmé indépendamment sur le Cerfa officiel vierge (deux méthodes : PyMuPDF get_drawings() et parsing direct des opérateurs vectoriels m/l/S du flux de contenu pdf-lib) : séparateurs verticaux à x=361.890/425.955/440.307/506.446 sur cette ligne — bord droit réel de la boîte de VALEUR de 372 = 506.446, même famille de colonnes que 314 (voir 314 ci-dessus, boîte identique). Position alignée sur 314 (x=507.0). " +
      "MISE À JOUR (correction fiscale aa765cb) : 372 ne reçoit plus jamais `fiscalResult.deficitNouveau` — elle lit désormais `resultatFiscal` (si <0), voir map-2033b.ts. Cette condition n'est jamais vraie avec le F-006 actuel (`resultatFiscal` toujours ≥0, TRF-0031) : 372 reste géométriquement calibrée et testée (tests/position-oracle.test.ts, fixture synthétique) mais n'est exercée par aucun scénario réel aujourd'hui. Le déficit LMNP non professionnel du dossier témoin (9862) est désormais réintégré en case 330 (calibrée et rendue, voir l'entrée 330 ci-dessous) — plus une absence du mapper.",
  },
  // Case 330 (bloc RÉINTÉGRATIONS, ligne "Divers*") — MICRO-JALON calibration
  // 330, après démonstration géométrique READ-ONLY indépendante (deux
  // méthodes : PyMuPDF `get_drawings()` et parsing direct des opérateurs
  // `m`/`l`/`S` du flux de contenu pdf-lib, résultats identiques au
  // centième de point près).
  //
  // La ligne "Divers*" (y=[485.248,504.337] top-left, haute de 19.1pt car
  // partagée avec les libellés sur deux lignes de 247/248) porte TROIS
  // cases numérotées côte à côte : 247 (valeur en [148.325,191.813]), 248
  // (valeur en [298.414,347.539]), puis 330. Ces trois zones sont
  // mutuellement exclusives — la zone de 330 ne chevauche ni 247 ni 248.
  //
  // Le numéro "330" lui-même est imprimé en [347.539,361.942] (même largeur
  // ≈14.4pt que les zones-numéro déjà connues de 312/314/370/372, sur la
  // MÊME famille de séparateurs). Sa boîte de VALEUR est donc l'intervalle
  // suivant à droite : [361.839/361.89, 425.955/426.007] — EXACTEMENT la
  // même colonne physique (un seul grand séparateur vertical continu de
  // y=423.5 à y=789.75) que les boîtes "bénéfice" de 312 et 370. Confirmé
  // par un indice supplémentaire : le Cerfa grise (rectangle de fond
  // x=[425.87,506.0], y=[437.4,553.8]) toute la colonne "style déficit" à
  // droite de x≈426 sur cette plage de lignes — aucune saisie n'y est
  // attendue pour une ligne de réintégration.
  //
  // x=426.0 : bord droit mesuré de la boîte de valeur, même convention que
  // 312/370 (même colonne). y=488.0 : calibré par génération réelle +
  // re-mesure indépendante du texte effectivement dessiné (PyMuPDF, sur le
  // PDF réellement produit par generateCerfaLiassePdf(), PAS recopié de
  // 312/370 dont le y ne s'applique qu'à leur propre ligne plus courte, et
  // PAS dérivé du dossier témoin). Résultat mesuré : bbox réelle de "9 862"
  // = x∈[403.48,426.0], y∈[488.0,500.366] (top-left) — confortablement à
  // l'intérieur de la cellule démontrée [361.89,425.96]×[485.248,504.337]
  // (marge ≈2.75pt du bord haut, ≈3.97pt du bord bas, aucun débordement sur
  // la zone-numéro "330" ni sur la ligne voisine). Voir
  // tests/position-oracle.test.ts, describe "case 330" pour la preuve
  // reproductible (test de non-régression sur cette bbox).
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "330",
    page: 1,
    position: topLeft(426.0, 488.0),
    width: 64,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "MICRO-JALON calibration 330 : position géométrique démontrée indépendamment du dossier témoin (deux méthodes techniques convergentes sur l'asset officiel 2033-sd.pdf, voir commentaire ci-dessus) — jamais déduite d'une autre case ni du dossier témoin. Zone de valeur [361.89,425.96]×[485.248,504.337], distincte de 247/248 et de la colonne droite grisée. Statut fiscal : `deficitNouveau` (voir map-2033b.ts, correction aa765cb) — cette entrée ne fait que positionner une valeur déjà fiscalement déterminée, aucune règle fiscale ici.",
  },
  // Case 350 (ligne "Créance due au titre du report en arrière du déficit",
  // partagée avec 346) — MICRO-JALON calibration 350, après démonstration
  // géométrique READ-ONLY indépendante (trois méthodes : PyMuPDF
  // `get_drawings()`/`get_text()`, parsing direct des opérateurs `m`/`l`/`S`
  // du flux de contenu pdf-lib, pdfjs-dist — résultats identiques au dixième
  // de point près ; plus un rendu raster + inspection visuelle pour calibrer
  // le y).
  //
  // La ligne porte DEUX numéros de case dans des colonnes disjointes : 346
  // (colonne du bloc "DÉDUCTIONS", x≈[286,296]) et 350 (colonne du bloc
  // "RÉINTÉGRATIONS/RÉSULTAT FISCAL" adjacent, x≈[425.9,440.36]) — jamais la
  // même zone. Le numéro "350" est imprimé en [425.903,440.359] ; sa boîte
  // de VALEUR est l'intervalle suivant à droite, [440.255,506.446] —
  // EXACTEMENT la même colonne physique (même grand séparateur vertical
  // continu, x≈440.3, de y=423.5 à y=789.75) que les boîtes de valeur de 314
  // et 372. Confirmé par un indice indépendant supplémentaire : un
  // rectangle de fond grisé (`347.452 175.342 78.434 10.928 re f*`) couvre
  // exactement la zone [347.45,425.89] de cette ligne (ni 346, ni 350) —
  // le Cerfa marque lui-même cette zone comme inutilisée ici, quand
  // [440.26,506.45] ne l'est pas.
  //
  // x=507.0 : bord droit de cette boîte, même convention que 314/372 (même
  // colonne). y=655.5 : calibré par génération réelle sur un PDF externe au
  // dépôt (`/tmp`, jamais commité) + re-mesure indépendante (PyMuPDF) +
  // inspection visuelle raster — PAS recopié de 330/372 (dont le y
  // appartient à des lignes de hauteur différente) ni dérivé du dossier
  // témoin (deficitsImputes=0 sur ce dossier, fiscalement non discriminant
  // pour la géométrie). Marge validée visuellement : aucun débordement
  // jusqu'à y≈656, débordement confirmé dès y≈658.5 — voir
  // tests/position-oracle.test.ts, describe "case 350" pour la preuve
  // reproductible.
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "350",
    page: 1,
    position: topLeft(507.0, 655.5),
    width: 66,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "MICRO-JALON calibration 350 : position géométrique démontrée indépendamment du registre et du dossier témoin (trois méthodes techniques convergentes sur l'asset officiel 2033-sd.pdf, voir commentaire ci-dessus). Zone de valeur [440.26,506.45]×[655.71,666.62], distincte de la zone-numéro '350', de la boîte de valeur de 346, et de la zone grisée voisine. Statut fiscal : `deficitsImputes` — règle VERROUILLÉE (voir map-2033b.ts, jalon dédié) ; cette entrée ne fait que positionner une valeur déjà fiscalement déterminée, aucune règle fiscale ici.",
  },
  // Case 300 (ligne "Charges exceptionnelles (VI)", même famille de colonnes
  // que 294/290/310/314/372) — MICRO-JALON implémentation 300, après
  // démonstration géométrique READ-ONLY indépendante (quatre méthodes :
  // PyMuPDF `get_drawings()`/`get_text()`, parsing direct des opérateurs
  // `m`/`l`/`S`/`re`/`rg` du flux de contenu pdf-lib (tokenizer dédié,
  // indépendant de `independent-grid-oracle.ts`), pdfjs-dist, et rendu raster
  // avec valeurs synthétiques — résultats identiques au millième de point).
  //
  // Le jalon d'audit de couverture précédent avait relevé que la justification
  // historique de l'exclusion ("aucun séparateur de grille fiable trouvé...
  // les lignes verticales détectées à sa hauteur appartiennent à la ligne
  // 290/347 au-dessus") ne résistait pas à une recontre-vérification : la
  // bande de 300 (y=[367.027,383.488] top-left) est délimitée par SES PROPRES
  // lignes horizontales, strictement disjointe de celle de 290
  // (y=[355.113,367.027]), et porte les mêmes séparateurs verticaux continus
  // (x=425.955 et x=440.307) que la ligne 294 juste au-dessus — déjà
  // GEO_CONFIRMED_NO_POSITION_ORACLE, jamais contestée.
  //
  // Le numéro "300" est imprimé en [425.903,440.359] (bbox PyMuPDF,
  // confirmée par pdfjs-dist) ; sa boîte de VALEUR est l'intervalle suivant à
  // droite, [440.255,506.446] — exactement la même largeur (≈66pt) et le
  // même bord droit que la boîte de valeur de 350 (même colonne physique,
  // famille 314/372/350). Aucune zone grisée ne chevauche cette ligne : le
  // seul rectangle gris trouvé à proximité couvre la ligne du memo "348",
  // strictement en dessous (y=[383.402,400.192]), jamais celle de 300.
  //
  // x=506.45 : bord droit mesuré, même convention que 314/372/350 (même
  // colonne). y=369.0 : calibré par génération réelle sur un PDF externe au
  // dépôt (`/tmp`, jamais commité) avec cinq valeurs candidates de y et
  // re-mesure indépendante (PyMuPDF) — pas recopié d'une autre case. Marge
  // mesurée à y=369.0 : ≈2.0pt en haut ET en bas (quasi-centrage dans la
  // cellule de 16.46pt de haut) ; débordement confirmé visuellement et par
  // bbox dès y≈372.5. Voir tests/position-oracle.test.ts, describe "case 300"
  // pour la preuve reproductible.
  {
    form: FORM,
    millesime: MILLESIME,
    caseId: "300",
    page: 1,
    position: topLeft(506.45, 369.0),
    width: 66,
    height: 9,
    fontSize: 9,
    align: "right",
    format: "eur-arrondi",
    calibration: "mesure-empirique",
    note:
      "MICRO-JALON calibration 300 : position géométrique démontrée indépendamment du registre et du dossier témoin (quatre méthodes techniques convergentes sur l'asset officiel 2033-sd.pdf, voir commentaire ci-dessus). Zone de valeur [440.26,506.45]×[367.03,383.49], distincte de la zone-numéro '300', de la ligne 294 au-dessus, et de la zone grisée du memo 348 en dessous. Statut fiscal : `perteExceptionnelle` (voir map-2033b.ts, pass-through TRF-0027, inchangé) — cette entrée ne fait que positionner une valeur déjà fiscalement déterminée, aucune règle fiscale ici.",
  },
  // Cases 352, 354 : RETIRÉES du périmètre supporté — voir excluded-cases.ts
  // pour la raison (jamais produites par le mapper actuel, aucune case à
  // positionner).
];
