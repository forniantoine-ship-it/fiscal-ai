import type { FiscalRepresentation } from "../types";
import type { CaseTrace, CerfaCase } from "../../f007/types";
import { round2 } from "../../f007/types";
import { resolveNonProNeutralisation } from "../../f007/nonpro-neutralisation";
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
 * de référence. SAV-032 — 330/350/352/354/370/372 forment UN SEUL bloc de
 * neutralisation du résultat LMNP non professionnel (voir
 * `f007/nonpro-neutralisation.ts`) : `resultatFiscalAvantDeficits` (F-006) est
 * la grandeur métier de 2031 7a, ce n'est PAS directement la ligne 352/354 ;
 * 352 = 370 = 0 imprimés, 354/372 vides, et un invariant de bouclage
 * (`balancing`) construit sur les lignes réellement imprimées bloque la
 * livraison s'il n'est pas vérifié. Un FiscalResult antérieur, sans
 * `resultatFiscalAvantDeficits`, laisse ces lignes non alimentées
 * (`balancing.status = UNAVAILABLE`). 356 est reclassée : ce n'est pas un
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
 * SAV-032 (remplace la règle « 350 = deficitsImputes », jalon antérieur) — la
 * notice 2033-NOT-SD 2026 (rubriques 330, 350, 690, 691) neutralise le
 * résultat d'une activité non professionnelle dans la 2033-B : déficit
 * réintégré en 330, bénéfice déduit en 350 (ARD consommés inclus dans ce
 * total, jamais une seconde déduction), 352/354 et 370/372 à zéro pour une
 * activité LMNP exclusive. Les déficits ANTÉRIEURS n'apparaissent pas dans la
 * 2033-B (le cadre I de la 2031 Bis demande un résultat « avant imputation
 * des déficits antérieurs » : 7a/7b) ; `deficitsImputes` n'est donc plus
 * projeté ici. Ni `ligne 350` ni `ligne 330` ne reçoivent plus `deficitNouveau`
 * seul : voir `f007/nonpro-neutralisation.ts`.
 *
 * Correction documentaire (audit indépendant, ce même jalon) — l'ancienne
 * justification de ce commentaire ("à la place du Cadre II du 2033-D-SD")
 * était inexacte : le Cadre II "Déficits reportables" du 2033-D-SD (réservé
 * à l'IS) se sert de la case **360** du 2033-B-SD (notice 2033-NOT-SD 2026,
 * p.14 : "Montant porté ligne 360 du tableau n° 2033-B-SD"), jamais de la
 * case 350 — 360 reste `non_applicable` ci-dessous, à raison, comme mécanisme
 * IS distinct. La case 350 « Divers à déduire » porte le bénéfice
 * non professionnel (art. 156-I-1° bis, symétrique de la case 330 pour le
 * déficit) : désormais projetée, voir SAV-032 ci-dessus.
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

/**
 * SAV-032 — invariant de bouclage du bloc « RÉSULTAT FISCAL » de la 2033-B, construit sur les lignes RÉELLEMENT
 * imprimées (jamais sur les scalaires F-006) :
 *   (312 − 314) + réintégrations imprimées − déductions imprimées = (352 − 354) imprimés.
 * Domaine supporté (LMNP exclusif) : le résultat attendu après neutralisation est 0. Toute ligne du bloc imprimée mais
 * non modélisée ici, ou tout écart, rend le bouclage `UNBALANCED` : fail-closed (aucun PDF, déclaration non livrable).
 */
export type Balancing2033B = {
  status: "BALANCED" | "UNBALANCED" | "UNAVAILABLE";
  /** 312 − 314 imprimés. */
  resultatComptable: number;
  /** Σ des lignes de réintégration imprimées (316, 318, 322, 324, 330, 251, 998, 999). */
  reintegrations: number;
  /** Σ des lignes de déduction imprimées (342, 350, 997). */
  deductions: number;
  /** resultatComptable + reintegrations − deductions. */
  resultatCalcule: number;
  /** 352 − 354 imprimés. */
  resultatImprime: number;
  /** resultatCalcule − resultatImprime. */
  ecart: number;
  raisons: string[];
};

export type Form2033B = {
  formId: "2033-B-SD";
  millésime: number;
  cases: CerfaCase[];
  /** Jamais une valeur inventée : chaque case listée ici reste explicitement sans valeur, avec sa raison tracée. */
  casesNonAlimentees: CerfaCaseNonAlimentee[];
  /** A1 — invariant de conservation : 242 + 244 + 254 = 264 (ou lignes non publiées, avec raison). */
  conservationDetail: ConservationDetail2033B;
  /** SAV-032 — bouclage du bloc résultat fiscal (voir `Balancing2033B`). */
  balancing: Balancing2033B;
};

const RESULTAT_BLOCK_REINTEGRATIONS: readonly string[] = ["316", "318", "322", "324", "330", "251", "998", "999"];
const RESULTAT_BLOCK_DEDUCTIONS: readonly string[] = ["342", "350", "997"];
/**
 * Lignes du bloc 2033-B situées entre 312/314 et 370/372 dont le SIGNE dans l'équation n'est pas modélisé ici, ou qui
 * ne concernent pas le domaine LMNP exclusif (déductions exceptionnelles, ZFU…, « dont », IS) : imprimées, elles rendent
 * le bouclage `UNBALANCED` plutôt que d'être ignorées silencieusement.
 */
const RESULTAT_BLOCK_UNMODELLED: readonly string[] = [
  "247", "248", "249", "344", "345", "346", "986", "987", "989", "127", "138", "991", "181", "992", "993",
  "655", "643", "645", "647", "648", "641", "990", "649", "354", "356", "360", "372",
];

function computeBalancing2033B(cases: readonly CerfaCase[], unavailableReason?: string): Balancing2033B {
  const valueOf = (caseId: string): number | undefined => {
    const value = cases.find((c) => c.caseId === caseId)?.value;
    return typeof value === "number" ? value : undefined;
  };
  const sum = (ids: readonly string[]) => round2(ids.reduce((acc, id) => acc + (valueOf(id) ?? 0), 0));
  const resultatComptable = round2((valueOf("312") ?? 0) - (valueOf("314") ?? 0));
  const reintegrations = sum(RESULTAT_BLOCK_REINTEGRATIONS);
  const deductions = sum(RESULTAT_BLOCK_DEDUCTIONS);
  const noNegativeZero = (value: number) => (Object.is(value, -0) ? 0 : value);
  const resultatCalcule = noNegativeZero(round2(resultatComptable + reintegrations - deductions));
  const resultatImprime = noNegativeZero(round2((valueOf("352") ?? 0) - (valueOf("354") ?? 0)));
  const ecart = noNegativeZero(round2(resultatCalcule - resultatImprime));
  const base = { resultatComptable, reintegrations, deductions, resultatCalcule, resultatImprime, ecart };

  if (unavailableReason !== undefined) {
    return { status: "UNAVAILABLE", ...base, raisons: [unavailableReason] };
  }
  const raisons: string[] = [];
  const unmodelled = RESULTAT_BLOCK_UNMODELLED.filter((id) => valueOf(id) !== undefined);
  if (unmodelled.length > 0) {
    raisons.push(`Ligne(s) du bloc résultat fiscal imprimée(s) mais non modélisée(s) dans le bouclage : ${unmodelled.join(", ")}.`);
  }
  if (valueOf("352") === undefined) raisons.push("La ligne 352 n'est pas imprimée : le résultat du bloc n'est pas établi.");
  if (ecart !== 0) {
    raisons.push(
      `Le bloc ne boucle pas : (312 − 314) ${resultatComptable} + réintégrations ${reintegrations} − déductions ${deductions} = ${resultatCalcule}, ` +
        `alors que 352 − 354 imprimés = ${resultatImprime} (écart ${ecart}).`,
    );
  }
  return { status: raisons.length === 0 ? "BALANCED" : "UNBALANCED", ...base, raisons };
}

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
  const detail = rfs.detailCharges2033B ?? resolveConservationDetail2033B(fr);

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

  // Case 318 — MOUVEMENT ANNUEL. Source canonique : amortNonDeduitExercice (G10).
  // Snapshots RFS antérieurs à G10 n'ont pas ce champ : fallback dérivé
  // round2(amortCalcule − amortDeduct). Jamais amortReporte (STOCK FINAL).
  const amortNonDeduitExplicite =
    typeof fr.amortNonDeduitExercice === "number" && Number.isFinite(fr.amortNonDeduitExercice)
      ? fr.amortNonDeduitExercice
      : undefined;
  const amortNonDeduitPour318 =
    amortNonDeduitExplicite !== undefined
      ? round2(amortNonDeduitExplicite)
      : round2(fr.amortCalcule - fr.amortDeduct);
  const trace318Path =
    amortNonDeduitExplicite !== undefined
      ? "fiscalResult.amortNonDeduitExercice"
      : "fiscalResult.amortCalcule − fiscalResult.amortDeduct (legacy fallback)";

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
      // MOUVEMENT ANNUEL (amortissements N comptabilisés mais non déduits N) —
      // jamais le STOCK FINAL (`amortReporte`), qui peut inclure l'ouverture.
      value: amortNonDeduitPour318,
      trace: {
        ...baseTrace,
        path: trace318Path,
        ksArtifacts: ["TRF-0031", "TRF-0032"],
      },
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

  // SAV-032 — neutralisation du résultat LMNP non professionnel (domaine supporté : LMNP exclusif, IR). Une seule
  // règle pour 330 / 350 / 352 / 354 / 370 / 372 (jamais patchées séparément) ; voir `nonpro-neutralisation.ts`.
  //   330 = −E + totalNonDeductible (E < 0) ou totalNonDeductible ; 350 = E (E > 0, ARD consommés inclus) ;
  //   352 = 370 = 0 imprimés (colonne 1, comme le dossier témoin accepté) ; 354 et 372 vides.
  // `resultatFiscalAvantDeficits` (F-006) est la grandeur métier de 2031 7a : ce n'est PAS la ligne 352/354.
  const neutralisation = resolveNonProNeutralisation(fr);
  const neutralisationTrace = {
    ...baseTrace,
    ksArtifacts: ["SAV-032", "SAV-030", "TRF-0031", "TRF-0032"],
  };
  if (neutralisation.status === "AVAILABLE") {
    if (neutralisation.ligne330 > 0) {
      cases.push({
        caseId: "330",
        label: "Divers à réintégrer (déficit LMNP non professionnel et charges non déductibles)",
        value: neutralisation.ligne330,
        trace: {
          ...neutralisationTrace,
          path: "max(−E, 0) + fiscalResult.charges.totalNonDeductible, E = fiscalResult.resultatFiscalAvantDeficits + fiscalResult.amortReportesUtilises",
        },
      });
    }
    if (neutralisation.ligne350 > 0) {
      cases.push({
        caseId: "350",
        label: "Divers à déduire (bénéfice LMNP non professionnel, ARD consommés inclus)",
        value: neutralisation.ligne350,
        trace: {
          ...neutralisationTrace,
          path: "max(E, 0), E = fiscalResult.resultatFiscalAvantDeficits + fiscalResult.amortReportesUtilises",
        },
      });
    }
    cases.push(
      {
        caseId: "352",
        label: "Résultat fiscal avant imputation des déficits antérieurs — Bénéfice (col. 1)",
        value: 0,
        trace: { ...neutralisationTrace, path: "case 312/314 + case 318 + case 330 − case 350 (projection de présentation : résultat de l'équation 2033-B, 0 après neutralisation)" },
      },
      {
        caseId: "370",
        label: "Résultat fiscal après imputation des déficits — Bénéfice (col. 1)",
        value: 0,
        trace: { ...neutralisationTrace, path: "case 352 − case 354 − 356 − 360 (356 = 360 = 0 : IS uniquement) = 0" },
      },
    );
  }

  const casesNonAlimentees: CerfaCaseNonAlimentee[] = [
    ...(neutralisation.status === "UNAVAILABLE"
      ? (["330", "350", "352", "354", "370", "372"] as const).map((caseId) => ({
          caseId,
          label: `Ligne ${caseId} (neutralisation du résultat LMNP non professionnel, SAV-032)`,
          raison: neutralisation.raison,
          categorie: "incoherence_modele" as const,
        }))
      : []),
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
    balancing: computeBalancing2033B(cases, neutralisation.status === "UNAVAILABLE" ? neutralisation.raison : undefined),
  };
}
