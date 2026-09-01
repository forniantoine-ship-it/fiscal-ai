import OpenAI from "openai";

import {
  VISION_OCR_RETRY_SYSTEM_PROMPT,
  VISION_OCR_SYSTEM_PROMPT,
  type VisionOcrPromptVariant,
} from "@/lib/documents/ocr/vision-ocr";
import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";

const DEFAULT_VISION_MODEL = "gpt-4o-mini";

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurée.");
  }
  return new OpenAI({ apiKey });
}

function getVisionModel(): string {
  return (
    process.env.OPENAI_VISION_OCR_MODEL ??
    process.env.OPENAI_OCR_MODEL ??
    DEFAULT_VISION_MODEL
  );
}

export async function extractVisionOcrTextFromImages(
  images: RasterPageImage[],
  fileName?: string,
  promptVariant: VisionOcrPromptVariant = "default",
): Promise<string> {
  if (images.length === 0) {
    throw new Error("Aucune image fournie pour l'OCR vision.");
  }

  const systemPrompt =
    promptVariant === "retry_after_refusal" ? VISION_OCR_RETRY_SYSTEM_PROMPT : VISION_OCR_SYSTEM_PROMPT;

  const imageParts: { type: "image_url"; image_url: { url: string; detail: "high" } }[] =
    images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high" as const,
      },
    }));

  const openai = getOpenAI();
  const model = getVisionModel();

  console.log("[ocr-vision] request", {
    model,
    pageCount: images.length,
    fileName: fileName ?? null,
    promptVariant,
  });

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              images.length > 1
                ? `Document: ${fileName ?? "document"}. ${images.length} pages. Extract all text from every page, in order, separated by blank lines.`
                : `Document: ${fileName ?? "document"}. Extract all visible text.`,
          },
          ...imageParts,
        ],
      },
    ],
  });

  const rawText = completion.choices[0]?.message?.content?.trim() ?? "";

  console.log("[ocr-vision] response", {
    textLength: rawText.length,
    newlineCount: (rawText.match(/\n/g) ?? []).length,
  });

  return rawText;
}
