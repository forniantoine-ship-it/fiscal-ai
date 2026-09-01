import type { ResolvedDocumentClassification } from "@/lib/ai/document-classification-types";
import type { ClassificationReviewAction } from "@/lib/ai/apply-classification-review";
import { supabase } from "@/lib/supabase";

export class ClassificationReviewError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ClassificationReviewError";
    this.status = status;
  }
}

export async function submitClassificationReview(params: {
  extractionRowId: string;
  action: ClassificationReviewAction;
}): Promise<ResolvedDocumentClassification> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/lmnp/classification-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      extractionRowId: params.extractionRowId,
      action: params.action,
      authToken: session?.access_token,
    }),
  });

  const body = (await response.json()) as {
    classification?: ResolvedDocumentClassification;
    error?: string;
  };

  if (!response.ok) {
    throw new ClassificationReviewError(body.error ?? "Validation échouée.", response.status);
  }

  if (!body.classification) {
    throw new ClassificationReviewError("Réponse de validation invalide.", 502);
  }

  return body.classification;
}
