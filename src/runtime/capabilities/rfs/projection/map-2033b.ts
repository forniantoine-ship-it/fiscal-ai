import type { FiscalRepresentation } from "../types";
import type { CaseTrace, CerfaCase } from "../../f007/types";
import { round2 } from "../../f007/types";

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
 * aujourd'hui QUE la commission de caution ; garantie récupérable, garantie
 * non qualifiée et assurance pré-exploitation restent hors périmètre de ce
 * cycle (paliers ultérieurs). `rfs.emprunts` absent → repli sur l'ancien
 * comportement (294 = chargesFinancement en totalité, 242 absente).
 *
 * Audit fiscal ciblé (déficits LMNP) — 360 est reclassée en `non_applicable`,
 * pour la même raison que 356 : la notice 2033-NOT-SD réserve explicitement
 * cette ligne aux entreprises relevant de l'IS. `fiscalResult.deficitsImputes`
 * n'y est jamais projetée — cette donnée reste déjà reflétée dans
 * `resultatFiscal` (case 370) et documentée séparément sur le 2042-C-PRO
 * (cases 5GA-5GJ).
 *
 * Audit fiscal ciblé (case 350) — pour les entreprises à l'IR, la notice
 * 2033-NOT-SD indique explicitement qu'à la place du Cadre II du 2033-D-SD
 * (réservé à l'IS), le montant de déficit imputé sur le bénéfice catégoriel
 * doit être mentionné en case 350 « Divers à déduire ». 218/254 exceptées,
 * 350 est la première case du groupe 209-350 sortie du statut « non
 * traitée » : projection informative pure de `fiscalResult.deficitsImputes`
 * — elle ne participe à aucun calcul de 352/354/370/372, qui restent des
 * lectures indépendantes de `resultatFiscal`/`deficitNouveau`.
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
};

export function map2033BFromRfs(rfs: FiscalRepresentation): Form2033B {
  const fr = rfs.fiscalResult;
  const baseTrace: Omit<CaseTrace, "path"> = { source: "FiscalResult", ksArtifacts: ["TRF-0032"] };

  // Cases 242/294 — P1 : ventilation du financement par nature, depuis
  // `rfs.emprunts` (F-011, PretFinancementExercice[]), jamais recalculée.
  // `rfs.emprunts` et `fiscalResult.charges.chargesFinancement` proviennent,
  // dans le pipeline réel, du même appel à computeFinancementExercice()
  // (run-declaration-generation.ts) — descendre au détail n'introduit donc
  // aucune seconde source de vérité, seulement un niveau de granularité plus
  // fin d'une donnée déjà calculée. `chargesFinancement` reste le total de
  // contrôle (invariant de conservation, vérifié par les tests, jamais par
  // ce code — voir rfs-2033b.test.ts).
  //
  // `garantieDeductible` ne représente aujourd'hui QUE la commission de
  // caution (F-011 ne capture aucun montant pour hypothèque/IPPD/autre) —
  // elle rejoint 242 à ce titre précis, jamais comme "toute garantie".
  //
  // `rfs.emprunts === undefined` (jamais fourni) → repli explicite sur
  // l'ancien comportement : 294 = chargesFinancement en totalité, 242 reste
  // absente. Jamais une ventilation arbitraire faute de détail disponible.
  // `rfs.emprunts` vide (`[]`, financement nul) est distinct : le détail est
  // disponible, la somme vaut simplement 0 des deux côtés.
  const emprunts = rfs.emprunts;
  const financement242 =
    emprunts !== undefined
      ? round2(
          emprunts.reduce(
            (acc, p) => acc + p.assuranceEmpruntExercice + p.fraisDossierDeductibles + p.garantieDeductible,
            0,
          ),
        )
      : undefined;
  const financement294 =
    emprunts !== undefined
      ? round2(emprunts.reduce((acc, p) => acc + p.interetsEmpruntExercice + p.iraDeductible, 0))
      : round2(fr.charges.chargesFinancement);
  const empruntsTrace: Omit<CaseTrace, "path"> = { source: "Emprunts", ksArtifacts: ["TRF-0016", "TRF-0032"] };

  // Case 264 — Total des charges d'exploitation (II). Formule établie et
  // vérifiée par l'audit FEC (grand livre comptable réel du dossier de
  // référence, reconciliation au centime près) : les charges d'exploitation
  // comptables complètes = la part déductible fiscalement (F-012) + les
  // dotations aux amortissements comptables (compte PCG 681, confirmé dans
  // le FEC) + les charges comptabilisées mais fiscalement non déductibles
  // (F-012, ex. fonds de roulement de copropriété). Projection de trois
  // valeurs déjà calculées — aucune règle fiscale nouvelle.
  const charges264 = round2(fr.charges.chargesExploitation + fr.amortCalcule + fr.charges.totalNonDeductible);
  // Case 270 — Résultat d'exploitation (I − II). Différence entre deux cases
  // déjà projetées (232 et 264) — présentation Cerfa, pas un calcul fiscal.
  const resultat270 = round2(fr.recettes.total - charges264);
  // Cases 310/312/314 — résultat comptable. Même formule et même preuve que
  // pour 264 : resultatAvantAmort (déjà net des charges non déductibles, par
  // construction F-012) moins l'amortissement comptable complet moins les
  // charges non déductibles réintègre exactement le résultat comptable réel
  // (vérifié : -9862 - 3720 - 99 = -13681, valeur exacte du dossier de
  // référence).
  const resultatComptable = round2(fr.resultatAvantAmort - fr.amortCalcule - fr.charges.totalNonDeductible);

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
        path: "fiscalResult.charges.chargesExploitation + fiscalResult.amortCalcule + fiscalResult.charges.totalNonDeductible",
        ksArtifacts: ["TRF-0020", "TRF-0012", "TRF-0032"],
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
          ? { ...empruntsTrace, path: "Σ rfs.emprunts[].(interetsEmpruntExercice + iraDeductible)" }
          : { ...baseTrace, path: "fiscalResult.charges.chargesFinancement" },
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
      // Audit fiscal ciblé (déficits LMNP) — la notice 2033-NOT-SD indique
      // explicitement que les entreprises à l'IR doivent mentionner sur cette
      // ligne le montant de déficit imputé sur le bénéfice catégoriel (à la
      // place du Cadre II du 2033-D-SD, réservé à l'IS). Projection
      // informative pure de fiscalResult.deficitsImputes, déjà calculé par
      // TRF-0031 — ne participe à aucun calcul de 352/354/370/372.
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

  // Case 242 — P1 : uniquement quand le détail par prêt est disponible
  // (financement242 !== undefined, voir plus haut). Jamais une valeur à 0
  // inventée en son absence : contrairement à 218/254/300/350 (scalaires
  // propres de FiscalResult, toujours définis), 242 est une somme qui exige
  // le détail — sans lui, il n'existe aucune base non arbitraire pour
  // affirmer "242 = 0" pendant que 294 porte la totalité de chargesFinancement.
  if (financement242 !== undefined) {
    cases.push({
      caseId: "242",
      label: "Autres charges externes",
      value: financement242,
      trace: {
        ...empruntsTrace,
        path: "Σ rfs.emprunts[].(assuranceEmpruntExercice + fraisDossierDeductibles + garantieDeductible)",
      },
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

  if (fr.resultatFiscal > 0) {
    cases.push({
      caseId: "370",
      label: "Résultat fiscal après imputation des déficits — Bénéfice (col. 1)",
      value: round2(fr.resultatFiscal),
      trace: { ...baseTrace, path: "fiscalResult.resultatFiscal" },
    });
  }

  if (fr.deficitNouveau > 0) {
    cases.push({
      caseId: "372",
      label: "Résultat fiscal après imputation des déficits — Déficit (col. 2)",
      value: round2(fr.deficitNouveau),
      trace: { ...baseTrace, path: "fiscalResult.deficitNouveau", ksArtifacts: ["TRF-0031", "TRF-0032"] },
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

  return {
    formId: "2033-B-SD",
    millésime: rfs.exercice,
    cases,
    casesNonAlimentees,
  };
}
