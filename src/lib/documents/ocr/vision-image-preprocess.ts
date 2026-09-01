/**
 * Client-side Vision image enhancement for logement document rasterization.
 * TRACE: filter console with [vision-image-quality-debug]
 */

export type VisionImageEnhanceOptions = {
  grayscale?: boolean;
  contrastBoost?: number;
  sharpen?: boolean;
};

export type VisionImageQualityDebug = {
  pageNumber: number;
  width: number;
  height: number;
  dpiEstimate: number;
  renderScale: number;
  contrastApplied: number;
  sharpenApplied: boolean;
  grayscaleApplied: boolean;
  imageByteSize: number;
};

const DEFAULT_ENHANCE: Required<VisionImageEnhanceOptions> = {
  grayscale: true,
  contrastBoost: 1.35,
  sharpen: true,
};

/** PDF user space is 72pt/in — scale maps to approximate raster DPI. */
export function estimateRasterDpi(renderScale: number): number {
  return Math.round(72 * renderScale);
}

export function logVisionImageQualityDebug(payload: VisionImageQualityDebug): void {
  console.log("[vision-image-quality-debug]", {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function applyGrayscaleContrastSharpen(
  imageData: ImageData,
  options: Required<VisionImageEnhanceOptions>,
): void {
  const { data, width, height } = imageData;
  const contrast = options.contrastBoost;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;

    if (options.grayscale) {
      let lum = 0.299 * r + 0.587 * g + 0.114 * b;
      lum = contrast * (lum - 128) + 128;
      lum = clampByte(lum);
      data[i] = lum;
      data[i + 1] = lum;
      data[i + 2] = lum;
    } else {
      for (const channel of [i, i + 1, i + 2]) {
        let v = contrast * (data[channel]! - 128) + 128;
        data[channel] = clampByte(v);
      }
    }
  }

  if (!options.sharpen) return;

  const copy = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += copy[idx]! * kernel[ki]!;
            ki++;
          }
        }
        data[(y * width + x) * 4 + c] = clampByte(sum);
      }
    }
  }
}

/**
 * Enhance a rendered canvas for GPT Vision OCR (grayscale, contrast, light sharpen).
 */
export function enhanceCanvasForVisionOcr(
  canvas: HTMLCanvasElement,
  options?: VisionImageEnhanceOptions,
): Required<VisionImageEnhanceOptions> {
  const merged = { ...DEFAULT_ENHANCE, ...options };
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return merged;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyGrayscaleContrastSharpen(imageData, merged);
  ctx.putImageData(imageData, 0, 0);
  return merged;
}

export function canvasToPngBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Échec export PNG Vision.");
  return base64;
}

export function decodeBase64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function logCanvasVisionQuality(params: {
  canvas: HTMLCanvasElement;
  pageNumber: number;
  renderScale: number;
  base64: string;
  enhance: Required<VisionImageEnhanceOptions>;
}): void {
  logVisionImageQualityDebug({
    pageNumber: params.pageNumber,
    width: params.canvas.width,
    height: params.canvas.height,
    dpiEstimate: estimateRasterDpi(params.renderScale),
    renderScale: params.renderScale,
    contrastApplied: params.enhance.contrastBoost,
    sharpenApplied: params.enhance.sharpen,
    grayscaleApplied: params.enhance.grayscale,
    imageByteSize: decodeBase64ByteLength(params.base64),
  });
}
