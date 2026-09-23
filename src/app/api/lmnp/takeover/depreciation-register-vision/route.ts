import { NextResponse } from "next/server";

import type { ExtractDepreciationRegisterVisionRowsInput } from "@/lib/lmnp/services/takeover/depreciation-register-vision-server";
import type { DepreciationRegisterPdfRow } from "@/lib/lmnp/services/takeover/depreciation-register-pdf-row";

export const maxDuration = 120;

/** Alignée sur la route vision-text existante — pas de limite ad hoc supplémentaire. */
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Import dynamique — depreciation-register-vision-server.ts porte une garde
 * `server-only` réelle (throw hors contexte react-server, y compris sous
 * Node/tsx). Un import statique en tête de fichier romprait la testabilité
 * du handler ; l'import dynamique préserve la garde en production (la route
 * ne s'exécute jamais ailleurs que côté serveur) tout en restant injectable
 * en test via `depreciationRegisterVisionRouteDeps` — même pattern que
 * inpiCompanionChatRouteDeps (src/app/api/lmnp/inpi-companion/chat/route.ts).
 */
export const depreciationRegisterVisionRouteDeps = {
  extractDepreciationRegisterVisionRows: async (
    input: ExtractDepreciationRegisterVisionRowsInput,
  ): Promise<DepreciationRegisterPdfRow[]> => {
    const mod = await import("@/lib/lmnp/services/takeover/depreciation-register-vision-server");
    return mod.extractDepreciationRegisterVisionRows(input);
  },
};

export async function POST(request: Request) {
  const formData = await request.formData();

  const documentId = String(formData.get("documentId") ?? "");
  const pageNumberRaw = formData.get("pageNumber");
  const pageNumber = Number(pageNumberRaw);
  const pageTextHint = formData.get("pageTextHint");
  const image = formData.get("image");

  if (!documentId || !Number.isFinite(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "documentId/pageNumber invalides." }, { status: 400 });
  }
  if (!(image instanceof Blob) || image.size === 0) {
    return NextResponse.json({ error: "Image de page manquante." }, { status: 400 });
  }
  const mimeType = ALLOWED_MIME_TYPES.has(image.type) ? image.type : "image/png";

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");

    const rows: DepreciationRegisterPdfRow[] = await depreciationRegisterVisionRouteDeps.extractDepreciationRegisterVisionRows({
      documentId,
      pageNumber,
      pageImage: { mimeType: mimeType as "image/png" | "image/jpeg" | "image/webp", base64 },
      pageTextHint: typeof pageTextHint === "string" ? pageTextHint : undefined,
    });

    return NextResponse.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur vision registre d'amortissements.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    console.error("[api/lmnp/takeover/depreciation-register-vision]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
