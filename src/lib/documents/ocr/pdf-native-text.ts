import {
  incrementCreditPipelineCounter,
  measureCreditPipelineAwait,
  measureCreditPipelineSync,
} from "@/lib/lmnp/services/credit-pipeline-timing";

const MAX_NATIVE_PDF_PAGES = 24;

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * Extracts embedded text from a PDF using pdf.js (browser).
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
  const parts: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const pageText = await measureCreditPipelineAwait(
      `pdf_native_page_extract`,
      (async () => {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        return content.items
          .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
          .join(" ");
      })(),
      { pageNum, totalPages: pdf.numPages },
    );
    if (pageText.trim()) parts.push(pageText);
  }

  const text = measureCreditPipelineSync("pdf_native_text_join", () => parts.join("\n").trim(), {
    pageCount,
  });

  console.log("[ocr-pdf-text]", {
    pageCount,
    totalPages: pdf.numPages,
    textLength: text.length,
    newlineCount: (text.match(/\n/g) ?? []).length,
  });

  return { text, pageCount };
}

export { isPdfFile };
