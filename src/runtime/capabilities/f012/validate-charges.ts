import type { Anomaly } from "../../contracts/Anomaly";
import type { ProfilCharges } from "./types";

/**
 * TRF-0021 — Vérification de cohérence des charges.
 * Vérifie la complétude de l'inventaire attendu (F-012).
 */
export type ValidateChargesInput = {
  profil: ProfilCharges;
  renseigne: {
    taxeFonciere?: boolean;
    assurancePno?: boolean;
    copropriete?: boolean;
    honorairesGestion?: boolean;
    travaux?: boolean;
  };
  totalDeductible: number;
};

export type ValidateChargesOutput = {
  chargesCoherentes: boolean;
  anomalies: Anomaly[];
};

export function validateCharges(input: ValidateChargesInput): ValidateChargesOutput {
  const anomalies: Anomaly[] = [];

  if (!input.renseigne.taxeFonciere) {
    anomalies.push({
      severity: "warning",
      message: "La taxe foncière n'a pas été renseignée — catégorie attendue pour tout bien LMNP.",
      field: "taxe_fonciere",
    });
  }

  if (!input.renseigne.assurancePno) {
    anomalies.push({
      severity: "warning",
      message: "L'assurance PNO n'a pas été renseignée — catégorie attendue.",
      field: "assurance_pno",
    });
  }

  if (input.profil.copropriete && !input.renseigne.copropriete) {
    anomalies.push({
      severity: "warning",
      message: "Votre bien est en copropriété mais les charges de copropriété ne sont pas renseignées.",
      field: "copropriete",
    });
  }

  if (input.profil.agence && !input.renseigne.honorairesGestion) {
    anomalies.push({
      severity: "warning",
      message: "Votre bien est géré par une agence mais les honoraires de gestion ne sont pas renseignés.",
      field: "honoraires_gestion",
    });
  }

  if (input.profil.travaux && !input.renseigne.travaux) {
    anomalies.push({
      severity: "warning",
      message: "Vous avez signalé des travaux mais aucune dépense n'a été qualifiée.",
      field: "travaux",
    });
  }

  if (input.totalDeductible <= 0 && anomalies.length === 0) {
    anomalies.push({
      severity: "warning",
      message: "Aucune charge déductible n'a été identifiée pour cet exercice.",
    });
  }

  const blocking = anomalies.filter((a) => a.severity === "fatal" || a.severity === "error");
  return {
    chargesCoherentes: blocking.length === 0,
    anomalies,
  };
}
