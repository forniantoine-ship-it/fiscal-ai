import { NextResponse } from "next/server";

import {
  generateCerfa2033AFromRfs,
  generateCerfa2033BFromRfs,
  type Cerfa2033AGenerationResult,
  type Cerfa2033BGenerationResult,
} from "@/lib/lmnp/services/liasse-pdf";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

/**
 * P1-1 — pont serveur minimal entre le parcours client (RFS déjà calculée
 * par runDeclarationGeneration(), jamais recalculée ici) et le moteur CERFA
 * Node-only (`src/lib/lmnp/services/liasse-pdf/`, inchangé). Cette route
 * n'appelle QUE les fonctions publiques `generateCerfa2033AFromRfs()` /
 * `generateCerfa2033BFromRfs()` — aucun accès à produceFiscalResult(),
 * produceLiasse(), ni aux mappers RFS bruts.
 */

const SUPPORTED_FORMS = ["2033-A-SD", "2033-B-SD"] as const;
type SupportedForm = (typeof SUPPORTED_FORMS)[number];

function isSupportedForm(value: unknown): value is SupportedForm {
  return typeof value === "string" && (SUPPORTED_FORMS as readonly string[]).includes(value);
}

type RequestBody = {
  rfs?: unknown;
  declarationVersionId?: unknown;
  forms?: unknown;
};

type FormResult =
  | { form: "2033-A-SD"; result: Cerfa2033AGenerationResult }
  | { form: "2033-B-SD"; result: Cerfa2033BGenerationResult };

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  const rfs = body.rfs;
  const declarationVersionId = typeof body.declarationVersionId === "string" ? body.declarationVersionId.trim() : "";
  const forms = body.forms;

  if (!rfs || typeof rfs !== "object") {
    return NextResponse.json({ error: "rfs requis (FiscalRepresentation)." }, { status: 400 });
  }
  if (!declarationVersionId) {
    return NextResponse.json({ error: "declarationVersionId requis." }, { status: 400 });
  }
  if (!Array.isArray(forms) || forms.length === 0 || !forms.every(isSupportedForm)) {
    return NextResponse.json(
      { error: `forms doit être un tableau non vide, valeurs autorisées : ${SUPPORTED_FORMS.join(", ")}.` },
      { status: 400 },
    );
  }

  const typedRfs = rfs as FiscalRepresentation;
  const requestedForms = forms as SupportedForm[];

  try {
    const results: FormResult[] = [];
    for (const form of requestedForms) {
      if (form === "2033-A-SD") {
        results.push({ form, result: await generateCerfa2033AFromRfs({ rfs: typedRfs, declarationVersionId }) });
      } else {
        results.push({ form, result: await generateCerfa2033BFromRfs({ rfs: typedRfs, declarationVersionId }) });
      }
    }

    const blocked = results.filter((r) => r.result.status === "blocked");
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          status: "blocked",
          violations: blocked.flatMap((b) => (b.result.status === "blocked" ? b.result.violations : [])),
        },
        { status: 422 },
      );
    }

    const generated = results as Array<
      { form: "2033-A-SD"; result: Extract<Cerfa2033AGenerationResult, { status: "generated" }> }
      | { form: "2033-B-SD"; result: Extract<Cerfa2033BGenerationResult, { status: "generated" }> }
    >;

    if (generated.length === 1) {
      const bytes = generated[0].result.pdfBytes;
      return new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }

    // Plusieurs formulaires demandés dans la même requête — aucune fonction
    // publique n'assemble aujourd'hui les sorties de generateCerfa2033AFromRfs()
    // et generateCerfa2033BFromRfs() (chacune produit son propre PDFDocument
    // complet, cf. render-cerfa-liasse.ts). Fusion générique pdf-lib
    // (copyPages/addPage) — exactement les mêmes primitives déjà utilisées
    // par le moteur CERFA pour assembler les pages d'un même formulaire —
    // aucune logique CERFA ni fiscale ajoutée ici, aucun recalcul.
    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.create();
    for (const { result } of generated) {
      const doc = await PDFDocument.load(result.pdfBytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }
    const mergedBytes = await merged.save();

    return new NextResponse(new Uint8Array(mergedBytes), {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });
  } catch (err) {
    console.error("[api/lmnp/declaration/cerfa-pdf]", err);
    return NextResponse.json({ error: "Erreur serveur lors de la génération du PDF." }, { status: 500 });
  }
}
