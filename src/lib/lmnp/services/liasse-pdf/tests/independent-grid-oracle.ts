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

// --- 2033-C-SD — GO-1/GO-2 (page 3 de l'asset partagé) --------------------

/**
 * Variante multi-textes de `findExactTextOnOfficialPage` : localise
 * PLUSIEURS chaînes exactes en un seul chargement de page (huit cases sur
 * la même page 2033-C sinon huit chargements pdfjs-dist redondants).
 */
async function findExactTextHits(
  pdfBytes: Uint8Array,
  pageNumber1Based: number,
  needles: readonly string[],
): Promise<Map<string, TextHit>> {
  const pdfjsLib = await loadPdfJs();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const page = await doc.getPage(pageNumber1Based);
  const textContent = await page.getTextContent();
  const remaining = new Set(needles);
  const found = new Map<string, TextHit>();
  for (const item of textContent.items as Array<{ str: string; transform: number[]; width: number; height: number }>) {
    const trimmed = item.str.trim();
    if (remaining.has(trimmed) && !found.has(trimmed)) {
      found.set(trimmed, { x: item.transform[4], yBottomLeft: item.transform[5], width: item.width, height: item.height });
    }
  }
  for (const needle of needles) {
    if (!found.has(needle)) {
      throw new Error(`Texte "${needle}" introuvable page ${pageNumber1Based} de l'asset officiel — l'oracle ne peut pas localiser la case sans ce repère indépendant du registre.`);
    }
  }
  return found;
}

export type Case2033CTotalRowBoxes = {
  numberZone426: ColumnBox; valueBox426: ColumnBox;
  numberZone476: ColumnBox; valueBox476: ColumnBox;
  numberZone490: ColumnBox; valueBox490: ColumnBox;
  numberZone492: ColumnBox; valueBox492: ColumnBox;
  numberZone496: ColumnBox; valueBox496: ColumnBox;
  numberZone570: ColumnBox; valueBox570: ColumnBox;
  numberZone572: ColumnBox; valueBox572: ColumnBox;
  numberZone576: ColumnBox; valueBox576: ColumnBox;
};

// "490" est un cas particulier du flux de contenu officiel : la ligne
// "TOTAL 490" est dessinée par un SEUL opérateur Tj ("TOTAL 490", un bloc
// texte indivisible), jamais deux opérateurs distincts "TOTAL" et "490" —
// vérifié par exécution directe (`getTextContent`, avec et sans
// `disableCombineTextItems`) : les deux renvoient le bloc fusionné pour
// cette ligne précise, alors que 492/494/496 restent des items séparés sur
// la même ligne. Impossible d'obtenir le x du seul "490" par ce chemin.
// On retrouve sa colonne par une ligne SIBLING non ambiguë de la MÊME
// colonne (Cadre I, colonne "début d'exercice", x constant sur les 9 lignes
// 400/410/420/430/440/450/460/470/480 juste au-dessus — vérifié sur le
// dump complet de la page) : "480" partage exactement cette colonne, sans
// aucune ambiguïté. La bande verticale (y) reste celle de la ligne TOTAL
// elle-même, dérivée de "492" (même ligne, item non fusionné).
const CASE_490_COLUMN_SIBLING = "480";

const CASE_IDS_2033C_TOTAL_ROW = ["426", "476", "492", "496", "570", "572", "576"] as const;

/**
 * Dérive, en lisant `assets/2026/2033-sd.pdf` (page 3 = 2033-C-SD), les
 * bornes réelles des 8 cases GO-1/GO-2 (Terrains/Mobilier colonne "fin
 * d'exercice", TOTAL Cadre I et Cadre II) — sans jamais importer
 * `registry/2033-c`. Même principe que `deriveCase370372Boxes`/
 * `deriveCase330Boxes` : zone-numéro = intervalle contenant le texte du
 * numéro de case, boîte de valeur = intervalle suivant à droite.
 */
export async function deriveCase2033CTotalRowBoxes(officialAssetBytes: Uint8Array): Promise<Case2033CTotalRowBoxes> {
  const PAGE_NUMBER = 3; // 2033-C-SD = page 3 de l'asset partagé (asset-manifest.ts) — fait fixe du fichier, jamais une hypothèse de registre.
  const hits = await findExactTextHits(officialAssetBytes, PAGE_NUMBER, [...CASE_IDS_2033C_TOTAL_ROW, CASE_490_COLUMN_SIBLING]);

  const contentText = await officialPageContentText(officialAssetBytes, PAGE_NUMBER - 1);
  const segments = parseStrokedLineSegments(contentText);

  const result = {} as Record<string, ColumnBox>;
  for (const caseId of CASE_IDS_2033C_TOTAL_ROW) {
    const hit = hits.get(caseId)!;
    const yMin = hit.yBottomLeft - 1;
    const yMax = hit.yBottomLeft + hit.height + 1;
    const xs = verticalSeparatorsSpanningBand(segments, yMin, yMax);
    if (xs.length < 2) {
      throw new Error(
        `Oracle 2033-C : seulement ${xs.length} séparateur(s) vertical(aux) trouvé(s) dans la bande de la case "${caseId}" (attendu ≥2) — l'asset officiel a peut-être changé de structure. xs=${xs.join(",")}`,
      );
    }
    const numberZone = intervalContaining(xs, hit.x);
    if (!numberZone) {
      throw new Error(`Oracle 2033-C : impossible de localiser la zone-numéro de la case "${caseId}" dans les séparateurs trouvés.`);
    }
    const valueBox = nextIntervalRight(xs, numberZone);
    if (!valueBox) {
      throw new Error(`Oracle 2033-C : impossible de dériver la boîte de valeur à droite du numéro de la case "${caseId}".`);
    }
    result[`numberZone${caseId}`] = numberZone;
    result[`valueBox${caseId}`] = valueBox;
  }

  // "490" — voir le commentaire de `CASE_490_COLUMN_SIBLING` ci-dessus.
  // Bande verticale de la ligne TOTAL (déjà dérivée pour "492" ci-dessus,
  // même ligne). Colonne retrouvée via "480", ligne sibling non ambiguë de
  // la même colonne.
  const totalRowHit492 = hits.get("492")!;
  const siblingHit480 = hits.get(CASE_490_COLUMN_SIBLING)!;
  const totalRowYMin = totalRowHit492.yBottomLeft - 1;
  const totalRowYMax = totalRowHit492.yBottomLeft + totalRowHit492.height + 1;
  const totalRowXs = verticalSeparatorsSpanningBand(segments, totalRowYMin, totalRowYMax);
  const numberZone490 = intervalContaining(totalRowXs, siblingHit480.x);
  if (!numberZone490) {
    throw new Error('Oracle 2033-C : impossible de localiser la zone-numéro de "490" via sa colonne sibling "480".');
  }
  const valueBox490 = nextIntervalRight(totalRowXs, numberZone490);
  if (!valueBox490) {
    throw new Error('Oracle 2033-C : impossible de dériver la boîte de valeur à droite du numéro de "490".');
  }
  result.numberZone490 = numberZone490;
  result.valueBox490 = valueBox490;

  return result as unknown as Case2033CTotalRowBoxes;
}

// --- 2033-A-SD — bilan simplifié, 25 cases (page 1 de l'asset partagé) ----

/**
 * Les trois familles de colonnes du 2033-A-SD, telles qu'elles apparaissent
 * RÉELLEMENT sur le Cerfa officiel — jamais une hypothèse de registre.
 *
 * "NET" ici désigne exclusivement l'en-tête (majuscules) du bloc PASSIF,
 * seul à porter des numéros de case (120…180) : le bloc ACTIF affiche aussi
 * un intitulé "Net" (minuscule), mais c'est une colonne CALCULÉE sans numéro
 * de case propre — aucune des 25 cases du registre ne s'y trouve, donc elle
 * n'a pas besoin d'être dérivée ici.
 */
export type Cerfa2033AColumnLabel = "Brut" | "Amortissements-Provisions" | "NET";

const COLUMN_HEADER_TEXT_2033A: Record<Cerfa2033AColumnLabel, string> = {
  Brut: "Brut",
  "Amortissements-Provisions": "Amortissements – Provisions",
  NET: "NET",
};

const CASE_IDS_2033A = [
  "016", "028", "030", "042", "044", "048",
  "064", "066", "068", "070", "072", "074", "080", "082", "084", "086", "092", "094", "096", "098",
  "110", "112",
  "120", "134", "136", "137", "142",
  "156", "164", "166", "172", "174", "175", "176", "180",
] as const;

/**
 * Dérive, en lisant `assets/2026/2033-sd.pdf` (page 1 = 2033-A-SD), les
 * bornes réelles des TROIS familles de colonnes (zone-numéro + boîte de
 * valeur fusionnées) en repérant les intitulés de colonne effectivement
 * imprimés ("Brut", "Amortissements – Provisions", "NET") — jamais en
 * important `registry/2033-a` ni `scope/2033-a-2026`.
 */
export async function derive2033AColumnFamilies(officialAssetBytes: Uint8Array): Promise<Record<Cerfa2033AColumnLabel, ColumnBox>> {
  const PAGE_NUMBER = 1;
  const needles = Object.values(COLUMN_HEADER_TEXT_2033A);
  const hits = await findExactTextHits(officialAssetBytes, PAGE_NUMBER, needles);
  const contentText = await officialPageContentText(officialAssetBytes, PAGE_NUMBER - 1);
  const segments = parseStrokedLineSegments(contentText);

  const result = {} as Record<Cerfa2033AColumnLabel, ColumnBox>;
  for (const [column, needle] of Object.entries(COLUMN_HEADER_TEXT_2033A) as [Cerfa2033AColumnLabel, string][]) {
    const hit = hits.get(needle)!;
    const yMin = hit.yBottomLeft - 1;
    const yMax = hit.yBottomLeft + hit.height + 1;
    const xs = verticalSeparatorsSpanningBand(segments, yMin, yMax);
    // L'intitulé de colonne est un texte large, centré sur toute la famille
    // (zone-numéro + boîte de valeur réunies : le trait qui sépare les deux
    // sous-zones n'existe qu'au niveau des LIGNES de cases, jamais au niveau
    // de la ligne d'en-tête elle-même) — `intervalContaining` avec la
    // tolérance par défaut suffit, vérifié par exécution directe.
    const family = intervalContaining(xs, hit.x);
    if (!family) {
      throw new Error(
        `Oracle 2033-A : impossible de localiser la famille de colonne "${column}" (en-tête "${needle}") dans les séparateurs officiels — xs=${xs.join(",")}`,
      );
    }
    result[column] = family;
  }
  return result;
}

export type Case2033ABox = {
  readonly caseId: string;
  readonly column: Cerfa2033AColumnLabel;
  /** Zone où est imprimé le numéro de case — écrire une valeur ici répéterait l'erreur historique P0-1 (case 372 du 2033-B). */
  readonly numberZone: ColumnBox;
  /** Boîte VALEUR réelle de la case. */
  readonly valueBox: ColumnBox;
  /**
   * Bande verticale (espace PDF natif, bas-gauche) de la ligne portant cette
   * case, dérivée par MI-DISTANCE avec les cases voisines de la MÊME colonne
   * (jamais une valeur mesurée à part, jamais une constante recopiée) —
   * détecte un décalage d'une valeur vers la ligne du dessus ou du dessous,
   * dans la même colonne.
   */
  readonly rowBand: { readonly yMin: number; readonly yMax: number };
};

/**
 * Dérive, en lisant `assets/2026/2033-sd.pdf` (page 1 = 2033-A-SD), les
 * bornes réelles des 25 cases actuellement rendues (colonne + zone-numéro +
 * boîte de valeur + bande de ligne) — sans jamais importer `registry/2033-a`
 * ni `scope/2033-a-2026`.
 *
 * Principe, identique à `deriveCase370372Boxes`/`deriveCase330Boxes` : pour
 * chaque case, son numéro imprimé est localisé par `pdfjs-dist` (texte exact,
 * position réelle) ; la zone-numéro est l'intervalle des séparateurs
 * vectoriels qui le contient ; la boîte de valeur est l'intervalle suivant
 * à droite. La colonne (Brut / Amortissements-Provisions / NET) est ensuite
 * identifiée en comparant cette paire zone-numéro/boîte-de-valeur aux trois
 * familles dérivées indépendamment par `derive2033AColumnFamilies` (elles-
 * mêmes dérivées des en-têtes officiels, jamais du registre).
 */
export async function derive2033ACaseBoxes(officialAssetBytes: Uint8Array): Promise<ReadonlyMap<string, Case2033ABox>> {
  const PAGE_NUMBER = 1;
  const columnFamilies = await derive2033AColumnFamilies(officialAssetBytes);
  const hits = await findExactTextHits(officialAssetBytes, PAGE_NUMBER, CASE_IDS_2033A);
  const contentText = await officialPageContentText(officialAssetBytes, PAGE_NUMBER - 1);
  const segments = parseStrokedLineSegments(contentText);

  type RawCase = { caseId: string; numberZone: ColumnBox; valueBox: ColumnBox; column: Cerfa2033AColumnLabel; y: number };
  const raw: RawCase[] = [];

  for (const caseId of CASE_IDS_2033A) {
    const hit = hits.get(caseId)!;
    const yMin = hit.yBottomLeft - 1;
    const yMax = hit.yBottomLeft + hit.height + 1;
    const xs = verticalSeparatorsSpanningBand(segments, yMin, yMax);
    if (xs.length < 2) {
      throw new Error(
        `Oracle 2033-A : seulement ${xs.length} séparateur(s) vertical(aux) trouvé(s) dans la bande de la case "${caseId}" (attendu ≥2) — xs=${xs.join(",")}`,
      );
    }
    const numberZone = intervalContaining(xs, hit.x);
    if (!numberZone) {
      throw new Error(`Oracle 2033-A : impossible de localiser la zone-numéro de la case "${caseId}" — xs=${xs.join(",")}`);
    }
    const valueBox = nextIntervalRight(xs, numberZone);
    if (!valueBox) {
      throw new Error(`Oracle 2033-A : impossible de dériver la boîte de valeur à droite du numéro de la case "${caseId}".`);
    }

    // Comparaison sur la seule boîte de VALEUR (jamais la zone-numéro) : les
    // familles dérivées des en-têtes ne couvrent que la portion de la grille
    // effectivement sous-tendue par le texte de l'intitulé, qui ne remonte
    // pas toujours jusqu'à la zone-numéro (vérifié empiriquement pour "NET",
    // bloc PASSIF : famille=[480.7,568.1], alors que la zone-numéro réelle de
    // 120…180, mesurée ligne par ligne, commence dès 464.5) — la boîte de
    // valeur, elle, coïncide toujours exactement.
    const columnEntry = (Object.entries(columnFamilies) as [Cerfa2033AColumnLabel, ColumnBox][]).find(
      ([, family]) => valueBox.xMin >= family.xMin - 1 && valueBox.xMax <= family.xMax + 1,
    );
    if (!columnEntry) {
      throw new Error(
        `Oracle 2033-A : impossible d'identifier la colonne de la case "${caseId}" (boîte de valeur [${valueBox.xMin},${valueBox.xMax}]) parmi les familles d'en-tête officielles ${JSON.stringify(columnFamilies)}.`,
      );
    }

    raw.push({ caseId, numberZone, valueBox, column: columnEntry[0], y: hit.yBottomLeft });
  }

  const byColumn = new Map<Cerfa2033AColumnLabel, RawCase[]>();
  for (const r of raw) {
    if (!byColumn.has(r.column)) byColumn.set(r.column, []);
    byColumn.get(r.column)!.push(r);
  }

  const result = new Map<string, Case2033ABox>();
  for (const group of byColumn.values()) {
    group.sort((a, b) => b.y - a.y); // haut de page → bas de page (y natif décroissant)
    for (let i = 0; i < group.length; i += 1) {
      const current = group[i];
      const above = group[i - 1];
      const below = group[i + 1];
      // Pas de voisine (première/dernière ligne d'une colonne) : marge large
      // et arbitraire (200pt, très supérieure au pas de ligne réel ~15pt) —
      // seule une comparaison MI-DISTANCE avec une vraie voisine a une valeur
      // de preuve ; ce cas ne sert qu'à ne jamais laisser `rowBand` indéfini.
      const yMax = above ? (current.y + above.y) / 2 : current.y + 200;
      const yMin = below ? (current.y + below.y) / 2 : current.y - 200;
      result.set(current.caseId, {
        caseId: current.caseId,
        column: current.column,
        numberZone: current.numberZone,
        valueBox: current.valueBox,
        rowBand: { yMin, yMax },
      });
    }
  }
  return result;
}
