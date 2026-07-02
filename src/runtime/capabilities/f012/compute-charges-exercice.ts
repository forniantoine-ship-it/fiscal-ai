import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import { computeCoproDeductible, type CoproLigneInput } from "./compute-copro-deductible";
import { createComposantTravaux } from "./create-composant-travaux";
import { computeTaxeFonciereDeductible } from "./compute-taxe-fonciere-deductible";
import { isolatePreExploitationCharge } from "./isolate-pre-exploitation-charge";
import { qualifyTravail, splitMixteTravaux } from "./qualify-travail";
import type {
  ChargeCategorie,
  ChargesExerciceResult,
  ComposantNouveau,
  LigneCharge,
  NatureIntervention,
  ProfilCharges,
} from "./types";
import { round2 } from "./types";

/**
 * Composition explicite F-012 (TRF-0017, TRF-0018, TRF-0020, TRF-0026, TRF-0028) — ADR-003.
 */
export type TravauxInput = {
  id: string;
  description: string;
  montant: number;
  natureIntervention: NatureIntervention;
  montantReparation?: number;
  source?: FieldSource;
};

export type ComputeChargesExerciceInput = {
  exerciceFiscal: number;
  dateMiseEnService: string;
  taxeFonciere?: number;
  assurancePno?: number;
  assuranceGli?: number;
  coproLignes?: CoproLigneInput[];
  honorairesGestion?: number;
  fraisEtatDesLieux?: number;
  honorairesComptable?: number;
  fraisBancaires?: number;
  divers?: { id: string; description: string; montant: number }[];
  travaux?: TravauxInput[];
  fieldSources?: Partial<Record<string, FieldSource>>;
};

export type ComputeChargesExerciceOutput = {
  charges: ChargesExerciceResult;
  anomalies: Anomaly[];
};

function ligne(
  partial: Omit<LigneCharge, "montantDeductible" | "montantPreExploitation" | "montantAmortissable"> & {
    montantDeductible?: number;
    montantPreExploitation?: number;
    montantAmortissable?: number;
  },
): LigneCharge {
  return {
    montantDeductible: partial.montantDeductible ?? 0,
    montantPreExploitation: partial.montantPreExploitation ?? 0,
    montantAmortissable: partial.montantAmortissable ?? 0,
    ...partial,
  };
}

function simpleDeductibleCharge(
  id: string,
  description: string,
  montant: number,
  categorie: ChargeCategorie,
  exerciceFiscal: number,
  dateMiseEnService: string,
  source: FieldSource,
): LigneCharge {
  const isolated = isolatePreExploitationCharge({
    montant,
    exerciceFiscal,
    dateMiseEnService,
  });
  return ligne({
    id,
    description,
    montant,
    categorie,
    deductibilite: "deductible",
    montantDeductible: isolated.montantDeductible,
    montantPreExploitation: isolated.montantPreExploitation,
    source,
    regleAppliquee: "Charge déductible — prorata pré-exploitation appliqué si nécessaire",
  });
}

export function computeChargesExercice(
  input: ComputeChargesExerciceInput,
): ComputeChargesExerciceOutput {
  const anomalies: Anomaly[] = [];
  const lignes: LigneCharge[] = [];
  const composantsNouveaux: ComposantNouveau[] = [];
  const src = (key: string): FieldSource => input.fieldSources?.[key] ?? "manual";

  if (input.taxeFonciere !== undefined && input.taxeFonciere > 0) {
    const tf = computeTaxeFonciereDeductible({
      montant: input.taxeFonciere,
      exerciceFiscal: input.exerciceFiscal,
      dateMiseEnService: input.dateMiseEnService,
    });
    lignes.push(
      ligne({
        id: "taxe-fonciere",
        description: "Taxe foncière",
        montant: input.taxeFonciere,
        categorie: "taxe_fonciere",
        deductibilite: "deductible",
        montantDeductible: tf.taxeFonciereDeductible,
        montantPreExploitation: tf.montantPreExploitation,
        source: src("taxe_fonciere"),
        regleAppliquee: "TRF-0018",
      }),
    );
    if (tf.montantPreExploitation > 0) {
      lignes.push(
        ligne({
          id: "taxe-fonciere-pre-exploitation",
          description: "Taxe foncière — part pré-exploitation",
          montant: tf.montantPreExploitation,
          categorie: "taxe_fonciere",
          deductibilite: "non_deductible",
          montantPreExploitation: tf.montantPreExploitation,
          source: "derived",
          regleAppliquee: "F-012 — isolation pré-exploitation",
        }),
      );
    }
  }

  if (input.assurancePno !== undefined && input.assurancePno > 0) {
    lignes.push(
      simpleDeductibleCharge(
        "assurance-pno",
        "Assurance PNO",
        input.assurancePno,
        "assurance_pno",
        input.exerciceFiscal,
        input.dateMiseEnService,
        src("assurance_pno"),
      ),
    );
  }

  if (input.assuranceGli !== undefined && input.assuranceGli > 0) {
    lignes.push(
      simpleDeductibleCharge(
        "assurance-gli",
        "Assurance GLI",
        input.assuranceGli,
        "assurance_gli",
        input.exerciceFiscal,
        input.dateMiseEnService,
        src("assurance_gli"),
      ),
    );
  }

  if (input.coproLignes?.length) {
    const copro = computeCoproDeductible({ lignes: input.coproLignes });
    for (const row of input.coproLignes) {
      if (row.type === "fonds_travaux") {
        lignes.push(
          ligne({
            id: `copro-fonds-${row.description ?? "fonds"}`,
            description: row.description ?? "Fonds de travaux ALUR",
            montant: row.montant,
            categorie: "copropriete",
            deductibilite: "non_deductible",
            source: src("copropriete"),
            regleAppliquee: "F-012 — fonds de travaux non déductible à la cotisation",
          }),
        );
        continue;
      }
      if (row.type === "appel_gros_travaux" && row.grosTravauxDeductible === false) {
        const created = createComposantTravaux({
          label: row.description ?? "Appel fonds gros travaux",
          montant: row.montant,
          nature: "amélioration",
          dateDebut: input.dateMiseEnService,
        });
        composantsNouveaux.push(created.composant);
        lignes.push(
          ligne({
            id: `copro-gros-travaux-${row.description ?? "appel"}`,
            description: row.description ?? "Appel gros travaux copropriété",
            montant: row.montant,
            categorie: "copropriete",
            deductibilite: "amortissement",
            montantAmortissable: row.montant,
            source: src("copropriete"),
            regleAppliquee: "TRF-0028 — immobilisation après qualification",
          }),
        );
      }
    }
    if (copro.coproprieteDeductible !== 0) {
      lignes.push(
        ligne({
          id: "copropriete-deductible",
          description: "Charges de copropriété déductibles",
          montant: copro.coproprieteDeductible,
          categorie: "copropriete",
          deductibilite: "deductible",
          montantDeductible: copro.coproprieteDeductible,
          source: src("copropriete"),
          regleAppliquee: "TRF-0017",
        }),
      );
    }
  }

  const gestionTotal = round2((input.honorairesGestion ?? 0) + (input.fraisEtatDesLieux ?? 0));
  if (gestionTotal > 0) {
    lignes.push(
      simpleDeductibleCharge(
        "honoraires-gestion",
        "Honoraires et frais de gestion",
        gestionTotal,
        "honoraires_gestion",
        input.exerciceFiscal,
        input.dateMiseEnService,
        src("honoraires_gestion"),
      ),
    );
  }

  if (input.honorairesComptable !== undefined && input.honorairesComptable > 0) {
    lignes.push(
      simpleDeductibleCharge(
        "honoraires-comptable",
        "Honoraires comptables",
        input.honorairesComptable,
        "honoraires_comptable",
        input.exerciceFiscal,
        input.dateMiseEnService,
        src("honoraires_comptable"),
      ),
    );
  }

  if (input.fraisBancaires !== undefined && input.fraisBancaires > 0) {
    lignes.push(
      simpleDeductibleCharge(
        "frais-bancaires",
        "Frais bancaires",
        input.fraisBancaires,
        "frais_bancaires",
        input.exerciceFiscal,
        input.dateMiseEnService,
        src("frais_bancaires"),
      ),
    );
  }

  for (const item of input.divers ?? []) {
    lignes.push(
      simpleDeductibleCharge(
        item.id,
        item.description,
        item.montant,
        "divers",
        input.exerciceFiscal,
        input.dateMiseEnService,
        src(item.id),
      ),
    );
  }

  for (const travail of input.travaux ?? []) {
    const source = travail.source ?? src(`travaux-${travail.id}`);

    if (travail.natureIntervention === "entretien" && travail.montantReparation !== undefined) {
      const split = splitMixteTravaux(travail.montant, travail.montantReparation);
      if (split.charge > 0) {
        const qualified = qualifyTravail({
          description: travail.description,
          montant: split.charge,
          natureIntervention: "entretien",
        });
        lignes.push(
          ligne({
            id: `${travail.id}-charge`,
            description: `${travail.description} (part réparation)`,
            montant: split.charge,
            categorie: "travaux",
            deductibilite: "deductible",
            montantDeductible: split.charge,
            source,
            regleAppliquee: qualified.regleAppliquee,
          }),
        );
      }
      if (split.immobilisation > 0) {
        const created = createComposantTravaux({
          label: travail.description,
          montant: split.immobilisation,
          nature: "amélioration",
          dateDebut: input.dateMiseEnService,
        });
        composantsNouveaux.push(created.composant);
        lignes.push(
          ligne({
            id: `${travail.id}-immo`,
            description: `${travail.description} (part amélioration)`,
            montant: split.immobilisation,
            categorie: "travaux",
            deductibilite: "amortissement",
            montantAmortissable: split.immobilisation,
            source,
            regleAppliquee: "TRF-0026 + TRF-0028 — facture mixte",
          }),
        );
      }
      continue;
    }

    const qualified = qualifyTravail({
      description: travail.description,
      montant: travail.montant,
      natureIntervention: travail.natureIntervention,
    });

    if (qualified.qualification === "charge") {
      if (travail.montant > 5000) {
        anomalies.push({
          severity: "warning",
          message:
            `Une dépense de travaux de ${travail.montant.toLocaleString("fr-FR")} € mérite confirmation (facture recommandée).`,
          field: travail.id,
        });
      }
      lignes.push(
        ligne({
          id: travail.id,
          description: travail.description,
          montant: travail.montant,
          categorie: "travaux",
          deductibilite: "deductible",
          montantDeductible: travail.montant,
          source,
          regleAppliquee: qualified.regleAppliquee,
        }),
      );
    } else {
      const nature =
        travail.natureIntervention === "construction"
          ? "construction"
          : travail.natureIntervention === "renouvellement"
            ? "renouvellement"
            : "amélioration";
      const created = createComposantTravaux({
        label: travail.description,
        montant: travail.montant,
        nature,
        dateDebut: input.dateMiseEnService,
      });
      composantsNouveaux.push(created.composant);
      lignes.push(
        ligne({
          id: travail.id,
          description: travail.description,
          montant: travail.montant,
          categorie: "travaux",
          deductibilite: "amortissement",
          montantAmortissable: travail.montant,
          source,
          regleAppliquee: qualified.regleAppliquee,
        }),
      );
    }
  }

  const parCategorie: Partial<Record<ChargeCategorie, number>> = {};
  let totalDeductible = 0;
  let totalNonDeductible = 0;
  let totalAmortissable = 0;
  let totalPreExploitation = 0;

  for (const row of lignes) {
    if (row.deductibilite === "deductible") {
      totalDeductible = round2(totalDeductible + row.montantDeductible);
      parCategorie[row.categorie] = round2((parCategorie[row.categorie] ?? 0) + row.montantDeductible);
    } else if (row.deductibilite === "non_deductible") {
      totalNonDeductible = round2(totalNonDeductible + row.montant);
    } else if (row.deductibilite === "amortissement") {
      totalAmortissable = round2(totalAmortissable + row.montantAmortissable);
    }
    totalPreExploitation = round2(totalPreExploitation + row.montantPreExploitation);
  }

  return {
    charges: {
      exerciceFiscal: input.exerciceFiscal,
      lignes,
      parCategorie,
      totalDeductible,
      totalNonDeductible,
      totalAmortissable,
      totalPreExploitation,
      composantsNouveaux,
    },
    anomalies,
  };
}

export function buildCategoryInventory(profil: ProfilCharges): string[] {
  const categories = ["taxe_fonciere", "assurance_pno"] as const;
  const inventory: string[] = [...categories];
  if (profil.copropriete) inventory.push("copropriete");
  if (profil.agence) inventory.push("honoraires_gestion");
  if (profil.travaux) inventory.push("travaux");
  if (profil.comptable) inventory.push("honoraires_comptable");
  inventory.push("frais_bancaires", "divers");
  return inventory;
}
