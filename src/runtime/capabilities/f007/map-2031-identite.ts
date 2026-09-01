import type { CerfaCase, IdentiteDeclarante } from "./types";

function sirenFromIdentite(identite: IdentiteDeclarante): string | undefined {
  if (identite.siren?.trim()) return identite.siren.trim();
  if (identite.siret && identite.siret.length >= 9) return identite.siret.slice(0, 9);
  return undefined;
}

/**
 * TRF-0033 / 2031-SD — section A Identification (ENT-013).
 * Aucune transformation fiscale : report direct des données déclarant.
 */
export function map2031IdentiteCases(identite: IdentiteDeclarante): CerfaCase[] {
  const cases: CerfaCase[] = [];
  const traceBase = { source: "IdentiteDeclarante" as const, ksArtifacts: ["ENT-013", "TRF-0033"] };

  const siren = sirenFromIdentite(identite);
  if (siren) {
    cases.push({
      caseId: "A_SIREN",
      label: "SIREN",
      value: siren,
      trace: { ...traceBase, path: "siren|siret[0:9]" },
    });
  }

  if (identite.denomination) {
    cases.push({
      caseId: "A_DENOMINATION",
      label: "Dénomination de l'entreprise",
      value: identite.denomination,
      trace: { ...traceBase, path: "denomination" },
    });
  }

  if (identite.adresseEntreprise) {
    cases.push({
      caseId: "A_ADRESSE_ENTREPRISE",
      label: "Adresse de l'entreprise",
      value: identite.adresseEntreprise,
      trace: { ...traceBase, path: "adresseEntreprise" },
    });
  }

  if (identite.exerciceDebut) {
    cases.push({
      caseId: "A_EXERCICE_DEBUT",
      label: "Exercice ouvert le",
      value: identite.exerciceDebut,
      trace: { ...traceBase, path: "exerciceDebut" },
    });
  }

  if (identite.exerciceFin) {
    cases.push({
      caseId: "A_EXERCICE_FIN",
      label: "Exercice clos le",
      value: identite.exerciceFin,
      trace: { ...traceBase, path: "exerciceFin" },
    });
  }

  return cases;
}
