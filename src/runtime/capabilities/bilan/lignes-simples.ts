import { resolveLignePatrimoniale } from "./ligne-patrimoniale";
import type {
  LignePatrimonialeInput,
  LignePatrimonialeResolution,
  LignesSimplesInputs,
  LignesSimplesResolution,
} from "./types";

/**
 * Résout une ligne patrimoniale « ouverte » P1-B.2 : peut exister en LMNP,
 * donc `NON_APPLICABLE` n'est JAMAIS autorisé par défaut ni accepté comme
 * raccourci pour « je ne sais pas / rare ». Un appelant qui passerait
 * `{ status: "NON_APPLICABLE" }` est ramené à `INCONNU` avec une raison
 * explicite — jamais transformé en 0 publiable.
 *
 * Réutilise l'abstraction P1-A `resolveLignePatrimoniale` pour
 * DECLARE / NUL_CONFIRME / INCONNU.
 */
export function resolveLignePatrimonialeOuverte(
  input: LignePatrimonialeInput | undefined,
  label: string,
): LignePatrimonialeResolution {
  if (input?.status === "NON_APPLICABLE") {
    return {
      status: "INCONNU",
      raison: `${label} : NON_APPLICABLE refusé — cette ligne peut exister en LMNP ; elle n'est jamais hors périmètre par défaut. Absence de donnée ≠ hors périmètre, et ≠ zéro.`,
    };
  }
  return resolveLignePatrimoniale(input, label);
}

/**
 * Résout l'ensemble des lignes patrimoniales simples P1-B.2.
 * `inputs` absent ⇒ toutes les lignes `INCONNU` (pas de faux zéro).
 */
export function resolveLignesSimples(inputs?: LignesSimplesInputs): LignesSimplesResolution {
  return {
    autresImmobilisationsIncorporellesBrut: resolveLignePatrimonialeOuverte(
      inputs?.autresImmobilisationsIncorporellesBrut,
      "Autres immobilisations incorporelles brut (case 014)",
    ),
    autresImmobilisationsIncorporellesNet: resolveLignePatrimonialeOuverte(
      inputs?.autresImmobilisationsIncorporellesNet,
      "Autres immobilisations incorporelles net (case 016)",
    ),
    immobilisationsFinancieresBrut: resolveLignePatrimonialeOuverte(
      inputs?.immobilisationsFinancieresBrut,
      "Immobilisations financières brut (case 040)",
    ),
    immobilisationsFinancieresNet: resolveLignePatrimonialeOuverte(
      inputs?.immobilisationsFinancieresNet,
      "Immobilisations financières net (case 042)",
    ),
    avancesAcomptesVerses: resolveLignePatrimonialeOuverte(
      inputs?.avancesAcomptesVerses,
      "Avances et acomptes versés (case 064)",
    ),
    valeursMobilieresPlacementBrut: resolveLignePatrimonialeOuverte(
      inputs?.valeursMobilieresPlacementBrut,
      "Valeurs mobilières de placement brut (case 080)",
    ),
    valeursMobilieresPlacementNet: resolveLignePatrimonialeOuverte(
      inputs?.valeursMobilieresPlacementNet,
      "Valeurs mobilières de placement net (case 082)",
    ),
    chargesConstateesAvance: resolveLignePatrimonialeOuverte(
      inputs?.chargesConstateesAvance,
      "Charges constatées d'avance (case 092)",
    ),
    produitsConstatesAvance: resolveLignePatrimonialeOuverte(
      inputs?.produitsConstatesAvance,
      "Produits constatés d'avance (case 174)",
    ),
    autresDettes: resolveLignePatrimonialeOuverte(inputs?.autresDettes, "Autres dettes (case 175)"),
  };
}

export type GateTotalComposantesResult =
  | { status: "COMPOSANTES_CONNUES" }
  | { status: "BLOQUE"; raison: string; casesInconnues: string[] };

/**
 * Gate doctrine des totaux : un total n'est considéable comme publiable
 * (côté composantes listées) que si AUCUNE composante nécessaire n'est
 * `INCONNU`. Ne calcule PAS le montant du total — d'autres composantes
 * hors P1-B.2 (ex. 010/028 pour 044, 156 pour 176) restent hors de ce
 * jalon. Ne « résout » jamais un total artificiellement.
 */
export function gateTotalSurComposantes(
  totalCaseId: string,
  totalLabel: string,
  composantes: Array<{ caseId: string; resolution: LignePatrimonialeResolution }>,
): GateTotalComposantesResult {
  const inconnues = composantes.filter((c) => c.resolution.status === "INCONNU");
  if (inconnues.length === 0) {
    return { status: "COMPOSANTES_CONNUES" };
  }
  const casesInconnues = inconnues.map((c) => c.caseId);
  return {
    status: "BLOQUE",
    casesInconnues,
    raison: `Total ${totalCaseId} (${totalLabel}) non publiable : composante(s) encore INCONNU (${casesInconnues.join(", ")}). Absence de donnée ≠ zéro ; le total reste bloqué tant que chaque composante nécessaire n'est pas DECLARE, NUL_CONFIRME ou (si autorisé) NON_APPLICABLE.`,
  };
}

/** Composantes P1-B.2 du total 044 (= 010 + 014 + 028 + 040) — hors 010/028. */
export function gateTotal044ActifImmobiliseBrut(lignes: LignesSimplesResolution): GateTotalComposantesResult {
  return gateTotalSurComposantes("044", "Total I — Actif immobilisé (brut)", [
    { caseId: "014", resolution: lignes.autresImmobilisationsIncorporellesBrut },
    { caseId: "040", resolution: lignes.immobilisationsFinancieresBrut },
  ]);
}

/** Composantes P1-B.2 du total 096 (= 050 + 060 + 064 + 068 + 072 + 080 + 084 + 092) — hors stocks/clients/dispo. */
export function gateTotal096ActifCirculantBrut(lignes: LignesSimplesResolution): GateTotalComposantesResult {
  return gateTotalSurComposantes("096", "Total II — Actif circulant (brut)", [
    { caseId: "064", resolution: lignes.avancesAcomptesVerses },
    { caseId: "080", resolution: lignes.valeursMobilieresPlacementBrut },
    { caseId: "092", resolution: lignes.chargesConstateesAvance },
  ]);
}

/** Composantes P1-B.2 du total 176 (= 156 + 164 + 166 + 172 + 173 + 174 + 175) — hors emprunts/fournisseurs. */
export function gateTotal176Dettes(lignes: LignesSimplesResolution): GateTotalComposantesResult {
  return gateTotalSurComposantes("176", "Total III — Dettes", [
    { caseId: "174", resolution: lignes.produitsConstatesAvance },
    { caseId: "175", resolution: lignes.autresDettes },
  ]);
}
