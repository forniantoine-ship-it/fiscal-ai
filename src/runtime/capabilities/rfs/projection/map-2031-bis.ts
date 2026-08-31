import type { FiscalRepresentation } from "../types";
import type { CaseTrace, CerfaCase } from "../../f007/types";
import { round2 } from "../../f007/types";

/**
 * Projection Cerfa 2031 Bis-SD (Annexe au 2031-SD — Cadre I, BIC non
 * professionnels) — consomme UNIQUEMENT `rfs.fiscalResult`. Aucun appel à
 * produceFiscalResult()/applyAmortissementStocks(), aucune lecture directe
 * d'assistant F-010/F-011/F-012/F-013/F-014, aucun accès FEC.
 *
 * Cycle 41-44 — hors périmètre ADR-004 au sens strict (ADR-004 ne liste que
 * 2031-SD/2033-A/B/C/D) : ajouté après audit explicite (Cycle 41), le
 * formulaire officiel confirme (Cycle 42, notice DGFiP millésime 2026) que le
 * Cadre I vise exactement le profil LMNP réel simplifié ciblé par le produit.
 *
 * La ligne « Autres locations meublées non professionnelles » ne porte aucun
 * code Cerfa numéroté sur le formulaire officiel (vérifié positionnellement
 * sur le PDF officiel, Cycle 44) — seules les cases 7a/7b (déjà couvertes par
 * `I_7A`/`I_7B` de `map-2031-recapitulation.ts`) portent un identifiant
 * numéroté. L'identifiant `I_AUTRES_LMNP_*` suit la même convention que
 * `I_7A`/`I_7B` (préfixe du cadre officiel), sans inventer de code.
 *
 * Périmètre volontairement restreint (Cycles 42-43) : aucune source officielle
 * (BOI-BIC-DEF-10, BOI-BIC-DEF-20-10, notice DGFiP, recherche documentaire) ne
 * confirme la formule reliant cette ligne à `fiscalResult.deficitsImputes`
 * quand un déficit antérieur est imputé cette année. La ligne n'est donc
 * alimentée que lorsque `deficitsImputes === 0` (auquel cas la valeur avant et
 * après imputation coïncident nécessairement) — jamais par
 * `resultatFiscal + deficitsImputes`, formule non prouvée. Voir
 * `rfs-2031-bis.test.ts` pour la preuve.
 */

export type CerfaCaseNonAlimenteeCategorie =
  | "donnee_absente"
  | "incoherence_modele"
  | "hors_perimetre"
  | "non_applicable";

export type CerfaCaseNonAlimentee = {
  caseId: string;
  label: string;
  raison: string;
  categorie: CerfaCaseNonAlimenteeCategorie;
};

export type Form2031Bis = {
  formId: "2031-Bis-SD";
  millésime: number;
  cases: CerfaCase[];
  /** Jamais une valeur inventée : chaque case listée ici reste explicitement sans valeur, avec sa raison tracée. */
  casesNonAlimentees: CerfaCaseNonAlimentee[];
};

const LABEL_BENEFICE = "BIC non professionnels — Autres locations meublées non professionnelles (Bénéfice)";
const LABEL_DEFICIT = "BIC non professionnels — Autres locations meublées non professionnelles (Déficit)";

const RAISON_AMBIGUE =
  "Ligne 2031 Bis-SD non alimentée : la formule officielle reliant le résultat de l'activité avant imputation des déficits antérieurs au résultat fiscal après imputation n'est pas suffisamment établie.";

export function map2031BisFromRfs(rfs: FiscalRepresentation): Form2031Bis {
  const fr = rfs.fiscalResult;
  const baseTrace: Omit<CaseTrace, "path"> = { source: "FiscalResult", ksArtifacts: ["TRF-0032"] };

  const cases: CerfaCase[] = [];
  const casesNonAlimentees: CerfaCaseNonAlimentee[] = [];

  if (fr.deficitsImputes === 0) {
    // Aucun déficit antérieur imputé cette année : le résultat « avant » et
    // « après » imputation coïncident nécessairement — la valeur est un
    // pass-through direct, déjà utilisé et validé pour les cases I_7A/I_7B
    // du 2031-SD et 370/372 du 2033-B.
    if (fr.resultatFiscal > 0) {
      cases.push({
        caseId: "I_AUTRES_LMNP_BENEFICE",
        label: LABEL_BENEFICE,
        value: round2(fr.resultatFiscal),
        trace: { ...baseTrace, path: "fiscalResult.resultatFiscal", ksArtifacts: ["TRF-0032"] },
      });
    }
    if (fr.deficitNouveau > 0) {
      cases.push({
        caseId: "I_AUTRES_LMNP_DEFICIT",
        label: LABEL_DEFICIT,
        value: round2(fr.deficitNouveau),
        trace: { ...baseTrace, path: "fiscalResult.deficitNouveau", ksArtifacts: ["TRF-0031", "TRF-0032"] },
      });
    }
  } else {
    // deficitsImputes > 0 : la formule reliant cette ligne à resultatFiscal
    // n'est pas prouvée (Cycles 42-43) — jamais resultatFiscal + deficitsImputes.
    if (fr.resultatFiscal > 0) {
      casesNonAlimentees.push({ caseId: "I_AUTRES_LMNP_BENEFICE", label: LABEL_BENEFICE, raison: RAISON_AMBIGUE, categorie: "incoherence_modele" });
    }
    if (fr.deficitNouveau > 0) {
      casesNonAlimentees.push({ caseId: "I_AUTRES_LMNP_DEFICIT", label: LABEL_DEFICIT, raison: RAISON_AMBIGUE, categorie: "incoherence_modele" });
    }
  }

  return {
    formId: "2031-Bis-SD",
    millésime: rfs.exercice,
    cases,
    casesNonAlimentees,
  };
}
