import { jsPDF } from "jspdf";
import { colors } from "@/design-system/theme/colors";
import type { ClientSummaryCase2042, ClientSummaryDocument } from "./build-client-summary-document";

/**
 * Rendu PDF de « Votre aide pour la déclaration 2042-C-PRO » — document
 * autonome, distinct de la synthèse fiscale (`render-client-summary-pdf.ts`).
 *
 * Design validé (concept C — Assistant pas-à-pas). Trois principes non
 * négociables portés par ce fichier :
 *
 * 1. Pur rendu — AUCUNE logique fiscale ici. Chaque case, montant et libellé
 *    provient de `ClientSummaryDocument.aide2042`, déjà construit par
 *    `buildClientSummaryDocument()`. Ce fichier ne fait que disposer ce
 *    contenu sur la page.
 * 2. Validation officielle 2026 (Cerfa 2042 C PRO N°11222*28 — revenus 2025 ;
 *    brochure DGFiP « Loueurs en meublé non professionnels ») : les cases
 *    catégorie "a_saisir" (5CD, 5NA, 5NY) ne sont jamais présentées comme
 *    pouvant être préremplies. Seules les cases "a_verifier" (5GA-5GJ)
 *    portent une formulation de vérification conditionnelle.
 * 3. Deux pages cibles dans le cas normal : page 1 « ce que vous devez
 *    faire » (blocs À SAISIR / À VÉRIFIER, chaque case à saisir portant
 *    directement son instruction et son "pourquoi" — pas de page de détail
 *    séparée), page 2 « où et comment faire la déclaration » (navigation +
 *    checklist). Aucune page n'est créée pour la seule raison qu'un
 *    composant a été conçu comme une page : un dossier chargé (plusieurs
 *    déficits antérieurs, exercice partiel) peut déborder naturellement sur
 *    une 3ᵉ page via la pagination automatique de jsPDF, jamais en forçant
 *    un saut de page arbitraire.
 *
 * Librairie : jsPDF, polices intégrées uniquement (Helvetica / Courier).
 * Aucune police custom (Fraunces / DM Sans / Geist Mono) n'est embarquée —
 * ce pipeline PDF ne dispose d'aucune infrastructure d'embarquement de
 * police (`doc.addFont`) à ce jour, et aucun fichier de police n'existe dans
 * le dépôt. Courier (chasse fixe) est utilisé pour les montants et les codes
 * de case en lieu et place de Geist Mono, pour conserver l'esprit "valeurs
 * tabulaires" du design system sans dépendance binaire externe non validée.
 * Voir le rapport final pour la discussion de ce compromis.
 */

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 12;

/** Couleurs — importées telles quelles du design system, jamais redéfinies. */
const INK = colors.text.primary; // #1C1917
const INK_SECONDARY = colors.text.secondary; // #5C5650
const INK_MUTED = colors.text.tertiary; // #8A837A
const ORANGE_BG = colors.orange[50]; // #FFF8F3
const ORANGE_BORDER = colors.orange[200]; // #FFDCC4
const ORANGE_BADGE = colors.orange[500]; // #E87D3A
const WARNING_BG = colors.warning.surface; // #FBF7F0
const WARNING_BORDER = colors.warning.border; // #E0CEB0
const WARNING_BADGE = colors.warning.DEFAULT; // #A8834A
const CARD_BORDER = colors.border.default; // #E8E2D9
const WHITE: RGB = [255, 255, 255];

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function fmtEurValue(value: number): string {
  // Sanitisé à la source : `toLocaleString("fr-FR")` insère une espace fine
  // insécable (U+202F) que Courier/Helvetica non embarqués rendent parfois
  // comme un "/" — voir `sanitizeForPdf`. En corrigeant ici, aucun appelant
  // ne peut oublier l'assainissement (bug reproduit et corrigé pendant la
  // vérification visuelle de ce fichier : "5 500 €" s'affichait "5 / 5 0 0 €").
  return sanitizeForPdf(`${Math.round(value).toLocaleString("fr-FR")} €`);
}

function fmtCaseMontant(montant: number | string): string {
  return typeof montant === "number" ? fmtEurValue(montant) : sanitizeForPdf(montant);
}

/**
 * Étiquette affichée dans le badge/valeur d'une case du bloc À SAISIR.
 * Correction ciblée : 5CD en durée d'exercice ambiguë porte la valeur de
 * donnée "À vérifier" (`build-client-summary-document.ts`, jamais modifié
 * ici), mais afficher littéralement "À vérifier" à l'intérieur du bloc
 * orange "À SAISIR VOUS-MÊME" contredit visuellement le badge de catégorie.
 * Purement un choix de libellé de rendu : la donnée sous-jacente et son
 * filtrage (`isCaseApplicable`) restent strictement inchangés.
 */
export function displayMontantForSaisir(c: ClientSummaryCase2042): string {
  if (c.case === "5CD" && typeof c.montant === "string") return "À renseigner";
  return fmtCaseMontant(c.montant);
}

/**
 * `toLocaleString("fr-FR")` produit un séparateur de milliers non standard
 * (espace fine insécable / insécable selon runtime) — même limitation que
 * `render-client-summary-pdf.ts` : Helvetica/Courier non embarqués ne les
 * rendent pas correctement dans tous les lecteurs. Remplacés par une espace
 * normale juste avant l'écriture, jamais dans les données du document.
 */
function sanitizeForPdf(text: string): string {
  return text.replace(/[    ]/g, " ");
}

/** 5CD "Ne pas renseigner" n'est jamais une action : cette case ne doit jamais s'afficher. */
function isCaseApplicable(c: ClientSummaryCase2042): boolean {
  return !(c.case === "5CD" && typeof c.montant === "string" && c.montant.startsWith("Ne pas renseigner"));
}

type TextStyle = { bold?: boolean; italic?: boolean; size?: number; color?: string; font?: "helvetica" | "courier" };

/** Curseur d'écriture avec saut de page automatique — pure présentation, aucune règle métier. */
class Cursor {
  y = MARGIN;
  readonly doc: jsPDF;
  readonly clientLabel: string;
  readonly exercice: number;

  constructor(doc: jsPDF, clientLabel: string, exercice: number) {
    this.doc = doc;
    this.clientLabel = clientLabel;
    this.exercice = exercice;
  }

  private setStyle(opts: TextStyle = {}): void {
    this.doc.setFont(opts.font ?? "helvetica", opts.bold ? "bold" : opts.italic ? "italic" : "normal");
    this.doc.setFontSize(opts.size ?? 11);
    this.doc.setTextColor(...hexToRgb(opts.color ?? INK));
  }

  ensureSpace(height: number): void {
    if (this.y + height > FOOTER_Y - 6) {
      this.pageBreak();
    }
  }

  /** Saut de page explicite, avec bandeau discret client/exercice en en-tête. */
  pageBreak(): void {
    this.doc.addPage();
    this.y = MARGIN;
    this.setStyle({ size: 9, color: INK_MUTED });
    this.doc.text(sanitizeForPdf(`${this.clientLabel} · Exercice ${this.exercice}`), MARGIN, this.y);
    this.y += 8;
  }

  spacer(height = 4): void {
    this.y += height;
  }

  text(content: string, opts: TextStyle = {}): void {
    this.setStyle(opts);
    const lines = this.doc.splitTextToSize(sanitizeForPdf(content), CONTENT_WIDTH) as string[];
    const lineHeight = (opts.size ?? 11) * 0.42;
    this.ensureSpace(lines.length * lineHeight);
    this.doc.text(lines, MARGIN, this.y);
    this.y += lines.length * lineHeight;
  }

  /** Petit badge rectangulaire coloré portant le code de case, en chasse fixe. */
  caseBadge(x: number, yBaseline: number, label: string, badgeColor: string, width = 14): void {
    this.doc.setFillColor(...hexToRgb(badgeColor));
    this.doc.roundedRect(x, yBaseline - 4, width, 5.5, 1, 1, "F");
    this.doc.setFont("courier", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...WHITE);
    this.doc.text(label, x + width / 2, yBaseline - 0.3, { align: "center" });
  }

  finalizePagination(footerNote: string): void {
    const totalPages = this.doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      this.doc.setPage(page);
      this.setStyle({ size: 8, color: INK_MUTED });
      this.doc.text(sanitizeForPdf(footerNote), MARGIN, FOOTER_Y);
      this.doc.text(`Page ${page} / ${totalPages}`, PAGE_WIDTH - MARGIN, FOOTER_Y, { align: "right" });
    }
  }
}

/** Mesure la hauteur qu'occuperait `render` sur un document jetable, sans jamais toucher au document réel. */
function measureHeight(clientLabel: string, exercice: number, render: (probe: Cursor) => void): number {
  const probeDoc = new jsPDF({ unit: "mm", format: "a4" });
  const probe = new Cursor(probeDoc, clientLabel, exercice);
  probe.y = 0;
  render(probe);
  return probe.y;
}

/**
 * Réserve d'un bloc la hauteur totale de `render` avant de le dessiner, pour
 * qu'il ne soit jamais coupé en deux pages (ex. un titre de section et son
 * contenu, ou une checklist et ses items — jamais un titre orphelin en bas
 * de page pendant que son contenu commence sur la suivante). Sans effet de
 * bord si le bloc est trop grand pour tenir sur une page entière : dans ce
 * cas il démarre simplement en haut de la page courante ou suivante et se
 * poursuit naturellement via `ensureSpace`, comme n'importe quel contenu.
 */
function atomicGroup(cursor: Cursor, render: (inner: Cursor) => void): void {
  const height = measureHeight(cursor.clientLabel, cursor.exercice, render);
  cursor.ensureSpace(height);
  render(cursor);
}

/** Bloc coloré pleine largeur (fond + bordure) avec badge de catégorie et titre — "À SAISIR" / "À VÉRIFIER". */
function sectionBlock(
  cursor: Cursor,
  title: string,
  badgeColor: string,
  bgColor: string,
  borderColor: string,
  render: (inner: Cursor) => void,
): void {
  const innerHeight = measureHeight(cursor.clientLabel, cursor.exercice, render);
  const blockHeight = innerHeight + 13;
  cursor.ensureSpace(blockHeight + 3);

  const top = cursor.y;
  cursor.doc.setDrawColor(...hexToRgb(borderColor));
  cursor.doc.setFillColor(...hexToRgb(bgColor));
  cursor.doc.roundedRect(MARGIN, top, CONTENT_WIDTH, blockHeight, 3, 3, "FD");

  cursor.doc.setFillColor(...hexToRgb(badgeColor));
  cursor.doc.circle(MARGIN + 8, top + 8, 1.6, "F");
  cursor.doc.setFont("helvetica", "bold");
  cursor.doc.setFontSize(11);
  cursor.doc.setTextColor(...hexToRgb(INK));
  cursor.doc.text(sanitizeForPdf(title), MARGIN + 13, top + 9.5);

  cursor.y = top + 14.5;
  render(cursor);
  cursor.y = top + blockHeight + 4.5;
}

/** Une ligne compacte "case — montant — libellé", utilisée pour le bloc À VÉRIFIER (5GA-5GJ). Jamais de grosse carte individuelle pour un déficit antérieur. */
function compactCaseLine(cursor: Cursor, c: ClientSummaryCase2042, badgeColor: string): void {
  cursor.ensureSpace(8.5);
  cursor.y += 3;
  cursor.caseBadge(MARGIN + 6, cursor.y, c.case, badgeColor, 15);
  cursor.doc.setFont("courier", "bold");
  cursor.doc.setFontSize(10.5);
  cursor.doc.setTextColor(...hexToRgb(INK));
  cursor.doc.text(fmtCaseMontant(c.montant), MARGIN + 25, cursor.y);
  cursor.y += 4.6;
  const label = c.case === "5CD" ? c.label : `Case ${c.case} — ${c.label}`;
  cursor.text(label, { size: 9.5, color: INK_SECONDARY });
  cursor.spacer(1.2);
}

function instructionFor(c: ClientSummaryCase2042): string {
  return c.case === "5CD"
    ? "Dans votre déclaration de revenus, ouvrez l'annexe 2042-C-PRO et renseignez la case 5CD."
    : `Dans votre déclaration de revenus, ouvrez l'annexe 2042-C-PRO et saisissez ${fmtCaseMontant(c.montant)} dans la case ${c.case}.`;
}

function whyLineFor(c: ClientSummaryCase2042): string | undefined {
  if (c.case === "5NA")
    return "Ce montant correspond au résultat fiscal de votre activité LMNP, calculé à partir de votre dossier.";
  if (c.case === "5NY")
    return "Ce montant correspond au déficit fiscal de votre activité LMNP, calculé à partir de votre dossier.";
  if (c.case === "5CD") return "Cette information indique à l'administration que votre exercice n'a pas duré 12 mois.";
  return undefined;
}

/**
 * Ligne enrichie pour une case "à saisir" (5CD, 5NA, 5NY) : badge + montant,
 * libellé, instruction concrète (où/combien) et "pourquoi" — directement
 * dans le bloc de la page 1. Remplace l'ancienne page de détail séparée :
 * densifie la page 1 (moins d'espace blanc) sans ajouter de page qui
 * n'existait que parce qu'un composant avait été conçu comme une page.
 */
function saisirCaseLine(cursor: Cursor, c: ClientSummaryCase2042): void {
  cursor.ensureSpace(9);
  cursor.y += 3;
  cursor.caseBadge(MARGIN + 6, cursor.y, c.case, ORANGE_BADGE, 15);
  cursor.doc.setFont("courier", "bold");
  cursor.doc.setFontSize(11);
  cursor.doc.setTextColor(...hexToRgb(INK));
  cursor.doc.text(sanitizeForPdf(displayMontantForSaisir(c)), MARGIN + 25, cursor.y);
  cursor.y += 5.2;

  const label = c.case === "5CD" ? c.label : `Case ${c.case} — ${c.label}`;
  cursor.text(label, { size: 9.5, color: INK_SECONDARY });
  cursor.spacer(0.8);
  cursor.text(instructionFor(c), { size: 9.5, color: INK });
  const why = whyLineFor(c);
  if (why) {
    cursor.spacer(0.4);
    cursor.text(why, { size: 8.8, italic: true, color: INK_MUTED });
  }
  cursor.spacer(2.5);
}

/** Une étape numérotée (pastille + texte) pour la section navigation. */
function numberedStep(cursor: Cursor, index: number, text: string): void {
  cursor.ensureSpace(7.5);
  cursor.y += 2.5;
  cursor.doc.setFillColor(...hexToRgb(ORANGE_BADGE));
  cursor.doc.circle(MARGIN + 3, cursor.y - 1, 3, "F");
  cursor.doc.setFont("helvetica", "bold");
  cursor.doc.setFontSize(8.5);
  cursor.doc.setTextColor(...WHITE);
  cursor.doc.text(String(index), MARGIN + 3, cursor.y + 0.2, { align: "center" });
  cursor.doc.setFont("helvetica", "normal");
  cursor.doc.setFontSize(10.5);
  cursor.doc.setTextColor(...hexToRgb(INK));
  const lines = cursor.doc.splitTextToSize(sanitizeForPdf(text), CONTENT_WIDTH - 12) as string[];
  cursor.doc.text(lines, MARGIN + 10, cursor.y);
  cursor.y += Math.max(lines.length * 4.6, 5);
  cursor.spacer(1.8);
}

/** Une ligne de checklist finale (case à cocher + texte). */
function checklistItem(cursor: Cursor, text: string): void {
  cursor.ensureSpace(6.5);
  cursor.y += 2.2;
  cursor.doc.setDrawColor(...hexToRgb(CARD_BORDER));
  cursor.doc.rect(MARGIN, cursor.y - 3.5, 4, 4, "S");
  cursor.doc.setFont("helvetica", "normal");
  cursor.doc.setFontSize(10.5);
  cursor.doc.setTextColor(...hexToRgb(INK));
  const lines = cursor.doc.splitTextToSize(sanitizeForPdf(text), CONTENT_WIDTH - 8) as string[];
  cursor.doc.text(lines, MARGIN + 7, cursor.y);
  cursor.y += Math.max(lines.length * 4.6, 4.5);
  cursor.spacer(1.1);
}

export function renderAide2042Pdf(document: ClientSummaryDocument): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const clientLabel = document.meta.identite.denomination ?? "Votre dossier LMNP";
  doc.setProperties({ title: `Votre aide pour la déclaration 2042-C-PRO — ${document.meta.exercice}` });
  const cursor = new Cursor(doc, clientLabel, document.meta.exercice);

  const cases = document.aide2042.cases.filter(isCaseApplicable);
  const casesASaisir = cases.filter((c) => c.categorie === "a_saisir");
  const casesAVerifier = cases.filter((c) => c.categorie === "a_verifier");

  // ==================== PAGE 1 — Votre déclaration de revenus ====================
  cursor.text(clientLabel, { size: 10, color: INK_MUTED });
  cursor.text(`Exercice ${document.meta.exercice}`, { size: 10, color: INK_MUTED });
  cursor.spacer(5);

  cursor.text("Votre déclaration de revenus", { bold: true, size: 22, color: INK });
  cursor.spacer(2);
  cursor.text(
    `Votre dossier fiscal ${document.meta.exercice} est prêt. Voici ce qu'il vous reste à faire sur votre déclaration de revenus.`,
    { size: 11, color: INK_SECONDARY },
  );
  cursor.spacer(6);

  // Bloc À SAISIR VOUS-MÊME — toujours présent : au moins 5NA ou 5NY (mutuellement exclusives).
  // Chaque ligne porte directement son instruction et son "pourquoi" —
  // aucune page de détail séparée (design resserré, voir en-tête de fichier).
  if (casesASaisir.length > 0) {
    sectionBlock(cursor, "À SAISIR VOUS-MÊME", ORANGE_BADGE, ORANGE_BG, ORANGE_BORDER, (inner) => {
      for (const c of casesASaisir) saisirCaseLine(inner, c);
    });
  }

  // Bloc À VÉRIFIER — uniquement si des déficits antérieurs existent.
  if (casesAVerifier.length > 0) {
    sectionBlock(
      cursor,
      "À VÉRIFIER — Vos déficits des années précédentes",
      WARNING_BADGE,
      WARNING_BG,
      WARNING_BORDER,
      (inner) => {
        for (const c of casesAVerifier) compactCaseLine(inner, c, WARNING_BADGE);
      },
    );
  }

  cursor.spacer(3);
  if (casesAVerifier.length > 0) {
    cursor.text(
      "Si les montants indiqués dans la section « À vérifier » sont déjà exacts dans votre déclaration, vous n'avez rien à modifier.",
      { size: 10, italic: true, color: INK_SECONDARY },
    );
  }

  // ==================== Où et comment faire la déclaration + checklist ====================
  // Pas de saut de page forcé ici : un dossier simple (une seule case à
  // saisir, aucun déficit) tient déjà largement sur une page à ce stade — y
  // ajouter cette section de force sur une nouvelle page laisserait deux
  // pages à moitié vides. Le titre et l'espacement marquent la nouvelle
  // section ; `ensureSpace` (appelé par chaque ligne ci-dessous) déclenche
  // un vrai saut de page seulement si le contenu déborde réellement.
  //
  // Navigation ET checklist sont regroupées dans UN SEUL groupe atomique
  // (voir `atomicGroup`), pas deux séparés : si l'ensemble ne tient pas dans
  // l'espace restant de la page courante, il bascule entièrement sur la
  // page suivante — jamais la navigation seule ici et la checklist livrée à
  // elle-même trois lignes plus loin. Ainsi, quand une deuxième page existe,
  // elle porte toujours la totalité "où faire ma déclaration + ce que j'ai
  // vérifié avant de valider", jamais une poignée de lignes isolées.
  cursor.spacer(8);
  atomicGroup(cursor, (inner) => {
    inner.text("Où faire votre déclaration ?", { bold: true, size: 16, color: INK });
    inner.spacer(3.5);
    const etapes = [
      "Rendez-vous sur impots.gouv.fr.",
      "Connectez-vous à votre espace Finances publiques.",
      "Ouvrez votre déclaration de revenus en ligne.",
      "Accédez à l'annexe 2042-C-PRO.",
      "Saisissez ou vérifiez les cases indiquées dans ce document.",
    ];
    etapes.forEach((etape, i) => numberedStep(inner, i + 1, etape));
    inner.spacer(1.5);
    inner.text(
      "Le libellé exact des menus peut évoluer légèrement d'une campagne à l'autre ; la destination reste la même.",
      { size: 9, italic: true, color: INK_MUTED },
    );

    inner.spacer(8);
    inner.text("Avant de valider votre déclaration", { bold: true, size: 14, color: INK });
    inner.spacer(2.5);
    const checklist = [
      "J'ai saisi les montants indiqués dans les cases à saisir.",
      "J'ai vérifié les éventuels déficits reportables.",
      "Les informations correspondent à ce qui est indiqué dans ce document.",
    ];
    checklist.forEach((item) => checklistItem(inner, item));
    inner.spacer(3);
    inner.text("Une fois ces vérifications faites, vous pouvez valider votre déclaration sur impots.gouv.fr.", {
      size: 10,
      italic: true,
      color: INK_SECONDARY,
    });
  });

  const generatedNote = document.meta.generatedAt
    ? ` · généré le ${new Date(document.meta.generatedAt).toLocaleDateString("fr-FR")}`
    : "";
  cursor.finalizePagination(`Fiscal AI · Aide à la déclaration 2042-C-PRO · ${document.meta.exercice}${generatedNote}`);

  return doc;
}

/** Déclenche le téléchargement navigateur du PDF d'aide 2042-C-PRO. */
export function downloadAide2042Pdf(document: ClientSummaryDocument): void {
  const doc = renderAide2042Pdf(document);
  doc.save(`aide-declaration-2042-c-pro-${document.meta.exercice}.pdf`);
}
