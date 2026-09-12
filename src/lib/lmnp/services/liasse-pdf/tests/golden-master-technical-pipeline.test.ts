/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/golden-master-technical-pipeline.test.ts
 *
 * ⚠️ CE TEST EST UN GOLDEN MASTER TECHNIQUE, PAS UN GOLDEN MASTER FISCAL.
 *
 * Il affirme UNE SEULE CHOSE : « le renderer PDF reproduit fidèlement, à la
 * position exacte du Cerfa officiel, les valeurs que produit le mapper
 * fiscal ACTUEL. » La case 350 a fait l'objet d'un jalon d'arbitrage dédié,
 * désormais tranché — voir `case-350-fiscal-arbitration.test.ts` : la règle
 * fiscale est verrouillée (`deficitsImputes`), seule sa position PDF reste à
 * calibrer (`GEOMETRIC_UNCERTAINTY`, plus une question fiscale ouverte).
 *
 * MISE À JOUR — CORRECTION FISCALE P0 (audit indépendant Cursor/Grok,
 * confirmée) : la divergence documentée par `case-372-fiscal-divergence.test.ts`
 * (le déficit LMNP non professionnel apparaissait à tort sur la case 372) a
 * été CORRIGÉE dans `map-2033b.ts`/`map-2031-recapitulation.ts` — F-006 n'a
 * PAS été modifié (`resultatFiscal=0`/`deficitNouveau=9862` restent la bonne
 * représentation fiscale interne), seule la destination Cerfa a changé : le
 * déficit LMNP est désormais réintégré en case 330 (CGI art. 156-I-1° bis,
 * AX-016), jamais projeté sur 372/C_L1_COL2. Ce golden master reflète
 * maintenant ce comportement corrigé. `case-372-fiscal-divergence.test.ts` a
 * été mis à jour en conséquence (voir ce fichier) plutôt que supprimé.
 *
 * Chaîne exacte exercée, aucun raccourci :
 *   FiscalResult (construit à la main, mêmes valeurs que le dossier réel)
 *     → FiscalRepresentation (RFS)
 *     → mappers fiscaux RÉELS et INCHANGÉS (`assembleForm2031SD`,
 *       `map2031BisFromRfs`, `map2033BFromRfs` — importés depuis
 *       `src/runtime`, jamais réimplémentés ici)
 *     → CerfaCase[]
 *     → `generateCerfaLiassePdf()` (ce module)
 *     → PDF réellement généré, re-ouvert et re-mesuré pour vérification.
 *
 * Référence : dossier réel Elsa Bouvard (Liasse-2025, JD2M), LMNP réel,
 * exercice du 01/02/2025 au 31/12/2025, déficitaire, télétransmission EDI
 * acceptée le 29/05/2026 (n° d'interchange 75014026013783) — voir l'audit
 * "Dossier témoin" pour le détail page par page.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assembleForm2031SD } from "@/runtime/capabilities/f007/assemble-form-2031";
import { map2031BisFromRfs } from "@/runtime/capabilities/rfs/projection/map-2031-bis";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

import { generateCerfaLiassePdf } from "../generator/render-cerfa-liasse";
import { extractDrawnStringsForPage } from "./extract-rendered-text";

// --- Reconstruction du FiscalResult du dossier témoin --------------------
// Mêmes valeurs que le dossier réel (Liasse-2025, page 5 "Formation du
// résultat fiscal" et page 1 "Synthèse") : recettes 5 100, amortissement
// calculé 3 720 intégralement reporté, déficit 9 862, aucun déficit
// antérieur (1ère année). Construit à la main comme le fait déjà
// `src/runtime/rfs-2033b.test.ts` — jamais via `produceFiscalResult()`, non
// nécessaire pour tester la couche PDF (qui ne consomme que la SORTIE des
// mappers, jamais le calcul lui-même).
export const DOSSIER_TEMOIN_FISCAL_RESULT: FiscalResult = {
  exercice: 2025,
  recettes: { total: 5100 },
  charges: {
    totalDeductible: 14963,
    chargesExploitation: 10361,
    chargesFinancement: 4602,
    chargesPreExploitation: 0,
    totalNonDeductible: 99,
  },
  resultatAvantAmort: -9862,
  amortCalcule: 3720,
  amortDeduct: 0,
  amortReporte: 3720,
  amortReportesUtilises: 0,
  resultatFiscal: 0,
  deficitNouveau: 9862,
  deficitsImputes: 0,
  perteExceptionnelle: 0,
  stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
  trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-05-01T00:00:00.000Z", journal: [] },
  status: "computed",
  anomalies: [],
};

export const DOSSIER_TEMOIN_IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "BOUVARD ELSA",
  adresseEntreprise: "15 Rue Saint-Germain",
  exerciceDebut: "01/02/2025",
  exerciceFin: "31/12/2025",
};

export function buildDossierTemoinRfs(): FiscalRepresentation {
  return {
    exercice: DOSSIER_TEMOIN_FISCAL_RESULT.exercice,
    identite: DOSSIER_TEMOIN_IDENTITE,
    fiscalResult: DOSSIER_TEMOIN_FISCAL_RESULT,
    trace: {
      ksArtifacts: DOSSIER_TEMOIN_FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2026-05-01T00:00:00.000Z",
      sourceFiscalResultAt: DOSSIER_TEMOIN_FISCAL_RESULT.trace.computedAt,
      sources: {
        identite: "IdentiteDeclarante (ENT-013)",
        fiscalResult: "FiscalResult (F-006)",
      },
    },
  };
}

describe("Golden master TECHNIQUE — pipeline PDF avec le mapper fiscal actuel (pas une validation fiscale)", () => {
  it("génère un PDF Cerfa officiel réel à partir des mappers fiscaux existants, sans aucune règle fiscale ajoutée par la couche PDF", async () => {
    const rfs = buildDossierTemoinRfs();

    // --- Mappers fiscaux RÉELS, INCHANGÉS ---------------------------------
    const { form: form2031SD } = assembleForm2031SD(rfs.fiscalResult, rfs.identite);
    const form2031Bis = map2031BisFromRfs(rfs);
    const form2033B = map2033BFromRfs(rfs);

    const result = await generateCerfaLiassePdf({
      millesime: 2026,
      forms: [
        { form: "2031-SD", cases: form2031SD.cases },
        { form: "2031-bis-SD", cases: form2031Bis.cases },
        { form: "2033-B-SD", cases: form2033B.cases },
      ],
    });

    if (result.status === "blocked") {
      assert.fail(`La génération a été bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    // --- Structure : 3 formulaires, 1 page chacun (2031-SD, 2031-bis, 2033-B) ---
    assert.deepEqual(result.forms, ["2031-SD", "2031-bis-SD", "2033-B-SD"]);
    assert.equal(result.pdfBytes.length > 0, true);

    // --- Exclusions attendues, documentées et visibles (jamais silencieuses) ---
    // MICRO-JALON calibration 330, puis 350, puis 300 : les trois positions
    // ont été démontrées et calibrées (registry/2033-b/2026.ts) — plus
    // aucune case exclue pour 2033-B-SD / millésime 2026.
    assert.equal(result.excludedCases.length, 0, "plus aucune case exclue — 330, 350 et 300 sont désormais calibrées et rendues");
    assert.ok(!result.excludedCases.some((e) => e.caseId === "330"), "330 ne doit plus apparaître dans excludedCases (MICRO-JALON calibration 330)");
    assert.ok(!result.excludedCases.some((e) => e.caseId === "350"), "350 ne doit plus apparaître dans excludedCases (MICRO-JALON implémentation 350)");
    assert.ok(!result.excludedCases.some((e) => e.caseId === "300"), "300 ne doit plus apparaître dans excludedCases (MICRO-JALON implémentation 300)");
    assert.deepEqual(result.excludedCases, []);

    // --- Page 1 (2031-SD) — extraction réelle du texte écrit ------------
    const page1Text = await extractDrawnStringsForPage(result.pdfBytes, 1);
    for (const digit of "104545108") {
      assert.ok(page1Text.includes(digit), `chiffre SIREN "${digit}" doit être présent (case à case)`);
    }
    assert.ok(page1Text.includes("BOUVARD ELSA"), "dénomination doit être extractible telle quelle");
    assert.ok(page1Text.includes("15 Rue Saint-Germain"), "adresse doit être extractible");
    assert.ok(page1Text.includes("01/02/2025"), "date d'ouverture d'exercice doit être extractible");
    assert.ok(page1Text.includes("31/12/2025"), "date de clôture d'exercice doit être extractible");
    assert.ok(page1Text.includes("X"), "case 'régime réel simplifié' doit être cochée (glyphe X)");
    // CORRIGÉ (audit fiscal P0) : C_L1_COL2 ne porte plus deficitNouveau — le
    // déficit LMNP n'apparaît plus qu'UNE SEULE fois sur le 2031-SD, case 7b
    // (I_7B), conforme désormais au dossier de référence (qui affiche 0 sur
    // C_L1, la case étant réintégrée via 330 du 2033-B-SD).
    const nineEightSixTwoCount = page1Text.filter((s) => s === "9 862").length;
    assert.equal(
      nineEightSixTwoCount,
      1,
      "9 862 doit apparaître UNE SEULE fois sur le 2031-SD désormais : case 7b (I_7B) — C_L1_COL2 n'est plus alimentée (correction fiscale P0)",
    );

    // --- Page 2 (2031-bis-SD) --------------------------------------------
    const page2Text = await extractDrawnStringsForPage(result.pdfBytes, 2);
    assert.ok(page2Text.includes("9 862"), "I_AUTRES_LMNP_DEFICIT doit reproduire le déficit LMNP");

    // --- Page 3 (2033-B-SD) — cases déjà vérifiées « au centime près » dans
    // le code du mapper lui-même, ici vérifiées de bout en bout jusqu'au PDF ---
    const page3Text = await extractDrawnStringsForPage(result.pdfBytes, 3);
    assert.ok(page3Text.includes("5 100"), "case 218/232 (production vendue / total produits)");
    assert.ok(page3Text.includes("3 720"), "cases 254/318 (dotations / réintégration amortissements)");
    assert.ok(page3Text.includes("14 180"), "case 264 (total charges d'exploitation)");
    assert.ok(page3Text.includes("(9 080)"), "case 270 (résultat d'exploitation) — négatif entre parenthèses, corrigé P0");
    assert.ok(page3Text.includes("4 602"), "case 294 (charges financières)");
    assert.ok(page3Text.includes("(13 681)"), "case 310 (résultat comptable) — négatif entre parenthèses, corrigé P0");
    assert.ok(page3Text.includes("13 681"), "case 314 (report du déficit comptable, col.2)");
    // CORRIGÉ (audit fiscal P0 + MICRO-JALON calibration 330) : 372
    // n'apparaît plus du tout sur le PDF (le mapper ne la produit plus pour
    // ce scénario déficitaire) — le déficit LMNP est désormais réintégré et
    // RENDU en case 330 (position calibrée et testée indépendamment, voir
    // tests/position-oracle.test.ts). "9 862" apparaît donc exactement UNE
    // fois sur cette page, portée par 330 — jamais par 372.
    assert.equal(
      page3Text.filter((s) => s === "9 862").length,
      1,
      "9 862 doit apparaître UNE SEULE fois sur le 2033-B-SD : case 330 (déficit LMNP réintégré) — jamais 372",
    );
    assert.ok(result.manifest.some((e) => e.caseId === "330" && e.text === "9 862"), "330 doit apparaître dans le manifeste de rendu avec la valeur 9 862");

    // MICRO-JALON implémentation 350 : le mapper produit TOUJOURS la case
    // 350 (deficitsImputes, jamais bloquée même à 0 — convention identique à
    // 218/254/300/318, voir map-2033b.ts). deficitsImputes=0 sur le dossier
    // témoin (aucun déficit antérieur, première année) : la convention
    // "eur-arrondi" existante (format-value.ts) ne transforme JAMAIS un zéro
    // en absence — elle dessine littéralement "0", exactement comme pour
    // n'importe quelle autre case toujours-alimentée. Ce test vérifie la
    // convention RÉELLEMENT utilisée, sans en inventer une nouvelle.
    assert.ok(page3Text.includes("0"), "350=0 (deficitsImputes) doit être réellement dessinée, convention identique aux autres cases toujours-alimentées");
    assert.ok(result.manifest.some((e) => e.caseId === "350" && e.text === "0"), "350 doit apparaître dans le manifeste de rendu avec la valeur '0'");

    // MICRO-JALON implémentation 300 : le mapper produit TOUJOURS la case
    // 300 (perteExceptionnelle, jamais bloquée même à 0 — même convention
    // que 218/254/318/350, voir map-2033b.ts, pass-through TRF-0027 INCHANGÉ
    // par ce jalon). perteExceptionnelle=0 sur le dossier témoin : "0" est
    // déjà couvert par l'assertion "0" ci-dessus (partagée avec 350) ; le
    // manifeste, lui, distingue précisément les deux cases par caseId.
    assert.ok(result.manifest.some((e) => e.caseId === "300" && e.text === "0"), "300 doit apparaître dans le manifeste de rendu avec la valeur '0'");

    // --- Manifeste : traçabilité de ce qui a été réellement dessiné ------
    assert.ok(
      result.manifest.every((entry) => entry.measuredWidth <= entry.maxWidth || entry.measuredWidth === 0),
      "aucune entrée du manifeste ne doit dépasser sa largeur calibrée (la gate l'aurait bloqué avant)",
    );
  });

  it("bloque la génération si une case du mapper n'a pas de mapping visuel NI d'exclusion documentée (jamais un PDF partiel silencieux)", async () => {
    const result = await generateCerfaLiassePdf({
      millesime: 2026,
      forms: [
        {
          form: "2033-B-SD",
          cases: [
            { caseId: "218", label: "x", value: 5100, trace: { source: "FiscalResult", path: "x", ksArtifacts: [] } },
            {
              caseId: "CASE_QUI_N_EXISTE_PAS",
              label: "x",
              value: 1,
              trace: { source: "FiscalResult", path: "x", ksArtifacts: [] },
            },
          ],
        },
      ],
    });
    assert.equal(result.status, "blocked");
  });

  it("une case absente du CerfaCase[] d'entrée n'apparaît jamais dans le PDF, même si le registre la connaît", async () => {
    // 254 (dotations aux amortissements) existe dans le registre mais n'est
    // volontairement pas fournie ici — elle ne doit jamais être "comblée".
    const result = await generateCerfaLiassePdf({
      millesime: 2026,
      forms: [
        {
          form: "2033-B-SD",
          cases: [
            { caseId: "218", label: "x", value: 5100, trace: { source: "FiscalResult", path: "x", ksArtifacts: [] } },
          ],
        },
      ],
    });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;
    const caseIds = result.manifest.map((m) => m.caseId);
    assert.ok(!caseIds.includes("254"), "254 ne doit jamais apparaître : absente du CerfaCase[] fourni");
  });
});
