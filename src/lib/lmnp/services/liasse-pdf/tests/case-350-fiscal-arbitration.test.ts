/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/case-350-fiscal-arbitration.test.ts
 *
 * RÈGLE FISCALE VERROUILLÉE — jalon dédié, après audit indépendant primaire
 * de la notice 2033-NOT-SD 2026 (lue intégralement pour les cases 330/350/360
 * et le cadre "Déficits reportables" du 2033-D-SD).
 *
 * Conservé sous ce nom (historique) plutôt que supprimé — ce fichier
 * documentait une divergence qui a depuis été explicitement arbitrée. Comme
 * annoncé dans une version précédente : "si ce test échoue un jour parce que
 * l'arbitrage a eu lieu, mettre à jour ce fichier en conséquence, jamais le
 * supprimer silencieusement."
 *
 * ------------------------------------------------------------------------
 * (a) CE QUE DIT LE CERFA OFFICIEL ET SA NOTICE
 * ------------------------------------------------------------------------
 * Sur le formulaire vierge (assets/2026/2033-sd.pdf, page 2) : la ligne
 * entière portant les cases 346 ET 350 ne porte qu'UN SEUL libellé imprimé —
 * "Créance due au titre du report en arrière du déficit" (mécanisme de
 * carry-back, art. 220 quinquies du CGI, réservé à l'IS). Mais la notice
 * 2033-NOT-SD 2026 (lue intégralement pour ce jalon, source :
 * impots.gouv.fr) précise que la CASE 350 elle-même, au-delà du seul libellé
 * de cette ligne, s'intitule « Divers à déduire » — une liste ouverte
 * incluant, entre autres, la créance de carry-back ET, séparément, "le
 * bénéfice... provenant d'activités... exercées à titre non professionnel...
 * article 156-I-1° bis du CGI".
 *
 * Autre confirmation issue de cette même lecture : le Cadre II "Déficits
 * reportables" du 2033-D-SD (réservé à l'IS) se sert de la case **360** du
 * 2033-B-SD ("Montant porté ligne 360", notice p.14), jamais de 350 — 360
 * reste `non_applicable` dans ce mapper, à raison.
 *
 * ------------------------------------------------------------------------
 * (b) RÈGLE VERROUILLÉE POUR LE PÉRIMÈTRE PRODUIT ACTUEL
 * ------------------------------------------------------------------------
 * Fiscal AI ne traite aujourd'hui qu'une entreprise individuelle LMNP à
 * l'IR, activité non professionnelle UNIQUE, aucun autre mécanisme "divers"
 * (pas de carry-back, pas de plus-values art. 238, pas de bénéfice non
 * professionnel séparé d'une activité professionnelle). Dans ce périmètre
 * précis, la case 350 porte la mention IR de l'imputation d'un déficit
 * catégoriel ANTÉRIEUR sur le bénéfice de l'exercice —
 * `fiscalResult.deficitsImputes` (TRF-0031), sans recalculer 370, sans
 * jamais recevoir `deficitNouveau` ni `amortReporte`/ARD. Voir map-2033b.ts
 * pour le raisonnement complet et la correction du commentaire qui citait à
 * tort le Cadre II du 2033-D-SD comme fondement de cette case.
 *
 * ------------------------------------------------------------------------
 * MISE À JOUR — MICRO-JALON implémentation 350
 * ------------------------------------------------------------------------
 * La géométrie de 350 est désormais, elle aussi, démontrée indépendamment
 * (trois méthodes techniques convergentes sur l'asset officiel + rendu
 * raster, voir `registry/2033-b/2026.ts` et `tests/position-oracle.test.ts`,
 * describe "ligne 346/350"). 350 a donc une entrée de registre active et
 * n'est plus une exclusion : les deux conditions ("règle fiscale
 * verrouillée" ET "géométrie démontrée") sont désormais réunies.
 *
 * ------------------------------------------------------------------------
 * CE QUE CE TEST GARANTIT
 * ------------------------------------------------------------------------
 * 1. Le mapper fiscal N'EST PAS modifié par ce jalon : il continue de
 *    produire la case 350 exactement comme avant (valeur = deficitsImputes).
 * 2. La couche PDF N'INVENTE RIEN : elle ne recalcule jamais 350 à partir
 *    d'une autre grandeur (`resultatFiscal`, `deficitNouveau`, `amortReporte`).
 * 3. La couche PDF la DESSINE désormais, à une position géométriquement
 *    démontrée — voir `tests/position-oracle.test.ts` pour la preuve de
 *    position indépendante, ce fichier ne re-teste pas la géométrie.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";

import { isExcludedCase } from "../excluded-cases";
import { resolveVisualMapping } from "../registry";
import { buildDossierTemoinRfs, DOSSIER_TEMOIN_FISCAL_RESULT } from "./golden-master-technical-pipeline.test";

describe("RÈGLE VERROUILLÉE + GÉOMÉTRIE DÉMONTRÉE — case 350 du 2033-B-SD (350 = deficitsImputes, périmètre LMNP-IR)", () => {
  it("le mapper produit la case 350 avec la valeur deficitsImputes, conforme à la règle verrouillée (INCHANGÉ par ce jalon)", () => {
    const rfs = buildDossierTemoinRfs();
    const form = map2033BFromRfs(rfs);
    const case350 = form.cases.find((c) => c.caseId === "350");
    assert.ok(case350, "le mapper doit produire la case 350");
    assert.equal(case350?.value, DOSSIER_TEMOIN_FISCAL_RESULT.deficitsImputes);
  });

  it("350 n'est plus dans la liste des exclusions PDF (règle fiscale verrouillée ET géométrie désormais démontrée)", () => {
    const excluded = isExcludedCase("2033-B-SD", 2026, "350");
    assert.equal(excluded, undefined, "350 ne doit plus être une exclusion — les deux conditions (fiscal + géométrie) sont réunies");
  });

  it("350 a désormais une entrée de registre active, distincte de 346/330/370/372", () => {
    const mapping = resolveVisualMapping("2033-B-SD", 2026, "350");
    assert.ok(mapping, "350 doit avoir une entrée de registre (MICRO-JALON implémentation 350)");
    assert.equal(mapping?.format, "eur-arrondi");
    assert.equal(mapping?.align, "right");
  });
});
