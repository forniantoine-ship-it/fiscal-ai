import { LIASSE_LMNP_REEL_SIMPLIFIE_ATTENDUE } from "../../f007/types";
import type { Form2031SD } from "../../f007/types";
import type { FiscalRepresentation } from "../types";
import { map2031FromRfs } from "./map-2031-from-rfs";
import { map2031BisFromRfs, type Form2031Bis } from "./map-2031-bis";
import { map2033AFromRfs, type Form2033A } from "./map-2033a";
import { map2033BFromRfs, type Form2033B } from "./map-2033b";
import { map2033CFromRfs, type Form2033C } from "./map-2033c";
import { map2033DFromRfs, type Form2033D } from "./map-2033d";

/**
 * Assemblage additif de la liasse depuis la RFS.
 *
 * Chemin PARALLÈLE à `produceLiasse()` (F-007) — celui-ci reste intact et
 * continue d'être le chemin de génération réel tant que ce nouveau module
 * n'est pas explicitement branché (cf. run-declaration-generation.ts). Cette
 * fonction ne fait qu'appeler les mappers déjà existants et testés
 * (`map2031FromRfs`, `map2033BFromRfs`) et composer leurs sorties — aucun
 * calcul fiscal, aucune reconstruction de FiscalResult.
 *
 * `formulairesManquants` reste la même logique de diff d'ensembles déjà
 * utilisée par `produceLiasse()` (LIASSE_LMNP_REEL_SIMPLIFIE_ATTENDUE moins
 * les formulaires réellement assemblés) — pas un second mécanisme concurrent.
 */
export type LiasseFromRfs = {
  exercice: number;
  form2031: Form2031SD;
  /**
   * Annexe hors périmètre ADR-004 (cf. Cycle 41) — volontairement absente de
   * `formulairesAttendus`/`formulairesGeneres`/`formulairesManquants`, qui
   * restent strictement le suivi des 5 formulaires ADR-004. Exposée ici en
   * champ additif, au même titre que `rfs.immobilisations`/`rfs.emprunts`.
   */
  form2031Bis: Form2031Bis;
  form2033A: Form2033A;
  form2033B: Form2033B;
  form2033C: Form2033C;
  /**
   * P3-LIASSE-1A — socle minimal honnête : formulaire présent (le mapper
   * s'exécute sans erreur), mais aucune case alimentée — voir map-2033d.ts.
   * Champ additif, au même titre que form2033A/B/C ci-dessus.
   */
  form2033D: Form2033D;
  formulairesAttendus: readonly string[];
  formulairesGeneres: string[];
  formulairesManquants: string[];
  trace: {
    ksArtifacts: string[];
    assembledAt: string;
    sourceFiscalResultAt: string;
  };
};

export function assembleLiasseFromRfs(rfs: FiscalRepresentation): LiasseFromRfs {
  const form2031 = map2031FromRfs(rfs);
  const form2031Bis = map2031BisFromRfs(rfs);
  const form2033A = map2033AFromRfs(rfs);
  const form2033B = map2033BFromRfs(rfs);
  const form2033C = map2033CFromRfs(rfs);
  const form2033D = map2033DFromRfs(rfs);

  const formulairesGeneres: string[] = [
    form2031.formId,
    form2033A.formId,
    form2033B.formId,
    form2033C.formId,
    form2033D.formId,
  ];
  const formulairesManquants = LIASSE_LMNP_REEL_SIMPLIFIE_ATTENDUE.filter(
    (id) => !formulairesGeneres.includes(id),
  );

  return {
    exercice: rfs.exercice,
    form2031,
    form2031Bis,
    form2033A,
    form2033B,
    form2033C,
    form2033D,
    formulairesAttendus: LIASSE_LMNP_REEL_SIMPLIFIE_ATTENDUE,
    formulairesGeneres,
    formulairesManquants,
    trace: {
      ksArtifacts: [...rfs.trace.ksArtifacts],
      assembledAt: new Date().toISOString(),
      sourceFiscalResultAt: rfs.trace.sourceFiscalResultAt,
    },
  };
}
