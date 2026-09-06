/**
 * Générateur PDF — overlay sur Cerfa officiel immuable (méthode B, seule
 * méthode retenue par l'audit "Générer le Cerfa" : les PDF DGFiP 2026
 * inspectés ne contiennent aucun champ AcroForm/XFA, donc aucune méthode de
 * remplissage de champ n'est applicable).
 *
 * Ce module NE CONTIENT AUCUNE RÈGLE FISCALE. Il :
 *   1. vérifie la generation gate (structure + mapping + calibrage) ;
 *   2. copie, page par page, les fonds Cerfa officiels tels quels
 *      (`copyPages` — jamais de rastérisation, jamais de retouche du fond) ;
 *   3. pour chaque `CerfaCase` produite par un mapper fiscal existant,
 *      résout sa position dans le registre visuel et écrit la valeur, sans
 *      jamais décider si elle doit exister ;
 *   4. mesure le débordement AVANT d'écrire (gate phase 2) — bloque plutôt
 *      que de tronquer silencieusement un montant.
 *
 * Une case absente du `CerfaCase[]` d'entrée n'est JAMAIS dessinée, jamais
 * remplacée par 0, jamais cochée par déduction (section 8 de la mission).
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { readAssetBytes } from "../assets/load-asset";
import { resolveAssetManifestEntry } from "../asset-manifest";
import { toPdfLibPoint } from "./coordinates";
import { formatCerfaValue } from "./format-value";
import {
  checkAssetIntegrity,
  checkCoordinateBounds,
  checkOverflow,
  runStructuralAndMappingGate,
  type FormInput,
} from "../gate/generation-gate";
import { isExcludedCase } from "../excluded-cases";
import { resolveVisualMapping } from "../registry";
import { ALL_CERFA_FORM_IDS } from "../types";
import type {
  CerfaFormId,
  ExcludedCaseRecord,
  GateViolation,
  LiasseGenerationResult,
  Millesime,
  RenderManifestEntry,
} from "../types";

/**
 * Ordre canonique d'assemblage de la liasse finale — celui du dossier
 * témoin et de la DGFiP elle-même, jamais l'ordre d'appel du code. Seuls
 * les formulaires effectivement passés dans `input.forms` sont assemblés ;
 * cette constante fixe uniquement leur ORDRE relatif si plusieurs sont
 * fournis dans un ordre différent.
 */
const CANONICAL_FORM_ORDER: readonly CerfaFormId[] = ALL_CERFA_FORM_IDS;

function sortByCanonicalOrder(forms: readonly FormInput[]): FormInput[] {
  return [...forms].sort(
    (a, b) => CANONICAL_FORM_ORDER.indexOf(a.form) - CANONICAL_FORM_ORDER.indexOf(b.form),
  );
}

export async function generateCerfaLiassePdf(input: {
  forms: readonly FormInput[];
  millesime: Millesime;
}): Promise<LiasseGenerationResult> {
  const orderedForms = sortByCanonicalOrder(input.forms);

  // --- Gate phase 1 : structure + couverture de mapping + calibrage ----
  const phase1Violations = runStructuralAndMappingGate({ forms: orderedForms, millesime: input.millesime });
  if (phase1Violations.length > 0) {
    return { status: "blocked", violations: phase1Violations };
  }

  const outputDoc = await PDFDocument.create();
  const font = await outputDoc.embedFont(StandardFonts.Helvetica);
  const black = rgb(0, 0, 0);

  const violations: GateViolation[] = [];
  const manifest: RenderManifestEntry[] = [];
  const excludedCases: ExcludedCaseRecord[] = [];
  const loadedAssetDocs = new Map<string, PDFDocument>();
  let outputPageCursor = 0;

  for (const { form, cases } of orderedForms) {
    // Consigner chaque case explicitement retirée du périmètre — une fois
    // par case, indépendamment du nombre de pages du formulaire. Jamais
    // silencieux (section 10 de la mission) : visible dans le résultat de
    // génération même quand celle-ci réussit par ailleurs.
    for (const cerfaCase of cases) {
      const excluded = isExcludedCase(form, input.millesime, cerfaCase.caseId);
      if (excluded) {
        excludedCases.push({
          form,
          caseId: cerfaCase.caseId,
          value: cerfaCase.value,
          classification: excluded.classification,
          reason: excluded.reason,
        });
      }
    }

    const manifestEntry = resolveAssetManifestEntry(form, input.millesime);
    if (!manifestEntry) {
      // Déjà détecté en phase 1 — inatteignable ici, garde défensive.
      violations.push({ code: "asset-manifest-manquant", form, message: "Manifeste introuvable (phase 2)." });
      continue;
    }

    let assetDoc = loadedAssetDocs.get(manifestEntry.assetFile);
    if (!assetDoc) {
      const bytes = readAssetBytes(input.millesime, manifestEntry.assetFile);

      // Empreinte d'intégrité — détecte un fond officiel silencieusement
      // remplacé, corrompu, ou d'un autre millésime AVANT toute écriture.
      // Ne modifie jamais le fichier ; compare seulement son contenu à
      // l'empreinte figée dans le manifeste au moment du calibrage.
      const integrityViolation = checkAssetIntegrity({ form, assetFile: manifestEntry.assetFile, bytes, manifestEntry });
      if (integrityViolation) {
        violations.push(integrityViolation);
        continue;
      }

      assetDoc = await PDFDocument.load(bytes);
      if (assetDoc.getPageCount() !== manifestEntry.assetTotalPages) {
        violations.push({
          code: "asset-page-count-inattendu",
          form,
          message: `${manifestEntry.assetFile} compte ${assetDoc.getPageCount()} page(s), ${manifestEntry.assetTotalPages} attendue(s) par le manifeste — fichier remplacé ou corrompu, génération bloquée avant toute écriture.`,
        });
        continue;
      }
      loadedAssetDocs.set(manifestEntry.assetFile, assetDoc);
    }

    // Copie des pages de DÉCLARATION uniquement — les pages de notice du
    // fichier partagé (le cas échéant) ne sont jamais copiées dans le PDF
    // final (point 12 de la mission), sans jamais modifier le fichier source.
    const zeroIndexedPages = manifestEntry.declarationAssetPages.map((p) => p - 1);
    const copiedPages: PDFPage[] = await outputDoc.copyPages(assetDoc, zeroIndexedPages);

    for (let formPageIndex = 0; formPageIndex < copiedPages.length; formPageIndex += 1) {
      const page = copiedPages[formPageIndex];
      outputDoc.addPage(page);
      outputPageCursor += 1;
      const formPageNumber = formPageIndex + 1;
      const pageHeight = page.getHeight();
      const pageWidth = page.getWidth();

      for (const cerfaCase of cases) {
        const mapping = resolveVisualMapping(form, input.millesime, cerfaCase.caseId);
        // Absent de mapping = déjà bloqué en phase 1 ; ici, ne concerne que
        // les cases de CETTE page précise (les autres pages du formulaire,
        // le cas échéant, sont traitées à leur propre itération).
        if (!mapping || mapping.page !== formPageNumber) continue;

        const boundsViolation = checkCoordinateBounds({
          form,
          caseId: cerfaCase.caseId,
          mapping,
          pageWidth,
          pageHeight,
        });
        if (boundsViolation) {
          violations.push(boundsViolation);
          continue;
        }

        const overflow = checkOverflow({ form, caseValue: cerfaCase, mapping, font });
        if (overflow) {
          violations.push(overflow);
          continue;
        }

        if (mapping.format === "chiffres-repartis") {
          const digits = formatCerfaValue(cerfaCase.value, mapping.format);
          const positions = mapping.digitPositions ?? [];
          if (digits.length !== positions.length) {
            violations.push({
              code: "debordement-largeur",
              form,
              caseId: cerfaCase.caseId,
              message: `"chiffres-repartis" attend ${positions.length} chiffre(s) (digitPositions), reçu ${digits.length} pour la case "${cerfaCase.caseId}".`,
            });
            continue;
          }
          for (let i = 0; i < digits.length; i += 1) {
            const point = toPdfLibPoint({ space: "top-left", x: positions[i], y: mapping.position.y }, pageHeight);
            page.drawText(digits[i], { x: point.x, y: point.y, size: mapping.fontSize ?? 9, font, color: black });
          }
          manifest.push({
            form,
            caseId: cerfaCase.caseId,
            outputPage: outputPageCursor,
            text: digits,
            pdfLibX: positions[0] ?? mapping.position.x,
            pdfLibY: pageHeight - mapping.position.y,
            measuredWidth: 0,
            maxWidth: mapping.width,
          });
          continue;
        }

        const text = formatCerfaValue(cerfaCase.value, mapping.format ?? "texte");
        if (text.length === 0) continue; // case-a-cocher à `false` : rien à dessiner.

        const fontSize = mapping.fontSize ?? 9;
        const measuredWidth = font.widthOfTextAtSize(text, fontSize);
        const align = mapping.align ?? "left";
        const anchorX =
          align === "right"
            ? mapping.position.x - measuredWidth
            : align === "center"
              ? mapping.position.x - measuredWidth / 2
              : mapping.position.x;

        const point = toPdfLibPoint({ space: "top-left", x: anchorX, y: mapping.position.y }, pageHeight);
        page.drawText(text, { x: point.x, y: point.y, size: fontSize, font, color: black });
        manifest.push({
          form,
          caseId: cerfaCase.caseId,
          outputPage: outputPageCursor,
          text,
          pdfLibX: point.x,
          pdfLibY: point.y,
          measuredWidth,
          maxWidth: mapping.width,
        });
      }
    }
  }

  if (violations.length > 0) {
    return { status: "blocked", violations };
  }

  const pdfBytes = await outputDoc.save();
  return {
    status: "generated",
    pdfBytes,
    manifest,
    millesime: input.millesime,
    forms: orderedForms.map((f) => f.form),
    excludedCases,
  };
}
