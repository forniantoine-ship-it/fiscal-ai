import { minConfidenceField, requiredField, sirenFormatValidator } from "./field-validators";
import { registerValidationRules } from "./validate-extraction";

/** INPI / activité tunnel validation rules — registered once at module load. */
registerValidationRules([
  {
    documentType: "inpi",
    validators: [
      requiredField("nom"),
      requiredField("prenom"),
      requiredField("siren"),
      sirenFormatValidator("siren"),
      minConfidenceField("siren"),
      minConfidenceField("nom"),
      minConfidenceField("prenom"),
    ],
  },
  {
    documentType: "p0i",
    validators: [requiredField("adresseEtablissement"), minConfidenceField("adresseEtablissement")],
  },
]);
