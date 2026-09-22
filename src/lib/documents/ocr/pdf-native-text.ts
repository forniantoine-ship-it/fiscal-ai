import {
  incrementCreditPipelineCounter,
  measureCreditPipelineAwait,
  measureCreditPipelineSync,
} from "@/lib/lmnp/services/credit-pipeline-timing";

const MAX_NATIVE_PDF_PAGES = 24;
const ROW_Y_THRESHOLD_PX = 4;
const PAGE_SEPARATOR = "\n\n--- PAGE ---\n\n";

type PdfJsTextItem = {
  str?: string;
  transform?: number[];
};

type NormalizedPdfTextItem = {
  text: string;
  x: number;
  y: number;
};

export type NativePdfPageText = {
  /** 1-indexed, aligned with pdfjs page numbers. */
  pageNumber: number;
  text: string;
};

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isPdfJsTextItem(item: unknown): item is PdfJsTextItem {
  return typeof item === "object" && item !== null && "str" in item;
}

function normalizePdfTextItem(item: PdfJsTextItem): NormalizedPdfTextItem | null {
  const text = typeof item.str === "string" ? item.str.trim() : "";
  if (!text) return null;

  const transform = item.transform;
  if (!transform || transform.length < 6) return null;

  return {
    text,
    x: transform[4] ?? 0,
    y: transform[5] ?? 0,
  };
}

function groupRowsByY(
  items: NormalizedPdfTextItem[],
  thresholdPx = ROW_Y_THRESHOLD_PX,
): string[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const clusters: NormalizedPdfTextItem[][] = [];

  for (const item of sorted) {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster) {
      clusters.push([item]);
      continue;
    }

    const clusterY =
      lastCluster.reduce((sum, member) => sum + member.y, 0) / lastCluster.length;

    if (Math.abs(item.y - clusterY) <= thresholdPx) {
      lastCluster.push(item);
    } else {
      clusters.push([item]);
    }
  }

  return clusters
    .map((cluster) => {
      const rowText = [...cluster]
        .sort((a, b) => a.x - b.x)
        .map((member) => member.text)
        .join(" ");
      return rowText.trim();
    })
    .filter((row) => row.length > 0);
}

function buildSpatialPageText(items: unknown[]): { text: string; rowCount: number } {
  const normalized: NormalizedPdfTextItem[] = [];
  for (const item of items) {
    if (!isPdfJsTextItem(item)) continue;
    const textItem = normalizePdfTextItem(item);
    if (textItem) normalized.push(textItem);
  }

  const rows = groupRowsByY(normalized);
  return {
    text: rows.join("\n"),
    rowCount: rows.length,
  };
}

async function loadPdfDocument(file: File) {
  const isBrowser = typeof window !== "undefined";

  // Browser: standard build. Node/tests: legacy build (pas de DOMMatrix).
  const pdfjs = await measureCreditPipelineAwait(
    "pdf_worker_import",
    isBrowser
      ? import("pdfjs-dist")
      : import("pdfjs-dist/legacy/build/pdf.mjs"),
  );

  if (isBrowser) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  } else {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    );
  }

  const buffer = await measureCreditPipelineAwait("pdf_array_buffer_read", file.arrayBuffer(), {
    fileName: file.name,
    sizeBytes: file.size,
  });

  incrementCreditPipelineCounter("pdf_get_document");
  const pdf = await measureCreditPipelineAwait(
    "pdf_get_document",
    pdfjs.getDocument({ data: buffer }).promise,
    { fileName: file.name, totalPages: "pending" },
  );

  return pdf;
}

/**
 * Page-aware native PDF text — preserves 1-indexed pageNumber.
 * Reuses the same pdfjs / spatial reconstruction as extractNativePdfText.
 * Empty pages are kept (with empty text) so numbering stays aligned.
 */
export async function extractNativePdfPages(
  file: File,
): Promise<{ pages: NativePdfPageText[]; pageCount: number }> {
  if (!isPdfFile(file)) {
    return { pages: [], pageCount: 0 };
  }

  const pdf = await loadPdfDocument(file);
  const pageCount = Math.min(pdf.numPages, MAX_NATIVE_PDF_PAGES);
  const pages: NativePdfPageText[] = [];
  let totalRowCount = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
    const pageResult = await measureCreditPipelineAwait(
      "pdf_native_page_extract",
      (async () => {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        return buildSpatialPageText(content.items);
      })(),
      { pageNum, totalPages: pdf.numPages },
    );

    totalRowCount += pageResult.rowCount;

    console.log("[pdf-native-text]", {
      pageNumber: pageNum,
      rowCount: pageResult.rowCount,
      textLength: pageResult.text.length,
    });

    pages.push({
      pageNumber: pageNum,
      text: pageResult.text,
    });
  }

  console.log("[pdf-native-text]", {
    mode: "pages",
    pageCount,
    totalPages: pdf.numPages,
    totalRowCount,
    pagesWithText: pages.filter((p) => p.text.trim().length > 0).length,
  });

  return { pages, pageCount };
}

/**
 * Extracts embedded text from a PDF using pdf.js (browser).
 * Rows are reconstructed from text item coordinates (Y grouping, X sort).
 *
 * Contract preserved for existing callers:
 * - returns `{ text, pageCount }`
 * - joins non-empty pages with PAGE_SEPARATOR
 * - skips empty pages in the joined text (historical behaviour)
 */
export async function extractNativePdfText(
  file: File,
): Promise<{ text: string; pageCount: number }> {
  if (!isPdfFile(file)) {
    return { text: "", pageCount: 0 };
  }

  const { pages, pageCount } = await extractNativePdfPages(file);
  const pageTexts = pages.map((page) => page.text).filter((text) => text.trim().length > 0);

  const text = measureCreditPipelineSync(
    "pdf_native_text_join",
    () => pageTexts.join(PAGE_SEPARATOR).trim(),
    { pageCount },
  );

  const totalRowCount = pages.reduce(
    (sum, page) => sum + (page.text.trim() ? page.text.split("\n").length : 0),
    0,
  );

  console.log("[pdf-native-text]", {
    pageCount,
    totalRowCount,
    textLength: text.length,
    newlineCount: (text.match(/\n/g) ?? []).length,
  });

  return { text, pageCount };
}

export { isPdfFile, PAGE_SEPARATOR, MAX_NATIVE_PDF_PAGES };
