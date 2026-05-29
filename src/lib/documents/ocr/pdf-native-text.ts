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

  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_NATIVE_PDF_PAGES);
  const parts: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ");
    if (pageText.trim()) parts.push(pageText);
  }

  const text = parts.join("\n").trim();

  console.log("[ocr-pdf-text]", {
    pageCount,
    totalPages: pdf.numPages,
    textLength: text.length,
    newlineCount: (text.match(/\n/g) ?? []).length,
  });

  return { text, pageCount };
}

export { isPdfFile };
