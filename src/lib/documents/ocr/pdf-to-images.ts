/**
 * Client-side PDF → PNG rasterization for vision OCR (browser only).
 */

import {
  canvasToPngBase64,
  enhanceCanvasForVisionOcr,
  logCanvasVisionQuality,
} from "@/lib/documents/ocr/vision-image-preprocess";
import {
  incrementCreditPipelineCounter,
  measureCreditPipelineAwait,
} from "@/lib/lmnp/services/credit-pipeline-timing";

/** Default scale for cheap vision OCR (~144 DPI from 72pt PDF base). */
export const OCR_RENDER_SCALE = 2;

/** High-quality render for logement Vision fallback (~360 DPI from 72pt PDF base). */
export const VISION_FALLBACK_RENDER_SCALE = 5;

const MAX_PDF_PAGES = 12;

export type RasterizePdfOptions = {
  scale?: number;
  maxPages?: number;
  /** Apply grayscale/contrast/sharpen for Vision OCR (logement fallback). */
  visionEnhance?: boolean;
};

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

async function rasterizeImageFileForVision(
  dataUrl: string,
  renderScale: number,
): Promise<RasterPageImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const upscale = Math.max(1, renderScale / OCR_RENDER_SCALE);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * upscale);
  canvas.height = Math.round(img.naturalHeight * upscale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponible pour l'image Vision.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const enhance = enhanceCanvasForVisionOcr(canvas);
  const base64 = canvasToPngBase64(canvas);
  logCanvasVisionQuality({
    canvas,
    pageNumber: 1,
    renderScale,
    base64,
    enhance,
  });

  return { mimeType: "image/png", base64, pageNumber: 1 };
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

async function rasterizePdfPages(
  file: File,
  options?: RasterizePdfOptions,
): Promise<RasterPageImage[]> {
  const scale = options?.scale ?? OCR_RENDER_SCALE;
  const maxPages = options?.maxPages ?? MAX_PDF_PAGES;
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

  const pageCount = Math.min(pdf.numPages, maxPages);
  const images: RasterPageImage[] = [];

  console.log("[ocr-rasterization] start", {
    totalPages: pdf.numPages,
    pagesToRender: pageCount,
    scale,
    purpose: scale >= VISION_FALLBACK_RENDER_SCALE ? "vision_fallback" : "ocr",
  });

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    await measureCreditPipelineAwait(
      `pdf_page_rasterize`,
      (async () => {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas non disponible pour la conversion PDF.");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport, canvas }).promise;

        const enhance =
          options?.visionEnhance === true
            ? enhanceCanvasForVisionOcr(canvas)
            : null;
        const base64 = canvasToPngBase64(canvas);
        if (options?.visionEnhance === true && enhance) {
          logCanvasVisionQuality({
            canvas,
            pageNumber: pageNum,
            renderScale: scale,
            base64,
            enhance,
          });
        }
        images.push({ mimeType: "image/png", base64, pageNumber: pageNum });
      })(),
      { pageNum, totalPages: pdf.numPages, scale },
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
export async function fileToRasterImages(
  file: File,
  options?: RasterizePdfOptions,
): Promise<RasterPageImage[]> {
  if (isPdfFile(file)) {
    return rasterizePdfPages(file, options);
  }

  if (isImageFile(file)) {
    const scale = options?.scale ?? OCR_RENDER_SCALE;
    const dataUrl = await readFileAsDataUrl(file);

    if (options?.visionEnhance === true && typeof document !== "undefined") {
      const raster = await rasterizeImageFileForVision(dataUrl, scale);
      return [raster];
    }

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
