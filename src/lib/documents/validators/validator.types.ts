import type { ExtractedField } from "../types/extraction-result";

export type FieldValidationCode =
  | "required"
  | "invalid_format"
  | "out_of_range"
  | "inconsistent"
  | "low_confidence";

export type FieldValidationIssue = {
  fieldKey: string;
  code: FieldValidationCode;
  message: string;
};

export type FieldValidator<T = unknown> = {
  fieldKey: string;
  validate(field: ExtractedField<T>): FieldValidationIssue | null;
};

export type DocumentValidationRule = {
  documentType: import("../types/document-type").DocumentType;
  validators: FieldValidator[];
};
