import { jsPDF } from "jspdf";
import type { ClientSummaryDocument } from "./build-client-summary-document";

/**
 * Rendu PDF du document client — pur rendu, AUCUNE logique métier ici.
 * Toutes les valeurs affichées proviennent de `ClientSummaryDocument`, déjà
 * construit par `buildClientSummaryDocument()`. Ce fichier ne fait que
 * disposer ce contenu sur la page.
 *
 * Librairie : jsPDF (déjà utilisée pour ce document uniquement — pas de
 * mélange avec le futur PDF Cerfa officiel, qui utilisera pdf-lib sur les
 * gabarits DGFiP).
 */

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 6;

function fmtEurValue(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

/**
 * `toLocaleString("fr-FR")` produit un séparateur de milliers non standard
 * selon l'environnement Node/ICU — vérifié empiriquement : U+202F (narrow
 * no-break space) ici, U+00A0 (no-break space) possible sur d'autres
 * runtimes. La police standard "Helvetica" utilisée par jsPDF (non
 * embarquée) ne rend correctement aucun des deux dans certains lecteurs/
 * extracteurs — ils apparaissent comme un "/". Purement cosmétique,
 * purement côté rendu : on les remplace par une espace normale juste avant
 * l'écriture, jamais dans les données du document
 * (`build-client-summary-document.ts` reste inchangé).
 */
function sanitizeForPdf(text: string): string {
  return text.replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
}

/** Curseur d'écriture avec saut de page automatique — pure présentation. */
class PdfCursor {
  private y = MARGIN;
  private pageNumber = 1;

  constructor(private readonly doc: jsPDF) {}

  private ensureSpace(height: number): void {
    if (this.y + height > PAGE_HEIGHT - MARGIN) {
      this.doc.addPage();
      this.pageNumber += 1;
      this.y = MARGIN;
    }
  }

  newPage(): void {
    if (this.y > MARGIN) {
      this.doc.addPage();
      this.pageNumber += 1;
      this.y = MARGIN;
    }
  }

  heading(text: string): void {
    this.ensureSpace(LINE_HEIGHT * 2);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(16);
    this.doc.text(sanitizeForPdf(text), MARGIN, this.y);
    this.y += LINE_HEIGHT * 1.6;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(11);
  }

  subheading(text: string): void {
    this.ensureSpace(LINE_HEIGHT * 1.5);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(13);
    this.doc.text(sanitizeForPdf(text), MARGIN, this.y);
    this.y += LINE_HEIGHT * 1.3;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(11);
  }

  paragraph(text: string): void {
    const lines = this.doc.splitTextToSize(sanitizeForPdf(text), CONTENT_WIDTH) as string[];
    this.ensureSpace(lines.length * LINE_HEIGHT);
    this.doc.text(lines, MARGIN, this.y);
    this.y += lines.length * LINE_HEIGHT + LINE_HEIGHT * 0.4;
  }

  line(text: string, options: { bold?: boolean } = {}): void {
    this.ensureSpace(LINE_HEIGHT);
    this.doc.setFont("helvetica", options.bold ? "bold" : "normal");
    this.doc.text(sanitizeForPdf(text), MARGIN, this.y);
    this.doc.setFont("helvetica", "normal");
    this.y += LINE_HEIGHT;
  }

  spacer(height = LINE_HEIGHT * 0.6): void {
    this.y += height;
  }

  /** Encadré titré (bordure simple) — pour "Ce que nous avons calculé pour vous", etc. */
  box(title: string, bullets: string[]): void {
    if (bullets.length === 0) return;
    const padding = 4;
    const innerWidth = CONTENT_WIDTH - padding * 2;
    this.doc.setFontSize(11);
    this.doc.setFont("helvetica", "bold");
    const titleHeight = LINE_HEIGHT * 1.2;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10);
    const wrapped = bullets.map((b) => this.doc.splitTextToSize(sanitizeForPdf(`• ${b}`), innerWidth) as string[]);
    const bodyHeight = wrapped.reduce((sum, lines) => sum + lines.length * (LINE_HEIGHT - 1), 0);
    const boxHeight = padding * 2 + titleHeight + bodyHeight;

    this.ensureSpace(boxHeight + 2);
    const boxTop = this.y;
    this.doc.setDrawColor(180);
    this.doc.roundedRect(MARGIN, boxTop, CONTENT_WIDTH, boxHeight, 2, 2, "S");

    let cursorY = boxTop + padding + LINE_HEIGHT * 0.7;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.text(sanitizeForPdf(title), MARGIN + padding, cursorY);
    cursorY += titleHeight * 0.6;

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10);
    for (const lines of wrapped) {
      this.doc.text(lines, MARGIN + padding, cursorY);
      cursorY += lines.length * (LINE_HEIGHT - 1);
    }
    this.doc.setFontSize(11);
    this.y = boxTop + boxHeight + LINE_HEIGHT * 0.6;
  }

  /** Tableau simple à 2 colonnes (libellé / montant), pour les catégories de charges. */
  twoColumnTable(title: string, rows: { label: string; montant: string }[]): void {
    if (rows.length === 0) return;
    this.subheading(title);
    const colLabel = MARGIN;
    const colMontantRight = PAGE_WIDTH - MARGIN;
    const rowHeight = LINE_HEIGHT * 1.1;
    this.doc.setFontSize(10);
    for (const row of rows) {
      this.ensureSpace(rowHeight);
      this.doc.text(sanitizeForPdf(row.label), colLabel, this.y);
      this.doc.text(sanitizeForPdf(row.montant), colMontantRight, this.y, { align: "right" });
      this.y += rowHeight;
    }
    this.doc.setFontSize(11);
    this.spacer();
  }

  finalizePagination(): void {
    const totalPages = this.doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      this.doc.setPage(page);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(9);
      this.doc.text(`Page ${page} / ${totalPages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 10, { align: "right" });
    }
  }
}

export function renderClientSummaryPdf(document: ClientSummaryDocument): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cursor = new PdfCursor(doc);
  const s = document.syntheseFiscale;

  // ---- Page 1 — Votre synthèse fiscale LMNP ----
  cursor.heading("Votre synthèse fiscale LMNP");
  if (document.meta.identite.denomination) cursor.line(document.meta.identite.denomination);
  if (document.meta.identite.siret) cursor.line(`SIRET : ${document.meta.identite.siret}`);
  if (document.meta.identite.adresseEntreprise) cursor.line(document.meta.identite.adresseEntreprise);
  cursor.line(`Exercice ${document.meta.exercice}`);
  cursor.spacer(LINE_HEIGHT);

  const principal = s.resultatPrincipal;
  cursor.subheading(
    principal.nature === "deficit"
      ? `Déficit fiscal de l'exercice : ${fmtEurValue(principal.montant)}`
      : `Résultat fiscal de l'exercice : ${fmtEurValue(principal.montant)}`,
  );
  cursor.spacer();

  cursor.line(`Recettes : ${fmtEurValue(s.recettes)}`);
  cursor.line(`Charges déductibles de l'exercice : ${fmtEurValue(s.chargesDeductibles)}`);
  // P0-3b — même correction que la page 2 (formationDuResultat) : sans cette
  // ligne, "Résultat avant amortissement" juste en dessous ne se déduit pas
  // arithmétiquement des deux lignes précédentes dès que ce montant est non
  // nul. Restitution directe de syntheseFiscale.chargesPreExploitation
  // (déjà transportée, jamais recalculée ici), masquée à 0 comme les autres
  // lignes conditionnelles de ce bloc (amortissementReporte ci-dessous).
  if (s.chargesPreExploitation > 0) {
    cursor.line(`Charges déductibles de pré-exploitation : ${fmtEurValue(s.chargesPreExploitation)}`);
  }
  cursor.line(`Résultat avant amortissement : ${fmtEurValue(s.resultatAvantAmortissement)}`);
  cursor.line(`Amortissement calculé : ${fmtEurValue(s.amortissementCalcule)}`);
  cursor.line(`Amortissement déductible : ${fmtEurValue(s.amortissementDeductible)}`);
  if (s.amortissementReporte > 0) {
    cursor.line(`Amortissement reporté (article 39 C du CGI) : ${fmtEurValue(s.amortissementReporte)}`);
  }
  if (s.deficitsAnterieursImputes > 0) {
    cursor.line(`Déficits antérieurs imputés cette année : ${fmtEurValue(s.deficitsAnterieursImputes)}`);
  }
  cursor.line(
    principal.nature === "deficit"
      ? `Déficit fiscal final : ${fmtEurValue(principal.montant)}`
      : `Résultat fiscal final : ${fmtEurValue(principal.montant)}`,
    { bold: true },
  );

  cursor.spacer(LINE_HEIGHT * 0.6);
  cursor.box("Ce que nous avons calculé pour vous", document.travailEffectue);

  cursor.spacer(LINE_HEIGHT * 0.4);
  cursor.paragraph(document.avertissements.perimetreDocument);

  // ---- Page 2 — Comment votre résultat fiscal a été déterminé ----
  cursor.newPage();
  cursor.heading("Comment votre résultat fiscal a été déterminé");
  for (const ligne of document.formationDuResultat) {
    cursor.line(ligne, { bold: ligne.startsWith("=") });
  }

  cursor.spacer(LINE_HEIGHT * 0.4);
  cursor.twoColumnTable(
    "Détail de vos charges par catégorie",
    document.chargesParCategorie.map((c) => ({ label: c.label, montant: fmtEurValue(c.montant) })),
  );

  if (s.deficitsAnterieursImputes > 0 || s.totalDeficitsAnterieursRestants > 0) {
    cursor.subheading("Vos déficits antérieurs");
    if (s.deficitsAnterieursImputes > 0) {
      cursor.line(`Montant utilisé cette année : ${fmtEurValue(s.deficitsAnterieursImputes)}`);
    }
    if (s.totalDeficitsAnterieursRestants > 0) {
      cursor.line(`Montant restant à reporter sur les exercices suivants : ${fmtEurValue(s.totalDeficitsAnterieursRestants)}`);
    }
    cursor.spacer();
  }

  if (document.avertissements.deficitsExpires) {
    cursor.box("Déficits arrivés à expiration", [document.avertissements.deficitsExpires]);
    cursor.spacer();
  }

  cursor.box("Pourquoi ce résultat peut être différent de votre résultat comptable ou de votre trésorerie", [
    document.avertissements.differenceResultatTresorerie,
  ]);

  // L'aide détaillée à la déclaration 2042-C-PRO (cases, montants,
  // instructions à saisir/à vérifier) vit désormais dans un document dédié —
  // voir `render-aide-2042-pdf.ts`. Elle n'est plus dupliquée ici : ce
  // document reste centré sur la synthèse du calcul fiscal.
  cursor.spacer(LINE_HEIGHT * 0.4);
  cursor.paragraph(document.avertissements.statutEdi);

  cursor.finalizePagination();
  return doc;
}

/** Déclenche le téléchargement navigateur du PDF client. */
export function downloadClientSummaryPdf(document: ClientSummaryDocument): void {
  const doc = renderClientSummaryPdf(document);
  doc.save(`synthese-fiscale-lmnp-${document.meta.exercice}.pdf`);
}
