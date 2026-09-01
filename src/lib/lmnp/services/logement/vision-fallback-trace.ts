import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";

/**
 * Mandatory checkpoints for the logement Vision fallback extraction path.
 * TRACE ONLY — filter console with: [vision-fallback-debug]
 */

export type VisionFallbackCheckpoint =
  | "vision_fallback_activated"
  | "rendered_pages"
  | "multimodal_request"
  | "multimodal_raw_response"
  | "canonical_processing_after_vision"
  | "hydration_after_vision"
  | "final_prefill_after_vision";

export type RenderedPageTrace = {
  pageIndex: number;
  pageNumber: number;
  renderedSuccessfully: boolean;
  width: number | null;
  height: number | null;
  imageByteSize: number;
  blankPageDetected: boolean;
  mimeType: string;
};

export type VisionHydrationFieldTrace = {
  canonicalField: string;
  targetUiField: string;
  mappedValue?: string;
  skippedReason?: string;
  applied: boolean;
};

export function logVisionFallbackCheckpoint(
  checkpoint: VisionFallbackCheckpoint,
  payload: Record<string, unknown>,
): void {
  const serialized = serializeVisionCheckpointPayload(payload);
  console.log("[vision-fallback-debug]", {
    checkpoint,
    timestamp: new Date().toISOString(),
    ...serialized,
  });
}

/** @deprecated Use logVisionFallbackCheckpoint — kept for backward-compatible call sites. */
export function logVisionFallbackDebug(payload: Record<string, unknown>): void {
  const checkpoint =
    typeof payload.stage === "string"
      ? mapLegacyStageToCheckpoint(payload.stage)
      : "vision_fallback_activated";
  logVisionFallbackCheckpoint(checkpoint, payload);
}

function mapLegacyStageToCheckpoint(stage: string): VisionFallbackCheckpoint {
  switch (stage) {
    case "vision_fallback_render_complete":
      return "rendered_pages";
    case "vision_extraction_start":
    case "vision_fallback_pipeline_start":
    case "vision_fallback_render_start":
      return "vision_fallback_activated";
    case "vision_fallback_exhausted":
      return "final_prefill_after_vision";
    default:
      return "vision_fallback_activated";
  }
}

function serializeVisionCheckpointPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (
        key === "rawGptResponse" ||
        key === "rawGptJson" ||
        key === "rawVisionResponse" ||
        key === "canonicalFieldsBeforeNormalization" ||
        key === "normalizedCanonicalFields" ||
        key === "fullPayload"
      ) {
        return [key, serializeVisionDebugJson(value)];
      }
      return [key, value];
    }),
  );
}

export function serializeVisionDebugJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(value);
  }
}

function decodeBase64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function decodeBase64Prefix(base64: string, maxChars: number): Uint8Array {
  const slice = base64.slice(0, Math.min(base64.length, maxChars));
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(slice, "base64"));
  }
  const binary = atob(slice);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function pngDimensionsFromBase64(
  base64: string,
): { width: number; height: number } | null {
  try {
    const bytes = decodeBase64Prefix(base64, 96);
    if (bytes.length < 24) return null;
    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    if (!isPng) return null;
    const width =
      (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!;
    const height =
      (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!;
    return { width, height };
  } catch {
    return null;
  }
}

function detectBlankPage(params: {
  imageByteSize: number;
  width: number | null;
  height: number | null;
}): boolean {
  if (params.imageByteSize < 8_000) return true;
  if (params.width != null && params.height != null && params.width * params.height < 12_000) {
    return true;
  }
  return false;
}

export function traceRenderedPages(images: RasterPageImage[]): RenderedPageTrace[] {
  return images.map((image, pageIndex) => {
    const imageByteSize = decodeBase64ByteLength(image.base64);
    const dimensions = pngDimensionsFromBase64(image.base64);
    const renderedSuccessfully = imageByteSize > 0 && Boolean(image.base64);
    const blankPageDetected = detectBlankPage({
      imageByteSize,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    });

    return {
      pageIndex,
      pageNumber: image.pageNumber,
      renderedSuccessfully,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      imageByteSize,
      blankPageDetected,
      mimeType: image.mimeType,
    };
  });
}

export function logRenderedPagesCheckpoint(
  images: RasterPageImage[],
  context: Record<string, unknown>,
): void {
  const pages = traceRenderedPages(images);
  logVisionFallbackCheckpoint("rendered_pages", {
    ...context,
    renderedPagesCount: pages.length,
    pages,
    anyBlankPage: pages.some((page) => page.blankPageDetected),
    allPagesRenderedSuccessfully: pages.every((page) => page.renderedSuccessfully),
  });
}
