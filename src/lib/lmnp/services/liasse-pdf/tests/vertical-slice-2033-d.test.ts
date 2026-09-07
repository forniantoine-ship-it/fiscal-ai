/**
 * P1-6B — Vertical slice 2033-D-SD / millésime 2026 : wrapper public
 * generateCerfa2033DFromRfs(), même patron de test que
 * vertical-slice-2033-c.test.ts (P1-3).
 *
 * "Néant" volontaire (déjà documenté dans map-2033d.ts, P3-LIASSE-1A) :
 * `Form2033D.cases` est typé `never[]` — TOUJOURS vide, quel que soit le
 * dossier. Ce fichier ne fabrique donc ni scénario "bénéfice/déficit" ni
 * "premier exercice/exercice ultérieur" (aucun n'a de sens pour un
 * formulaire dont le contenu ne dépend jamais des données fiscales), et ne
 * fabrique pas non plus de scénario "moteur bloqué" artificiel : ce wrapper
 * ne transmet jamais aucune `CerfaCase` au renderer, donc aucune violation
 * de contenu (débordement, case sans mapping) n'est structurellement
 * atteignable — voir le test dédié qui documente explicitement ce constat
 * plutôt que d'inventer un moyen de forcer un blocage inexistant.
 *
 * `rfs-2033d.test.ts` (existant, non dupliqué ici) couvre déjà
 * exhaustivement le contrat du MAPPER (map2033DFromRfs) au niveau RFS — ce
 * fichier-ci vérifie uniquement le CONTRAT DU WRAPPER PDF, avec une RFS
 * réelle issue de runDeclarationGeneration().
 *
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/vertical-slice-2033-d.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateCerfa2033DFromRfs } from "../generate-cerfa-2033d";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";

function draftBase(): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2025-03-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft;
}

describe("generateCerfa2033DFromRfs — vertical slice 2033-D-SD (P1-6B)", () => {
  it("cas nominal — RFS réelle (runDeclarationGeneration) : formulaire officiel généré, une page, page réellement copiée (taille non triviale)", async () => {
    const generation = runDeclarationGeneration(draftBase(), 2025);
    assert.equal(generation.status, "generated", "précondition — le fixture doit être générable");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2033DFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });

    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    assert.ok(result.pdfBytes.length > 0, "le PDF ne doit jamais être vide");
    // Signature %PDF- : preuve qu'un vrai PDF est produit, pas un contenu fabriqué.
    assert.equal(String.fromCharCode(...result.pdfBytes.slice(0, 5)), "%PDF-");
    assert.equal(result.pageCount, 1, "2033-D-SD occupe une seule page (page 4 de l'asset partagé)");
    assert.equal(result.form, "2033-D-SD");
    assert.equal(result.millesime, 2026);
    // Taille non triviale : preuve que la page officielle réelle (fond DGFiP)
    // a bien été copiée, pas un PDF vide fabriqué pour faire passer le test.
    assert.ok(result.sizeBytes > 1000, "la page officielle réelle doit être copiée, pas un PDF minimal artificiel");
  });

  it("contrat « Néant » : aucune case n'est jamais transmise au renderer, aucune entrée de manifeste — comportement volontaire du mapper, pas une absence de test", async () => {
    const generation = runDeclarationGeneration(draftBase(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2033DFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    assert.deepEqual(result.form2033D.cases, [], "Form2033D.cases est typé never[] — toujours vide par construction");
    assert.deepEqual(result.manifest, [], "aucune case transmise ⇒ aucune entrée de manifeste (rien n'est dessiné sur la page)");
    assert.ok(
      result.form2033D.casesNonAlimentees.length > 0,
      "les 3 cadres structurellement non applicables (provisions/amortissements dérogatoires/déficits reportables) doivent rester tracés avec leur raison, jamais silencieux",
    );
  });

  it("« moteur bloqué » n'est pas atteignable pour ce wrapper : aucune CerfaCase n'étant jamais transmise, aucune violation de contenu ne peut être déclenchée (constat documenté, pas un blocage fabriqué)", async () => {
    // Même avec des montants fiscaux extrêmes, le mapper ne produit toujours
    // aucune case (Form2033D.cases: never[]) — donc aucun débordement, aucune
    // case sans mapping ne peut jamais survenir via ce wrapper. Vérifié avec
    // les mêmes valeurs extrêmes qui bloquent réellement 2033-A/B/C/2031.
    const generation = runDeclarationGeneration(
      {
        ...draftBase(),
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 999999999999999999 } as never,
      },
      2025,
    );
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2033DFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated", "aucune donnée fiscale, même extrême, ne peut jamais bloquer ce wrapper : aucune case n'est jamais transmise au renderer");
  });

  it("délégation sans recalcul parallèle : deux appels avec la même RFS produisent le même PDF (SHA-256 identique)", async () => {
    const generation = runDeclarationGeneration(draftBase(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const first = await generateCerfa2033DFromRfs({ rfs: generation.rfs, declarationVersionId: "v1", generatedAt: "2026-01-01T00:00:00.000Z" });
    const second = await generateCerfa2033DFromRfs({ rfs: generation.rfs, declarationVersionId: "v1", generatedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(first.status, "generated");
    assert.equal(second.status, "generated");
    if (first.status !== "generated" || second.status !== "generated") return;

    assert.equal(first.sha256, second.sha256, "même RFS, même appel → même PDF octet pour octet");
  });
});
