import type { FiscalYear } from "@/lib/lmnp/types/domain";
import { isUsableExternalTakeoverOpening } from "@/lib/lmnp/services/fiscal-year-opening/is-usable-external-takeover-opening";

/** Resolve a pre-P0-2E scalar opening against the persisted, closed predecessor. */
export function repairLegacyTakeoverContinuity(
  current: FiscalYear,
  previous?: FiscalYear,
): FiscalYear {
  const opening = current.immobilisationsOuverture;
  if (!opening || !current.previousFiscalYearId ||
      current.repriseHistoriqueEnContinuite === true || current.continuiteNativeVerifiee === true ||
      opening.actifsReprise !== undefined) {
    return current;
  }

  const closure = previous?.closures?.at(-1);
  const predecessorProven = Boolean(
    previous && previous.id === current.previousFiscalYearId &&
    previous.dossierId && previous.dossierId === current.dossierId &&
    previous.year === current.year - 1 && previous.status === "closed" &&
    closure && closure.id === opening.sourceClosureId &&
    closure.fiscalYearId === previous.id && closure.dossierId === current.dossierId,
  );
  if (!predecessorProven || !previous || !closure) {
    return { ...current, declarationGeneratedAt: undefined };
  }

  const takeover = isUsableExternalTakeoverOpening(previous.externalTakeoverOpening?.opening, previous.year)
    || previous.repriseHistoriqueEnContinuite === true;
  if (!takeover) {
    return { ...current, continuiteNativeVerifiee: true };
  }

  const snapshot = closure.immobilisationsComptables;
  const sameCent = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.01;
  const coherent = Boolean(snapshot && Array.isArray(snapshot.actifs) && snapshot.actifs.length > 0 &&
    sameCent(snapshot.brutCloture, opening.brut) &&
    sameCent(snapshot.amortissementsCumulesCloture, opening.amortissementsCumules) &&
    sameCent(snapshot.vncCloture, opening.vnc));
  return {
    ...current,
    declarationGeneratedAt: undefined,
    repriseHistoriqueEnContinuite: true,
    immobilisationsOuverture: coherent && snapshot
      ? { ...opening, actifsReprise: snapshot.actifs.map((asset) => ({ ...asset })) }
      : opening,
  };
}
