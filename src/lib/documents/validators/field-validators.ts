import { CONFIDENCE_THRESHOLDS } from "../types/confidence-score";
import type { ExtractedField } from "../types/extraction-result";
import type { FieldValidationIssue, FieldValidator } from "./validator.types";

export function requiredField(fieldKey: string): FieldValidator {
  return {
    fieldKey,
    validate(field) {
      if (field.value === null || field.value === undefined || field.value === "") {
        return { fieldKey, code: "required", message: `${field.label} est requis` };
      }
      return null;
    },
  };
}

export function minConfidenceField(
  fieldKey: string,
  threshold = CONFIDENCE_THRESHOLDS.review,
): FieldValidator {
  return {
    fieldKey,
    validate(field) {
      if (field.confidence.value < threshold) {
        return {
          fieldKey,
          code: "low_confidence",
          message: `${field.label} : confiance insuffisante (${Math.round(field.confidence.value * 100)} %)`,
        };
      }
      return null;
    },
  };
}

export function sirenFormatValidator(fieldKey = "siren"): FieldValidator<string> {
  return {
    fieldKey,
    validate(field) {
      const raw = String(field.value ?? "").replace(/\s/g, "");
      if (!/^\d{9}$/.test(raw)) {
        return { fieldKey, code: "invalid_format", message: "SIREN invalide (9 chiffres attendus)" };
      }
      return null;
    },
  };
}

export function euroAmountValidator(fieldKey: string): FieldValidator<number> {
  return {
    fieldKey,
    validate(field) {
      const n = typeof field.value === "number" ? field.value : Number(field.value);
      if (!Number.isFinite(n) || n < 0) {
        return { fieldKey, code: "invalid_format", message: `${field.label} : montant invalide` };
      }
      return null;
    },
  };
}

export function runFieldValidators(
  fields: ExtractedField[],
  validators: FieldValidator[],
): FieldValidationIssue[] {
  const issues: FieldValidationIssue[] = [];
  for (const validator of validators) {
    const field = fields.find((f) => f.key === validator.fieldKey);
    if (!field) {
      issues.push({
        fieldKey: validator.fieldKey,
        code: "required",
        message: `Champ manquant : ${validator.fieldKey}`,
      });
      continue;
    }
    const issue = validator.validate(field);
    if (issue) issues.push(issue);
  }
  return issues;
}
