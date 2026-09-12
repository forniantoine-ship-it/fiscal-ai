/**
 * Chargement des fonds de page Cerfa officiels — jamais modifiés, jamais
 * aplatis en image, jamais recomposés. Next et les commandes Node sont
 * lancés depuis la racine du projet. Ne pas utiliser __dirname ici :
 * Turbopack le remplace par un chemin virtuel /ROOT au build.
 * Les fonds sont inclus dans la trace de la route via next.config.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Millesime } from "../types";

const ASSETS_ROOT = path.join(process.cwd(), "src/lib/lmnp/services/liasse-pdf/assets");

export function assetPath(millesime: Millesime, assetFile: string): string {
  return path.join(ASSETS_ROOT, String(millesime), assetFile);
}

export function readAssetBytes(millesime: Millesime, assetFile: string): Uint8Array {
  return new Uint8Array(readFileSync(assetPath(millesime, assetFile)));
}
