import type { RasterPageImage } from "./pdf-to-images";

function base64ToImage(base64: string, mimeType: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

function canvasToRasterPage(
  canvas: HTMLCanvasElement,
  pageNumber: number,
): RasterPageImage {
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Échec de conversion image prétraitée.");
  return { mimeType: "image/png", base64, pageNumber };
}

/**
 * Light preprocessing for low-contrast scans: grayscale + contrast stretch.
 */
export async function preprocessRasterImagesForOcr(
  images: RasterPageImage[],
): Promise<RasterPageImage[]> {
  if (typeof document === "undefined") return images;

  const processed: RasterPageImage[] = [];

  for (const image of images) {
    const img = await base64ToImage(image.base64, image.mimeType);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible pour le prétraitement OCR.");

    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let min = 255;
    let max = 0;
    for (let index = 0; index < data.length; index += 4) {
      const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
      min = Math.min(min, gray);
      max = Math.max(max, gray);
    }

    const range = Math.max(max - min, 1);
    for (let index = 0; index < data.length; index += 4) {
      const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
      const stretched = Math.round(((gray - min) / range) * 255);
      const threshold = stretched > 185 ? 255 : stretched < 70 ? 0 : stretched;
      data[index] = threshold;
      data[index + 1] = threshold;
      data[index + 2] = threshold;
    }

    ctx.putImageData(new ImageData(data, width, height), 0, 0);
    processed.push(canvasToRasterPage(canvas, image.pageNumber));
  }

  console.log("[ocr-strategy] image preprocessing complete", {
    pageCount: processed.length,
  });

  return processed;
}
