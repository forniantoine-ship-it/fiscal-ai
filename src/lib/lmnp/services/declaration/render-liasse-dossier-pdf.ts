/**
 * Rendu PDF des pages documentaires de la liasse — pur rendu.
 *
 * Architecture :
 *   F-006 → RFS → buildLiasseDossierDocument → renderLiasseDossierPdf
 *
 * Aucune règle fiscale ici. Chaque libellé et chaque montant provient
 * du `LiasseDossierDocument` déjà construit. Un champ absent est omis,
 * jamais remplacé par 0, "Non renseigné", ou une valeur déduite.
 *
 * Librairie : jsPDF (même pile que la synthèse / l'aide 2042). Les Cerfa
 * officiels restent hors de ce fichier (pdf-lib, étape de fusion ultérieure).
 */

import { jsPDF } from "jspdf";
import { colors } from "@/design-system/theme/colors";
import type {
  LiasseDossierChargeCategorie,
  LiasseDossierChargesDescriptives,
  LiasseDossierDocument,
  LiasseDossierImmobilisationLigne,
  LiasseDossierPret,
} from "./build-liasse-dossier-document";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 11;

const INK = colors.text.primary;
const INK_SECONDARY = colors.text.secondary;
const INK_MUTED = colors.text.tertiary;
const RULE = colors.border.strong;
const RULE_SUBTLE = colors.border.default;
const HEADER_FILL = colors.surface.tertiary;
const ROW_ALT = colors.surface.secondary;
const ACCENT = colors.orange[700];

type RGB = [number, number, number];

export const LIASSE_DOSSIER_PDF_TITLE = "Liasse fiscale";

export const LIASSE_DOSSIER_SECTION = {
  identite: "Identité et exercice",
  formation: "Formation du résultat",
  charges: "Charges",
  immobilisations: "Immobilisations et amortissements",
  financement: "Financement",
  reports: "Déficits et amortissements reportés",
} as const;

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function sanitizeForPdf(text: string): string {
  return text.replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
}

export function formatLiasseEur(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const formatted = Number.isInteger(rounded)
    ? rounded.toLocaleString("fr-FR")
    : rounded.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sanitizeForPdf(`${formatted} €`);
}

function formatDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return value.trim();
}

function formatTaux(value: number): string {
  const percent = value <= 1 ? value * 100 : value;
  return sanitizeForPdf(
    `${percent.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`,
  );
}

function regimeLabel(regime: "reel_simplifie" | "reel_normal"): string {
  return regime === "reel_simplifie" ? "Réel simplifié" : "Réel normal";
}

function typePretLabel(typePret: string): string {
  if (typePret === "amortissable") return "Emprunt amortissable";
  if (typePret === "in_fine") return "Emprunt in fine";
  return "Emprunt";
}

function fraisTraitementLabel(choix: "integration" | "deduction"): string {
  return choix === "deduction"
    ? "Déduction des frais d'acquisition"
    : "Intégration des frais d'acquisition au prix de revient";
}

function coproTypeLabel(type: string): string {
  if (type === "provisions") return "Provisions";
  if (type === "regularisation") return "Régularisation";
  if (type === "fonds_travaux") return "Fonds travaux";
  if (type === "appel_gros_travaux") return "Appel de gros travaux";
  return type.replace(/_/g, " ");
}

function isDefinedNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

type TextStyle = { bold?: boolean; size?: number; color?: string };

class DossierCursor {
  y = MARGIN;
  readonly doc: jsPDF;
  readonly runningLabel: string;
  readonly exercice: number;

  constructor(doc: jsPDF, runningLabel: string, exercice: number) {
    this.doc = doc;
    this.runningLabel = runningLabel;
    this.exercice = exercice;
  }

  setStyle(opts: TextStyle = {}): void {
    this.doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    this.doc.setFontSize(opts.size ?? 10);
    this.doc.setTextColor(...hexToRgb(opts.color ?? INK));
  }

  ensureSpace(height: number): void {
    if (this.y + height > FOOTER_Y - 8) {
      this.pageBreak();
    }
  }

  pageBreak(): void {
    this.doc.addPage();
    this.y = MARGIN;
    this.drawRunningHeader();
  }

  /** Nouvelle section : saut de page sauf si on est encore en haut de la première page. */
  startSection(): void {
    if (this.y > MARGIN + 4) {
      this.pageBreak();
    }
  }

  private drawRunningHeader(): void {
    this.setStyle({ size: 8, color: INK_MUTED });
    this.doc.text(sanitizeForPdf(`${this.runningLabel}  |  Exercice ${this.exercice}`), MARGIN, this.y);
    this.y += 4;
    this.doc.setDrawColor(...hexToRgb(RULE_SUBTLE));
    this.doc.setLineWidth(0.2);
    this.doc.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y);
    this.y += 6;
  }

  spacer(height = 3): void {
    this.y += height;
  }

  titleBlock(title: string, subtitle: string): void {
    this.setStyle({ bold: true, size: 16, color: INK });
    this.doc.text(sanitizeForPdf(title), MARGIN, this.y + 2);
    this.y += 8;
    this.setStyle({ bold: true, size: 12, color: ACCENT });
    this.doc.text(sanitizeForPdf(subtitle), MARGIN, this.y);
    this.y += 5;
    this.doc.setDrawColor(...hexToRgb(ACCENT));
    this.doc.setLineWidth(0.6);
    this.doc.line(MARGIN, this.y, MARGIN + 36, this.y);
    this.y += 8;
  }

  sectionHeading(text: string): void {
    this.ensureSpace(12);
    this.setStyle({ bold: true, size: 12, color: INK });
    this.doc.text(sanitizeForPdf(text), MARGIN, this.y);
    this.y += 3;
    this.doc.setDrawColor(...hexToRgb(RULE));
    this.doc.setLineWidth(0.35);
    this.doc.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y);
    this.y += 6;
  }

  subheading(text: string): void {
    this.ensureSpace(8);
    this.setStyle({ bold: true, size: 10, color: INK });
    this.doc.text(sanitizeForPdf(text), MARGIN, this.y);
    this.y += 5;
  }

  kv(label: string, value: string | undefined): void {
    if (!value) return;
    this.ensureSpace(5.4);
    this.setStyle({ size: 9.5, color: INK_SECONDARY });
    this.doc.text(sanitizeForPdf(label), MARGIN, this.y);
    this.setStyle({ size: 9.5, color: INK });
    const wrapped = this.doc.splitTextToSize(sanitizeForPdf(value), CONTENT_WIDTH * 0.58) as string[];
    this.doc.text(wrapped, PAGE_WIDTH - MARGIN, this.y, { align: "right" });
    this.y += Math.max(5.2, wrapped.length * 4.4);
  }

  amountRow(label: string, amount: number, opts: { bold?: boolean } = {}): void {
    this.ensureSpace(5.6);
    this.setStyle({ bold: opts.bold, size: opts.bold ? 10 : 9.5, color: INK });
    this.doc.text(sanitizeForPdf(label), MARGIN, this.y);
    this.doc.setFont("courier", opts.bold ? "bold" : "normal");
    this.doc.text(formatLiasseEur(amount), PAGE_WIDTH - MARGIN, this.y, { align: "right" });
    this.y += 5.4;
  }

  rule(): void {
    this.ensureSpace(3);
    this.doc.setDrawColor(...hexToRgb(RULE_SUBTLE));
    this.doc.setLineWidth(0.2);
    this.doc.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y);
    this.y += 3.5;
  }

  finalizePagination(): void {
    const totalPages = this.doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      this.doc.setPage(page);
      this.doc.setDrawColor(...hexToRgb(RULE_SUBTLE));
      this.doc.setLineWidth(0.2);
      this.doc.line(MARGIN, FOOTER_Y - 4, PAGE_WIDTH - MARGIN, FOOTER_Y - 4);
      this.setStyle({ size: 8, color: INK_MUTED });
      this.doc.text(sanitizeForPdf(`${LIASSE_DOSSIER_PDF_TITLE}  ·  Exercice ${this.exercice}`), MARGIN, FOOTER_Y);
      this.doc.text(`Page ${page} / ${totalPages}`, PAGE_WIDTH - MARGIN, FOOTER_Y, { align: "right" });
    }
  }
}

type TableColumn = { key: string; header: string; width: number; align?: "left" | "right" };

function drawTable(
  cursor: DossierCursor,
  columns: TableColumn[],
  rows: Array<Record<string, string | undefined>>,
): void {
  if (rows.length === 0) return;
  const rowMin = 6.2;
  const headerH = 7;
  const paddingX = 1.4;

  cursor.ensureSpace(headerH + rowMin);

  const drawHeader = (): void => {
    cursor.doc.setFillColor(...hexToRgb(HEADER_FILL));
    cursor.doc.rect(MARGIN, cursor.y, CONTENT_WIDTH, headerH, "F");
    cursor.doc.setDrawColor(...hexToRgb(RULE));
    cursor.doc.setLineWidth(0.25);
    cursor.doc.rect(MARGIN, cursor.y, CONTENT_WIDTH, headerH, "S");
    let x = MARGIN;
    cursor.doc.setFont("helvetica", "bold");
    cursor.doc.setFontSize(7.4);
    cursor.doc.setTextColor(...hexToRgb(INK_SECONDARY));
    for (const col of columns) {
      const header = sanitizeForPdf(col.header);
      const textX = col.align === "right" ? x + col.width - paddingX : x + paddingX;
      cursor.doc.text(header, textX, cursor.y + 4.8, { align: col.align === "right" ? "right" : "left" });
      x += col.width;
    }
    cursor.y += headerH;
  };

  drawHeader();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const wrapped = columns.map((col) => {
      const raw = row[col.key];
      if (!raw) return [] as string[];
      const inner = col.width - paddingX * 2;
      return cursor.doc.splitTextToSize(sanitizeForPdf(raw), Math.max(inner, 8)) as string[];
    });
    const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
    const height = Math.max(rowMin, 3.2 + lineCount * 3.4);

    if (cursor.y + height > FOOTER_Y - 8) {
      cursor.pageBreak();
      drawHeader();
    }

    if (index % 2 === 1) {
      cursor.doc.setFillColor(...hexToRgb(ROW_ALT));
      cursor.doc.rect(MARGIN, cursor.y, CONTENT_WIDTH, height, "F");
    }
    cursor.doc.setDrawColor(...hexToRgb(RULE_SUBTLE));
    cursor.doc.setLineWidth(0.15);
    cursor.doc.rect(MARGIN, cursor.y, CONTENT_WIDTH, height, "S");

    let x = MARGIN;
    cursor.doc.setFont("helvetica", "normal");
    cursor.doc.setFontSize(7.6);
    cursor.doc.setTextColor(...hexToRgb(INK));
    for (let c = 0; c < columns.length; c += 1) {
      const col = columns[c]!;
      const lines = wrapped[c] ?? [];
      const textX = col.align === "right" ? x + col.width - paddingX : x + paddingX;
      const align = col.align === "right" ? "right" : "left";
      let lineY = cursor.y + 4.2;
      for (const line of lines) {
        cursor.doc.text(line, textX, lineY, { align });
        lineY += 3.4;
      }
      x += col.width;
    }
    cursor.y += height;
  }
  cursor.spacer(4);
}

function renderIdentite(cursor: DossierCursor, document: LiasseDossierDocument): void {
  cursor.sectionHeading(LIASSE_DOSSIER_SECTION.identite);
  const id = document.meta.identite;
  cursor.kv("Dénomination", id.denomination);
  cursor.kv("SIREN", id.siren);
  cursor.kv("SIRET", id.siret);
  cursor.kv("Adresse de l'entreprise", id.adresseEntreprise);
  cursor.kv("Adresse du déclarant", id.adresseDeclarant);
  cursor.kv("Courriel", id.email);
  cursor.kv("Téléphone", id.telephone);
  cursor.kv("Exercice", String(document.meta.exercice));
  if (id.exerciceDebut && id.exerciceFin) {
    cursor.kv("Période d'exercice", `Du ${id.exerciceDebut} au ${id.exerciceFin}`);
  } else {
    cursor.kv("Début d'exercice", id.exerciceDebut);
    cursor.kv("Fin d'exercice", id.exerciceFin);
  }
  if (document.meta.activityStartDate) {
    cursor.kv("Date de début d'activité", formatDate(document.meta.activityStartDate));
  }
  if (document.meta.activityType) {
    cursor.kv("Statut", document.meta.activityType);
  }
  if (document.meta.regimeFiscal) {
    cursor.kv("Régime fiscal", regimeLabel(document.meta.regimeFiscal));
  }

  const bien = document.bien;
  if (bien) {
    cursor.spacer(3);
    cursor.subheading("Bien immobilier");
    cursor.kv("Adresse", bien.adresse);
    cursor.kv("Type de bien", bien.typeBien);
    if (bien.dateAcquisition) cursor.kv("Date d'acquisition", formatDate(bien.dateAcquisition));
    if (isDefinedNumber(bien.prixAcquisition)) cursor.kv("Prix d'acquisition", formatLiasseEur(bien.prixAcquisition));
    if (isDefinedNumber(bien.fraisNotaire)) cursor.kv("Frais d'acquisition", formatLiasseEur(bien.fraisNotaire));
    if (bien.choixTraitementFrais) {
      cursor.kv("Traitement des frais d'acquisition", fraisTraitementLabel(bien.choixTraitementFrais));
    }
  }
}

function renderFormation(cursor: DossierCursor, document: LiasseDossierDocument): void {
  cursor.startSection();
  cursor.sectionHeading(LIASSE_DOSSIER_SECTION.formation);
  const f = document.formationDuResultat;

  cursor.amountRow("Produits / recettes", f.recettes);
  const detail = f.recettesDetail;
  if (detail) {
    if (isDefinedNumber(detail.loyersEncaisses)) cursor.amountRow("  dont loyers encaissés", detail.loyersEncaisses);
    if (isDefinedNumber(detail.recettesPlateforme)) {
      cursor.amountRow("  dont recettes plateforme", detail.recettesPlateforme);
    }
    if (isDefinedNumber(detail.indemnitesAssurance)) {
      cursor.amountRow("  dont indemnités d'assurance", detail.indemnitesAssurance);
    }
    if (isDefinedNumber(detail.ajustementsJanDec)) {
      cursor.amountRow("  dont ajustements janvier-décembre", detail.ajustementsJanDec);
    }
  }
  cursor.rule();
  cursor.amountRow("Charges déductibles", f.chargesDeductibles);
  cursor.amountRow("Charges d'exploitation", f.chargesExploitation);
  cursor.amountRow("Charges de financement", f.chargesFinancement);
  if (f.chargesPreExploitation !== 0) {
    cursor.amountRow("Charges de pré-exploitation", f.chargesPreExploitation);
  }
  if (f.chargesNonDeductibles !== 0) {
    cursor.amountRow("Charges non déductibles", f.chargesNonDeductibles);
  }
  cursor.rule();
  cursor.amountRow("Résultat avant amortissements", f.resultatAvantAmortissement);
  cursor.amountRow("Résultat comptable", f.resultatComptable);
  cursor.rule();
  cursor.amountRow("Amortissements calculés", f.amortissementCalcule);
  cursor.amountRow("Amortissements déductibles", f.amortissementDeductible);
  cursor.amountRow("Amortissements reportés", f.amortissementReporte);
  cursor.amountRow("Amortissements reportés utilisés", f.amortissementReportesUtilises);
  cursor.rule();
  cursor.amountRow("Résultat fiscal", f.resultatFiscal, { bold: true });
  if (f.resultatPrincipal.nature === "deficit") {
    cursor.amountRow("Déficit de l'exercice", f.resultatPrincipal.montant, { bold: true });
  }
  if (f.deficitsAnterieursImputes !== 0) {
    cursor.amountRow("Déficits antérieurs imputés", f.deficitsAnterieursImputes);
  }
}

function renderChargeGroup(
  cursor: DossierCursor,
  title: string,
  lignes: LiasseDossierChargeCategorie[],
): void {
  if (lignes.length === 0) return;
  cursor.subheading(title);
  drawTable(
    cursor,
    [
      { key: "label", header: "Libellé", width: CONTENT_WIDTH - 36 },
      { key: "montant", header: "Montant", width: 36, align: "right" },
    ],
    lignes.map((ligne) => ({ label: ligne.label, montant: formatLiasseEur(ligne.montant) })),
  );
}

function renderChargesDescriptives(cursor: DossierCursor, descriptives: LiasseDossierChargesDescriptives): void {
  if (descriptives.coproLignes && descriptives.coproLignes.length > 0) {
    cursor.subheading("Détail descriptif — copropriété");
    drawTable(
      cursor,
      [
        { key: "type", header: "Nature", width: CONTENT_WIDTH - 36 },
        { key: "montant", header: "Montant", width: 36, align: "right" },
      ],
      descriptives.coproLignes.map((ligne) => ({
        type: ligne.description ? `${coproTypeLabel(ligne.type)} — ${ligne.description}` : coproTypeLabel(ligne.type),
        montant: formatLiasseEur(ligne.montant),
      })),
    );
  }
  if (descriptives.familyLines && descriptives.familyLines.length > 0) {
    cursor.subheading("Détail descriptif — autres charges saisies");
    drawTable(
      cursor,
      [
        { key: "label", header: "Libellé", width: CONTENT_WIDTH - 36 },
        { key: "montant", header: "Montant", width: 36, align: "right" },
      ],
      descriptives.familyLines.map((ligne) => ({
        label: ligne.description || ligne.category,
        montant: formatLiasseEur(ligne.montant),
      })),
    );
  }
  if (descriptives.travaux && descriptives.travaux.length > 0) {
    cursor.subheading("Détail descriptif — travaux");
    drawTable(
      cursor,
      [
        { key: "label", header: "Libellé", width: CONTENT_WIDTH - 36 },
        { key: "montant", header: "Montant", width: 36, align: "right" },
      ],
      descriptives.travaux.map((ligne) => ({
        label: ligne.choix ? `${ligne.description} (${ligne.choix})` : ligne.description,
        montant: formatLiasseEur(ligne.montant),
      })),
    );
  }
  if (descriptives.divers && descriptives.divers.length > 0) {
    cursor.subheading("Détail descriptif — divers");
    drawTable(
      cursor,
      [
        { key: "label", header: "Libellé", width: CONTENT_WIDTH - 36 },
        { key: "montant", header: "Montant", width: 36, align: "right" },
      ],
      descriptives.divers.map((ligne) => ({
        label: ligne.description,
        montant: formatLiasseEur(ligne.montant),
      })),
    );
  }
}

function renderCharges(cursor: DossierCursor, document: LiasseDossierDocument): void {
  const exploitation = document.chargesParCategorie.filter((c) => c.source === "exploitation");
  const financement = document.chargesParCategorie.filter((c) => c.source === "financement");
  const hasDescriptives = Boolean(document.chargesDescriptives);
  if (exploitation.length === 0 && financement.length === 0 && !hasDescriptives) return;

  cursor.startSection();
  cursor.sectionHeading(LIASSE_DOSSIER_SECTION.charges);
  renderChargeGroup(cursor, "Charges d'exploitation", exploitation);
  renderChargeGroup(cursor, "Charges de financement", financement);
  if (document.chargesDescriptives) {
    renderChargesDescriptives(cursor, document.chargesDescriptives);
  }
}

function immoCell(value: string | number | undefined, kind?: "eur" | "date" | "duree"): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (kind === "eur" && typeof value === "number") return formatLiasseEur(value);
  if (kind === "date" && typeof value === "string") return formatDate(value);
  if (kind === "duree" && typeof value === "number") return `${value} ans`;
  return String(value);
}

function renderImmobilisations(cursor: DossierCursor, document: LiasseDossierDocument): void {
  const immo = document.immobilisations;
  if (!immo || immo.lignes.length === 0) return;

  cursor.startSection();
  cursor.sectionHeading(LIASSE_DOSSIER_SECTION.immobilisations);
  if (immo.dateMiseEnService) {
    cursor.kv("Date de mise en service", formatDate(immo.dateMiseEnService));
  }
  if (isDefinedNumber(immo.totalBrut)) cursor.kv("Total brut", formatLiasseEur(immo.totalBrut));
  if (isDefinedNumber(immo.totalDotationExercice)) {
    cursor.kv("Dotation totale de l'exercice", formatLiasseEur(immo.totalDotationExercice));
  }
  cursor.spacer(2);

  const columns: TableColumn[] = [
    { key: "label", header: "Désignation", width: 46 },
    { key: "brut", header: "Valeur brute", width: 26, align: "right" },
    { key: "duree", header: "Durée", width: 16, align: "right" },
    { key: "date", header: "Mise en service", width: 24, align: "right" },
    { key: "dotation", header: "Dotation", width: 22, align: "right" },
    { key: "cumul", header: "Cumul", width: 22, align: "right" },
    { key: "vnc", header: "VNC", width: 22, align: "right" },
  ];

  drawTable(
    cursor,
    columns,
    immo.lignes.map((ligne: LiasseDossierImmobilisationLigne) => ({
      label: ligne.label,
      brut: immoCell(ligne.valeurBrute, "eur"),
      duree: immoCell(ligne.dureeAnnees, "duree"),
      date: immoCell(ligne.dateMiseEnService, "date"),
      dotation: immoCell(ligne.dotationExercice, "eur"),
      cumul: immoCell(ligne.amortissementsCumules, "eur"),
      vnc: immoCell(ligne.vnc, "eur"),
    })),
  );
}

function renderPret(cursor: DossierCursor, pret: LiasseDossierPret, index: number, total: number): void {
  const heading = pret.typePret ? typePretLabel(pret.typePret) : "Emprunt";
  cursor.subheading(total > 1 ? `${heading} ${index + 1}` : heading);
  if (isDefinedNumber(pret.capitalInitial)) cursor.kv("Capital initial", formatLiasseEur(pret.capitalInitial));
  if (isDefinedNumber(pret.tauxNominal)) cursor.kv("Taux nominal", formatTaux(pret.tauxNominal));
  if (isDefinedNumber(pret.dureeMois)) cursor.kv("Durée", `${pret.dureeMois} mois`);
  if (pret.datePremiereMensualite) cursor.kv("Première mensualité", formatDate(pret.datePremiereMensualite));
  if (isDefinedNumber(pret.capitalRembourseExercice)) {
    cursor.kv("Capital remboursé sur l'exercice", formatLiasseEur(pret.capitalRembourseExercice));
  }
  if (isDefinedNumber(pret.interetsEmpruntExercice)) {
    cursor.kv("Intérêts d'emprunt", formatLiasseEur(pret.interetsEmpruntExercice));
  }
  if (isDefinedNumber(pret.interetsPreExploitation)) {
    cursor.kv("Intérêts d'emprunt (pré-exploitation)", formatLiasseEur(pret.interetsPreExploitation));
  }
  if (isDefinedNumber(pret.assuranceEmpruntExercice)) {
    cursor.kv("Assurance emprunteur", formatLiasseEur(pret.assuranceEmpruntExercice));
  }
  if (isDefinedNumber(pret.assurancePreExploitation)) {
    cursor.kv("Assurance emprunteur (pré-exploitation)", formatLiasseEur(pret.assurancePreExploitation));
  }
  if (isDefinedNumber(pret.fraisDossierDeductibles)) {
    cursor.kv("Frais de dossier", formatLiasseEur(pret.fraisDossierDeductibles));
  }
  if (isDefinedNumber(pret.garantieDeductible)) {
    cursor.kv("Commission de garantie / caution", formatLiasseEur(pret.garantieDeductible));
  }
  if (isDefinedNumber(pret.iraDeductible)) {
    cursor.kv("Indemnité de remboursement anticipé", formatLiasseEur(pret.iraDeductible));
  }
  if (isDefinedNumber(pret.capitalRestantDu31_12)) {
    cursor.kv("Capital restant dû au 31/12", formatLiasseEur(pret.capitalRestantDu31_12));
  }
  cursor.spacer(2);
}

function renderFinancement(cursor: DossierCursor, document: LiasseDossierDocument): void {
  const prets = document.financement?.prets ?? [];
  if (prets.length === 0) return;
  cursor.startSection();
  cursor.sectionHeading(LIASSE_DOSSIER_SECTION.financement);
  prets.forEach((pret, index) => renderPret(cursor, pret, index, prets.length));
}

function renderReports(cursor: DossierCursor, document: LiasseDossierDocument): void {
  cursor.startSection();
  cursor.sectionHeading(LIASSE_DOSSIER_SECTION.reports);
  const r = document.reports;

  cursor.amountRow("Déficit de l'exercice", r.deficitExercice);
  cursor.amountRow("Déficits imputés", r.deficitsImputes);
  cursor.amountRow("Amortissements reportés de l'exercice", r.amortissementReporteExercice);
  cursor.amountRow("Amortissements reportés utilisés", r.amortissementReportesUtilises);
  cursor.amountRow("Stock d'amortissements reportés à clôture", r.stockAmortissementsReportesCloture, { bold: true });

  if (r.deficitsAnterieurs.length > 0) {
    cursor.spacer(2);
    cursor.subheading("Déficits antérieurs");
    drawTable(
      cursor,
      [
        { key: "millesime", header: "Millésime", width: CONTENT_WIDTH - 36 },
        { key: "montant", header: "Montant", width: 36, align: "right" },
      ],
      r.deficitsAnterieurs.map((d) => ({ millesime: String(d.millesime), montant: formatLiasseEur(d.montant) })),
    );
  }

  if (r.stockDeficitsCloture.length > 0) {
    cursor.subheading("Stock de déficits à clôture");
    drawTable(
      cursor,
      [
        { key: "millesime", header: "Millésime", width: CONTENT_WIDTH - 36 },
        { key: "montant", header: "Montant", width: 36, align: "right" },
      ],
      r.stockDeficitsCloture.map((d) => ({ millesime: String(d.millesime), montant: formatLiasseEur(d.montant) })),
    );
  }

  if (r.deficitsExpires.length > 0) {
    cursor.subheading("Déficits expirés");
    drawTable(
      cursor,
      [
        { key: "millesime", header: "Millésime", width: CONTENT_WIDTH - 36 },
        { key: "montant", header: "Montant", width: 36, align: "right" },
      ],
      r.deficitsExpires.map((d) => ({ millesime: String(d.millesime), montant: formatLiasseEur(d.montant) })),
    );
  }

  if (r.stockDeficitsOuverture || isDefinedNumber(r.stockAmortissementsReportesOuverture)) {
    cursor.subheading("Stocks d'ouverture");
    if (isDefinedNumber(r.stockAmortissementsReportesOuverture)) {
      cursor.amountRow("Stock d'amortissements reportés à l'ouverture", r.stockAmortissementsReportesOuverture);
    }
    if (r.stockDeficitsOuverture && r.stockDeficitsOuverture.length > 0) {
      drawTable(
        cursor,
        [
          { key: "millesime", header: "Millésime", width: CONTENT_WIDTH - 36 },
          { key: "montant", header: "Montant", width: 36, align: "right" },
        ],
        r.stockDeficitsOuverture.map((d) => ({
          millesime: String(d.millesime),
          montant: formatLiasseEur(d.montant),
        })),
      );
    }
  }
}

export function renderLiasseDossierPdf(document: LiasseDossierDocument): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const denomination = document.meta.identite.denomination;
  const runningLabel = denomination ?? LIASSE_DOSSIER_PDF_TITLE;
  doc.setProperties({
    title: `${LIASSE_DOSSIER_PDF_TITLE} — Exercice ${document.meta.exercice}`,
    subject: "Pages documentaires de la liasse fiscale",
  });

  const cursor = new DossierCursor(doc, runningLabel, document.meta.exercice);
  cursor.titleBlock(LIASSE_DOSSIER_PDF_TITLE, `Exercice ${document.meta.exercice}`);
  if (denomination) {
    cursor.setStyle({ size: 11, color: INK });
    cursor.doc.text(sanitizeForPdf(denomination), MARGIN, cursor.y);
    cursor.spacer(8);
  }

  renderIdentite(cursor, document);
  renderFormation(cursor, document);
  renderCharges(cursor, document);
  renderImmobilisations(cursor, document);
  renderFinancement(cursor, document);
  renderReports(cursor, document);

  cursor.finalizePagination();
  return new Uint8Array(doc.output("arraybuffer"));
}
