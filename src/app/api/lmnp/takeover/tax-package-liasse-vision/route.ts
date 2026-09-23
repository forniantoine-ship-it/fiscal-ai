import { NextResponse } from "next/server";

import type { TaxPackageLiasseFormType, TaxPackageLiasseVisionFormPayload } from "@/lib/lmnp/services/takeover/extract-tax-package-liasse-observations";

export const maxDuration = 120;

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_FORM_TYPES = new Set<TaxPackageLiasseFormType>(["2033A", "2033C"]);

type VisionCallInput = {
  formType: TaxPackageLiasseFormType;
  sourceCases: string[];
  pageNumber?: number;
  pageTextHint?: string;
  pageImage?: { mimeType: "image/png" | "image/jpeg" | "image/webp"; base64: string };
};

/**
 * Lot 5.5-A — import dynamique : tax-package-liasse-vision-server.ts porte
 * une garde `server-only` réelle (throw hors contexte react-server, y
 * compris sous Node/tsx). Un import statique en tête de fichier romprait la
 * testabilité du handler ; l'import dynamique préserve la garde en
 * production tout en restant injectable en test via
 * `taxPackageLiasseVisionRouteDeps` — même pattern que
 * depreciationRegisterVisionRouteDeps.
 */
export const taxPackageLiasseVisionRouteDeps = {
  requestVisionCases: async (input: VisionCallInput): Promise<TaxPackageLiasseVisionFormPayload> => {
    const mod = await import("@/lib/lmnp/services/takeover/tax-package-liasse-vision-server");
    const requester = mod.createTaxPackageLiasseVisionRequester();
    return requester(input);
  },
};

export async function POST(request: Request) {
  const formData = await request.formData();

  const formType = String(formData.get("formType") ?? "");
  const sourceCasesRaw = formData.get("sourceCases");
  const pageNumberRaw = formData.get("pageNumber");
  const pageTextHint = formData.get("pageTextHint");
  const image = formData.get("image");

  if (!ALLOWED_FORM_TYPES.has(formType as TaxPackageLiasseFormType)) {
    return NextResponse.json({ error: "formType invalide." }, { status: 400 });
  }

  let sourceCases: string[];
  try {
    const parsed = typeof sourceCasesRaw === "string" ? JSON.parse(sourceCasesRaw) : null;
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((c) => typeof c === "string")) {
      throw new Error("invalid");
    }
    sourceCases = parsed;
  } catch {
    return NextResponse.json({ error: "sourceCases invalide (JSON array de string attendu)." }, { status: 400 });
  }

  const pageNumber = pageNumberRaw === null ? undefined : Number(pageNumberRaw);
  if (pageNumber !== undefined && (!Number.isFinite(pageNumber) || pageNumber < 1)) {
    return NextResponse.json({ error: "pageNumber invalide." }, { status: 400 });
  }

  if (!(image instanceof Blob) || image.size === 0) {
    return NextResponse.json({ error: "Image de page manquante." }, { status: 400 });
  }
  const mimeType = ALLOWED_MIME_TYPES.has(image.type) ? image.type : "image/png";

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");

    const payload = await taxPackageLiasseVisionRouteDeps.requestVisionCases({
      formType: formType as TaxPackageLiasseFormType,
      sourceCases,
      pageNumber,
      pageTextHint: typeof pageTextHint === "string" ? pageTextHint : undefined,
      pageImage: { mimeType: mimeType as "image/png" | "image/jpeg" | "image/webp", base64 },
    });

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur vision liasse.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    console.error("[api/lmnp/takeover/tax-package-liasse-vision]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
