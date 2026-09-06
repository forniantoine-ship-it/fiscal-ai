/**
 * Manifeste des fonds de page officiels — sépare "quel fichier PDF" de
 * "quelles pages" un formulaire logique occupe. Nécessaire car la DGFiP
 * regroupe plusieurs formulaires dans un même fichier PDF :
 *   - `2031-sd.pdf` (4 pages) : p.1 = 2031-SD, p.2 = 2031-bis-SD (cadres E à
 *     I), p.3-4 = pages de NOTICE (texte d'aide, aucune case à remplir).
 *   - `2033-sd.pdf` (7 pages) : p.1..7 = 2033-A-SD à 2033-G-SD, une page par
 *     formulaire, sans notice.
 *
 * Règle du point 12 (audit "Générer le Cerfa") : `declarationAssetPages` ne
 * référence QUE les pages de déclaration réelles. Les pages de notice
 * existent dans le fichier source (elles ne sont ni supprimées ni modifiées
 * du fichier immuable), mais ne sont jamais copiées dans le PDF final remis
 * au client — ce n'est pas un oubli, c'est une décision explicite
 * documentée ici.
 *
 * `sha256` permet à la generation gate de détecter un asset silencieusement
 * remplacé (mauvais fichier, mauvais millésime, fichier corrompu) avant même
 * d'en lire le contenu.
 */
import type { CerfaFormId, Millesime } from "./types";

export type CerfaAssetManifestEntry = {
  form: CerfaFormId;
  millesime: Millesime;
  /** Chemin relatif à `assets/<millesime>/`. */
  assetFile: string;
  /** Nombre total de pages attendu dans le fichier asset (déclaration + notices) — sert de garde-fou (voir gate). */
  assetTotalPages: number;
  /**
   * Pages de l'asset (1-indexées) qui composent CE formulaire, dans l'ordre
   * de sortie. `declarationAssetPages.length` = nombre de pages de ce
   * formulaire dans le PDF final produit pour le client.
   */
  declarationAssetPages: readonly number[];
  /** SHA-256 du fichier asset au moment du calibrage — voir generation gate. */
  sha256: string;
  source: string;
};

export const CERFA_ASSET_MANIFEST_2026: readonly CerfaAssetManifestEntry[] = [
  {
    form: "2031-SD",
    millesime: 2026,
    assetFile: "2031-sd.pdf",
    assetTotalPages: 4,
    declarationAssetPages: [1],
    sha256: "d45d66d6f6ed7e97769b454a22ed462b1ff2c8c2b0ed5779a1448bc6996b9ac2",
    source: "https://www.impots.gouv.fr/sites/default/files/formulaires/2031-sd/2026/2031-sd_5396.pdf (Cerfa 11085*28)",
  },
  {
    form: "2031-bis-SD",
    millesime: 2026,
    assetFile: "2031-sd.pdf",
    assetTotalPages: 4,
    // Page 2 du fichier partagé = intégralité du 2031-bis-SD (cadres E à I).
    // Pages 3-4 = notice/observations — volontairement exclues (point 12).
    declarationAssetPages: [2],
    sha256: "d45d66d6f6ed7e97769b454a22ed462b1ff2c8c2b0ed5779a1448bc6996b9ac2",
    source: "https://www.impots.gouv.fr/sites/default/files/formulaires/2031-sd/2026/2031-sd_5396.pdf (Cerfa 11085*28, annexe)",
  },
  {
    form: "2033-A-SD",
    millesime: 2026,
    assetFile: "2033-sd.pdf",
    assetTotalPages: 7,
    declarationAssetPages: [1],
    sha256: "ce4c519097fa435e9bd0ca3956016e5e05321c6f07db341285c9f46fb177b6cb",
    source: "https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5394.pdf (Cerfa 15948*08)",
  },
  {
    form: "2033-B-SD",
    millesime: 2026,
    assetFile: "2033-sd.pdf",
    assetTotalPages: 7,
    declarationAssetPages: [2],
    sha256: "ce4c519097fa435e9bd0ca3956016e5e05321c6f07db341285c9f46fb177b6cb",
    source: "https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5394.pdf (Cerfa 15948*08)",
  },
  {
    form: "2033-C-SD",
    millesime: 2026,
    assetFile: "2033-sd.pdf",
    assetTotalPages: 7,
    declarationAssetPages: [3],
    sha256: "ce4c519097fa435e9bd0ca3956016e5e05321c6f07db341285c9f46fb177b6cb",
    source: "https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5394.pdf (Cerfa 15948*08)",
  },
  {
    form: "2033-D-SD",
    millesime: 2026,
    assetFile: "2033-sd.pdf",
    assetTotalPages: 7,
    declarationAssetPages: [4],
    sha256: "ce4c519097fa435e9bd0ca3956016e5e05321c6f07db341285c9f46fb177b6cb",
    source: "https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5394.pdf (Cerfa 15948*08)",
  },
  {
    form: "2033-E-SD",
    millesime: 2026,
    assetFile: "2033-sd.pdf",
    assetTotalPages: 7,
    declarationAssetPages: [5],
    sha256: "ce4c519097fa435e9bd0ca3956016e5e05321c6f07db341285c9f46fb177b6cb",
    source: "https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5394.pdf (Cerfa 15948*08)",
  },
  {
    form: "2033-F-SD",
    millesime: 2026,
    assetFile: "2033-sd.pdf",
    assetTotalPages: 7,
    declarationAssetPages: [6],
    sha256: "ce4c519097fa435e9bd0ca3956016e5e05321c6f07db341285c9f46fb177b6cb",
    source: "https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5394.pdf (Cerfa 15948*08)",
  },
  {
    form: "2033-G-SD",
    millesime: 2026,
    assetFile: "2033-sd.pdf",
    assetTotalPages: 7,
    declarationAssetPages: [7],
    sha256: "ce4c519097fa435e9bd0ca3956016e5e05321c6f07db341285c9f46fb177b6cb",
    source: "https://www.impots.gouv.fr/sites/default/files/formulaires/2033-sd/2026/2033-sd_5394.pdf (Cerfa 15948*08)",
  },
];

/** Point d'extension explicite pour un futur millésime — jamais modifier les entrées 2026 ci-dessus. */
export const CERFA_ASSET_MANIFESTS: Readonly<Record<Millesime, readonly CerfaAssetManifestEntry[]>> = {
  2026: CERFA_ASSET_MANIFEST_2026,
};

export function resolveAssetManifestEntry(
  form: CerfaFormId,
  millesime: Millesime,
): CerfaAssetManifestEntry | undefined {
  return CERFA_ASSET_MANIFESTS[millesime]?.find((entry) => entry.form === form);
}
