/**
 * Detects provider error messages and OCR failure placeholders that must NOT
 * be treated as valid document semantic corpus.
 */

export type DocumentTextProviderSource =
  | "pdf_text"
  | "vision_ocr"
  | "vision_ocr_preprocessed"
  | "unknown";

export type InvalidCorpusDetectionResult = {
  invalidCorpusDetected: boolean;
  rejectionReason: string | null;
};

type InvalidCorpusRule = {
  pattern: RegExp;
  reason: string;
};

const INVALID_CORPUS_RULES: InvalidCorpusRule[] = [
  {
    pattern: /i[''`]?m unable to extract text/i,
    reason: "vision_model_refusal_unable_to_extract",
  },
  {
    pattern: /unable to extract text from/i,
    reason: "vision_model_refusal_unable_to_extract_from",
  },
  {
    pattern: /i (?:am |'m )?unable to (?:read|process|analyze)/i,
    reason: "model_refusal_unable_to_read",
  },
  {
    pattern: /i cannot extract(?: any)? text/i,
    reason: "model_refusal_cannot_extract",
  },
  {
    pattern: /i (?:am |'m )?sorry,? but i (?:am |'m )?unable/i,
    reason: "model_apology_refusal",
  },
  {
    pattern: /no readable text (?:was )?found/i,
    reason: "no_readable_text_placeholder",
  },
  {
    pattern: /no text (?:could be |was )?(?:found|extracted|detected)/i,
    reason: "no_text_found_placeholder",
  },
  {
    pattern: /\bocr failed\b/i,
    reason: "ocr_failure_message",
  },
  {
    pattern: /\b(?:text )?extraction failed\b/i,
    reason: "extraction_failure_message",
  },
  {
    pattern: /échec(?: de)? l['']?ocr/i,
    reason: "ocr_failure_message_fr",
  },
  {
    pattern: /impossible d['']extraire (?:le )?texte/i,
    reason: "extraction_failure_message_fr",
  },
  {
    pattern: /aucun texte (?:lisible|exploitable) (?:n['']?a )?(?:été )?(?:trouvé|détecté)/i,
    reason: "no_readable_text_placeholder_fr",
  },
  {
    pattern: /nous n['']avons pas réussi à lire/i,
    reason: "provider_read_failure_fr",
  },
  {
    pattern: /(?:^|\n)\s*error:\s/im,
    reason: "error_prefix_diagnostic",
  },
  {
    pattern: /(?:TypeError|ReferenceError|SyntaxError):\s/,
    reason: "javascript_exception_trace",
  },
  {
    pattern: /at\s+\S+\s+\([^)]+\)/,
    reason: "stack_trace_diagnostic",
  },
  {
    pattern: /OPENAI_API_KEY/i,
    reason: "provider_configuration_error",
  },
  {
    pattern: /vision OCR échoué/i,
    reason: "vision_ocr_failure_message",
  },
  {
    pattern: /réponse vision OCR invalide/i,
    reason: "vision_ocr_invalid_response",
  },
];

/**
 * Returns true when the text is a provider/model failure message, not document content.
 */
export function detectInvalidCorpus(text: string): InvalidCorpusDetectionResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { invalidCorpusDetected: false, rejectionReason: null };
  }

  for (const rule of INVALID_CORPUS_RULES) {
    if (rule.pattern.test(trimmed)) {
      return { invalidCorpusDetected: true, rejectionReason: rule.reason };
    }
  }

  // Short refusal-style responses with no document structure.
  if (
    trimmed.length < 220 &&
    /^(?:i[''`]?m |i am )(?:sorry|unable|afraid)/i.test(trimmed) &&
    /(?:extract|read|provide|process|image|document|text)/i.test(trimmed)
  ) {
    return { invalidCorpusDetected: true, rejectionReason: "short_model_refusal" };
  }

  return { invalidCorpusDetected: false, rejectionReason: null };
}

export function logInvalidCorpusDebug(params: {
  invalidCorpusDetected: boolean;
  rejectionReason: string | null;
  rejectedCorpusPreview: string;
  providerSource: DocumentTextProviderSource;
  originalLength?: number;
  stage?: string;
  fileName?: string;
}): void {
  console.log("[document-text-invalid-corpus-debug]", params);
}

/**
 * Reject invalid corpus — returns empty string when the input is a failure placeholder.
 */
export function sanitizeCorpusText(
  text: string,
  providerSource: DocumentTextProviderSource,
  context?: { stage?: string; fileName?: string },
): string {
  const detection = detectInvalidCorpus(text);
  if (!detection.invalidCorpusDetected) {
    return text;
  }

  logInvalidCorpusDebug({
    invalidCorpusDetected: true,
    rejectionReason: detection.rejectionReason,
    rejectedCorpusPreview: text,
    providerSource,
    originalLength: text.length,
    stage: context?.stage,
    fileName: context?.fileName,
  });

  return "";
}
