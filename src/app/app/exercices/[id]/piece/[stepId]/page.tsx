"use client";

import { useParams, useRouter } from "next/navigation";
import {
  DOCUMENT_JOURNEY_ORDER,
  type DocumentJourneyStepId,
} from "@/lib/lmnp/constants/document-journey";
import { SequentialDocumentStep } from "@/components/lmnp/document-journey/SequentialDocumentStep";

const VALID = new Set(DOCUMENT_JOURNEY_ORDER);

export default function DocumentPiecePage() {
  const params = useParams();
  const router = useRouter();
  const stepId = params.stepId as DocumentJourneyStepId;
  const fiscalYearId = params.id as string;

  if (!VALID.has(stepId)) {
    router.replace(`/app/exercices/${fiscalYearId}`);
    return null;
  }

  if (stepId === "inpi") {
    router.replace(`/app/exercices/${fiscalYearId}/piece/inpi`);
    return null;
  }

  return <SequentialDocumentStep stepId={stepId} />;
}
