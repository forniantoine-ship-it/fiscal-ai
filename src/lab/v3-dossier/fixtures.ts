/**
 * LAB V3 — données de démonstration uniquement.
 *
 * Aucun de ces chiffres ne provient d’un moteur (F009→F014, F006) ni d’un
 * document réel. Ils servent à valider la structure UX de Mon dossier, du
 * panneau de restitution et de l’espace de travail Financement.
 *
 * Invariant de démonstration : les lignes mensuelles se somment exactement
 * aux totaux annoncés (9 840 / 2 100 / 350 / 7 390 / 2 450), pour que le
 * tableau « détail mois par mois » reste une preuve lisible du total.
 */

export type DomainId = "activite" | "logement" | "financement" | "revenus" | "charges" | "amortissements";

export type SourceRef = {
  document: string;
  /** Localisation dans la pièce (page, échéance…). */
  detail: string;
};

export const DOMAIN_ORDER: DomainId[] = ["activite", "logement", "financement", "revenus", "charges", "amortissements"];

export const DOMAIN_LABELS: Record<DomainId, string> = {
  activite: "Activité",
  logement: "Logement",
  financement: "Financement",
  revenus: "Revenus",
  charges: "Charges",
  amortissements: "Amortissements",
};

/** Montants de démonstration du dossier 2026. */
export const DEMO = {
  year: 2026,
  documentsAnalysed: 12,
  /** Documents déjà analysés quand les pièces de prêt manquent encore. */
  documentsWithoutLoan: 10,
  recettes: 12_600,
  amortissements: 4_850,
  acquisition: 180_000,
  /** Autres charges hors taxe foncière (frais bancaires fictifs). */
  autresCharges: 20,
  financement: { interets: 2_100, assurance: 350, total: 2_450 },
  taxeFonciere: { avis: 1_250, releve: 1_180 },
} as const;

/* ---------- Financement ---------- */

export const LOAN_OFFER = "Offre de prêt.pdf";
export const LOAN_SCHEDULE = "Échéancier.pdf";
export const INITIAL_SCHEDULE = "Échéancier initial.pdf";
export const LOAN_AMENDMENT = "Avenant au prêt.pdf";

export type LoanFieldId = "capital" | "taux" | "duree" | "assurance";

export type LoanFact = {
  id: LoanFieldId | "interets2026" | "assurance2026" | "echeances";
  label: string;
  value: string;
  source: SourceRef;
  /** Paramètre corrigeable ; les montants calculés ne se saisissent jamais à la main. */
  correctable: boolean;
};

export const LOAN_FACTS: LoanFact[] = [
  { id: "capital", label: "Capital emprunté", value: "140 000 €", source: { document: LOAN_OFFER, detail: "page 1 · montant du prêt" }, correctable: true },
  { id: "taux", label: "Taux", value: "3,45 %", source: { document: LOAN_OFFER, detail: "page 1 · taux nominal" }, correctable: true },
  { id: "duree", label: "Durée", value: "20 ans", source: { document: LOAN_OFFER, detail: "page 2 · durée du prêt" }, correctable: true },
  { id: "assurance", label: "Assurance", value: "0,25 %", source: { document: LOAN_SCHEDULE, detail: "en-tête · taux d’assurance" }, correctable: true },
  { id: "interets2026", label: "Intérêts déductibles 2026", value: "2 100 €", source: { document: LOAN_SCHEDULE, detail: "somme des 12 échéances 2026" }, correctable: false },
  { id: "assurance2026", label: "Assurance déductible 2026", value: "350 €", source: { document: LOAN_SCHEDULE, detail: "somme des 12 échéances 2026" }, correctable: false },
];

/** Ce qu’une lecture réussie des pièces de prêt fait apparaître. */
export const LOAN_FINDINGS = [
  "Capital retrouvé",
  "Taux retrouvé",
  "Durée retrouvée",
  "Assurance retrouvée",
  "12 échéances retrouvées",
];

export type MonthRow = {
  month: string;
  mensualite: number;
  interets: number;
  assurance: number;
  capital: number;
  deductible: number;
  source: SourceRef;
};

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MONTHLY_INTERETS = [180, 179, 178, 177, 176, 175, 175, 174, 173, 172, 171, 170];
const MONTHLY_ASSURANCE = [29, 29, 29, 29, 29, 30, 29, 29, 29, 29, 29, 30];
const MENSUALITE = 820;

export const MONTHLY_SCHEDULE: MonthRow[] = MONTHS.map((month, index) => {
  const interets = MONTHLY_INTERETS[index];
  const assurance = MONTHLY_ASSURANCE[index];
  return {
    month,
    mensualite: MENSUALITE,
    interets,
    assurance,
    capital: MENSUALITE - interets - assurance,
    deductible: interets + assurance,
    source: { document: LOAN_SCHEDULE, detail: `échéance ${month.toLowerCase()} ${DEMO.year}` },
  };
});

/* ---------- Grammaire commune des tableaux de restitution ---------- */

/**
 * Colonnes prévues pour chaque domaine. Seul Financement est simulé dans ce
 * LAB ; les autres montrent la grammaire attendue sans données.
 */
export const RESTITUTION_SHAPES: Record<DomainId, string[]> = {
  activite: ["Information", "Valeur", "Source", "État"],
  logement: ["Information", "Valeur", "Source", "État"],
  financement: ["Mois", "Mensualité", "Intérêts", "Assurance", "Capital", "Déductible", "Source"],
  revenus: ["Mois", "Recettes", "Source", "État"],
  charges: ["Date / mois", "Nature", "Catégorie", "Montant retenu", "Source", "État"],
  amortissements: ["Composant", "Base", "Durée", "Dotation", "Source", "État"],
};

/* ---------- Mes documents ---------- */

export type DemoDocument = { name: string; usedIn: DomainId[]; loan?: boolean };

export const DOCUMENTS: DemoDocument[] = [
  { name: "Attestation INSEE.pdf", usedIn: ["activite"] },
  { name: "Acte d’acquisition.pdf", usedIn: ["logement", "amortissements"] },
  { name: "Diagnostic de performance énergétique.pdf", usedIn: ["logement"] },
  { name: "Bail meublé.pdf", usedIn: ["revenus"] },
  { name: "Relevé de gestion 2026.pdf", usedIn: ["revenus", "charges"] },
  { name: "Quittances 2026.pdf", usedIn: ["revenus"] },
  { name: "Avis de taxe foncière 2026.pdf", usedIn: ["charges"] },
  { name: "Attestation assurance PNO.pdf", usedIn: ["charges"] },
  { name: "Relevé bancaire décembre.pdf", usedIn: ["charges"] },
  { name: "Facture mobilier.pdf", usedIn: ["amortissements"] },
  { name: LOAN_OFFER, usedIn: ["financement"], loan: true },
  { name: LOAN_SCHEDULE, usedIn: ["financement"], loan: true },
];
