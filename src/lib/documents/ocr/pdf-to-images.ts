/**
 * Client-side PDF → PNG rasterization for vision OCR (browser only).
 */

import {
  incrementCreditPipelineCounter,
  measureCreditPipelineAwait,
} from "@/lib/lmnp/services/credit-pipeline-timing";

const MIN_RENDER_SCALE = 2;
const MAX_PDF_PAGES = 12;

export type RasterPageImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
  pageNumber: number;
};

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

function guessImageMime(fileName: string): string {
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  if (/\.gif$/i.test(fileName)) return "image/gif";
  return "image/jpeg";
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function configurePdfWorker(): Promise<typeof import("pdfjs-dist")> {
  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  return pdfjs;
}

async function rasterizePdfPages(file: File): Promise<RasterPageImage[]> {
  const pdfjs = await measureCreditPipelineAwait("pdf_worker_configure", configurePdfWorker());
  const buffer = await measureCreditPipelineAwait("pdf_array_buffer_read", file.arrayBuffer(), {
    fileName: file.name,
    sizeBytes: file.size,
  });

  incrementCreditPipelineCounter("pdf_get_document");
  const pdf = await measureCreditPipelineAwait(
    "pdf_get_document",
    pdfjs.getDocument({ data: buffer }).promise,
    { fileName: file.name },
  );

  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const images: RasterPageImage[] = [];

  console.log("[ocr-rasterization] start", {
    totalPages: pdf.numPages,
    pagesToRender: pageCount,
    scale: MIN_RENDER_SCALE,
  });

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    await measureCreditPipelineAwait(
      `pdf_page_rasterize`,
      (async () => {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: MIN_RENDER_SCALE });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas non disponible pour la conversion PDF.");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport, canvas }).promise;

        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.split(",")[1];
        if (base64) {
          images.push({ mimeType: "image/png", base64, pageNumber: pageNum });
        }
      })(),
      { pageNum, totalPages: pdf.numPages, scale: MIN_RENDER_SCALE },
    );
  }

  if (images.length === 0) {
    throw new Error("Aucune page lisible dans le PDF.");
  }

  console.log("[ocr-rasterization] complete", {
    pageCount: images.length,
    format: "image/png",
  });

  return images;
}

/**
 * Converts a PDF or image file into PNG page images for vision OCR.
 */
export async function fileToRasterImages(file: File): Promise<RasterPageImage[]> {
  if (isPdfFile(file)) {
    return rasterizePdfPages(file);
  }

  if (isImageFile(file)) {
    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.split(",")[1];
    if (!base64) throw new Error("Impossible de lire le fichier image.");
    const mime: RasterPageImage["mimeType"] =
      file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp"
        ? file.type
        : guessImageMime(file.name) === "image/webp"
          ? "image/webp"
          : guessImageMime(file.name) === "image/png"
            ? "image/png"
            : "image/jpeg";
    return [{ mimeType: mime, base64, pageNumber: 1 }];
  }

  throw new Error("Format de fichier non pris en charge pour l'OCR vision.");
}
