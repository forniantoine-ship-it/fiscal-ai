/**
 * MICRO-JALON socle patrimonial P0 — report à nouveau (134).
 * Run: npx tsx --test src/runtime/bilan-ran.test.ts
 * Scénario R6 (contrat P0 §21) + interdictions §9/§23.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveRan } from "./capabilities/bilan/ran";

describe("resolveRan", () => {
  it("C1 — dossier Fiscal AI natif : 134 = 0, toujours, aucun RAN artificiel", () => {
    const res = resolveRan({ situation: "NATIF" });
    assert.equal(res.disponible, true);
    assert.equal(res.valeur, 0);
  });

  it("R6 — C2 dossier historique importé, RAN fourni explicitement : valeur conservée telle quelle", () => {
    const res = resolveRan({ situation: "IMPORTE", importedRAN: 4521.37, source: "bilan N-1 fourni par l'expert-comptable" });
    assert.equal(res.disponible, true);
    assert.equal(res.valeur, 4521.37);
  });

  it("C2 dossier historique importé, RAN NON fourni : indisponible, jamais supposé nul (contrairement à C1)", () => {
    const res = resolveRan({ situation: "IMPORTE" });
    assert.equal(res.disponible, false);
  });

  it("C3 reprise historique, valeur de reprise fournie : conservée telle quelle", () => {
    const res = resolveRan({ situation: "REPRISE_HISTORIQUE", importedRAN: -1200 });
    assert.equal(res.disponible, true);
    assert.equal(res.valeur, -1200);
  });

  it("C3 reprise historique sans valeur : indisponible", () => {
    const res = resolveRan({ situation: "REPRISE_HISTORIQUE" });
    assert.equal(res.disponible, false);
  });

  it("interdiction : jamais une valeur dérivée du déficit fiscal ou de l'ARD — la fonction n'accepte même pas ces champs en entrée", () => {
    // Preuve structurelle : RanInputs n'expose aucun champ deficit/ARD, donc
    // aucune valeur fiscale ne peut être injectée ici même par erreur.
    const res = resolveRan({ situation: "NATIF" });
    assert.equal(Object.keys(res).sort().join(","), "disponible,raison,valeur");
  });
});
