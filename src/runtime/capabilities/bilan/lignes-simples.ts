import { resolveLignePatrimoniale } from "./ligne-patrimoniale";
import type {
  LignePatrimonialeInput,
  LignePatrimonialeResolution,
  LignesSimplesInputs,
  LignesSimplesResolution,
} from "./types";
import type { TotalCapitauxPropresResolution } from "./total-capitaux-propres";

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

/**
 * Chantier 2C — gate 044 (colonne Brut).
 * Formule Cerfa : `044 = 010 + 014 + 028 + 040`. 010 (Fonds commercial, brut)
 * est catégoriquement 0 pour un LMNP (`non_applicable` structurel dans
 * `map-2033a.ts`, jamais une absence de donnée) — hors composantes de cette
 * gate, comme 052/062 le sont pour `gateTotal098`. 014/040 proviennent de
 * `lignesSimples` (G2). 028 (immobilisations corporelles, brut) provient du
 * registre patrimonial/legacy (`map-2033a.ts`, même mécanisme que 030 pour
 * 048) — jamais une composante `lignesSimples` : nécessite un flag de
 * publication réelle (`case028Published`), même doctrine que
 * `case030Published`/`case086Published` pour 048/098. Avant cette
 * correction, cette gate ignorait totalement 028 : un dossier où 028 est
 * bloquée (divergence F-010/F-014, absence de `valeurTerrain`) aurait pu
 * être déclaré `COMPOSANTES_CONNUES` alors qu'une composante réelle du
 * total est absente.
 */
export function gateTotal044ActifImmobiliseBrut(
  lignes: LignesSimplesResolution,
  case028Published: boolean,
  case028Raison?: string,
): GateTotalComposantesResult {
  const gateLignes = gateTotalSurComposantes("044", "Total I — Actif immobilisé (brut)", [
    { caseId: "014", resolution: lignes.autresImmobilisationsIncorporellesBrut },
    { caseId: "040", resolution: lignes.immobilisationsFinancieresBrut },
  ]);
  if (gateLignes.status === "BLOQUE") {
    return gateLignes;
  }
  if (!case028Published) {
    return {
      status: "BLOQUE",
      casesInconnues: ["028"],
      raison: `Total 044 (Total I — Actif immobilisé (brut)) non publiable : composante 028 non publiable${case028Raison ? ` — ${case028Raison}` : ""}. Absence de donnée ≠ zéro ; ne jamais sommer les valeurs disponibles partiellement.`,
    };
  }
  return { status: "COMPOSANTES_CONNUES" };
}

/**
 * @deprecated Superseded par `gateTotal096AvecVentilation` (ventilation-tiers.ts,
 * chantier 2C), qui couvre en plus 068/072 (ventilationTiers, publiées
 * depuis G2) et applique la réconciliation `resolveCaseAvecVentilationPrioritaire`
 * pour 064/092 — cette version ignore 068/072 et n'utilise que la résolution
 * brute `lignesSimples`, jamais la valeur réellement publiée par le mapper
 * quand une ventilation existe. Conservée pour compatibilité de ses propres
 * tests unitaires, ne pas réutiliser pour un nouveau câblage.
 */
export function gateTotal096ActifCirculantBrut(lignes: LignesSimplesResolution): GateTotalComposantesResult {
  return gateTotalSurComposantes("096", "Total II — Actif circulant (brut)", [
    { caseId: "064", resolution: lignes.avancesAcomptesVerses },
    { caseId: "080", resolution: lignes.valeursMobilieresPlacementBrut },
    { caseId: "092", resolution: lignes.chargesConstateesAvance },
  ]);
}

/**
 * @deprecated Superseded par `gateTotal176AvecVentilation` (ventilation-tiers.ts,
 * chantier 2C), qui couvre en plus 164/166/172/173 (ventilationTiers, publiées
 * depuis G2) et applique la réconciliation `resolveCaseAvecVentilationPrioritaire`
 * pour 174/175. Conservée pour compatibilité de ses propres tests unitaires,
 * ne pas réutiliser pour un nouveau câblage.
 */
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

/**
 * Chantier 2D-E1 — gate 110 (colonne Brut).
 * Formule Cerfa : `110 = 044 + 096` (Total général actif = Total I + Total
 * II, colonne Brut — symétrique de 112 côté Amortissements-Provisions).
 * Jamais déduit de 112/180 : `(110 − 112) = 180` n'est qu'un contrôle
 * d'équilibre a posteriori (`check-bilan-equilibre.ts`), jamais un chemin de
 * calcul — et `checkBilanEquilibre().totalActifBrut` n'est JAMAIS une source
 * pour 110 : cette valeur appartient exclusivement au mécanisme de contrôle
 * (reconstruction locale distincte, composantes différentes), jamais à la
 * production d'une case Cerfa.
 *
 * Ne recalcule PAS 044/096 : consomme leur gate déjà résolue par l'appelant
 * ET un flag de publication réelle (`case044Published`/`case096Published`),
 * même doctrine que `case048Published`/`case098Published` pour 112. 110
 * n'est publiable que si les DEUX totaux sont réellement publiables —
 * jamais une somme partielle.
 */
export function gateTotal110(
  gate044: GateTotalComposantesResult,
  gate096: GateTotalComposantesResult,
  case044Published: boolean,
  case096Published: boolean,
): GateTotalComposantesResult {
  const raison044 =
    gate044.status === "BLOQUE" ? gate044.raison : !case044Published ? "composante 044 non publiée par le mapper." : undefined;
  const raison096 =
    gate096.status === "BLOQUE" ? gate096.raison : !case096Published ? "composante 096 non publiée par le mapper." : undefined;

  if (raison044 !== undefined && raison096 !== undefined) {
    return {
      status: "BLOQUE",
      casesInconnues: ["044", "096"],
      raison: `Total 110 (Total général actif (I + II) (brut)) non publiable : composantes 044 et 096 non publiables — ${raison044} ${raison096} Absence de donnée ≠ zéro ; 110 ne peut jamais être déduit de 112/180.`,
    };
  }
  if (raison044 !== undefined) {
    return {
      status: "BLOQUE",
      casesInconnues: ["044"],
      raison: `Total 110 (Total général actif (I + II) (brut)) non publiable : composante 044 non publiable — ${raison044} Absence de donnée ≠ zéro ; 110 ne peut jamais être déduit de 112/180.`,
    };
  }
  if (raison096 !== undefined) {
    return {
      status: "BLOQUE",
      casesInconnues: ["096"],
      raison: `Total 110 (Total général actif (I + II) (brut)) non publiable : composante 096 non publiable — ${raison096} Absence de donnée ≠ zéro ; 110 ne peut jamais être déduit de 112/180.`,
    };
  }
  return { status: "COMPOSANTES_CONNUES" };
}

/**
 * Chantier 2D-E1 — gate 180 (colonne NET, Total général passif).
 * Formule Cerfa : `180 = 142 + 154 + 176`. 154 (Provisions pour risques et
 * charges) est catégoriquement 0 pour le produit actuel (aucune provision
 * modélisée, `non_applicable` structurel — voir `map-2033a.ts`,
 * `toujoursBloquees`) : jamais une composante calculée, jamais un faux 0
 * publié — simplement hors de la somme opérationnelle, exactement comme
 * 010/050/060 le sont déjà pour 044/096 et 173 pour 176.
 *
 * 142 (Total I — Capitaux propres) ne provient pas d'une
 * `GateTotalComposantesResult` mais de `resolveTotalCapitauxPropres()`
 * (total-capitaux-propres.ts, correction P1-A) — statut
 * `TotalCapitauxPropresResolution` distinct (`DISPONIBLE`/`BLOQUE`),
 * consommé tel quel, jamais recalculé ici. `checkBilanEquilibre().totalPassif`
 * n'est JAMAIS une source pour 180, pour la même raison que pour 110 :
 * reconstruction locale distincte réservée au contrôle d'équilibre.
 *
 * Ne recalcule PAS 142/176 : consomme leur résolution déjà faite par
 * l'appelant ET un flag de publication réelle (`case142Published`/
 * `case176Published`), même doctrine que pour 048/098/110/112.
 */
export function gateTotal180(
  totalCapitauxPropres: TotalCapitauxPropresResolution,
  gate176: GateTotalComposantesResult,
  case142Published: boolean,
  case176Published: boolean,
): GateTotalComposantesResult {
  const raison142 =
    totalCapitauxPropres.status === "BLOQUE"
      ? totalCapitauxPropres.raison
      : !case142Published
        ? "composante 142 non publiée par le mapper."
        : undefined;
  const raison176 =
    gate176.status === "BLOQUE" ? gate176.raison : !case176Published ? "composante 176 non publiée par le mapper." : undefined;

  if (raison142 !== undefined && raison176 !== undefined) {
    return {
      status: "BLOQUE",
      casesInconnues: ["142", "176"],
      raison: `Total 180 (Total général passif (I + II + III)) non publiable : composantes 142 et 176 non publiables — ${raison142} ${raison176} Absence de donnée ≠ zéro.`,
    };
  }
  if (raison142 !== undefined) {
    return {
      status: "BLOQUE",
      casesInconnues: ["142"],
      raison: `Total 180 (Total général passif (I + II + III)) non publiable : composante 142 non publiable — ${raison142} Absence de donnée ≠ zéro.`,
    };
  }
  if (raison176 !== undefined) {
    return {
      status: "BLOQUE",
      casesInconnues: ["176"],
      raison: `Total 180 (Total général passif (I + II + III)) non publiable : composante 176 non publiable — ${raison176} Absence de donnée ≠ zéro.`,
    };
  }
  return { status: "COMPOSANTES_CONNUES" };
}
