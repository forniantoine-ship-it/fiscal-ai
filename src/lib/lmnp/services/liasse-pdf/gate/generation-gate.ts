/**
 * Generation gate — contrôles bloquants entre les `CerfaCase[]` produits par
 * les mappers fiscaux (inchangés) et l'écriture effective du PDF. Distinct
 * de `resolveDeclarationGenerationGate()` (qui protège l'ENTRÉE dans le
 * calcul fiscal) : celui-ci protège la SORTIE, jamais l'inverse.
 *
 * Principe absolu (section 16 de la mission) : un système qui bloque plutôt
 * qu'un système qui invente. Aucune violation n'est jamais "juste un
 * avertissement" transformé silencieusement en génération partielle — une
 * violation bloque la génération complète, point final.
 */
import { createHash } from "node:crypto";
import type { PDFFont } from "pdf-lib";
import { resolveAssetManifestEntry, type CerfaAssetManifestEntry } from "../asset-manifest";
import { isExcludedCase } from "../excluded-cases";
import { isDocumentedOverlap } from "../overlap-exceptions";
import { isMillesimeKnown, resolveAllVisualMappings, resolveVisualMapping } from "../registry";
import { formatCerfaValue } from "../generator/format-value";
import type { CerfaCase, CerfaFormId, CerfaVisualMapping, GateViolation, Millesime } from "../types";

export type FormInput = {
  form: CerfaFormId;
  cases: readonly CerfaCase[];
};

/**
 * Phase 1 — contrôles structurels et de couverture de mapping. Purement
 * synchrone, aucune dépendance à pdf-lib : peut être testée et exécutée sans
 * jamais charger un octet de PDF.
 */
export function runStructuralAndMappingGate(input: {
  forms: readonly FormInput[];
  millesime: Millesime;
}): GateViolation[] {
  const violations: GateViolation[] = [];

  if (!isMillesimeKnown(input.millesime)) {
    for (const f of input.forms) {
      violations.push({
        code: "millesime-inconnu",
        form: f.form,
        message: `Aucun registre visuel connu pour le millésime ${input.millesime}. Un registre doit exister AVANT toute génération pour ce millésime — jamais un repli silencieux vers un autre millésime.`,
      });
    }
    return violations;
  }

  const overlapCheckedForms = new Set<CerfaFormId>();
  for (const { form, cases } of input.forms) {
    // Contrôle géométrique PUR (section 16 de la mission de correction P0) :
    // le registre lui-même ne doit jamais définir deux cases distinctes à la
    // même position — indépendamment de ce qu'un mapper produit à
    // l'exécution. Vérifié une seule fois par formulaire (le registre est
    // statique, inutile de le refaire à chaque case).
    if (!overlapCheckedForms.has(form)) {
      overlapCheckedForms.add(form);
      violations.push(...checkOverlappingPositions({ form, millesime: input.millesime }));
    }

    const manifestEntry = resolveAssetManifestEntry(form, input.millesime);
    if (!manifestEntry) {
      violations.push({
        code: "asset-manifest-manquant",
        form,
        message: `Aucune entrée de manifeste d'asset pour ${form} / millésime ${input.millesime}. Impossible de savoir quel fichier PDF officiel charger.`,
      });
      continue;
    }

    const seenCaseIds = new Set<string>();
    for (const cerfaCase of cases) {
      if (seenCaseIds.has(cerfaCase.caseId)) {
        violations.push({
          code: "case-id-dupliquee",
          form,
          caseId: cerfaCase.caseId,
          message: `Le mapper a produit deux fois la case "${cerfaCase.caseId}" pour ${form} — signale un défaut du mapper fiscal (hors périmètre de correction de cette mission), mais bloque la génération plutôt que d'écrire deux valeurs au même endroit.`,
        });
        continue;
      }
      seenCaseIds.add(cerfaCase.caseId);

      const mapping = resolveVisualMapping(form, input.millesime, cerfaCase.caseId);
      if (!mapping) {
        // Une case explicitement RETIRÉE du périmètre (excluded-cases.ts,
        // avec sa raison documentée) n'est jamais une violation bloquante —
        // c'est une décision délibérée, pas un oubli. Le générateur
        // (render-cerfa-liasse.ts) la consigne dans `excludedCases`, jamais
        // silencieusement. Toute autre absence de mapping reste bloquante :
        // c'est la différence entre "nous avons choisi de ne pas rendre
        // cette case" et "personne n'a pensé à cette case".
        if (isExcludedCase(form, input.millesime, cerfaCase.caseId)) continue;
        violations.push({
          code: "case-sans-mapping-visuel",
          form,
          caseId: cerfaCase.caseId,
          message: `La case "${cerfaCase.caseId}" est produite par le mapper fiscal de ${form} mais n'a aucune entrée dans le registre visuel ${input.millesime}, ET n'est pas dans la liste des exclusions documentées (excluded-cases.ts). Ajouter une entrée calibrée, ou une exclusion documentée — jamais une position devinée à la volée.`,
        });
        continue;
      }

      if (mapping.calibration === "a-calibrer") {
        violations.push({
          code: "case-sans-mapping-visuel",
          form,
          caseId: cerfaCase.caseId,
          message: `La case "${cerfaCase.caseId}" a une entrée de registre marquée "a-calibrer" (aucune mesure réelle) — génération bloquée tant qu'un calibrage visuel humain n'a pas confirmé sa position. Voir la note de l'entrée dans le registre pour le détail.`,
        });
        continue;
      }

      // Mauvaise page : le registre pointe vers une page que CE formulaire
      // n'a pas (ex. registre calibré pour page 2 d'un formulaire qui n'en
      // compte qu'une, après une évolution du manifeste d'asset non
      // répercutée dans le registre visuel). Contrôle structurel, sans
      // avoir besoin de charger le PDF.
      const pageViolation = checkPageBounds({
        form,
        caseId: cerfaCase.caseId,
        mappingPage: mapping.page,
        formPageCount: manifestEntry.declarationAssetPages.length,
      });
      if (pageViolation) violations.push(pageViolation);
    }
  }

  return violations;
}

/**
 * Phase 2 — débordement de largeur. Nécessite la police réellement utilisée
 * par le générateur (mesure exacte via pdf-lib, pas une heuristique) : cette
 * fonction reste dans le module "gate" conceptuellement, mais s'exécute
 * après le chargement de la police par le générateur — voir
 * `generator/render-cerfa-liasse.ts`, qui l'invoque avant tout `drawText`.
 */
export function checkOverflow(input: {
  form: CerfaFormId;
  caseValue: CerfaCase;
  mapping: CerfaVisualMapping;
  font: PDFFont;
}): GateViolation | undefined {
  const { form, caseValue, mapping, font } = input;
  const fontSize = mapping.fontSize ?? 9;

  if (mapping.format === "chiffres-repartis") {
    // Chaque chiffre est mesuré indépendamment dans son propre emplacement
    // (digitPositions) par le générateur — pas de largeur globale à vérifier ici.
    return undefined;
  }

  const text = formatCerfaValue(caseValue.value, mapping.format ?? "texte");
  if (text.length === 0) return undefined; // case-a-cocher à `false` : rien à mesurer.

  const measuredWidth = font.widthOfTextAtSize(text, fontSize);
  if (measuredWidth > mapping.width) {
    return {
      code: "debordement-largeur",
      form,
      caseId: caseValue.caseId,
      message: `La valeur "${text}" de la case "${caseValue.caseId}" mesure ${measuredWidth.toFixed(1)}pt à la taille ${fontSize}, au-delà de la largeur calibrée (${mapping.width}pt). Jamais tronquée silencieusement pour un format numérique — génération bloquée.`,
    };
  }
  return undefined;
}

export function assetManifestFor(form: CerfaFormId, millesime: Millesime): CerfaAssetManifestEntry | undefined {
  return resolveAssetManifestEntry(form, millesime);
}

/**
 * Empreinte d'intégrité de l'asset — extrait en fonction pure testable (le
 * générateur ne fait qu'appeler cette fonction après avoir lu les octets du
 * fichier, jamais recalculer sa propre logique de hachage). Détecte un fond
 * officiel silencieusement remplacé, corrompu, ou d'un autre millésime,
 * AVANT toute écriture — ne modifie jamais le fichier lui-même.
 */
export function checkAssetIntegrity(input: {
  form: CerfaFormId;
  assetFile: string;
  bytes: Uint8Array;
  manifestEntry: CerfaAssetManifestEntry;
}): GateViolation | undefined {
  const { form, assetFile, bytes, manifestEntry } = input;
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== manifestEntry.sha256) {
    return {
      code: "asset-empreinte-invalide",
      form,
      message: `${assetFile} ne correspond plus à l'empreinte SHA-256 enregistrée dans le manifeste (attendu ${manifestEntry.sha256}, obtenu ${actualSha256}) — le fond officiel a été modifié, remplacé, ou corrompu depuis son calibrage. Génération bloquée avant toute écriture.`,
    };
  }
  return undefined;
}

/**
 * Page du registre incohérente avec le manifeste d'asset — pur, sans avoir
 * besoin de charger le PDF (contrairement à `checkCoordinateBounds`, qui a
 * besoin des dimensions réelles de la page).
 */
export function checkPageBounds(input: {
  form: CerfaFormId;
  caseId: string;
  mappingPage: number;
  formPageCount: number;
}): GateViolation | undefined {
  const { form, caseId, mappingPage, formPageCount } = input;
  if (mappingPage < 1 || mappingPage > formPageCount) {
    return {
      code: "page-formulaire-invalide",
      form,
      caseId,
      message: `Le registre place la case "${caseId}" en page ${mappingPage} de ${form}, mais ce formulaire n'en compte que ${formPageCount} (voir asset-manifest.ts). Registre désynchronisé du manifeste — génération bloquée.`,
    };
  }
  return undefined;
}

/**
 * Anti-superposition — PUREMENT géométrique, aucune règle fiscale (section
 * 16 de la mission de correction P0). Deux `CerfaVisualMapping` distinctes
 * du même registre (formulaire + millésime + page) ne doivent jamais
 * partager exactement le même point d'ancrage `(x, y)`, sauf exception
 * explicitement documentée dans `overlap-exceptions.ts` — jamais une
 * coïncidence tolérée silencieusement. Détecté par le seul contenu STATIQUE
 * du registre : n'a besoin d'aucun `CerfaCase[]` en entrée, donc protège même
 * les cases qu'un jeu de tests donné n'exerce jamais (ex. 372 et
 * C_L1_COL1/COL2 étaient superposées bien avant qu'un scénario de test ne
 * les déclenche simultanément).
 *
 * Historique (audit indépendant Cursor/Grok, P0-2/P0-3) : avant correction,
 * `C_L1_COL1` et `C_L1_COL2` du registre `2031-SD` partageaient exactement
 * (x=502.9, y=264.8) — exactement le cas que cette fonction est conçue pour
 * bloquer désormais.
 */
/**
 * Algorithme PUR, testable indépendamment de tout registre réel : regroupe
 * des `CerfaVisualMapping` par (page, x, y) exacts et retourne chaque
 * groupe de taille ≥2 (deux caseId ou plus à la même position). Séparée de
 * `checkOverlappingPositions` pour que les tests puissent vérifier l'ALGORITHME
 * sur des mappings synthétiques, sans dépendre du contenu actuel du registre
 * (qui change avec le temps) — voir `tests/generation-gate.test.ts`.
 */
export function findOverlappingPositionGroups(
  mappings: readonly CerfaVisualMapping[],
): CerfaVisualMapping[][] {
  const groups = new Map<string, CerfaVisualMapping[]>();
  for (const mapping of mappings) {
    const key = `${mapping.page}:${mapping.position.x}:${mapping.position.y}`;
    const group = groups.get(key);
    if (group) group.push(mapping);
    else groups.set(key, [mapping]);
  }
  return [...groups.values()].filter((group) => group.length >= 2);
}

export function checkOverlappingPositions(input: { form: CerfaFormId; millesime: Millesime }): GateViolation[] {
  const { form, millesime } = input;
  const mappings = resolveAllVisualMappings(form, millesime);

  const violations: GateViolation[] = [];
  for (const group of findOverlappingPositionGroups(mappings)) {
    const caseIds = group.map((m) => m.caseId);
    if (isDocumentedOverlap(form, millesime, caseIds)) continue;

    const { page, position } = group[0];
    violations.push({
      code: "positions-superposees",
      form,
      caseId: caseIds.join(", "),
      message: `Les cases "${caseIds.join('", "')}" du registre ${form} (millésime ${millesime}) partagent exactement la même position (page ${page}, x=${position.x}, y=${position.y}), sans exception documentée dans overlap-exceptions.ts. Deux cases distinctes ne doivent jamais être dessinées au même point du Cerfa — vérifier et corriger le registre.`,
    });
  }
  return violations;
}

/**
 * Coordonnées hors page — nécessite les dimensions réelles de la page (donc
 * appelé par le générateur, après chargement du fond officiel, comme
 * `checkOverflow`). Détecte une entrée de registre dont la position
 * (mesurée sur un millésime différent, ou simplement fautive) tomberait en
 * dehors des limites physiques de la page — jamais un dessin invisible ou
 * débordant silencieusement du support.
 */
export function checkCoordinateBounds(input: {
  form: CerfaFormId;
  caseId: string;
  mapping: CerfaVisualMapping;
  pageWidth: number;
  pageHeight: number;
}): GateViolation | undefined {
  const { form, caseId, mapping, pageWidth, pageHeight } = input;
  const { x, y } = mapping.position;
  if (x < 0 || x > pageWidth || y < 0 || y > pageHeight) {
    return {
      code: "coordonnee-hors-page",
      form,
      caseId,
      message: `La position de la case "${caseId}" (x=${x}, y=${y}) tombe en dehors des limites de la page (${pageWidth}×${pageHeight}pt). Registre invalide pour ce millésime — génération bloquée.`,
    };
  }
  return undefined;
}
