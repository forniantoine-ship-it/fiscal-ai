/**
 * Cycle 5 — adaptateur pur Charge Registry → ComputeChargesExerciceInput.
 * Aucune règle fiscale ici : le moteur existant reste le seul calcul.
 */

import type { ComputeChargesExerciceInput, TravauxInput } from "../../capabilities/f012/compute-charges-exercice";
import type { CoproLigneInput } from "../../capabilities/f012/compute-copro-deductible";
import type { ChargeRegistry } from "../../capabilities/f012/charge";
import { scalarChargeId } from "../../capabilities/f012/charge";
import type { FieldSource } from "../../contracts/FieldSource";

export type RegistryToComputeInputDeps = {
  dateMiseEnService: string;
  /** Si fourni, réutilise les clés actuelles (dont divers-par-description) — équivalence fiscale. */
  fieldSources?: Partial<Record<string, FieldSource>>;
};

function pickScalar(registry: ChargeRegistry, slot: string): number | undefined {
  const id = scalarChargeId(slot, registry.exercise);
  const charge = registry.charges.find((c) => c.id === id);
  return charge?.amount;
}

function sumCharges(
  registry: ChargeRegistry,
  match: (charge: ChargeRegistry["charges"][number]) => boolean,
): number | undefined {
  const amounts = registry.charges.filter(match).map((charge) => charge.amount);
  if (amounts.length === 0) return undefined;
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

export function chargeRegistryToComputeInput(
  registry: ChargeRegistry,
  deps: RegistryToComputeInputDeps,
): ComputeChargesExerciceInput {
  const fieldSources: Partial<Record<string, FieldSource>> = {};
  const divers: NonNullable<ComputeChargesExerciceInput["divers"]> = [];
  const travaux: TravauxInput[] = [];
  const coproLignes: CoproLigneInput[] = [];

  for (const charge of registry.charges) {
    switch (charge.category) {
      case "taxe_fonciere":
        fieldSources.taxe_fonciere = charge.provenance;
        break;
      case "assurance_pno":
        fieldSources.assurance_pno = charge.provenance;
        break;
      case "assurance_gli":
        fieldSources.assurance_gli = charge.provenance;
        break;
      case "honoraires_comptable":
        fieldSources.honoraires_comptable = charge.provenance;
        break;
      case "frais_bancaires":
        fieldSources.frais_bancaires = charge.provenance;
        break;
      case "honoraires_gestion":
        fieldSources.honoraires_gestion = charge.provenance;
        break;
      case "copropriete":
        fieldSources.copropriete = charge.provenance;
        if (charge.coproType) {
          coproLignes.push({
            type: charge.coproType,
            montant: charge.amount,
            description: charge.description,
            grosTravauxDeductible: charge.grosTravauxDeductible,
          });
        }
        break;
      case "divers":
        fieldSources[charge.description ?? charge.id] = charge.provenance;
        divers.push({
          id: charge.id,
          description: charge.description ?? "",
          montant: charge.amount,
          financementOverlap: charge.financingOverlap,
        });
        break;
      case "travaux": {
        fieldSources[`travaux-${charge.id}`] = charge.provenance;
        const nature = charge.travaux?.natureIntervention;
        if (!nature) break;
        travaux.push({
          id: charge.id,
          description: charge.description ?? "",
          montant: charge.amount,
          natureIntervention: nature,
          montantReparation: charge.travaux?.montantReparation,
          source: charge.provenance,
        });
        break;
      }
    }
  }

  const etatDesLieuxId = scalarChargeId("frais-etat-des-lieux", registry.exercise);
  const honorairesGestion = sumCharges(
    registry,
    (charge) => charge.category === "honoraires_gestion" && charge.id !== etatDesLieuxId,
  );
  const fraisEtatDesLieux = pickScalar(registry, "frais-etat-des-lieux");

  return {
    exerciceFiscal: registry.exercise,
    dateMiseEnService: deps.dateMiseEnService,
    taxeFonciere: sumCharges(registry, (charge) => charge.category === "taxe_fonciere"),
    assurancePno: sumCharges(registry, (charge) => charge.category === "assurance_pno"),
    assuranceGli: sumCharges(registry, (charge) => charge.category === "assurance_gli"),
    coproLignes: coproLignes.length > 0 ? coproLignes : undefined,
    honorairesGestion,
    fraisEtatDesLieux,
    honorairesComptable: sumCharges(registry, (charge) => charge.category === "honoraires_comptable"),
    fraisBancaires: sumCharges(registry, (charge) => charge.category === "frais_bancaires"),
    divers: divers.length > 0 ? divers : undefined,
    travaux: travaux.length > 0 ? travaux : undefined,
    fieldSources: deps.fieldSources ?? fieldSources,
  };
}
