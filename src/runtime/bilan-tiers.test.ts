/**
 * MICRO-JALON socle patrimonial P0-1 — résolution des tiers (créances/dettes).
 * Run: npx tsx --test src/runtime/bilan-tiers.test.ts
 *
 * Corrige `tiers?.creances ?? 0` / `tiers?.dettes ?? 0` (audit indépendant) :
 * une absence de saisie (INCONNU) ne doit jamais devenir un montant nul.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveTiers } from "./capabilities/bilan/tiers";

describe("resolveTiers — NO SILENT ZERO", () => {
  it("tiers entièrement absent (undefined) : les deux postes sont INCONNU, jamais 0", () => {
    const res = resolveTiers(undefined);
    assert.equal(res.creances.status, "INCONNU");
    assert.equal(res.dettes.status, "INCONNU");
  });

  it("tiers renseigné vide ({}) : les deux postes restent INCONNU", () => {
    const res = resolveTiers({});
    assert.equal(res.creances.status, "INCONNU");
    assert.equal(res.dettes.status, "INCONNU");
  });

  it("un poste explicitement INCONNU reste INCONNU", () => {
    const res = resolveTiers({ creances: { status: "INCONNU" }, dettes: { status: "INCONNU" } });
    assert.equal(res.creances.status, "INCONNU");
    assert.equal(res.dettes.status, "INCONNU");
  });

  it("NUL_CONFIRME : montant = 0, statut distinct d'INCONNU", () => {
    const res = resolveTiers({ creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } });
    assert.equal(res.creances.status, "NUL_CONFIRME");
    assert.equal((res.creances as { montant: number }).montant, 0);
    assert.equal(res.dettes.status, "NUL_CONFIRME");
    assert.equal((res.dettes as { montant: number }).montant, 0);
  });

  it("DECLARE : montant retenu tel quel", () => {
    const res = resolveTiers({ creances: { status: "DECLARE", montant: 1500 }, dettes: { status: "DECLARE", montant: 800 } });
    assert.equal(res.creances.status, "DECLARE");
    assert.equal((res.creances as { montant: number }).montant, 1500);
    assert.equal((res.dettes as { montant: number }).montant, 800);
  });

  it("un poste déclaré, l'autre inconnu : chaque poste est résolu indépendamment", () => {
    const res = resolveTiers({ creances: { status: "DECLARE", montant: 1500 } });
    assert.equal(res.creances.status, "DECLARE");
    assert.equal(res.dettes.status, "INCONNU", "dettes absent de l'objet d'entrée → INCONNU, jamais 0");
  });
});
