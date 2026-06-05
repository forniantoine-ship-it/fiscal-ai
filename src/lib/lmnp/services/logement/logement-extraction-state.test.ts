import { deriveLogementExtractionState } from "./logement-extraction-state";
import type { LogementFormValues } from "@/lib/lmnp/services/logement-profile";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const emptyForm: LogementFormValues = {
  label: "",
  address: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  propertyType: "appartement",
  coproperty: false,
  surface: "",
  propertyPurchasePrice: "",
  notaryFees: "",
  acquisitionDate: "",
  status: "",
};

const partialForm: LogementFormValues = {
  ...emptyForm,
  label: "Appartement",
  address: "12 rue de la Paix",
  city: "Paris",
  postalCode: "75002",
};

const completeForm: LogementFormValues = {
  ...partialForm,
  propertyPurchasePrice: "250000",
  surface: "45",
  acquisitionDate: "2024-01-15",
  status: "Loué meublé",
};

assert(
  deriveLogementExtractionState({
    extractionSuccess: false,
    patchedFieldNames: [],
    canonicalFieldCount: 0,
    formValues: emptyForm,
    pipelineError: true,
  }).state === "failed",
  "pipeline error without partial → failed",
);

assert(
  deriveLogementExtractionState({
    extractionSuccess: true,
    patchedFieldNames: ["address", "city"],
    canonicalFieldCount: 2,
    formValues: partialForm,
  }).state === "partial",
  "success with incomplete profile → partial",
);

assert(
  deriveLogementExtractionState({
    extractionSuccess: true,
    patchedFieldNames: ["address", "city", "propertyPurchasePrice", "surface", "acquisitionDate"],
    canonicalFieldCount: 5,
    formValues: completeForm,
  }).state === "success",
  "complete extraction → success",
);

console.log("[test:logement-extraction-state] all assertions passed");
