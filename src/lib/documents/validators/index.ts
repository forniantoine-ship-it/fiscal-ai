/** Side-effect: registers INPI / P0I validation rules for the activité tunnel */
import "./activite-validation";

export {
  euroAmountValidator,
  minConfidenceField,
  requiredField,
  runFieldValidators,
  sirenFormatValidator,
} from "./field-validators";

export { registerValidationRules, validateExtraction } from "./validate-extraction";

export type {
  DocumentValidationRule,
  FieldValidationCode,
  FieldValidationIssue,
  FieldValidator,
} from "./validator.types";
