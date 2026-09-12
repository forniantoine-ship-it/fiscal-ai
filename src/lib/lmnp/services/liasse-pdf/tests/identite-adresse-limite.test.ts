/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/identite-adresse-limite.test.ts
 *
 * Section 7 de la mission de sécurisation P0 — documentation, PAS refactor
 * du modèle d'identité (`IdentiteDeclarante.adresseEntreprise` reste une
 * chaîne unique, inchangée).
 *
 * ------------------------------------------------------------------------
 * CE QUI EST ACTUELLEMENT RENDU
 * ------------------------------------------------------------------------
 * `A_ADRESSE_ENTREPRISE` écrit l'intégralité de `identite.adresseEntreprise`
 * sur UNE SEULE LIGNE, à la position mesurée de la ligne "Adresse de
 * l'entreprise :" (x=123.1, y=175.6 — voir registry/2031-sd/2026.ts).
 *
 * ------------------------------------------------------------------------
 * CE QUI N'EST PAS RENDU
 * ------------------------------------------------------------------------
 * Le Cerfa 2031-SD officiel réserve, juste en dessous de cette ligne
 * (y≈194.7), une SECONDE ligne pour code postal + ville — visible sur le
 * dossier témoin réel ("29600" et "Saint-Martin-Des-Champs" à cette
 * position, séparés de "15 Rue Saint-Germain"). `IdentiteDeclarante` ne
 * porte qu'un seul champ `adresseEntreprise` : le code postal et la ville
 * n'existent nulle part séparément dans ce type (voir
 * src/runtime/capabilities/f007/types.ts) — cette couche PDF ne peut donc
 * ni les extraire, ni les positionner sur cette seconde ligne, sans changer
 * le modèle de données, hors périmètre strict de cette mission.
 *
 * ------------------------------------------------------------------------
 * ACCEPTABLE TEMPORAIREMENT ?
 * ------------------------------------------------------------------------
 * Oui, avec une réserve précise : tant que `adresseEntreprise` reste courte
 * (rue + code postal + ville tenant sur ~28 caractères à la taille 9, la
 * largeur calibrée de 170pt), le rendu reste lisible sur une seule ligne
 * bien que non conforme à la mise en page officielle à deux lignes. Au-delà,
 * la generation gate bloque déjà (débordement, jamais une troncature
 * silencieuse) — voir le test ci-dessous, qui prouve ce filet de sécurité
 * plutôt que de le supposer.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { checkOverflow } from "../gate/generation-gate";
import { resolveVisualMapping } from "../registry";
import type { CerfaCase } from "../types";

describe("Identité / adresse — limite connue, documentée, pas silencieuse", () => {
  it("le registre confirme une seule ligne pour A_ADRESSE_ENTREPRISE (pas de seconde entrée pour code postal/ville)", () => {
    const mapping = resolveVisualMapping("2031-SD", 2026, "A_ADRESSE_ENTREPRISE");
    assert.ok(mapping);
    assert.equal(mapping?.calibration, "mesure-empirique");
    // Aucune case "A_CODE_POSTAL_ENTREPRISE" ou équivalent n'existe — le
    // modèle IdentiteDeclarante ne les distingue pas séparément.
    assert.equal(resolveVisualMapping("2031-SD", 2026, "A_CODE_POSTAL_ENTREPRISE"), undefined);
    assert.equal(resolveVisualMapping("2031-SD", 2026, "A_VILLE_ENTREPRISE"), undefined);
  });

  it("une adresse complète raisonnable (rue + code postal + ville, telle qu'un mapper amont pourrait la concaténer un jour) ne déborde pas de la largeur calibrée", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const mapping = resolveVisualMapping("2031-SD", 2026, "A_ADRESSE_ENTREPRISE")!;
    const caseValue: CerfaCase = {
      caseId: "A_ADRESSE_ENTREPRISE",
      label: "Adresse de l'entreprise",
      value: "15 Rue Saint-Germain 29600",
      trace: { source: "IdentiteDeclarante", path: "test", ksArtifacts: [] },
    };
    const violation = checkOverflow({ form: "2031-SD", caseValue, mapping, font });
    assert.equal(violation, undefined, "une adresse raisonnable ne doit pas déborder");
  });

  it("une adresse anormalement longue (rue + ville longue concaténées) EST détectée en débordement - jamais une perte silencieuse d'information", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const mapping = resolveVisualMapping("2031-SD", 2026, "A_ADRESSE_ENTREPRISE")!;
    const caseValue: CerfaCase = {
      caseId: "A_ADRESSE_ENTREPRISE",
      label: "Adresse de l'entreprise",
      value: "15 Rue Saint-Germain 29600 Saint-Martin-Des-Champs (complément très long)",
      trace: { source: "IdentiteDeclarante", path: "test", ksArtifacts: [] },
    };
    const violation = checkOverflow({ form: "2031-SD", caseValue, mapping, font });
    assert.ok(violation, "une adresse trop longue doit être détectée par la gate plutôt que tronquée en silence");
    assert.equal(violation?.code, "debordement-largeur");
  });
});
