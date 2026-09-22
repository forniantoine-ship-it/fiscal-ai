import { NextResponse } from "next/server";

import {
  generateCerfa2031FromRfs,
  generateCerfa2031BisFromRfs,
  generateCerfa2033AFromRfs,
  generateCerfa2033BFromRfs,
  generateCerfa2033CFromRfs,
  generateCerfa2033DFromRfs,
  ALL_CERFA_FORM_IDS,
  type GateViolation,
} from "@/lib/lmnp/services/liasse-pdf";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import { assembleLiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import { isDispense2033AEnEffet } from "@/runtime/capabilities/rfs/dispense-2033a";
import { resolveFinalDeclarabilityState } from "@/lib/lmnp/services/declaration/final-declarability";
import {
  defaultResolveDeliveryAccess,
  type DeliveryAccessResolver,
} from "@/lib/lmnp/services/payment/delivery-access";

/**
 * P1-1/P1-6C — pont serveur minimal entre le parcours client (RFS déjà
 * calculée par runDeclarationGeneration(), jamais recalculée ici) et le
 * moteur CERFA Node-only (`src/lib/lmnp/services/liasse-pdf/`, inchangé).
 * Cette route n'appelle QUE les fonctions publiques `generateCerfa*FromRfs()`
 * des 6 formulaires — aucun accès à produceFiscalResult(), produceLiasse(),
 * ni aux mappers RFS bruts (jamais appelés directement ici).
 *
 * P1-6C — étend le contrat de 2 à 6 formulaires (liasse LMNP réel simplifié
 * complète : 2031-SD, 2031-bis-SD, 2033-A/B/C/D-SD). L'ordre de fusion du
 * PDF final est TOUJOURS l'ordre canonique `ALL_CERFA_FORM_IDS` (source
 * unique déjà utilisée par `generateCerfaLiassePdf()`/`sortByCanonicalOrder()`,
 * jamais une seconde liste d'ordre) — jamais l'ordre d'entrée de `forms`,
 * qui reste un tableau de sélection, pas un ordre d'assemblage.
 */

const SUPPORTED_FORMS = [
  "2031-SD",
  "2031-bis-SD",
  "2033-A-SD",
  "2033-B-SD",
  "2033-C-SD",
  "2033-D-SD",
] as const;
type SupportedForm = (typeof SUPPORTED_FORMS)[number];

function isSupportedForm(value: unknown): value is SupportedForm {
  return typeof value === "string" && (SUPPORTED_FORMS as readonly string[]).includes(value);
}

type RequestBody = {
  rfs?: unknown;
  declarationVersionId?: unknown;
  forms?: unknown;
  /** Payment V1 — contexte d'accès à la livraison payée (jamais l'autorité fiscale : la RFS reste celle du client). */
  authToken?: unknown;
  dossierId?: unknown;
  fiscalYear?: unknown;
};

type WrapperResult =
  | { status: "generated"; pdfBytes: Uint8Array }
  | { status: "blocked"; violations: GateViolation[] };

type WrapperInput = { rfs: FiscalRepresentation; declarationVersionId: string };

/**
 * Table de dispatch formulaire → wrapper public — jamais un appel direct à
 * un mapper RFS, jamais une règle de scope dupliquée ici (chaque wrapper
 * reste l'unique source de vérité pour son propre mapper/filtre).
 */
const GENERATE_BY_FORM: Record<SupportedForm, (input: WrapperInput) => Promise<WrapperResult>> = {
  "2031-SD": generateCerfa2031FromRfs,
  "2031-bis-SD": generateCerfa2031BisFromRfs,
  "2033-A-SD": generateCerfa2033AFromRfs,
  "2033-B-SD": generateCerfa2033BFromRfs,
  "2033-C-SD": generateCerfa2033CFromRfs,
  "2033-D-SD": generateCerfa2033DFromRfs,
};

type FormResult = { form: SupportedForm; result: WrapperResult };

export async function handleCerfaPdfRequest(
  request: Request,
  resolveAccess: DeliveryAccessResolver = defaultResolveDeliveryAccess,
) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  // Payment V1 — AUTH → PROPRIÉTÉ → ENTITLEMENT PAYÉ (dossier + exercice), AVANT
  // toute validation ou génération. La frontière de déclarabilité ci-dessous
  // reste intacte et s'applique ENSUITE : le paiement la complète, ne la remplace pas.
  const access = await resolveAccess({
    authToken: body.authToken,
    dossierId: body.dossierId,
    fiscalYear: body.fiscalYear,
    fiscalYearOpening: (body as { fiscalYearOpening?: unknown }).fiscalYearOpening,
  });
  if (!access.ok) return access.response;

  const rfs = body.rfs;
  const declarationVersionId = typeof body.declarationVersionId === "string" ? body.declarationVersionId.trim() : "";
  const forms = body.forms;

  if (!rfs || typeof rfs !== "object") {
    return NextResponse.json({ error: "rfs requis (FiscalRepresentation)." }, { status: 400 });
  }
  // Un exercice payé ne débloque jamais un autre exercice : la RFS livrée doit
  // porter l'exercice de l'entitlement vérifié.
  if (access.fiscalYear !== undefined && (rfs as { exercice?: unknown }).exercice !== access.fiscalYear) {
    return NextResponse.json(
      { error: "La déclaration ne correspond pas à l'exercice payé.", code: "fiscal_year_mismatch" },
      { status: 403 },
    );
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

  // Dispense 2033-A (CGI, art. 302 septies A bis, VI) — même frontière que
  // `resolveFinalDeclarabilityState()` juste en dessous : cette route reste
  // joignable indépendamment de l'UI, donc son propre garde-fou. Un appel
  // direct ne peut pas obtenir le 2033-A quand le dossier a lui-même
  // enregistré `USE_DISPENSE` (`isDispense2033AEnEffet`, seule source de
  // vérité, jamais reproduite ici — voir `dispense-2033a.ts`). UNKNOWN et
  // NOT_ELIGIBLE ne satisfont jamais cette condition : dans ces deux cas, le
  // comportement reste inchangé (2033-A généré normalement s'il est demandé).
  if (requestedForms.includes("2033-A-SD") && isDispense2033AEnEffet(typedRfs.dispense2033A)) {
    return NextResponse.json({ status: "blocked", reason: "2033a_dispensed" }, { status: 422 });
  }

  try {
    // NEXT-5 (server hardening) — même frontière de déclarabilité que
    // DeclarationReadyView/ArchivedDeclarationView (final-declarability.ts,
    // seule source de vérité, jamais reproduite ici) : cette route reste
    // aujourd'hui joignable indépendamment de l'UI (RFS transmise telle
    // quelle par le client, jamais recalculée), donc son propre bypass de
    // l'UI. Bloque AVANT toute génération PDF, jamais après — aucun octet
    // n'est produit pour une projection dont on sait déjà qu'elle est
    // fiscalement incomplète pour ce dossier.
    if (!resolveFinalDeclarabilityState(assembleLiasseFromRfs(typedRfs)).deliverable) {
      return NextResponse.json({ status: "blocked", reason: "internal_projection_issue" }, { status: 422 });
    }

    const results: FormResult[] = [];
    for (const form of requestedForms) {
      results.push({ form, result: await GENERATE_BY_FORM[form]({ rfs: typedRfs, declarationVersionId }) });
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

    // Tri par ordre canonique AVANT fusion — jamais l'ordre d'entrée de
    // `forms`, qui n'est qu'une sélection. `ALL_CERFA_FORM_IDS` est la même
    // constante que celle utilisée en interne par `generateCerfaLiassePdf()`
    // (`sortByCanonicalOrder()`), jamais recréée ici.
    const generated = (results as Array<{ form: SupportedForm; result: { status: "generated"; pdfBytes: Uint8Array } }>).sort(
      (a, b) => ALL_CERFA_FORM_IDS.indexOf(a.form) - ALL_CERFA_FORM_IDS.indexOf(b.form),
    );

    if (generated.length === 1) {
      const bytes = generated[0].result.pdfBytes;
      return new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }

    // Plusieurs formulaires demandés dans la même requête — aucune fonction
    // publique n'assemble aujourd'hui les sorties de plusieurs
    // generateCerfa*FromRfs() (chacune produit son propre PDFDocument
    // complet, cf. render-cerfa-liasse.ts). Fusion générique pdf-lib
    // (copyPages/addPage) — exactement les mêmes primitives déjà utilisées
    // par le moteur CERFA pour assembler les pages d'un même formulaire —
    // aucune logique CERFA ni fiscale ajoutée ici, aucun recalcul. `generated`
    // est déjà trié par ordre canonique ci-dessus : la fusion respecte donc
    // cet ordre, quel que soit l'ordre d'entrée de `forms`.
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
