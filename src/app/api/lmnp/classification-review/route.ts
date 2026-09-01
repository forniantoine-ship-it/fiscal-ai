import { NextResponse } from "next/server";

import {
  applyClassificationReview,
  classificationFromRow,
  type ClassificationReviewAction,
} from "@/lib/ai/apply-classification-review";
import { getServerSupabase } from "@/lib/supabase-server";

const VALID_ACTIONS = new Set<ClassificationReviewAction>(["confirm-ai", "keep-user-category"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      extractionRowId?: string;
      action?: string;
      authToken?: string;
    };

    const extractionRowId = body.extractionRowId?.trim();
    const action = body.action as ClassificationReviewAction;

    if (!extractionRowId) {
      return NextResponse.json({ error: "extractionRowId requis." }, { status: 400 });
    }

    if (!action || !VALID_ACTIONS.has(action)) {
      return NextResponse.json({ error: "action invalide." }, { status: 400 });
    }

    const supabase = getServerSupabase(body.authToken);

    const { data: row, error: fetchError } = await supabase
      .from("extracted_document_data")
      .select(
        "id, document_type, detected_category, user_category, final_category, confidence_score, needs_review, classification_reason",
      )
      .eq("id", extractionRowId)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: "Classification introuvable." }, { status: 404 });
    }

    const current = classificationFromRow({
      document_type: row.document_type,
      detected_category: row.detected_category,
      user_category: row.user_category,
      final_category: row.final_category,
      confidence_score: row.confidence_score,
      needs_review: row.needs_review,
      classification_reason: row.classification_reason,
    });

    if (!current.needsReview) {
      return NextResponse.json({ classification: current });
    }

    const resolved = applyClassificationReview(current, action);

    if (action === "confirm-ai") {
      console.log("[classification-review] confirm-ai", {
        extractionRowId,
        finalCategory: resolved.finalCategory,
      });
    } else {
      console.log("[classification-review] keep-user-category", {
        extractionRowId,
        finalCategory: resolved.finalCategory,
      });
    }

    const { error: updateError } = await supabase
      .from("extracted_document_data")
      .update({
        final_category: resolved.finalCategory,
        needs_review: false,
      })
      .eq("id", extractionRowId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    console.log("[classification-review] resolved", {
      extractionRowId,
      finalCategory: resolved.finalCategory,
      needsReview: false,
    });

    return NextResponse.json({ classification: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur.";
    console.error("[api/lmnp/classification-review]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
