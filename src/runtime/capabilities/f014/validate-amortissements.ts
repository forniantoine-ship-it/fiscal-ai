import type { Anomaly } from "../../contracts/Anomaly";
import type { PlanAmortissement, ValidationAmortissements } from "./types";

export type ValidateAmortissementsInput = {
  plan?: PlanAmortissement;
  status: ValidationAmortissements["status"];
};

export type ValidateAmortissementsOutput = {
  validation?: ValidationAmortissements;
  anomalies: Anomaly[];
};

export function validateAmortissements(
  input: ValidateAmortissementsInput,
): ValidateAmortissementsOutput {
  const anomalies: Anomaly[] = [];

  if (!input.plan) {
    anomalies.push({
      severity: "fatal",
      message:
        "Votre plan d'amortissement n'est pas encore prêt. Complétez l'étape Logement pour continuer.",
      field: "plan_amortissement",
    });
    return { anomalies };
  }

  if (input.plan.composants.length === 0) {
    anomalies.push({
      severity: "fatal",
      message: "Aucun composant amortissable n'a été trouvé dans le plan.",
      field: "plan_amortissement",
    });
    return { anomalies };
  }

  const validatedAt = new Date().toISOString();
  const planVersion = `f014-${input.plan.exercice}-${validatedAt.slice(0, 10)}`;

  return {
    validation: {
      status: input.status,
      exercice: input.plan.exercice,
      total_dotations: input.plan.total_dotations_exercice,
      validated_at: validatedAt,
      plan_version: planVersion,
    },
    anomalies,
  };
}
