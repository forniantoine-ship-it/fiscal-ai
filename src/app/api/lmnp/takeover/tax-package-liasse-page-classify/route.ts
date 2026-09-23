import { NextResponse } from "next/server";

import type { TaxPackageLiassePageClassification } from "@/lib/lmnp/services/takeover/classify-tax-package-liasse-page";

export const maxDuration = 60;

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type PageImageInput = {
  pageNumber: number;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
};

/**
 * Lot 5.5-A — import dynamique, même raison que
 * tax-package-liasse-vision/route.ts : tax-package-liasse-vision-server.ts
 * porte une garde `server-only` réelle.
 */
export const taxPackageLiassePageClassifyRouteDeps = {
  classifyPage: async (pageImage: PageImageInput): Promise<TaxPackageLiassePageClassification> => {
    const mod = await import("@/lib/lmnp/services/takeover/tax-package-liasse-vision-server");
    const classifier = mod.createTaxPackageLiassePageClassifier();
    return classifier({ pageImage });
  },
};

export async function POST(request: Request) {
  const formData = await request.formData();

  const pageNumberRaw = formData.get("pageNumber");
  const pageNumber = Number(pageNumberRaw);
  const image = formData.get("image");

  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "pageNumber invalide." }, { status: 400 });
  }
  if (!(image instanceof Blob) || image.size === 0) {
    return NextResponse.json({ error: "Image de page manquante." }, { status: 400 });
  }
  const mimeType = ALLOWED_MIME_TYPES.has(image.type) ? image.type : "image/png";

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");

    const classification = await taxPackageLiassePageClassifyRouteDeps.classifyPage({
      pageNumber,
      mimeType: mimeType as "image/png" | "image/jpeg" | "image/webp",
      base64,
    });

    return NextResponse.json(classification);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur classification page liasse.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    console.error("[api/lmnp/takeover/tax-package-liasse-page-classify]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
