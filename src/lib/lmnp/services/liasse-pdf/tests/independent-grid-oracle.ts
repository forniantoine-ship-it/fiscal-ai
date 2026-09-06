/**
 * Oracle de position INDÉPENDANT — utilisé UNIQUEMENT par
 * `position-oracle.test.ts`, jamais par le générateur ni par le registre.
 *
 * Objet de ce module (section 6 de la mission de correction P0) : répondre
 * à la circularité relevée par l'audit indépendant Cursor/Grok. Avant cette
 * mission, le seul test de "position" comparait le PDF généré à... la valeur
 * du registre lui-même (`coordinates.test.ts`) — un registre ne peut pas
 * être son propre oracle.
 *
 * Ici, la référence de vérité est calculée en lisant DIRECTEMENT les octets
 * du Cerfa officiel vierge (`assets/2026/*.pdf`), par DEUX chemins
 * techniques totalement indépendants du registre TypeScript et l'un de
 * l'autre :
 *
 *  1. `pdfjs-dist` (déjà une dépendance du projet, jamais utilisée par le
 *     générateur/registre) — extrait le texte réellement imprimé sur le
 *     Cerfa officiel (labels "370", "372", "Col. 1", "Col. 2"...) avec sa
 *     position exacte, pour localiser une LIGNE du formulaire sans jamais
 *     supposer une coordonnée a priori.
 *  2. `pdf-lib` (déjà une dépendance, utilisée ailleurs pour ÉCRIRE des PDF,
 *     jamais pour LIRE la géométrie d'un PDF existant) — décode le flux de
 *     contenu brut du Cerfa officiel et parse directement les opérateurs
 *     vectoriels `m`/`l`/`S` (moveto/lineto/stroke) qui dessinent les
 *     séparateurs de grille du formulaire, pour dériver les bornes réelles
 *     de chaque case.
 *
 * Les deux résultats ont été croisés manuellement avec un troisième outil
 * totalement hors du projet (PyMuPDF, Python) pendant l'audit de cette
 * mission — les trois s'accordent au millipoint près. Voir le rapport final
 * pour le détail des mesures et des commandes.
 */
import { PDFDocument, PDFArray, PDFRef, PDFStream, PDFRawStream, decodePDFRawStream } from "pdf-lib";

// pdfjs-dist expose son build "legacy" pour Node (pas de Worker, pas de DOM).
// Import dynamique : ce module ne doit jamais être chargé par le générateur
// runtime, seulement par les tests qui l'importent explicitement.
async function loadPdfJs() {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsLib;
}

export type ColumnBox = { readonly xMin: number; readonly xMax: number };

export function xInBox(x: number, box: ColumnBox, tolerance = 0.5): boolean {
  return x >= box.xMin - tolerance && x <= box.xMax + tolerance;
}

// --- 1. Vecteurs — parsing direct des opérateurs de tracé (pdf-lib) -------

type LineSegment = { x0: number; y0: number; x1: number; y1: number };

async function officialPageContentText(pdfBytes: Uint8Array, pageIndex0Based: number): Promise<string> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPages()[pageIndex0Based];
  if (!page) throw new Error(`Page ${pageIndex0Based} introuvable dans l'asset officiel fourni.`);

  const contents = page.node.Contents();
  const streams: PDFStream[] = [];
  if (contents instanceof PDFArray) {
    for (const item of contents.asArray()) {
      if (item instanceof PDFRef) {
        const stream = doc.context.lookup(item);
        if (stream instanceof PDFStream) streams.push(stream);
      }
    }
  } else if (contents instanceof PDFStream) {
    streams.push(contents);
  }

  const parts = streams.map((stream) =>
    stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents(),
  );
  return parts.map((bytes) => Buffer.from(bytes).toString("latin1")).join("\n");
}

/**
 * Parse tous les segments `x0 y0 m` suivis de `x1 y1 l S` (ou `l\nS`) du
 * flux de contenu — le motif standard utilisé par les générateurs de Cerfa
 * DGFiP pour tracer la grille des formulaires (vérifié empiriquement sur
 * les deux assets de ce projet). Coordonnées en espace PDF natif (origine
 * BAS-GAUCHE), jamais en `top-left` — voir `coordinates.ts` pour la
 * distinction, ici volontairement PAS utilisée (cet oracle ne doit rien
 * importer du module qu'il vérifie).
 */
function parseStrokedLineSegments(contentText: string): LineSegment[] {
  const segments: LineSegment[] = [];
  const re = /(-?[\d.]+)\s+(-?[\d.]+)\s+m\s*\n(-?[\d.]+)\s+(-?[\d.]+)\s+l\s+S/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(contentText)) !== null) {
    segments.push({
      x0: Number.parseFloat(m[1]),
      y0: Number.parseFloat(m[2]),
      x1: Number.parseFloat(m[3]),
      y1: Number.parseFloat(m[4]),
    });
  }
  return segments;
}

/**
 * Sépare les x des segments VERTICAUX (x0≈x1) qui traversent intégralement
 * la bande [yMin,yMax] fournie (espace PDF natif, bas-gauche) — c'est-à-dire
 * les séparateurs de grille de LA ligne du formulaire qui nous intéresse,
 * pas une ligne voisine. Retourne les x triés, dédupliqués au dixième de
 * point (le tracé PDF répète parfois un même trait en segments consécutifs).
 */
function verticalSeparatorsSpanningBand(segments: readonly LineSegment[], yMin: number, yMax: number): number[] {
  const xs = new Set<number>();
  for (const s of segments) {
    const isVertical = Math.abs(s.x0 - s.x1) < 0.05;
    if (!isVertical) continue;
    const segMin = Math.min(s.y0, s.y1);
    const segMax = Math.max(s.y0, s.y1);
    if (segMin <= yMin + 0.5 && segMax >= yMax - 0.5) {
      xs.add(Math.round(s.x0 * 10) / 10);
    }
  }
  return [...xs].sort((a, b) => a - b);
}

// --- 2. Texte — localisation des lignes via pdfjs-dist --------------------

type TextHit = { x: number; yBottomLeft: number; width: number; height: number };

/**
 * Cherche un item de texte dont le contenu, une fois trimmé, est EXACTEMENT
 * `needle`, sur la page demandée (1-indexée) de l'asset officiel fourni.
 * Renvoie sa position en espace PDF natif bas-gauche (convention pdfjs-dist,
 * jamais convertie ici — chaque appelant convertit explicitement si besoin).
 */
async function findExactTextOnOfficialPage(
  pdfBytes: Uint8Array,
  pageNumber1Based: number,
  needle: string,
): Promise<TextHit> {
  const pdfjsLib = await loadPdfJs();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const page = await doc.getPage(pageNumber1Based);
  const textContent = await page.getTextContent();
  for (const item of textContent.items as Array<{ str: string; transform: number[]; width: number; height: number }>) {
    if (item.str.trim() === needle) {
      return { x: item.transform[4], yBottomLeft: item.transform[5], width: item.width, height: item.height };
    }
  }
  throw new Error(
    `Texte "${needle}" introuvable page ${pageNumber1Based} de l'asset officiel — l'oracle ne peut pas localiser la ligne sans ce repère indépendant du registre.`,
  );
}

/** Trouve l'intervalle [xs[i], xs[i+1]] qui contient `x` (avec tolérance). */
function intervalContaining(xs: readonly number[], x: number, tolerance = 1): ColumnBox | undefined {
  for (let i = 0; i < xs.length - 1; i += 1) {
    if (xs[i] - tolerance <= x && x <= xs[i + 1] + tolerance) {
      return { xMin: xs[i], xMax: xs[i + 1] };
    }
  }
  return undefined;
}

/** L'intervalle immédiatement à DROITE de celui fourni, dans la même liste triée de séparateurs. */
function nextIntervalRight(xs: readonly number[], box: ColumnBox): ColumnBox | undefined {
  const idx = xs.indexOf(box.xMax);
  if (idx === -1 || idx + 1 >= xs.length) return undefined;
  return { xMin: xs[idx], xMax: xs[idx + 1] };
}

// --- Oracles publics -------------------------------------------------------

export type Case370372Boxes = {
  /** Boîte VALEUR de la case "370" (bénéfice) — PAS la zone de son numéro imprimé. */
  beneficeBox: ColumnBox;
  /** Zone où est imprimé le numéro de case "372" — écrire une valeur ici est l'erreur P0-1 historique. */
  numberZone372: ColumnBox;
  /** Boîte VALEUR de la case "372" (déficit) — seule zone correcte pour la valeur de 372. */
  deficitBox: ColumnBox;
};

/**
 * Dérive, en lisant `assets/2026/2033-sd.pdf` (page 2 = 2033-B-SD), les
 * bornes réelles des boîtes de la ligne "RÉSULTAT FISCAL APRÈS IMPUTATION
 * DES DÉFICITS" (cases 370/372) — sans jamais importer `registry/2033-b`.
 */
export async function deriveCase370372Boxes(officialAssetBytes: Uint8Array): Promise<Case370372Boxes> {
  const PAGE_NUMBER = 2; // 2033-B-SD = page 2 de l'asset partagé (asset-manifest.ts, non importé ici par choix : la page est retrouvée par le contenu textuel de la ligne elle-même, voir ci-dessous — seul le NUMÉRO de page est un fait fixe du fichier PDF, pas une hypothèse de registre)
  const text372 = await findExactTextOnOfficialPage(officialAssetBytes, PAGE_NUMBER, "372");
  const text370 = await findExactTextOnOfficialPage(officialAssetBytes, PAGE_NUMBER, "370");

  const yMin = Math.min(text372.yBottomLeft, text370.yBottomLeft) - 1;
  const yMax = Math.max(text372.yBottomLeft + text372.height, text370.yBottomLeft + text370.height) + 1;

  const contentText = await officialPageContentText(officialAssetBytes, PAGE_NUMBER - 1);
  const segments = parseStrokedLineSegments(contentText);
  const xs = verticalSeparatorsSpanningBand(segments, yMin, yMax);
  if (xs.length < 4) {
    throw new Error(
      `Oracle 370/372 : seulement ${xs.length} séparateur(s) vertical(aux) trouvé(s) dans la bande de la ligne 370/372 (attendu ≥4) — l'asset officiel a peut-être changé de structure. xs=${xs.join(",")}`,
    );
  }

  const numberZone370 = intervalContaining(xs, text370.x);
  const numberZone372 = intervalContaining(xs, text372.x);
  if (!numberZone370 || !numberZone372) {
    throw new Error("Oracle 370/372 : impossible de localiser la zone-numéro de 370 ou 372 dans les séparateurs trouvés.");
  }
  const beneficeBox = nextIntervalRight(xs, numberZone370);
  const deficitBox = nextIntervalRight(xs, numberZone372);
  if (!beneficeBox || !deficitBox) {
    throw new Error("Oracle 370/372 : impossible de dériver la boîte de valeur à droite du numéro de case.");
  }

  return { beneficeBox, numberZone372, deficitBox };
}

export type ResultatFiscalColumnBoxes = {
  col1Box: ColumnBox;
  col2Box: ColumnBox;
};

/**
 * Dérive, en lisant `assets/2026/2031-sd.pdf` (page 1 = 2031-SD), les bornes
 * réelles des deux colonnes (Col.1 / Col.2) de la ligne "1. Résultat fiscal"
 * du cadre C — sans jamais importer `registry/2031-sd`.
 */
export async function deriveResultatFiscalColumnBoxes(officialAssetBytes: Uint8Array): Promise<ResultatFiscalColumnBoxes> {
  const PAGE_NUMBER = 1;
  const label = await findExactTextOnOfficialPage(officialAssetBytes, PAGE_NUMBER, "1. Résultat fiscal");

  const yMin = label.yBottomLeft - 1;
  const yMax = label.yBottomLeft + label.height + 1;

  const contentText = await officialPageContentText(officialAssetBytes, PAGE_NUMBER - 1);
  const segments = parseStrokedLineSegments(contentText);
  const allXs = verticalSeparatorsSpanningBand(segments, yMin, yMax);

  // Heuristique documentée (voir le module docstring) : sur un Cerfa
  // DGFiP, la/les colonne(s) de VALEUR d'une ligne sont toujours dans la
  // moitié droite de la page — filtrer élimine la marge de page gauche et
  // la frontière label/valeur, sans jamais supposer une coordonnée précise.
  const doc = await PDFDocument.load(officialAssetBytes);
  const pageWidth = doc.getPages()[PAGE_NUMBER - 1].getWidth();
  const xs = allXs.filter((x) => x > pageWidth / 2);
  if (xs.length < 3) {
    throw new Error(
      `Oracle Résultat fiscal : seulement ${xs.length} séparateur(s) trouvé(s) dans la moitié droite de la ligne (attendu ≥3 : fin-label/Col.1|Col.2, Col.1|Col.2, bord droit) — xs=${xs.join(",")}`,
    );
  }

  return {
    col1Box: { xMin: xs[0], xMax: xs[1] },
    col2Box: { xMin: xs[1], xMax: xs[2] },
  };
}

export type Case330Boxes = {
  /** Zone où est imprimé le numéro de case "330" — écrire une valeur ici répéterait l'erreur historique P0-1 (case 372). */
  numberZone330: ColumnBox;
  /** Boîte VALEUR de la case "330" — seule zone correcte. */
  valueBox330: ColumnBox;
  /** Boîte VALEUR de la case 247, sur la même ligne — ne doit jamais contenir la valeur de 330. */
  valueBox247: ColumnBox;
  /** Boîte VALEUR de la case 248, sur la même ligne — ne doit jamais contenir la valeur de 330. */
  valueBox248: ColumnBox;
};

/**
 * Dérive, en lisant `assets/2026/2033-sd.pdf` (page 2 = 2033-B-SD), les
 * bornes réelles de la ligne "Divers*" (bloc RÉINTÉGRATIONS) qui porte les
 * trois cases 247/248/330 — sans jamais importer `registry/2033-b`.
 *
 * Cette ligne est plus haute (labels 247/248 sur deux lignes) et plus dense
 * (trois cases côte à côte) que les lignes 370/372 — le même algorithme
 * générique (zone-numéro → boîte de valeur = intervalle suivant à droite)
 * s'applique néanmoins à chaque case individuellement.
 */
export async function deriveCase330Boxes(officialAssetBytes: Uint8Array): Promise<Case330Boxes> {
  const PAGE_NUMBER = 2;
  const text247 = await findExactTextOnOfficialPage(officialAssetBytes, PAGE_NUMBER, "247");
  const text248 = await findExactTextOnOfficialPage(officialAssetBytes, PAGE_NUMBER, "248");
  const text330 = await findExactTextOnOfficialPage(officialAssetBytes, PAGE_NUMBER, "330");

  const yMin = Math.min(text247.yBottomLeft, text248.yBottomLeft, text330.yBottomLeft) - 1;
  const yMax = Math.max(text247.yBottomLeft + text247.height, text248.yBottomLeft + text248.height, text330.yBottomLeft + text330.height) + 1;

  const contentText = await officialPageContentText(officialAssetBytes, PAGE_NUMBER - 1);
  const segments = parseStrokedLineSegments(contentText);
  const xs = verticalSeparatorsSpanningBand(segments, yMin, yMax);
  if (xs.length < 6) {
    throw new Error(
      `Oracle 330 : seulement ${xs.length} séparateur(s) vertical(aux) trouvé(s) dans la bande de la ligne 247/248/330 (attendu ≥6) — l'asset officiel a peut-être changé de structure. xs=${xs.join(",")}`,
    );
  }

  const numberZone247 = intervalContaining(xs, text247.x);
  const numberZone248 = intervalContaining(xs, text248.x);
  const numberZone330 = intervalContaining(xs, text330.x);
  if (!numberZone247 || !numberZone248 || !numberZone330) {
    throw new Error("Oracle 330 : impossible de localiser la zone-numéro de 247, 248 ou 330 dans les séparateurs trouvés.");
  }
  const valueBox247 = nextIntervalRight(xs, numberZone247);
  const valueBox248 = nextIntervalRight(xs, numberZone248);
  const valueBox330 = nextIntervalRight(xs, numberZone330);
  if (!valueBox247 || !valueBox248 || !valueBox330) {
    throw new Error("Oracle 330 : impossible de dériver une boîte de valeur à droite d'un des trois numéros de case.");
  }

  return { numberZone330, valueBox330, valueBox247, valueBox248 };
}

export type Case350Boxes = {
  /** Zone où est imprimé le numéro de case "350" — écrire une valeur ici répéterait l'erreur historique P0-1 (case 372). */
  numberZone350: ColumnBox;
  /** Boîte VALEUR de la case "350" — seule zone correcte. */
  valueBox350: ColumnBox;
  /** Boîte VALEUR de la case 346, même ligne, colonne totalement disjointe — ne doit jamais contenir la valeur de 350. */
  valueBox346: ColumnBox;
};

/**
 * Dérive, en lisant `assets/2026/2033-sd.pdf` (page 2 = 2033-B-SD), les
 * bornes réelles de la ligne "Créance due au titre du report en arrière du
 * déficit" (libellé unique, deux numéros de case dans des colonnes
 * disjointes : 346 et 350) — sans jamais importer `registry/2033-b`.
 *
 * 346 appartient à la colonne standard du bloc "DÉDUCTIONS" (même famille
 * que 247/248) ; 350 appartient à la colonne du bloc "RÉINTÉGRATIONS/
 * RÉSULTAT FISCAL" adjacent (même famille que 314/372) — deux familles de
 * séparateurs distinctes, toutes deux traversant la bande y de cette ligne,
 * d'où le même algorithme générique (zone-numéro → boîte de valeur =
 * intervalle suivant à droite) appliqué indépendamment à chacune.
 */
export async function deriveCase350Boxes(officialAssetBytes: Uint8Array): Promise<Case350Boxes> {
  const PAGE_NUMBER = 2;
  const text346 = await findExactTextOnOfficialPage(officialAssetBytes, PAGE_NUMBER, "346");
  const text350 = await findExactTextOnOfficialPage(officialAssetBytes, PAGE_NUMBER, "350");

  const yMin = Math.min(text346.yBottomLeft, text350.yBottomLeft) - 1;
  const yMax = Math.max(text346.yBottomLeft + text346.height, text350.yBottomLeft + text350.height) + 1;

  const contentText = await officialPageContentText(officialAssetBytes, PAGE_NUMBER - 1);
  const segments = parseStrokedLineSegments(contentText);
  const xs = verticalSeparatorsSpanningBand(segments, yMin, yMax);
  if (xs.length < 4) {
    throw new Error(
      `Oracle 350 : seulement ${xs.length} séparateur(s) vertical(aux) trouvé(s) dans la bande de la ligne 346/350 (attendu ≥4) — l'asset officiel a peut-être changé de structure. xs=${xs.join(",")}`,
    );
  }

  const numberZone346 = intervalContaining(xs, text346.x);
  const numberZone350 = intervalContaining(xs, text350.x);
  if (!numberZone346 || !numberZone350) {
    throw new Error("Oracle 350 : impossible de localiser la zone-numéro de 346 ou 350 dans les séparateurs trouvés.");
  }
  const valueBox346 = nextIntervalRight(xs, numberZone346);
  const valueBox350 = nextIntervalRight(xs, numberZone350);
  if (!valueBox346 || !valueBox350) {
    throw new Error("Oracle 350 : impossible de dériver une boîte de valeur à droite d'un des deux numéros de case.");
  }

  return { numberZone350, valueBox350, valueBox346 };
}

export type Case300Boxes = {
  /** Zone où est imprimé le numéro de case "300" — écrire une valeur ici répéterait l'erreur historique P0-1 (case 372). */
  numberZone300: ColumnBox;
  /** Boîte VALEUR de la case "300" — seule zone correcte. */
  valueBox300: ColumnBox;
};

/**
 * Dérive, en lisant `assets/2026/2033-sd.pdf` (page 2 = 2033-B-SD), les
 * bornes réelles de la ligne "Charges exceptionnelles (VI)" (case 300) —
 * sans jamais importer `registry/2033-b`.
 *
 * Contrairement à 330/350 (deux numéros de case sur la même ligne), 300 est
 * seule sur sa ligne : un seul appel à `findExactTextOnOfficialPage` suffit.
 * La ligne 300 jouxte à sa gauche le bloc mémo à accolade "{347/348}", dont
 * les séparateurs verticaux (x≈347.5/361.9/416.5) traversent aussi la bande
 * y de cette ligne — `verticalSeparatorsSpanningBand` les inclut donc dans
 * `xs`, mais l'algorithme générique (zone-numéro → boîte de valeur =
 * intervalle suivant à droite) les ignore naturellement : `intervalContaining`
 * ne retient que l'intervalle qui contient réellement `x` du texte "300",
 * jamais un intervalle plus à gauche. Vérifié par exécution directe avant
 * d'écrire cette fonction (voir le rapport du jalon d'implémentation) :
 * xs=[28.3, 148.3, 347.5, 361.9, 416.5, 426, 440.3, 506.1] →
 * numberZone300={426,440.3}, valueBox300={440.3,506.1} — identique aux
 * mesures indépendantes du jalon de calibration read-only.
 */
export async function deriveCase300Boxes(officialAssetBytes: Uint8Array): Promise<Case300Boxes> {
  const PAGE_NUMBER = 2;
  const text300 = await findExactTextOnOfficialPage(officialAssetBytes, PAGE_NUMBER, "300");

  const yMin = text300.yBottomLeft - 1;
  const yMax = text300.yBottomLeft + text300.height + 1;

  const contentText = await officialPageContentText(officialAssetBytes, PAGE_NUMBER - 1);
  const segments = parseStrokedLineSegments(contentText);
  const xs = verticalSeparatorsSpanningBand(segments, yMin, yMax);
  if (xs.length < 3) {
    throw new Error(
      `Oracle 300 : seulement ${xs.length} séparateur(s) vertical(aux) trouvé(s) dans la bande de la ligne 300 (attendu ≥3) — l'asset officiel a peut-être changé de structure. xs=${xs.join(",")}`,
    );
  }

  const numberZone300 = intervalContaining(xs, text300.x);
  if (!numberZone300) {
    throw new Error("Oracle 300 : impossible de localiser la zone-numéro de 300 dans les séparateurs trouvés.");
  }
  const valueBox300 = nextIntervalRight(xs, numberZone300);
  if (!valueBox300) {
    throw new Error("Oracle 300 : impossible de dériver la boîte de valeur à droite du numéro de case.");
  }

  return { numberZone300, valueBox300 };
}
