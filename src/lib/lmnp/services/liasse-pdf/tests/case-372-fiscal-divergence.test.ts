/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/case-372-fiscal-divergence.test.ts
 *
 * ARCHIVÉ / RÉSOLU — correction fiscale P0 (audit indépendant Cursor/Grok),
 * conformément à l'instruction de tête de ce fichier avant correction :
 * « Ce test échoue intentionnellement dès que l'écart disparaît — c'est le
 * signal qu'il faut ARCHIVER ce fichier (pas le supprimer sans discussion),
 * pas une régression de la couche PDF. »
 *
 * L'écart est désormais RÉSOLU. Historique, pour mémoire :
 *
 *  - Le dossier de référence réel (Liasse-2025, JD2M, télétransmission EDI
 *    acceptée) affichait 0 sur 372/C_L1_COL2 : son logiciel neutralise le
 *    résultat LMNP non professionnel via une case 330 ("Divers à
 *    réintégrer") avant de l'écrire sur 370/372.
 *  - Le mapper Fiscal AI (`map-2033b.ts`, `map-2031-recapitulation.ts`)
 *    écrivait directement `fiscalResult.deficitNouveau` sur 372 et
 *    C_L1_COL2 — sans case 330 équivalente. Fiscalement incorrect : un
 *    déficit LMNP non professionnel (CGI art. 156-I-1° bis, AX-016 du
 *    Knowledge System) ne s'impute/reporte jamais via le circuit générique
 *    370/372, seulement via le circuit dédié 7a/7b (I_7A/I_7B).
 *
 * CORRECTION appliquée (mission "CORRECTION P0 FISCALE APRÈS AUDIT GROK") :
 *  - F-006 INCHANGÉ. `resultatFiscal = 0` / `deficitNouveau = 9862` restent
 *    la bonne représentation fiscale interne (TRF-0031, applyAmortissementStocks).
 *  - `map-2033b.ts` réintègre désormais `deficitNouveau` en case 330 et ne
 *    projette plus jamais 372 depuis `deficitNouveau` (372 lit désormais
 *    `resultatFiscal < 0`, jamais vrai avec le F-006 actuel).
 *  - `map-2031-recapitulation.ts` : C_L1_COL2 suit la même règle que 372
 *    (report de la case 372 du 2033-B-SD, jamais lecture indépendante de
 *    `deficitNouveau`) — I_7B reste inchangée (circuit dédié, correct).
 *
 * Ce fichier vérifie désormais que la correction TIENT (test de
 * non-régression), plutôt que de documenter la divergence.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assembleForm2031SD } from "@/runtime/capabilities/f007/assemble-form-2031";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";

import { isExcludedCase } from "../excluded-cases";
import { resolveVisualMapping } from "../registry";
import { buildDossierTemoinRfs } from "./golden-master-technical-pipeline.test";

describe("RÉSOLU — case 372 (2033-B) / C_L1_COL2 (2031-SD) ne reflètent plus le déficit LMNP", () => {
  it("le mapper produit désormais 330 = deficitNouveau (9862), et ne produit plus jamais 372 pour ce scénario déficitaire", () => {
    const rfs = buildDossierTemoinRfs();
    const form = map2033BFromRfs(rfs);

    const case330 = form.cases.find((c) => c.caseId === "330");
    assert.ok(case330, "330 doit désormais être produite (réintégration du déficit LMNP)");
    assert.equal(case330?.value, 9862, "330 porte exactement deficitNouveau, sans reformulation");

    const case372 = form.cases.find((c) => c.caseId === "372");
    assert.equal(case372, undefined, "372 ne doit plus jamais être produite pour un déficit LMNP (exige resultatFiscal<0)");
  });

  it("le mapper produit désormais C_L1_COL2 = undefined (2031-SD) pour ce scénario déficitaire — I_7B continue de porter le déficit LMNP, inchangée", () => {
    const rfs = buildDossierTemoinRfs();
    const { form } = assembleForm2031SD(rfs.fiscalResult, rfs.identite);

    const colonne2 = form.cases.find((c) => c.caseId === "C_L1_COL2");
    assert.equal(colonne2, undefined, "C_L1_COL2 ne doit plus jamais reporter deficitNouveau directement — même correction que 372");

    const i7b = form.cases.find((c) => c.caseId === "I_7B");
    assert.ok(i7b, "I_7B doit continuer de porter le déficit LMNP (circuit dédié, INCHANGÉ par cette correction)");
    assert.equal(i7b?.value, 9862);
  });

  it("330 est désormais géométriquement calibrée et rendue (MICRO-JALON calibration 330) — plus une exclusion", () => {
    // AVANT le micro-jalon de calibration, 330 était exclue du DESSIN
    // (position PDF non calibrée). Sa géométrie a depuis été démontrée
    // indépendamment (deux méthodes techniques sur l'asset officiel, voir
    // tests/position-oracle.test.ts) et ajoutée au registre — elle n'est
    // plus une exclusion.
    const excluded = isExcludedCase("2033-B-SD", 2026, "330");
    assert.equal(excluded, undefined, "330 ne doit plus être une exclusion (MICRO-JALON calibration 330)");
    assert.ok(resolveVisualMapping("2033-B-SD", 2026, "330"), "330 doit avoir une position calibrée dans le registre");
  });

  it("372 reste dans le périmètre de rendu géométrique (registre présent, aucune exclusion) — simplement jamais produite pour un déficit LMNP", () => {
    // Distinction préservée : 372 EST toujours géométriquement calibrée et
    // testée (position-oracle.test.ts) — elle n'est simplement plus jamais
    // exercée par le mapper corrigé pour un déficit LMNP (resultatFiscal
    // reste >=0 par construction F-006). Si F-006 produisait un jour un
    // résultat fiscal réellement négatif (hors LMNP, hypothèse non couverte
    // par le produit actuel), 372 continuerait de fonctionner correctement.
    assert.equal(isExcludedCase("2033-B-SD", 2026, "372"), undefined, "372 ne doit PAS être dans la liste des exclusions");
    assert.ok(resolveVisualMapping("2033-B-SD", 2026, "372"), "372 doit conserver une entrée de registre géométriquement valide");
  });
});
