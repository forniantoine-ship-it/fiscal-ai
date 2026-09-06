/**
 * Chargement des fonds de page Cerfa officiels — jamais modifiés, jamais
 * aplatis en image, jamais recomposés. Un simple accès disque relatif à ce
 * module (portable quel que soit le `cwd` du process qui l'exécute).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Millesime } from "../types";

const ASSETS_ROOT = path.join(__dirname, "");

export function assetPath(millesime: Millesime, assetFile: string): string {
  return path.join(ASSETS_ROOT, String(millesime), assetFile);
}

export function readAssetBytes(millesime: Millesime, assetFile: string): Uint8Array {
  return new Uint8Array(readFileSync(assetPath(millesime, assetFile)));
}
