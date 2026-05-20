/**
 * Client-side PDF → PNG conversion for OpenAI Vision (browser only).
 */

const MAX_PDF_PAGES = 2;
const RENDER_SCALE = 1.5;

export interface VisionImagePayload {
  mimeType: string;
  base64: string;
}

export async function fileToVisionImages(file: File): Promise<VisionImagePayload[]> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return pdfFileToImages(file);
  }

  const dataUrl = await readFileAsDataUrl(file);
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Impossible de lire le fichier image.");

  const mimeType =
    file.type && file.type.startsWith("image/") ? file.type : guessImageMime(file.name);

  return [{ mimeType, base64 }];
}

async function pdfFileToImages(file: File): Promise<VisionImagePayload[]> {
  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const images: VisionImagePayload[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas non disponible pour la conversion PDF.");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    const base64 = dataUrl.split(",")[1];
    if (base64) {
      images.push({ mimeType: "image/jpeg", base64 });
    }
  }

  if (images.length === 0) {
    throw new Error("Aucune page lisible dans le PDF.");
  }

  return images;
}

function guessImageMime(fileName: string): string {
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  return "image/jpeg";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
