import type { ImmobilisationsRfs } from "../rfs/types";
import { round2 } from "../f010/types";
import type { ActifImmobilise, RegistrePatrimonialImmobilisations } from "./types";
import {
  totalCumulComposantsDetail,
  totalDotationComposantsDetail,
} from "@/lib/lmnp/services/dossier/immobilisations-comptables";

/**
 * Unifie en UN SEUL registre :
 * `rfs.immobilisations.lignes` (F-010) + F-012 (`composantsDetail` Lot 5,
 * sinon `composantsNouveaux` en brut seul).
 *
 * Lot 5 — avec `composantsDetail`, brut ET net sont fiables.
 * Sans détail : brut reste sommable (ComposantNouveau.montant), net UNKNOWN
 * (comportement Cycle 37 / pré-Lot 5 préservé).
 *
 * `immo.montantMobilier` n'est JAMAIS additionné séparément (déjà dans lignes).
 */
export function assembleRegistreImmobilisationsPatrimoniales(input: {
  immobilisations?: ImmobilisationsRfs;
  amortCalcule: number;
}): RegistrePatrimonialImmobilisations {
  const { immobilisations: immo, amortCalcule } = input;

  if (immo === undefined) {
    return {
      actifs: [],
      brutTotal: undefined,
      cumuleTotal: undefined,
      netTotal: undefined,
      brutFiable: false,
      netFiable: false,
      raisons: [
        "rfs.immobilisations est absent — aucun plan d'amortissement disponible pour ce dossier (F-010 non encore exécuté ou non persisté).",
      ],
    };
  }

  const raisons: string[] = [];
  const actifs: ActifImmobilise[] = immo.lignes.map((ligne) => {
    const anchoredId =
      typeof ligne.id === "string" && ligne.id.length > 0 && !/^f010-\d+$/.test(ligne.id)
        ? ligne.id
        : undefined;
    return {
      // Lot 2B — id stable ancré ; sinon label (comportement historique F-010).
      id: anchoredId ?? ligne.label,
      categorie: "composant" as const,
      label: ligne.label,
      coutBrut: ligne.montant,
      dureeAnnees: ligne.dureeAnnees,
      amortissementCumule: ligne.amortissementsCumules,
      vnc: ligne.vnc,
      source: anchoredId
        ? "F-010 ancré (PlanLigne.id stable)"
        : "F-010 (AmortissementPlan.lignes)",
    };
  });

  const terrainFiable = typeof immo.valeurTerrain === "number";
  if (terrainFiable) {
    actifs.push({
      id: "terrain",
      categorie: "terrain",
      label: "Terrain",
      coutBrut: immo.valeurTerrain as number,
      amortissementCumule: 0,
      vnc: immo.valeurTerrain as number,
      source: "F-010 (valeurTerrain — jamais amorti)",
    });
  } else {
    raisons.push(
      "valeurTerrain absent de rfs.immobilisations (dossier ou fixture antérieur à son exposition) — le brut ne peut pas être reconstitué sans sous-évaluer silencieusement le terrain.",
    );
  }

  const f012Details = immo.composantsDetail ?? [];
  const composantsNouveaux = immo.composantsNouveaux ?? [];
  const hasDetail = f012Details.length > 0;
  const hasNouveauxSansDetail = composantsNouveaux.length > 0 && !hasDetail;

  if (hasDetail) {
    for (const d of f012Details) {
      actifs.push({
        id: d.id,
        categorie: "travaux",
        label: d.label,
        coutBrut: d.montant,
        dureeAnnees: d.dureeAnnees,
        dateEntree: d.dateDebut,
        amortissementCumule: d.amortissementsCumules,
        vnc: d.vnc,
        source: "F-012 (composantsDetail, assemblePlan)",
      });
    }
  } else {
    for (const c of composantsNouveaux) {
      actifs.push({
        id: c.id,
        categorie: "travaux",
        label: c.label,
        coutBrut: c.montant,
        dureeAnnees: c.dureeAnnees,
        dateEntree: c.dateDebut,
        amortissementCumule: undefined,
        vnc: undefined,
        source: "F-012 (ComposantNouveau, cumul non enrichi)",
      });
    }
    if (hasNouveauxSansDetail) {
      raisons.push(
        "Au moins un composant nouveau F-012 (travaux réintégrés en immobilisation) existe : son amortissement cumulé individuel n'est pas exposé à la RFS (composantsDetail absent) — le net reste non fiable. Le brut reste fiable : somme de ComposantNouveau.montant.",
      );
    }
  }

  const dotationF012 = hasDetail
    ? totalDotationComposantsDetail(f012Details)
    : 0;
  // Sans détail : garde historique (divergence = F014 vs F010 seul sans
  // composants connus) ; avec détail : F010 + Σ dotations détail.
  const expectedDotation = hasDetail
    ? immo.totalAnnuelExercice + dotationF012
    : hasNouveauxSansDetail
      ? amortCalcule // ne pas signaler divergence F010/F014 « inexpliquée » si F012 connus sans détail
      : immo.totalAnnuelExercice;
  const divergenceInexpliquee =
    !hasNouveauxSansDetail &&
    Math.abs(round2(amortCalcule - expectedDotation)) > 0.01;
  if (divergenceInexpliquee) {
    raisons.push(
      `fiscalResult.amortCalcule (${amortCalcule}) diverge de la composition RFS (${expectedDotation}) sans explication F-012 — brut ET net non fiables.`,
    );
  }

  const brutFiable = terrainFiable && !divergenceInexpliquee;
  const netFiable = brutFiable && !hasNouveauxSansDetail;

  const brutF012 = hasDetail
    ? f012Details.reduce((acc, d) => acc + d.montant, 0)
    : composantsNouveaux.reduce((acc, c) => acc + c.montant, 0);

  const brutTotal = brutFiable
    ? round2(immo.totalBrut + (immo.valeurTerrain as number) + brutF012)
    : undefined;
  const cumuleTotal = netFiable
    ? round2(
        immo.lignes.reduce((acc, l) => acc + l.amortissementsCumules, 0) +
          totalCumulComposantsDetail(f012Details),
      )
    : undefined;
  const netTotal =
    netFiable && brutTotal !== undefined && cumuleTotal !== undefined
      ? round2(brutTotal - cumuleTotal)
      : undefined;

  return { actifs, brutTotal, cumuleTotal, netTotal, brutFiable, netFiable, raisons };
}
