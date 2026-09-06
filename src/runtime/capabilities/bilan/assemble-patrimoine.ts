import type { FiscalRepresentation } from "../rfs/types";
import { round2 } from "../f010/types";
import { assembleRegistreImmobilisationsPatrimoniales } from "./assemble-immobilisations-patrimoniales";
import { resolveCompteExploitant } from "./compte-exploitant";
import { resolveRan } from "./ran";
import { resultatComptable } from "./resultat-comptable";
import { resolveLignesSimples } from "./lignes-simples";
import { resolveLignePatrimoniale } from "./ligne-patrimoniale";
import {
  appliquerCoherenceInclusionConjointe,
  resolveReconciliationDecouvertTiers,
  resolveReconciliationEmpruntsTiers,
} from "./reconciliation-emprunts-tiers";
import { resolveSubventionsInvestissement } from "./subventions-investissement";
import { resolveTiers } from "./tiers";
import { resolveTresorerie } from "./tresorerie";
import {
  appliquerConflitsVentilation,
  detecterConflitsDoubleComptage,
  resolveVentilationTiers,
} from "./ventilation-tiers";
import type { BilanInputs, EmpruntsResolution, PatrimonialState } from "./types";

const TOLERANCE_RECONCILIATION_CRD = 0.01;

/**
 * Correction P0-3 — source canonique du CRD de clôture (156/176). Deux
 * sources possibles, jamais choisies arbitrairement l'une contre l'autre :
 * `Σ rfs.emprunts[].capitalRestantDu31_12` (F-011) et
 * `BilanInputs.financements.clotureCRD` (saisie déclarative secondaire).
 * Si les deux sont présentes, elles doivent concorder — sinon `DIVERGENT`,
 * et ni 156 ni 176 ne sont publiées tant que l'écart n'est pas résolu (voir
 * `check-bilan-equilibre.ts`/`map-2033a.ts`). Si une seule est présente,
 * elle est retenue telle quelle : aucune seconde valeur n'est inventée.
 */
function resolveEmprunts(rfs: FiscalRepresentation, inputs: BilanInputs): EmpruntsResolution {
  const crdF011 = rfs.emprunts !== undefined ? round2(rfs.emprunts.reduce((acc, p) => acc + p.capitalRestantDu31_12, 0)) : undefined;
  const crdDeclare = inputs.financements?.clotureCRD !== undefined ? round2(inputs.financements.clotureCRD) : undefined;

  if (crdF011 === undefined && crdDeclare === undefined) {
    return {
      etat: "INCONNU",
      raison: "Aucune information sur les emprunts (ni rfs.emprunts F-011, ni BilanInputs.financements.clotureCRD) — case 156 non calculable.",
    };
  }

  if (crdF011 !== undefined && crdDeclare !== undefined) {
    if (Math.abs(round2(crdF011 - crdDeclare)) > TOLERANCE_RECONCILIATION_CRD) {
      return {
        etat: "DIVERGENT",
        raison: `Divergence entre Σ rfs.emprunts[].capitalRestantDu31_12 (F-011 : ${crdF011} €) et BilanInputs.financements.clotureCRD (déclaré : ${crdDeclare} €) — ni 156 ni 176 ne sont publiées tant que l'écart n'est pas résolu ou documenté ; aucune des deux sources n'est choisie arbitrairement.`,
      };
    }
    return { etat: "DISPONIBLE", totalCRD: crdF011, source: "Σ rfs.emprunts[].capitalRestantDu31_12 (F-011), cohérent avec BilanInputs.financements.clotureCRD" };
  }

  if (crdF011 !== undefined) {
    return { etat: "DISPONIBLE", totalCRD: crdF011, source: "Σ rfs.emprunts[].capitalRestantDu31_12 (F-011)" };
  }

  return { etat: "DISPONIBLE", totalCRD: crdDeclare as number, source: inputs.financements?.source ?? "BilanInputs.financements.clotureCRD (saisie explicite)" };
}

/**
 * Composition explicite du socle patrimonial P0 (ADR-003, même principe que
 * F-010/F-011/F-012) — assemble un `PatrimonialState` à partir :
 *  - de la RFS déjà produite (`fiscalResult`, `immobilisations`, `emprunts`),
 *    jamais recalculée ;
 *  - des `BilanInputs` saisis explicitement par l'utilisateur (trésorerie,
 *    compte de l'exploitant, RAN, tiers, financements).
 *
 * N'introduit AUCUNE règle fiscale nouvelle. N'importe ni ne relit jamais
 * `produceFiscalResult()`/`applyAmortissementStocks()` — même garde
 * d'architecture que les mappers RFS (voir `assemble-patrimoine.test.ts`,
 * test d'architecture dédié).
 */
export function assemblePatrimoine(rfs: FiscalRepresentation, inputs: BilanInputs): PatrimonialState {
  const fr = rfs.fiscalResult;

  const immobilisations = assembleRegistreImmobilisationsPatrimoniales({
    immobilisations: rfs.immobilisations,
    amortCalcule: fr.amortCalcule,
  });

  const tresorerie = resolveTresorerie(inputs.tresorerie);
  const compteExploitant = resolveCompteExploitant(inputs.compteExploitant);
  const ran = resolveRan(inputs.ran);
  const emprunts = resolveEmprunts(rfs, inputs);
  const tiers = resolveTiers(inputs.tiers);
  const subventionsInvestissement = resolveSubventionsInvestissement(inputs.subventionsInvestissement);
  const lignesSimples = resolveLignesSimples(inputs.lignesSimples);
  const disponibilitesAmortissementsProvisions = resolveLignePatrimoniale(
    inputs.tresorerie.provisionsAmortissements,
    "Disponibilités amortissements-provisions (case 086)",
  );
  const ventilationBrute = resolveVentilationTiers(inputs.ventilationTiers);
  const ventilationTiers = appliquerConflitsVentilation(
    ventilationBrute,
    detecterConflitsDoubleComptage({
      ventilation: ventilationBrute,
      tiers,
      emprunts,
      tresorerie,
      lignesSimples,
    }),
  );
  const reconciliationEmpruntsBrute = resolveReconciliationEmpruntsTiers(
    emprunts,
    tiers.dettes,
    inputs.tiers?.reconciliationEmprunts,
  );
  const reconciliationDecouvertBrute = resolveReconciliationDecouvertTiers(
    tresorerie,
    tiers.dettes,
    inputs.tiers?.reconciliationDecouvert,
  );
  // R-02 : Σ dettes canoniques INCLUS ≤ bucket (jamais des contrôles séparés seuls).
  const montantEmpruntCanonique = emprunts.etat === "DISPONIBLE" ? emprunts.totalCRD : 0;
  const montantDecouvertCanonique = tresorerie.decouvertDettePassif ?? 0;
  const { reconciliationEmpruntsTiers, reconciliationDecouvertTiers } = appliquerCoherenceInclusionConjointe(
    reconciliationEmpruntsBrute,
    reconciliationDecouvertBrute,
    tiers.dettes,
    montantEmpruntCanonique,
    montantDecouvertCanonique,
  );

  return {
    exercice: rfs.exercice,
    resultatComptable: resultatComptable(fr),
    immobilisations,
    tresorerie,
    compteExploitant,
    ran,
    emprunts,
    tiers,
    subventionsInvestissement,
    lignesSimples,
    disponibilitesAmortissementsProvisions,
    ventilationTiers,
    reconciliationEmpruntsTiers,
    reconciliationDecouvertTiers,
  };
}
