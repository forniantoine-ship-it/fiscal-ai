import type { FiscalRepresentation } from "../types";
import type { CaseTrace, CerfaCase } from "../../f007/types";
import { round2 } from "../../f007/types";
import { resultatComptable as resultatComptableCentral } from "../../bilan/resultat-comptable";
import { resolveConservationDetail2033B, type ConservationDetail2033B } from "./detail-charges-2033b";
import { splitFinancementFor2033B } from "./split-financement-2033b";

/**
 * Projection Cerfa 2033-B-SD — consomme UNIQUEMENT la RFS (`rfs.fiscalResult`).
 * Aucun appel à produceFiscalResult()/applyAmortissementStocks(), aucune
 * lecture d'assistant F-010/F-011/F-012/F-013/F-014, aucune reconstruction de
 * FiscalResult. Chaque case alimentée est un pass-through (ou une projection
 * de présentation pure — différence entre deux cases déjà projetées, pas une
 * règle fiscale nouvelle) — voir `rfs-2033b.test.ts` pour la preuve, dont un
 * test d'architecture qui interdit ces imports.
 *
 * Cycle 32 — audit de conformité (notice 2033-NOT-SD + FEC réel du dossier de
 * référence) : 264/270/310/312/314 sont désormais alimentables grâce à
 * l'exposition de `FiscalResult.charges.totalNonDeductible` (Cycle 32,
 * transport pur depuis F-012 — voir f006/aggregate-inputs.ts). Formule
 * vérifiée au centime près contre le grand livre comptable réel du dossier
 * de référence. 352/354 restent bloquées : l'audit a identifié DEUX sources
 * indépendantes de désynchronisation entre l'ordre de calcul F-006 (SAV-027 :
 * déficits antérieurs imputés avant l'amortissement de l'exercice) et l'ordre
 * du formulaire officiel — les déficits antérieurs (déjà documentés) et,
 * nouvellement identifié, le stock d'amortissements reportés antérieurs
 * (`stockAmortInitial`, une entrée de `apply-amortissement-stocks.ts` jamais
 * exposée dans `FiscalResult`, qui se trouve mêlée à `amortReporte` sans
 * qu'on puisse l'isoler après coup). 356 est reclassée : ce n'est pas un
 * choix de périmètre Fiscal AI, c'est un mécanisme (report en arrière,
 * art. 220 quinquies du CGI) réservé aux entreprises à l'IS — non applicable
 * par nature à un LMNP au réel simplifié (IR).
 *
 * Cycle 46-47 — audit exhaustif de traçabilité (209-350) : deux cases
 * supplémentaires sont démontrables sans nouvelle formule. 218 (Services —
 * Production vendue) reprend exactement `recettes.total`, déjà validée pour
 * la case 232 : la location meublée est fiscalement une prestation de
 * services, jamais une vente de biens (positionnellement confirmé sur le
 * dossier de référence : la même valeur apparaît en case 218 et en case 232).
 * 254 (Dotations aux amortissements) reprend exactement `amortCalcule`, déjà
 * utilisée dans la formule des cases 264/310. Toutes les autres cases du
 * formulaire (209-230 hors 218, 234-262 hors 242/254, 280, 290, 306, 316,
 * 322, 324, 330-348) restent volontairement non traitées : soit
 * structurellement `non_applicable`/`donnee_absente` à un LMNP réel
 * simplifié, soit `incoherence_modele` faute d'une correspondance PCG
 * suffisamment certaine entre les catégories F-012 (`detailParCategorie`) et
 * les postes du compte de résultat Cerfa (voir Cycle 46) — non ajoutées à
 * `casesNonAlimentees` ce cycle, périmètre strictement limité à 218/254.
 *
 * Audit fiscal ciblé (case 300) — `fiscalResult.perteExceptionnelle` était
 * déjà un scalaire propre et déjà soustrait dans `resultatAvantAmort`
 * (TRF-0027) : seule sa projection en case 300 manquait. Pass-through pur,
 * sans effet sur 264/270/294/310, qui ne référencent pas cette case.
 *
 * P1 (ventilation financement) — case 242 introduite, `fiscalResult.charges.
 * chargesFinancement` ventilé en 242 (assurance emprunteur + frais de
 * dossier + garantie non récupérable qualifiée) et 294 (intérêts + IRA),
 * depuis `rfs.emprunts` (F-011, jamais recalculé) — voir la garde de code
 * juste avant la construction de `cases`. `garantieDeductible` ne représente
 * aujourd'hui QUE la commission de caution ; garantie récupérable et garantie
 * non qualifiée restent hors périmètre de ce cycle (paliers ultérieurs).
 * `rfs.emprunts` absent → repli sur l'ancien comportement (294 =
 * chargesFinancement en totalité, 242 absente).
 *
 * P0-3a.2 (mini-audit read-only + décision verrouillée) — `interetsPreExploitation`
 * et `assurancePreExploitation` (F-011, TRF-0023/P2) rejoignent désormais
 * respectivement 294 et 242 : même donnée déjà transportée sur `rfs.emprunts[]`,
 * simple ajout aux sommes existantes, aucun recalcul. Ces montants sont déjà
 * déduits une seule fois du résultat via `fiscalResult.charges.
 * chargesPreExploitation` (TRF-0030) — les restituer ici ne les réinjecte dans
 * aucun calcul, cela les rend seulement visibles sur leur case Cerfa. Le total
 * de contrôle `242 + 294 == chargesFinancement` (ci-dessous) ne couvre donc
 * plus que les charges de l'exercice : dès que des montants pré-exploitation
 * existent, `242 + 294` dépasse `chargesFinancement` de leur somme — c'est la
 * réalité fiscale attendue, jamais forcé artificiellement à l'égalité.
 *
 * Audit fiscal ciblé (déficits LMNP) — 360 est reclassée en `non_applicable`,
 * pour la même raison que 356 : la notice 2033-NOT-SD réserve explicitement
 * cette ligne aux entreprises relevant de l'IS. `fiscalResult.deficitsImputes`
 * n'y est jamais projetée — cette donnée reste déjà reflétée dans
 * `resultatFiscal` (case 370) et documentée séparément sur le 2042-C-PRO
 * (cases 5GA-5GJ).
 *
 * Règle fiscale VERROUILLÉE (jalon dédié, après audit indépendant primaire de
 * la notice 2033-NOT-SD 2026) — pour le périmètre produit actuel de Fiscal AI
 * (entreprise individuelle LMNP, IR, activité non professionnelle unique,
 * aucun autre mécanisme "divers" traité) : la case 350 « Divers à déduire »
 * porte la mention IR de l'imputation d'un déficit catégoriel ANTÉRIEUR sur
 * le bénéfice de l'exercice — projection informative pure de
 * `fiscalResult.deficitsImputes` (déjà calculé par TRF-0031), qui ne
 * participe à aucun calcul de 352/354/370/372 (lectures indépendantes de
 * `resultatFiscal`/`deficitNouveau`), ne reçoit jamais `deficitNouveau`, et
 * ne reçoit jamais `amortReporte`/ARD (voir case 318, flux totalement
 * distinct). 218/254 exceptées, 350 est la première case du groupe 209-350
 * sortie du statut « non traitée ».
 *
 * Correction documentaire (audit indépendant, ce même jalon) — l'ancienne
 * justification de ce commentaire ("à la place du Cadre II du 2033-D-SD")
 * était inexacte : le Cadre II "Déficits reportables" du 2033-D-SD (réservé
 * à l'IS) se sert de la case **360** du 2033-B-SD (notice 2033-NOT-SD 2026,
 * p.14 : "Montant porté ligne 360 du tableau n° 2033-B-SD"), jamais de la
 * case 350 — 360 reste `non_applicable` ci-dessous, à raison, comme mécanisme
 * IS distinct. La case 350 « Divers à déduire » a par ailleurs, sur le
 * formulaire officiel, un usage explicitement documenté pour le bénéfice non
 * professionnel (art. 156-I-1° bis, symétrique de la case 330 pour le
 * déficit) — usage volontairement HORS PÉRIMÈTRE de ce mapper (aucune donnée
 * ne le projette ici), le produit actuel ne traitant que l'imputation d'un
 * déficit antérieur pour cette case. Voir
 * `src/lib/lmnp/services/liasse-pdf/excluded-cases.ts` pour le statut PDF
 * correspondant (calibrage géométrique en attente, question fiscale
 * verrouillée).
 *
 * Correction P0 fiscale (audit indépendant Cursor/Grok, confirmée) — case
 * 330 « Divers* » (bloc RÉINTÉGRATIONS, notice 2033-NOT-SD 2026 : inclut le
 * déficit d'activités non professionnelles, CGI art. 156-I-1° bis — voir
 * AX-016 du Knowledge System, « Les déficits BIC non professionnels sont
 * reportables 10 ans... Ils ne s'imputent pas sur le revenu global »).
 *
 * AVANT cette correction, `fiscalResult.deficitNouveau` était projeté
 * directement sur la case 372 (« Résultat fiscal après imputation des
 * déficits — Déficit »). C'était fiscalement incorrect : un déficit LMNP non
 * professionnel n'est PAS un déficit BIC ordinaire qui s'impute (ou se
 * reporte) via le circuit général 370/372 — par construction de
 * TRF-0031/AX-016, il ne s'impute JAMAIS sur autre chose qu'un bénéfice de
 * même nature, et jamais sur le revenu global. C'est précisément pour cette
 * raison que `applyAmortissementStocks` (F-006, TRF-0031, INCHANGÉ par cette
 * correction) fixe `resultatFiscal = 0` (jamais négatif) dans la branche
 * déficitaire : `resultatFiscal` représente déjà le résultat BIC après
 * application de la règle de non-imputation, et `deficitNouveau` représente
 * le montant du déficit LMNP mis en réserve pour un report futur (case 7b /
 * `I_7B`, `I_AUTRES_LMNP_DEFICIT` — INCHANGÉES, c'est leur rôle).
 *
 * `fiscalResult.resultatFiscal = 0` / `fiscalResult.deficitNouveau = 9862`
 * (scénario témoin) EST donc déjà la bonne représentation fiscale interne —
 * F-006 n'est PAS modifié par cette correction. Ce qui était incorrect était
 * la DESTINATION Cerfa de `deficitNouveau` : désormais projeté sur la case
 * 330 (réintégration explicite du déficit non professionnel, pour que la
 * ligne 370/372 — un circuit générique BIC qui n'a pas vocation à recevoir
 * un déficit non-imputable sur le revenu global — retombe à zéro, comme
 * `resultatFiscal` l'indique déjà). La case 372 ne lit plus jamais
 * `deficitNouveau` : elle lit désormais `resultatFiscal < 0`, une condition
 * qui ne se déclenche jamais avec le F-006 actuel (garanti ≥0 par
 * TRF-0031) — cohérent avec le fait qu'un déficit LMNP non professionnel
 * n'apparaît jamais sur cette ligne.
 *
 * MICRO-JALON implémentation 244 — audit dédié : « Impôts, taxes et
 * versements assimilés » était classée à tort `incoherence_modele`/MODÈLE
 * GAP par un audit antérieur (302,352,354 confondues) alors que la donnée
 * (taxe foncière, TRF-0020 : "Totalisation des charges déductibles", sortie
 * détail_par_catégorie) est déjà transportée sans recalcul jusque dans
 * `FiscalResult.charges.detailParCategorie` — un pur MAPPER GAP. Pass-through
 * conditionnel (remplacé par A1, voir `detail-charges-2033b.ts`), même principe que 242 :
 * absente si aucune ligne "taxe_fonciere" n'a été saisie, jamais un 0
 * inventé. Couvre uniquement la composante taxe foncière — CFE et CVAE,
 * mentionnées dans le libellé officiel de cette case, ne sont pas des
 * catégories du moteur actuel (voir `family-ux.ts`) et restent hors
 * périmètre de cette implémentation.
 *
 * A1 (cohérence du détail 2033-B) — les lignes détaillées publiées doivent
 * expliquer EXACTEMENT 264 hors 254 : 242 + 244 + 254 = 264.
 *
 * Classification 2033-B des composantes F-011 (présentation Cerfa — 310 inchangé) :
 *   - intérêts d'emprunt + IRA → 294 : ÉTABLI ;
 *   - assurance emprunteur bancaire liée au prêt → 294 : ÉTABLI (BOFiP
 *     BOI-BIC-CHG-40-20-20 — primes imposées pour garantir le remboursement =
 *     charges financières au même titre que l'intérêt) ;
 *   - frais de dossier bancaire → 242 ∈ 264 : ÉTABLI (notice 2033-NOT-SD 2026
 *     ligne 242 « services bancaires » / annexe 627) — retirés de 294 ;
 *   - garantie / caution → 294 : PROVISOIRE / UNRESOLVED (notice « services
 *     bancaires » vs SAV-001 « charges financières ») — aucun déplacement.
 *
 * 242/244 restent alimentés par la ventilation F-012 (+ frais de dossier F-011
 * ajoutés explicitement à 242/264). Si la conservation F-012 échoue, 242/244
 * ne sont PAS publiées (écart tracé) ; les frais de dossier F-011 restent
 * néanmoins dans 264 et hors 294 pour préserver 270 − 294 − 300 = 310.
 */

/** Pourquoi une case Cerfa n'est volontairement pas alimentée. */
export type CerfaCaseNonAlimenteeCategorie =
  /** Aucun champ du modèle fiscal actuel ne représente cette grandeur. */
  | "donnee_absente"
  /** La donnée existe mais l'ordre/la définition du calcul diffère entre F-006 et le formulaire officiel — la reconstituer exigerait une formule non validée. */
  | "incoherence_modele"
  /** Le mécanisme fiscal correspondant n'est pas implémenté par F-006 — décision de périmètre, pas une lacune de donnée. */
  | "hors_perimetre"
  /** La case ne concerne pas notre régime cible (LMNP réel simplifié, IR) par construction légale — pas un choix produit, pas une donnée manquante. */
  | "non_applicable";

export type CerfaCaseNonAlimentee = {
  caseId: string;
  label: string;
  raison: string;
  categorie: CerfaCaseNonAlimenteeCategorie;
};

export type Form2033B = {
  formId: "2033-B-SD";
  millésime: number;
  cases: CerfaCase[];
  /** Jamais une valeur inventée : chaque case listée ici reste explicitement sans valeur, avec sa raison tracée. */
  casesNonAlimentees: CerfaCaseNonAlimentee[];
  /** A1 — invariant de conservation : 242 + 244 + 254 = 264 (ou lignes non publiées, avec raison). */
  conservationDetail: ConservationDetail2033B;
};

export function map2033BFromRfs(rfs: FiscalRepresentation): Form2033B {
  const fr = rfs.fiscalResult;
  const baseTrace: Omit<CaseTrace, "path"> = { source: "FiscalResult", ksArtifacts: ["TRF-0032"] };

  // Case 294 / frais de dossier → 242 — ventilation explicite (voir split-financement-2033b.ts).
  // Les montants restent déduits une seule fois du résultat via F-006 (`chargesFinancement` /
  // pré-exploitation) ; ce mapping ne les réinjecte dans aucun calcul fiscal.
  const emprunts = rfs.emprunts;
  const split = splitFinancementFor2033B({
    emprunts,
    chargesFinancementFallback: fr.charges.chargesFinancement,
  });
  const financement294 = split.case294;
  const fraisDossier242 = split.fraisDossier242;
  const empruntsTrace: Omit<CaseTrace, "path"> = { source: "Emprunts", ksArtifacts: ["TRF-0016", "TRF-0032"] };

  // Cases 242/244 — A1 : détail F-012 (+ frais de dossier F-011 ajoutés ci-dessous à 242/264).
  const detail = resolveConservationDetail2033B(fr);

  // Case 264 — charges d'exploitation F-012/F-010 + amortissements + non déductibles
  // + frais de dossier F-011 reclassés en exploitation (présentation ; 310 inchangé car
  // 294 baisse du même montant). B/C pré-exploitation restent en 294, jamais ici.
  const charges264 = round2(
    fr.charges.chargesExploitation +
      (fr.charges.chargesExploitationPreExploitation ?? 0) +
      fr.amortCalcule +
      fr.charges.totalNonDeductible +
      fraisDossier242,
  );
  // Case 270 — Résultat d'exploitation (I − II). Différence entre deux cases
  // déjà projetées (232 et 264) — présentation Cerfa, pas un calcul fiscal.
  const resultat270 = round2(fr.recettes.total - charges264);
  // Cases 310/312/314 — résultat comptable. MICRO-JALON socle patrimonial P0
  // : source UNIQUE désormais partagée avec la case 136 du 2033-A
  // (`capabilities/bilan/resultat-comptable.ts`) — même formule qu'avant
  // (aucun changement de valeur, non-régression vérifiée), mais plus jamais
  // recalculée indépendamment dans deux fichiers (risque de divergence
  // silencieuse identifié par l'audit normatif 2033-A). Preuve historique
  // conservée : -9862 - 3720 - 99 = -13681, valeur exacte du dossier de
  // référence.
  const resultatComptable = resultatComptableCentral(fr);

  const cases: CerfaCase[] = [
    {
      caseId: "232",
      label: "Total des produits d'exploitation hors TVA (I)",
      value: round2(fr.recettes.total),
      trace: { ...baseTrace, path: "fiscalResult.recettes.total" },
    },
    {
      // Cycle 47 — la location meublée est fiscalement une prestation de
      // services (jamais une vente de biens) : même valeur que la case 232,
      // pass-through pur, aucune ventilation des sous-champs recettes.*.
      caseId: "218",
      label: "Production vendue — Services",
      value: round2(fr.recettes.total),
      trace: { ...baseTrace, path: "fiscalResult.recettes.total" },
    },
    {
      caseId: "264",
      label: "Total des charges d'exploitation (II)",
      value: charges264,
      trace: {
        ...baseTrace,
        path: "fiscalResult.charges.chargesExploitation + chargesExploitationPreExploitation + amortCalcule + totalNonDeductible + fraisDossierF011(→242)",
        ksArtifacts: ["TRF-0020", "TRF-0025", "TRF-0012", "TRF-0016", "TRF-0032"],
      },
    },
    {
      caseId: "270",
      label: "Résultat d'exploitation (I − II)",
      value: resultat270,
      trace: { ...baseTrace, path: "case 232 − case 264 (projection de présentation)", ksArtifacts: ["TRF-0029", "TRF-0020", "TRF-0012", "TRF-0032"] },
    },
    {
      // Cycle 47 — pass-through pur de fiscalResult.amortCalcule, déjà
      // utilisée (sans recalcul) dans la formule des cases 264/310. Jamais
      // amortDeduct ni amortReporte : ce n'est pas la part déduite ni
      // reportée, c'est le montant calculé de la dotation elle-même.
      caseId: "254",
      label: "Dotations aux amortissements",
      value: round2(fr.amortCalcule),
      trace: { ...baseTrace, path: "fiscalResult.amortCalcule", ksArtifacts: ["TRF-0012", "TRF-0032"] },
    },
    {
      caseId: "294",
      label: "Charges financières (V)",
      value: financement294,
      trace:
        emprunts !== undefined
          ? {
              ...empruntsTrace,
              path: "Σ rfs.emprunts[].(intérêts + IRA + assurance emprunteur + garantie PROVISOIRE) — hors frais de dossier (→242)",
            }
          : { ...baseTrace, path: "fiscalResult.charges.chargesFinancement (repli sans détail emprunts)" },
    },
    {
      // Audit fiscal ciblé (case 300) — fiscalResult.perteExceptionnelle est
      // déjà un scalaire propre (TRF-0027), déjà soustrait dans
      // resultatAvantAmort en amont : cette case est un pass-through pur,
      // au même titre que 218/254/350 — jamais bloquée, alimentée avec 0 en
      // l'absence de perte. Aucune incidence sur 264/270/294/310, qui ne
      // référencent pas cette case.
      caseId: "300",
      label: "Charges exceptionnelles (VI)",
      value: round2(fr.perteExceptionnelle),
      trace: { ...baseTrace, path: "fiscalResult.perteExceptionnelle", ksArtifacts: ["TRF-0027", "TRF-0032"] },
    },
    {
      // Règle fiscale VERROUILLÉE (voir commentaire d'en-tête du fichier) :
      // pour le périmètre LMNP-IR actuel, 350 porte la mention IR de
      // l'imputation d'un déficit catégoriel antérieur sur le bénéfice de
      // l'exercice. Projection informative pure de fiscalResult.deficitsImputes,
      // déjà calculé par TRF-0031 — ne participe à aucun calcul de
      // 352/354/370/372. Seul cas d'usage spécifié pour cette case dans ce
      // mapper — voir le commentaire d'en-tête du fichier pour les autres
      // usages notice (bénéfice non professionnel, etc.) non couverts ici.
      caseId: "350",
      label: "Divers à déduire",
      value: round2(fr.deficitsImputes),
      trace: { ...baseTrace, path: "fiscalResult.deficitsImputes", ksArtifacts: ["TRF-0031", "TRF-0032"] },
    },
    {
      caseId: "310",
      label: "Bénéfices ou pertes (résultat comptable)",
      value: resultatComptable,
      trace: {
        ...baseTrace,
        path: "fiscalResult.resultatAvantAmort − fiscalResult.amortCalcule − fiscalResult.charges.totalNonDeductible",
        ksArtifacts: ["TRF-0030", "TRF-0012", "TRF-0020", "TRF-0032"],
      },
    },
    {
      caseId: "318",
      label: "Amortissements excédentaires et autres amortissements non déductibles",
      value: round2(fr.amortReporte),
      trace: { ...baseTrace, path: "fiscalResult.amortReporte", ksArtifacts: ["TRF-0031", "TRF-0032"] },
    },
  ];

  // Cases 242/244 — A1 : alimentées uniquement si la conservation F-012 est établie.
  // Les frais de dossier F-011 (notice 242) s'ajoutent alors à 242 pour coller à 264.
  const detailTrace = {
    ...baseTrace,
    path:
      "fiscalResult.charges.detailParCategorie + detailPreExploitationParCategorie + detailNonDeductibleParCategorie (F-012, par catégorie)",
    ksArtifacts: ["TRF-0020", "TRF-0025", "SAV-011", "TRF-0032"],
  };
  const ligne242Publiee =
    detail.status === "CONSERVE" && (detail.ligne242 !== undefined || fraisDossier242 > 0)
      ? round2((detail.ligne242 ?? 0) + fraisDossier242)
      : undefined;
  if (ligne242Publiee !== undefined) {
    cases.push({
      caseId: "242",
      label: "Autres achats et charges externes",
      value: ligne242Publiee,
      trace: {
        ...detailTrace,
        path:
          fraisDossier242 > 0
            ? `Σ catégories F-012 hors taxe_fonciere + frais de dossier F-011 (${fraisDossier242} €) — ${detailTrace.path}`
            : `Σ catégories F-012 hors taxe_fonciere — ${detailTrace.path}`,
        ksArtifacts: [...(detailTrace.ksArtifacts ?? []), "TRF-0016"],
      },
    });
  }
  if (detail.ligne244 !== undefined) {
    cases.push({
      caseId: "244",
      label: "Impôts, taxes et versements assimilés",
      value: round2(detail.ligne244),
      trace: { ...detailTrace, path: `taxe_fonciere (exercice + pré-exploitation) — ${detailTrace.path}` },
    });
  }

  if (resultatComptable > 0) {
    cases.push({
      caseId: "312",
      label: "Résultat fiscal — report du bénéfice comptable (col. 1)",
      value: resultatComptable,
      trace: {
        ...baseTrace,
        path: "fiscalResult.resultatAvantAmort − fiscalResult.amortCalcule − fiscalResult.charges.totalNonDeductible",
        ksArtifacts: ["TRF-0030", "TRF-0012", "TRF-0020", "TRF-0032"],
      },
    });
  }

  if (resultatComptable < 0) {
    cases.push({
      caseId: "314",
      label: "Résultat fiscal — report du déficit comptable (col. 2)",
      value: round2(Math.abs(resultatComptable)),
      trace: {
        ...baseTrace,
        path: "fiscalResult.resultatAvantAmort − fiscalResult.amortCalcule − fiscalResult.charges.totalNonDeductible",
        ksArtifacts: ["TRF-0030", "TRF-0012", "TRF-0020", "TRF-0032"],
      },
    });
  }

  // Correction P0 fiscale (audit indépendant Cursor/Grok) — le déficit LMNP
  // non professionnel (`deficitNouveau`) est réintégré ici, case 330 « Divers
  // » (bloc RÉINTÉGRATIONS ; notice 2033-NOT-SD 2026 : déficit d'activités
  // non professionnelles, CGI art. 156-I-1° bis, AX-016 du Knowledge
  // System) — jamais projeté sur 372 (voir ci-dessous et le commentaire
  // d'en-tête du fichier pour le raisonnement complet). Comme 350, cette case
  // ne participe à aucun calcul de 352/354/370/372 dans ce mapper : lecture
  // indépendante et informative de `deficitNouveau`, déjà calculé par
  // TRF-0031.
  if (fr.deficitNouveau > 0) {
    cases.push({
      caseId: "330",
      label: "Divers (réintégration du déficit LMNP non professionnel)",
      value: round2(fr.deficitNouveau),
      trace: { ...baseTrace, path: "fiscalResult.deficitNouveau", ksArtifacts: ["TRF-0031", "TRF-0032", "AX-016"] },
    });
  }

  if (fr.resultatFiscal > 0) {
    cases.push({
      caseId: "370",
      label: "Résultat fiscal après imputation des déficits — Bénéfice (col. 1)",
      value: round2(fr.resultatFiscal),
      trace: { ...baseTrace, path: "fiscalResult.resultatFiscal" },
    });
  }

  // Correction P0 fiscale — 372 ne lit plus jamais `deficitNouveau` (voir
  // commentaire d'en-tête). Cette condition reflète la définition réelle de
  // la case (résultat fiscal négatif après imputation) plutôt que le déficit
  // LMNP mis en réserve : elle ne se déclenche jamais avec le F-006 actuel,
  // qui garantit `resultatFiscal >= 0` (TRF-0031, applyAmortissementStocks —
  // INCHANGÉ). Conservée sous cette forme (plutôt que supprimée) pour rester
  // correcte si cette garantie F-006 changeait un jour.
  if (fr.resultatFiscal < 0) {
    cases.push({
      caseId: "372",
      label: "Résultat fiscal après imputation des déficits — Déficit (col. 2)",
      value: round2(Math.abs(fr.resultatFiscal)),
      trace: { ...baseTrace, path: "fiscalResult.resultatFiscal", ksArtifacts: ["TRF-0032"] },
    });
  }

  const casesNonAlimentees: CerfaCaseNonAlimentee[] = [
    {
      caseId: "352",
      label: "Résultat fiscal avant imputation des déficits antérieurs — Bénéfice (col. 1)",
      raison:
        "L'ordre de calcul de F-006 (SAV-027 : déficits antérieurs imputés avant l'amortissement de l'exercice) diffère de celui du formulaire officiel (déficits imputés après les réintégrations, dont l'amortissement excédentaire). Reconstituer cette case exigerait de connaître le stock d'amortissements reportés antérieurs au DÉBUT de l'exercice (`stockAmortInitial`), qui n'est jamais exposé dans FiscalResult — il est mêlé à `amortReporte` sans pouvoir être isolé après coup. Deux sources de désynchronisation identifiées (déficits antérieurs ET stock d'amortissements reportés), pas une seule — même le cas 'sans déficit antérieur imputé cette année' n'est donc pas sûr en général.",
      categorie: "incoherence_modele",
    },
    {
      caseId: "354",
      label: "Résultat fiscal avant imputation des déficits antérieurs — Déficit (col. 2)",
      raison: "Même incohérence que la case 352.",
      categorie: "incoherence_modele",
    },
    {
      caseId: "356",
      label: "Déficit de l'exercice reporté en arrière",
      raison:
        "Le report en arrière (carry-back, article 220 quinquies du CGI, formalisé sur le formulaire n° 2039-SD) est un mécanisme réservé aux entreprises soumises à l'impôt sur les sociétés (confirmé par la notice officielle 2033-NOT-SD). Un LMNP au réel simplifié relève de l'impôt sur le revenu : cette case ne concerne pas notre régime par construction légale, indépendamment de ce que F-006 implémente ou non.",
      categorie: "non_applicable",
    },
    {
      // Audit fiscal ciblé (déficits LMNP) — la notice 2033-NOT-SD réserve
      // explicitement cette ligne aux "entreprises relevant de l'impôt sur les
      // sociétés". Pour un LMNP à l'IR, l'imputation des déficits antérieurs
      // (fiscalResult.deficitsImputes) n'a pas sa place ici : elle est déjà
      // absorbée dans fiscalResult.resultatFiscal (report vers 370) et
      // documentée séparément au niveau du 2042-C-PRO (cases 5GA-5GJ), jamais
      // sur le 2033-B.
      caseId: "360",
      label: "Déficits antérieurs reportables",
      raison:
        "La notice officielle 2033-NOT-SD précise que le montant porté à cette ligne correspond à la fraction des déficits imputés sur le bénéfice de l'exercice par les entreprises relevant de l'impôt sur les sociétés. Un LMNP au réel simplifié relève de l'impôt sur le revenu : cette case ne concerne pas notre régime par construction légale. L'imputation des déficits antérieurs LMNP (fiscalResult.deficitsImputes) reste une donnée valide de F-006, déjà reflétée dans fiscalResult.resultatFiscal (case 370) et dans le 2042-C-PRO (cases 5GA-5GJ) — jamais projetée ici.",
      categorie: "non_applicable",
    },
  ];

  // A1 — conservation F-012 non établie : 242/244 F-012 restent sans valeur (écart tracé).
  // Les frais de dossier F-011 restent dans 264 / hors 294 même dans ce cas (310 cohérent).
  if (detail.status === "ECART") {
    const raison =
      `Le détail ne peut pas expliquer exactement 264 − 254 (attendu ${detail.attendu} €, ventilable ${detail.attribue} €, écart ${detail.ecart} €) : ` +
      detail.raisons.join(" ; ") +
      ". Aucun montant n'est publié plutôt qu'un détail qui n'explique pas le total.";
    casesNonAlimentees.push(
      { caseId: "242", label: "Autres achats et charges externes", raison, categorie: "incoherence_modele" },
      { caseId: "244", label: "Impôts, taxes et versements assimilés", raison, categorie: "incoherence_modele" },
    );
  }

  const conservationDetail: ConservationDetail2033B =
    detail.status === "CONSERVE"
      ? {
          ...detail,
          attendu: round2(detail.attendu + fraisDossier242),
          attribue: round2(detail.attribue + fraisDossier242),
          ...(ligne242Publiee !== undefined ? { ligne242: ligne242Publiee } : {}),
        }
      : detail;

  return {
    formId: "2033-B-SD",
    millésime: rfs.exercice,
    cases,
    casesNonAlimentees,
    conservationDetail,
  };
}
