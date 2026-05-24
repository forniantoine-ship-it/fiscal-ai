import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { DocumentCategory, LmnpDocument } from "@/lib/lmnp/types";
import { inferDocumentType } from "@/lib/lmnp/services/document-classifier";
import { buildAnalysisResult } from "@/lib/lmnp/ocr/map-to-extractions";
import { buildOcrSystemPrompt, buildOcrUserPrompt } from "@/lib/lmnp/ocr/prompts";
import { LMNP_OCR_JSON_SCHEMA, parseOcrDocumentResult } from "@/lib/lmnp/ocr/schema";

export const maxDuration = 60;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurée.");
  }
  return new OpenAI({ apiKey });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileName = String(formData.get("fileName") ?? "document");
    const userCategory = String(formData.get("userCategory") ?? "autre") as DocumentCategory;
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "");
    const documentId = String(formData.get("documentId") ?? "");
    const fiscalYearRaw = formData.get("fiscalYear");
    const fiscalYear = fiscalYearRaw ? Number(fiscalYearRaw) : undefined;

    const imageParts: { type: "image_url"; image_url: { url: string; detail: "high" } }[] = [];

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("image_") || !(value instanceof Blob)) continue;
      const buffer = Buffer.from(await value.arrayBuffer());
      const mimeType = value.type || "image/jpeg";
      const base64 = buffer.toString("base64");
      imageParts.push({
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${base64}`,
          detail: "high",
        },
      });
    }

    if (imageParts.length === 0) {
      return NextResponse.json({ error: "Aucune image fournie." }, { status: 400 });
    }

    const suggested = inferDocumentType(fileName, userCategory);

    const openai = getOpenAI();
    const model = process.env.OPENAI_OCR_MODEL ?? "gpt-4o-mini";

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: buildOcrSystemPrompt() },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildOcrUserPrompt({
                fileName,
                userCategory,
                pageCount: imageParts.length,
                suggestedType: suggested.documentType,
                fiscalYear,
              }),
            },
            ...imageParts,
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: LMNP_OCR_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Réponse vide du modèle." }, { status: 502 });
    }

    const parsed = parseOcrDocumentResult(JSON.parse(content));
    if (!parsed) {
      return NextResponse.json({ error: "JSON OCR invalide." }, { status: 502 });
    }

    const stubDoc: LmnpDocument = {
      id: documentId || crypto.randomUUID(),
      fiscalYearId: fiscalYearId || crypto.randomUUID(),
      fileName,
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      category: userCategory,
      documentType: parsed.documentType,
      status: "processing",
      uploadedAt: new Date().toISOString(),
    };

    const result = buildAnalysisResult({
      doc: stubDoc,
      ocr: parsed,
      userCategory,
      suggestedType: suggested.documentType,
      fiscalYear,
    });

    return NextResponse.json({
      result: { ...result, ocr: parsed },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur OCR.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    console.error("[lmnp/ocr]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
