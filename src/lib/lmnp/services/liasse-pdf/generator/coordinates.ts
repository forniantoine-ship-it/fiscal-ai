/**
 * Abstraction explicite de conversion de coordonnées — voir audit "Générer le
 * Cerfa" : PyMuPDF (et la plupart des outils d'inspection PDF) mesurent en
 * origine HAUT-GAUCHE, y croissant vers le bas. `pdf-lib` (comme tout
 * générateur PDF natif) dessine en origine BAS-GAUCHE, y croissant vers le
 * haut. Confondre les deux produit exactement le symptôme redouté par la
 * mission : une valeur décalée verticalement, invisible si elle tombe sur une
 * zone encore blanche, désastreuse si elle chevauche une autre case.
 *
 * Toutes les coordonnées du registre (`CerfaVisualMapping.position`) sont
 * stockées en `TopLeftPoint` — jamais en espace pdf-lib directement. Cette
 * fonction est le SEUL endroit du projet où la conversion a lieu.
 */
import type { TopLeftPoint } from "../types";

export type PdfLibPoint = { readonly space: "pdf-lib"; readonly x: number; readonly y: number };

/**
 * Écart mesuré empiriquement (smoke test de calibrage — génération réelle
 * puis re-mesure du PDF produit, 6 cases indépendantes : deux dates
 * d'exercice, dénomination, adresse, résultat fiscal, cadre 7 — sur
 * `2031-SD` 2026) entre :
 *  - le HAUT de la boîte englobante du texte de référence (convention
 *    `span["bbox"][1]`, PyMuPDF) — c'est ce que le registre stocke, car
 *    c'est ce que `search_for()`/`get_text("dict")` renvoient directement,
 *    sans interprétation typographique supplémentaire ;
 *  - la LIGNE DE BASE que `PDFPage.drawText()` de pdf-lib attend en
 *    paramètre `y` (police Helvetica standard pdf-lib, taille 9).
 * Écart identique à 0.001pt près sur les 6 mesures (9.675pt) — traité comme
 * une correction UNIQUE et documentée ici, jamais un ajustement ad hoc
 * appliqué case par case dans un registre. Revalidé par le test
 * `coordinates.test.ts` (re-génération + re-mesure du PDF produit, pas
 * seulement un calcul arithmétique isolé).
 */
const BBOX_TOP_TO_BASELINE_PT = 9.675;

export function toPdfLibPoint(point: TopLeftPoint, pageHeightPt: number): PdfLibPoint {
  return { space: "pdf-lib", x: point.x, y: pageHeightPt - (point.y + BBOX_TOP_TO_BASELINE_PT) };
}
