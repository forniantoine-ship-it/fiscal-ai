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

/**
 * Extracts embedded text from a PDF using pdf.js (browser).
 * Rows are reconstructed from text item coordinates (Y grouping, X sort).
 */
export async function extractNativePdfText(
  file: File,
): Promise<{ text: string; pageCount: number }> {
  if (!isPdfFile(file)) {
    return { text: "", pageCount: 0 };
  }

  const pdfjs = await measureCreditPipelineAwait("pdf_worker_import", import("pdfjs-dist"));

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
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

  const pageCount = Math.min(pdf.numPages, MAX_NATIVE_PDF_PAGES);
  const pageTexts: string[] = [];
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

    if (pageResult.text.trim()) {
      pageTexts.push(pageResult.text);
    }
  }

  const text = measureCreditPipelineSync(
    "pdf_native_text_join",
    () => pageTexts.join(PAGE_SEPARATOR).trim(),
    { pageCount },
  );

  console.log("[pdf-native-text]", {
    pageCount,
    totalPages: pdf.numPages,
    totalRowCount,
    textLength: text.length,
    newlineCount: (text.match(/\n/g) ?? []).length,
  });

  return { text, pageCount };
}

export { isPdfFile };
