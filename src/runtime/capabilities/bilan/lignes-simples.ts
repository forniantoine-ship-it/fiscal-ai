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
      "Autres immobilisations incorporelles amortissements-provisions (case 016)",
    ),
    immobilisationsFinancieresBrut: resolveLignePatrimonialeOuverte(
      inputs?.immobilisationsFinancieresBrut,
      "Immobilisations financières brut (case 040)",
    ),
    immobilisationsFinancieresNet: resolveLignePatrimonialeOuverte(
      inputs?.immobilisationsFinancieresNet,
      "Immobilisations financières amortissements-provisions (case 042)",
    ),
    avancesAcomptesVerses: resolveLignePatrimonialeOuverte(
      inputs?.avancesAcomptesVerses,
      "Avances et acomptes versés (case 064)",
    ),
    avancesAcomptesVersesAmort: resolveLignePatrimonialeOuverte(
      inputs?.avancesAcomptesVersesAmort,
      "Avances et acomptes versés amortissements-provisions (case 066)",
    ),
    clientsAmortissementsProvisions: resolveLignePatrimonialeOuverte(
      inputs?.clientsAmortissementsProvisions,
      "Clients amortissements-provisions (case 070)",
    ),
    autresCreancesAmortissementsProvisions: resolveLignePatrimonialeOuverte(
      inputs?.autresCreancesAmortissementsProvisions,
      "Autres créances amortissements-provisions (case 074)",
    ),
    valeursMobilieresPlacementBrut: resolveLignePatrimonialeOuverte(
      inputs?.valeursMobilieresPlacementBrut,
      "Valeurs mobilières de placement brut (case 080)",
    ),
    valeursMobilieresPlacementNet: resolveLignePatrimonialeOuverte(
      inputs?.valeursMobilieresPlacementNet,
      "Valeurs mobilières de placement amortissements-provisions (case 082)",
    ),
    chargesConstateesAvance: resolveLignePatrimonialeOuverte(
      inputs?.chargesConstateesAvance,
      "Charges constatées d'avance (case 092)",
    ),
    chargesConstateesAvanceAmort: resolveLignePatrimonialeOuverte(
      inputs?.chargesConstateesAvanceAmort,
      "Charges constatées d'avance amortissements-provisions (case 094)",
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

/**
 * P1-PDF-02-F4-C — gate 048 (colonne Amortissements-Provisions).
 * Formule Cerfa : `048 = 016 + 030 + 042`.
 * 030 provient du registre d'immobilisations corporelles (hors P1-B.2) ;
 * 016/042 proviennent de `lignesSimples`. Ne somme jamais les bruts 014/028/040.
 */
export function gateTotal048(
  lignes: LignesSimplesResolution,
  case030Published: boolean,
  case030Raison?: string,
): GateTotalComposantesResult {
  const gateLignes = gateTotalSurComposantes("048", "Total I — Actif immobilisé (amortissements-provisions)", [
    { caseId: "016", resolution: lignes.autresImmobilisationsIncorporellesNet },
    { caseId: "042", resolution: lignes.immobilisationsFinancieresNet },
  ]);
  if (gateLignes.status === "BLOQUE") {
    return gateLignes;
  }
  if (!case030Published) {
    return {
      status: "BLOQUE",
      casesInconnues: ["030"],
      raison: `Total 048 (Total I — Actif immobilisé (amortissements-provisions)) non publiable : composante 030 non publiable${case030Raison ? ` — ${case030Raison}` : ""}. Absence de donnée ≠ zéro ; ne jamais sommer les valeurs disponibles partiellement.`,
    };
  }
  return { status: "COMPOSANTES_CONNUES" };
}

/**
 * P1-PDF-02-F4-C — gate 098 (colonne Amortissements-Provisions).
 * Formule Cerfa LMNP : `098 = 066 + 070 + 074 + 082 + 086 + 094`.
 *
 * Cases 052/062 (stocks/marchandises, colonne net/amort) : structurellement
 * `non_applicable` pour un LMNP réel simplifié — preuve explicite dans
 * `map-2033a.ts` (`toujoursBloquees`, catégorie `non_applicable`, libellé
 * « aucun stock / aucune marchandise dans une activité de location meublée »).
 * Elles ne sont donc PAS des composantes de cette gate : aucune donnée métier
 * n'est requise pour les traiter comme hors périmètre (≠ zéro implicite sur un
 * poste ouvert).
 *
 * 086 provient de `disponibilitesAmortissementsProvisions` ou de la règle F2
 * (084=0 ⇒ 086=0 publié) — `case086Published` reflète la feuille réellement
 * publiée par le mapper, pas le brut 084.
 */
export function gateTotal098(
  lignes: LignesSimplesResolution,
  case086Published: boolean,
  case086Raison?: string,
): GateTotalComposantesResult {
  const gateLignes = gateTotalSurComposantes("098", "Total II — Actif circulant (amortissements-provisions)", [
    { caseId: "066", resolution: lignes.avancesAcomptesVersesAmort },
    { caseId: "070", resolution: lignes.clientsAmortissementsProvisions },
    { caseId: "074", resolution: lignes.autresCreancesAmortissementsProvisions },
    { caseId: "082", resolution: lignes.valeursMobilieresPlacementNet },
    { caseId: "094", resolution: lignes.chargesConstateesAvanceAmort },
  ]);
  if (gateLignes.status === "BLOQUE") {
    return gateLignes;
  }
  if (!case086Published) {
    return {
      status: "BLOQUE",
      casesInconnues: ["086"],
      raison: `Total 098 (Total II — Actif circulant (amortissements-provisions)) non publiable : composante 086 non publiable${case086Raison ? ` — ${case086Raison}` : ""}. La trésorerie brute (084) connue ne suffit pas ; absence de provision ≠ zéro.`,
    };
  }
  return { status: "COMPOSANTES_CONNUES" };
}

/**
 * P1-PDF-02-F4-D — gate 112 (colonne Amortissements-Provisions).
 * Formule Cerfa : `112 = 048 + 098` (Total général actif = Total I + Total
 * II, même colonne). Jamais `112 = 110 − 180` — cette relation n'est qu'un
 * contrôle d'équilibre croisé a posteriori (`check-bilan-equilibre.ts`),
 * jamais un chemin de calcul.
 *
 * Ne recalcule PAS 048/098 : consomme leur gate déjà résolue par l'appelant
 * ET un flag de publication réelle (`case048Published`/`case098Published`,
 * même doctrine que `case030Published`/`case086Published` pour 048/098 —
 * une gate `COMPOSANTES_CONNUES` ne suffit jamais seule, il faut que la case
 * ait réellement été produite par le mapper). 112 n'est publiable que si les
 * DEUX totaux sont réellement publiables — jamais une somme partielle.
 */
export function gateTotal112(
  gate048: GateTotalComposantesResult,
  gate098: GateTotalComposantesResult,
  case048Published: boolean,
  case098Published: boolean,
): GateTotalComposantesResult {
  const raison048 =
    gate048.status === "BLOQUE" ? gate048.raison : !case048Published ? "composante 048 non publiée par le mapper." : undefined;
  const raison098 =
    gate098.status === "BLOQUE" ? gate098.raison : !case098Published ? "composante 098 non publiée par le mapper." : undefined;

  if (raison048 !== undefined && raison098 !== undefined) {
    return {
      status: "BLOQUE",
      casesInconnues: ["048", "098"],
      raison: `Total 112 (Total général actif (I + II) (amortissements-provisions)) non publiable : composantes 048 et 098 non publiables — ${raison048} ${raison098} Absence de donnée ≠ zéro ; 112 ne peut jamais être déduit de 110 − 180.`,
    };
  }
  if (raison048 !== undefined) {
    return {
      status: "BLOQUE",
      casesInconnues: ["048"],
      raison: `Total 112 (Total général actif (I + II) (amortissements-provisions)) non publiable : composante 048 non publiable — ${raison048} Absence de donnée ≠ zéro ; 112 ne peut jamais être déduit de 110 − 180.`,
    };
  }
  if (raison098 !== undefined) {
    return {
      status: "BLOQUE",
      casesInconnues: ["098"],
      raison: `Total 112 (Total général actif (I + II) (amortissements-provisions)) non publiable : composante 098 non publiable — ${raison098} Absence de donnée ≠ zéro ; 112 ne peut jamais être déduit de 110 − 180.`,
    };
  }
  return { status: "COMPOSANTES_CONNUES" };
}
