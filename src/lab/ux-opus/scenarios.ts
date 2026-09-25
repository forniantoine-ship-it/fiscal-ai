// Données 100 % fictives. Aucun lien avec un dossier réel.

import {
  type AutoResolved,
  type DefaultChoice,
  type Doc,
  type DomainId,
  type Facts,
  type HistoryRow,
  type LoanSpec,
  type Point,
  type Provenance,
  type Row,
  type ScenarioId,
  type ScenarioState,
  type Summary,
  type View,
  componentsFor,
  days360ToYearEnd,
  eur,
  fiscalSequence,
  frDate,
  loanYear,
  monthName,
  sumRows,
} from "./model";

export type AllStates = Record<ScenarioId, ScenarioState>;

export type ScenarioDef = {
  id: ScenarioId;
  label: string;
  persona: string;
  firstName: string;
  initials: string;
  year: number;
  pitch: string;
  docs: Doc[];
  points: Point[];
  initialFacts: Facts;
  derive: (state: ScenarioState, all: AllStates) => View;
  previewMetric?: Record<string, (view: View) => string>;
  reprise?: { certain: string[]; contradictory: string[]; missing: string[]; fresh: string[] };
  memory?: (all: AllStates) => { label: string; value: string }[];
  changes?: { title: string; detail: string }[];
  expectedDocs?: string[];
};

// ─── Scénario A — première déclaration ──────────────────────────────────────

const LOAN_A: LoanSpec = {
  principal: 150000,
  annualRatePct: 3.45,
  months: 240,
  firstDueYear: 2026,
  firstDueMonth: 4,
  monthlyInsurance: 32.5,
};

const A_PRICE = 182000;
const A_FURNITURE_DEED = 6000;
const A_FEES = 13800;
const A_FURNITURE_INVOICE = 2480;
const A_RENT = 720;

const docsA: Doc[] = [
  {
    id: "acte",
    file: "Acte_vente_rue_des_Champs.pdf",
    kind: "Acte de vente notarié",
    year: 2026,
    status: "ok",
    findings: [
      { label: "Logement", value: "Studio 28 m², 12 rue des Champs, Lyon 3e" },
      { label: "Date d’achat", value: "14 mars 2026" },
      { label: "Prix", value: "182 000 € dont 6 000 € de mobilier" },
      { label: "Frais d’acquisition", value: "13 800 €" },
    ],
    usedIn: ["logement", "amortissements"],
    paper: {
      heading: "Vente — Maître Exemple, notaire à Lyon",
      lines: [
        { t: "L’an deux mille vingt-six, le quatorze mars", mark: "Date d’achat" },
        { t: "Le VENDEUR vend à Mme Claire MARTIN, qui accepte :" },
        { t: "Un studio de 28,40 m², lot n° 14, 12 rue des Champs, 69003 Lyon", mark: "Logement" },
        { t: "Prix : CENT QUATRE-VINGT-DEUX MILLE EUROS (182 000 €)", mark: "Prix" },
        { t: "dont mobilier : six mille euros (6 000 €), liste annexée", mark: "Mobilier" },
        { t: "Ventilation terrain / construction : non précisée" },
        { t: "Décompte acquéreur — frais et droits : 13 800 €", mark: "Frais d’acquisition" },
      ],
    },
  },
  {
    id: "offre",
    file: "Offre_pret_Banque_Exemple.pdf",
    kind: "Offre de prêt et tableau d’amortissement",
    year: 2026,
    status: "ok",
    findings: [
      { label: "Montant emprunté", value: "150 000 €" },
      { label: "Taux", value: "3,45 % sur 20 ans" },
      { label: "Première échéance", value: "5 avril 2026" },
      { label: "Assurance emprunteur", value: "32,50 € par mois" },
    ],
    usedIn: ["financement"],
    paper: {
      heading: "Banque Exemple — Offre de prêt immobilier",
      lines: [
        { t: "Emprunteur : Mme Claire MARTIN" },
        { t: "Coût total de l’opération : 185 000 €", mark: "Prix (offre)" },
        { t: "Montant du prêt : 150 000 €", mark: "Montant emprunté" },
        { t: "Taux nominal fixe : 3,45 % — durée : 240 mois", mark: "Taux" },
        { t: "Date de première échéance : 05/04/2026", mark: "Première échéance" },
        { t: "Assurance emprunteur : 32,50 € / mois", mark: "Assurance" },
        { t: "Tableau d’amortissement prévisionnel en annexe (240 lignes)" },
      ],
    },
  },
  {
    id: "releve-pret",
    file: "Releve_annuel_pret_2026.pdf",
    kind: "Relevé annuel du prêt",
    year: 2026,
    status: "ok",
    findings: [
      { label: "Intérêts payés en 2026", value: "concordent avec le tableau" },
      { label: "Assurance payée en 2026", value: "292,50 €" },
    ],
    usedIn: ["financement"],
    paper: {
      heading: "Banque Exemple — Récapitulatif annuel 2026",
      lines: [
        { t: "Prêt n° 0000 0000 — Mme Claire MARTIN" },
        { t: "Échéances prélevées en 2026 : 9" },
        { t: "Dont intérêts : voir montant retenu", mark: "Intérêts" },
        { t: "Dont assurance : 292,50 €", mark: "Assurance" },
      ],
    },
  },
  {
    id: "bail",
    file: "Bail_meuble_Leroy.pdf",
    kind: "Bail de location meublée",
    year: 2026,
    status: "attention",
    statusNote: "Date différente de l’état des lieux",
    findings: [
      { label: "Locataire", value: "Thomas Leroy" },
      { label: "Loyer", value: "720 € par mois" },
      { label: "Date d’effet", value: "1er avril 2026" },
    ],
    usedIn: ["loyers", "amortissements"],
    pointId: "a-date",
    paper: {
      heading: "Contrat de location meublée — résidence principale du locataire",
      lines: [
        { t: "Bailleur : Mme Claire MARTIN — Locataire : M. Thomas LEROY", mark: "Locataire" },
        { t: "Logement : 12 rue des Champs, 69003 Lyon, lot 14" },
        { t: "Prise d’effet du bail : 1er avril 2026", mark: "Date d’effet" },
        { t: "Loyer mensuel hors charges : 720 €", mark: "Loyer" },
      ],
    },
  },
  {
    id: "edl",
    file: "Etat_des_lieux_entree.pdf",
    kind: "État des lieux d’entrée",
    year: 2026,
    status: "attention",
    statusNote: "Date différente du bail",
    findings: [{ label: "Date de l’état des lieux", value: "15 avril 2026" }],
    usedIn: ["amortissements"],
    pointId: "a-date",
    paper: {
      heading: "État des lieux d’entrée — logement meublé",
      lines: [
        { t: "Réalisé contradictoirement le 15 avril 2026", mark: "Date" },
        { t: "Remise des clés au locataire : 2 jeux" },
        { t: "Inventaire du mobilier : conforme à la liste annexée" },
      ],
    },
  },
  {
    id: "releves",
    file: "Releves_compte_avril-novembre.pdf",
    kind: "Relevés bancaires",
    year: 2026,
    status: "attention",
    statusNote: "S’arrêtent au 30 novembre",
    findings: [
      { label: "Loyers retrouvés", value: "8 virements de 720 €, d’avril à novembre" },
      { label: "Période couverte", value: "1er avril → 30 novembre 2026" },
    ],
    usedIn: ["loyers"],
    pointId: "a-dec",
    paper: {
      heading: "Relevés de compte — avril à novembre 2026",
      lines: [
        { t: "05/04  VIR SEPA LEROY THOMAS LOYER AVRIL   +720,00", mark: "Loyer" },
        { t: "05/05  VIR SEPA LEROY THOMAS LOYER MAI     +720,00", mark: "Loyer" },
        { t: "…  6 autres virements identiques, juin → novembre" },
        { t: "30/11  SOLDE AU 30/11/2026 — fin de période", mark: "Fin des relevés" },
      ],
    },
  },
  {
    id: "pno",
    file: "Attestation_assurance_PNO.pdf",
    kind: "Assurance propriétaire non occupant",
    year: 2026,
    status: "ok",
    findings: [{ label: "Prime 2026", value: "142 €" }],
    usedIn: ["depenses"],
    paper: {
      heading: "Assurance Exemple — Propriétaire non occupant",
      lines: [
        { t: "Bien assuré : 12 rue des Champs, 69003 Lyon" },
        { t: "Cotisation annuelle TTC : 142,00 €", mark: "Prime" },
      ],
    },
  },
  {
    id: "copro",
    file: "Appels_de_fonds_syndic_2026.pdf",
    kind: "Appels de charges de copropriété",
    year: 2026,
    status: "ok",
    findings: [{ label: "Appels payés", value: "3 × 195 € (T2, T3, T4)" }],
    usedIn: ["depenses"],
    paper: {
      heading: "Syndic Exemple — Appels de fonds 2026, lot 14",
      lines: [
        { t: "2e trimestre 2026 : 195,00 €", mark: "Appel" },
        { t: "3e trimestre 2026 : 195,00 €", mark: "Appel" },
        { t: "4e trimestre 2026 : 195,00 €", mark: "Appel" },
      ],
    },
  },
  {
    id: "meubles",
    file: "Facture_Maison_Meuble.pdf",
    kind: "Facture de mobilier",
    year: 2026,
    status: "ok",
    findings: [{ label: "Meubles achetés", value: "2 480 € le 22 mars 2026" }],
    usedIn: ["amortissements"],
    paper: {
      heading: "Maison Meuble — Facture n° 0000",
      lines: [
        { t: "Canapé, table, 2 chaises, lit 140, literie, rangements" },
        { t: "Date : 22/03/2026", mark: "Date" },
        { t: "Total TTC : 2 480,00 €", mark: "Montant" },
      ],
    },
  },
  {
    id: "casto",
    file: "Photo_ticket_bricolage.jpg",
    kind: "Ticket de caisse",
    year: 2026,
    status: "ok",
    findings: [{ label: "Peinture et fournitures", value: "186 € le 9 juin 2026" }],
    usedIn: ["depenses"],
    paper: {
      heading: "Magasin de bricolage — ticket de caisse",
      lines: [
        { t: "09/06/2026 — Peinture blanc mat 10 L, rouleaux, bâche" },
        { t: "TOTAL : 186,00 €", mark: "Montant" },
      ],
    },
  },
  {
    id: "releve-dec",
    file: "Releve_compte_decembre.pdf",
    kind: "Relevé bancaire",
    year: 2026,
    hidden: true,
    status: "ok",
    findings: [{ label: "Loyer de décembre", value: "720 €" }],
    usedIn: ["loyers"],
    paper: {
      heading: "Relevé de compte — décembre 2026",
      lines: [{ t: "05/12  VIR SEPA LEROY THOMAS LOYER DECEMBRE   +720,00", mark: "Loyer" }],
    },
  },
  {
    id: "internet",
    file: "Factures_box_internet.pdf",
    kind: "Factures d’abonnement internet",
    year: 2026,
    hidden: true,
    status: "ok",
    findings: [{ label: "Abonnement fourni au locataire", value: "9 × 29,99 €" }],
    usedIn: ["depenses"],
    paper: {
      heading: "Opérateur Exemple — factures avril à décembre 2026",
      lines: [
        { t: "Ligne installée au 12 rue des Champs" },
        { t: "9 factures de 29,99 € — total 269,91 €", mark: "Montant" },
      ],
    },
  },
];

const pointsA: Point[] = [
  {
    id: "a-date",
    kind: "contradiction",
    blocking: true,
    domain: "amortissements",
    title: "À quelle date votre studio a-t-il été mis en location ?",
    context:
      "Votre bail et votre état des lieux ne donnent pas la même date. Je ne peux pas savoir laquelle correspond à la réalité.",
    why:
      "L’usure du logement et des meubles (les amortissements) se déduit à partir du jour où le logement est mis en location. Quinze jours d’écart changent légèrement le montant déduit en 2026.",
    sources: [
      { label: "Bail meublé", value: "1er avril 2026", docId: "bail" },
      { label: "État des lieux d’entrée", value: "15 avril 2026", docId: "edl" },
    ],
    options: [
      { id: "bail", label: "Le 1er avril 2026", hint: "la date du bail", set: { startDate: "2026-04-01" } },
      { id: "edl", label: "Le 15 avril 2026", hint: "la date de l’état des lieux", set: { startDate: "2026-04-15" } },
      {
        id: "other",
        label: "Une autre date",
        hint: "par exemple si le logement était proposé à la location avant",
        input: { kind: "date", key: "startDate", min: 20260314, max: 20261231 },
      },
    ],
    deferLabel: "Je dois vérifier",
  },
  {
    id: "a-dec",
    kind: "missing",
    blocking: true,
    domain: "loyers",
    title: "Avez-vous reçu le loyer de décembre ?",
    context:
      "J’ai retrouvé 8 loyers de 720 €, d’avril à novembre. Vos relevés s’arrêtent au 30 novembre : décembre n’apparaît nulle part.",
    why:
      "Tous les loyers encaissés dans l’année doivent être déclarés. Sans décembre, votre dossier pourrait être incomplet — je ne le suppose donc pas à votre place.",
    options: [
      { id: "same", label: "Oui, 720 € comme les autres mois", set: { decRent: 720 } },
      { id: "doc", label: "J’ajoute mon relevé de décembre", hint: "je le lirai pour vous", addDoc: "releve-dec" },
      {
        id: "other",
        label: "Oui, mais un autre montant",
        input: { kind: "amount", key: "decRent", min: 1, max: 5000 },
      },
      { id: "none", label: "Non, aucun loyer en décembre", set: { decRent: 0 } },
    ],
    deferLabel: "Mon relevé n’est pas encore disponible",
  },
  {
    id: "a-terrain",
    kind: "decision",
    blocking: true,
    domain: "amortissements",
    title: "Quelle part du prix correspond au terrain ?",
    context:
      "Le terrain ne s’use pas : il ne se déduit jamais. Votre acte ne précise pas sa valeur — c’est le cas le plus fréquent. Pour un appartement dans une grande métropole comme Lyon, la pratique retient généralement entre 20 et 30 % du prix.",
    why:
      "C’est un choix qui vous appartient, et le premier point regardé en cas de contrôle. Plus la part du terrain est faible, plus vous déduisez chaque année — mais la valeur doit rester justifiable. Si vous disposez d’une estimation (notaire, expertise), elle prime.",
    options: [
      { id: "20", label: "20 %", hint: "bas de la fourchette usuelle", set: { terrainPct: 20 } },
      { id: "25", label: "25 %", hint: "milieu de la fourchette usuelle", recommended: true, set: { terrainPct: 25 } },
      { id: "30", label: "30 %", hint: "haut de la fourchette usuelle", set: { terrainPct: 30 } },
      {
        id: "other",
        label: "J’ai une estimation",
        hint: "notaire, expert, données de ventes comparables",
        input: {
          kind: "percent",
          key: "terrainPct",
          min: 1,
          max: 80,
          softMin: 20,
          softMax: 30,
          softWarning:
            "Hors de la fourchette usuelle pour Lyon : conservez le justificatif de cette estimation.",
        },
      },
    ],
    deferLabel: "Je préfère y réfléchir",
  },
  {
    id: "a-autres",
    kind: "optional",
    blocking: false,
    domain: "depenses",
    title: "Avez-vous eu d’autres dépenses pour ce logement ?",
    context:
      "Je ne connais que les dépenses présentes dans vos documents. Certaines n’apparaissent dans aucun : petites réparations, équipement, abonnement internet inclus dans le loyer, frais d’un compte bancaire dédié…",
    why:
      "Une dépense oubliée ne vous met pas en faute : vous payez simplement un peu plus que nécessaire. C’est pourquoi cette question n’empêche pas de finaliser le dossier.",
    options: [
      { id: "doc", label: "Oui, j’ajoute des justificatifs", hint: "je les classerai pour vous", addDoc: "internet" },
      { id: "none", label: "Non, rien d’autre", dismiss: true },
    ],
    deferLabel: "Je regarderai plus tard",
  },
];

function deriveA(state: ScenarioState): View {
  const f = state.facts;
  const start = typeof f.startDate === "string" ? f.startDate : "2026-04-01";
  const terrainPct = typeof f.terrainPct === "number" ? f.terrainPct : 25;
  const prorataDays = days360ToYearEnd(start);
  const prorata = prorataDays / 360;
  const pointOpen = (id: string) => state.points[id]?.status !== "answered";

  const immeuble = A_PRICE + A_FEES - A_FURNITURE_DEED;
  const terrain = Math.round((immeuble * terrainPct) / 100);
  const bati = immeuble - terrain;
  const components = componentsFor(bati, prorata);
  const mobilier = [
    { label: "Mobilier cédé avec le studio", base: A_FURNITURE_DEED, years: 7, year: Math.round((A_FURNITURE_DEED / 7) * prorata) },
    { label: "Meubles achetés (Maison Meuble)", base: A_FURNITURE_INVOICE, years: 7, year: Math.round((A_FURNITURE_INVOICE / 7) * prorata) },
  ];
  const totalYear =
    components.reduce((s, c) => s + c.year, 0) + mobilier.reduce((s, m) => s + m.year, 0);

  const loan = loanYear(LOAN_A, 2026);

  const startProv = pointOpen("a-date")
    ? ({ kind: "estimated", note: "date du bail, en attendant votre réponse" } as const)
    : ({ kind: "answer" } as const);
  const terrainProv = pointOpen("a-terrain")
    ? ({ kind: "estimated", note: "25 % en attendant votre choix" } as const)
    : ({ kind: "answer" } as const);

  const logement: Row[] = [
    { id: "l-adr", label: "Logement", value: "Studio meublé de 28 m², 12 rue des Champs, 69003 Lyon", prov: { kind: "read", docIds: ["acte"] } },
    { id: "l-date", label: "Date d’achat", value: "14 mars 2026", prov: { kind: "read", docIds: ["acte"] } },
    { id: "l-prix", label: "Prix d’achat", amount: A_PRICE, sub: "dont 6 000 € de mobilier", prov: { kind: "read", docIds: ["acte"] } },
    { id: "l-frais", label: "Frais d’acquisition", amount: A_FEES, prov: { kind: "read", docIds: ["acte"] } },
    { id: "l-start", label: "Mise en location", value: frDate(start), prov: startProv, pointId: "a-date" },
    { id: "l-loc", label: "Locataire", value: "Thomas Leroy — 720 € par mois", prov: { kind: "read", docIds: ["bail"] } },
  ];

  const loyers: Row[] = [];
  for (let m = 4; m <= 11; m += 1) {
    loyers.push({ id: `r-${m}`, label: `Loyer de ${monthName(m)}`, sub: "Thomas Leroy", amount: A_RENT, prov: { kind: "read", docIds: ["releves"] } });
  }
  if (state.addedDocs.includes("releve-dec")) {
    loyers.push({ id: "r-12", label: "Loyer de décembre", sub: "Thomas Leroy", amount: 720, prov: { kind: "read", docIds: ["releve-dec"] } });
  } else if (typeof f.decRent === "number") {
    loyers.push({ id: "r-12", label: "Loyer de décembre", amount: f.decRent, prov: { kind: "answer" }, pointId: "a-dec" });
  } else {
    loyers.push({ id: "r-12", label: "Loyer de décembre", value: "non retrouvé", prov: { kind: "missing" }, flag: "gap", pointId: "a-dec" });
  }

  const depenses: Row[] = [
    { id: "d-int", label: "Intérêts d’emprunt", sub: `${loan.count} échéances, avril → décembre`, amount: loan.interest, prov: { kind: "read", docIds: ["offre", "releve-pret"] } },
    { id: "d-ass", label: "Assurance emprunteur", sub: "9 × 32,50 €", amount: loan.insurance, prov: { kind: "read", docIds: ["offre", "releve-pret"] } },
    { id: "d-pno", label: "Assurance propriétaire non occupant", amount: 142, prov: { kind: "read", docIds: ["pno"] } },
    { id: "d-copro", label: "Charges de copropriété", sub: "3 appels trimestriels, déduits en totalité cette première année", amount: 585, prov: { kind: "read", docIds: ["copro"] } },
    {
      id: "d-casto",
      label: "Petit entretien — peinture",
      sub: "classé en entretien et réparations",
      amount: 186,
      prov: state.removedRows.includes("d-casto") ? { kind: "corrected", note: "retiré par vous : ne concerne pas ce logement" } : { kind: "read", docIds: ["casto"] },
      removable: true,
      removed: state.removedRows.includes("d-casto"),
    },
  ];
  if (state.addedDocs.includes("internet")) {
    depenses.push({ id: "d-net", label: "Abonnement internet fourni au locataire", sub: "9 × 29,99 €", amount: 270, prov: { kind: "read", docIds: ["internet"] } });
  }

  const recettesTotal = sumRows(loyers);
  const chargesTotal = sumRows(depenses);
  const seq = fiscalSequence({ recettes: recettesTotal, charges: chargesTotal, amortYear: totalYear, deficitsStock: 0, ardStock: 0 });

  const schedule = loan.rows.map((row) => ({
    label: `${monthName(row.month)} ${row.year}`,
    interest: row.interest,
    insurance: LOAN_A.monthlyInsurance,
  }));

  const provisional = pointsA.some((p) => p.blocking && state.points[p.id]?.status !== "answered");
  const decKnown = !loyers.some((r) => r.flag === "gap");

  const summaries: Record<DomainId, Summary> = {
    logement: { text: "Studio de 28 m², 12 rue des Champs, Lyon 3e — acheté le 14 mars 2026", status: pointOpen("a-date") ? "attention" : "ok" },
    financement: { text: `Prêt de 150 000 € à 3,45 % · ${eur(loan.interest)} d’intérêts en 2026, confirmés par deux documents`, status: "ok" },
    loyers: decKnown
      ? { text: `${loyers.length} loyers encaissés · ${eur(recettesTotal)}`, status: "ok" }
      : { text: "8 loyers de 720 € retrouvés · décembre manquant", status: "attention" },
    depenses: { text: `${depenses.filter((d) => !d.removed).length} dépenses retenues · ${eur(chargesTotal)}`, status: "ok" },
    amortissements:
      pointOpen("a-date") || pointOpen("a-terrain")
        ? { text: "Point de départ et part du terrain à confirmer avec vous", status: "attention" }
        : { text: `${eur(totalYear)} d’usure calculée pour 2026 · ${eur(seq.newArd)} mis de côté`, status: "ok" },
    historique: { text: "Première année : rien à reprendre. Ce que nous faisons ici servira dès 2027.", status: "info" },
  };

  const autoResolved: AutoResolved[] = [
    {
      title: "Prix d’achat : 182 000 €",
      detail: "Votre offre de prêt indique un coût d’opération de 185 000 €, l’acte notarié 182 000 €. Pour le prix d’achat, c’est l’acte qui fait foi.",
      rule: "RAI-001 · étape 2",
    },
    {
      title: `Intérêts 2026 : ${eur(loan.interest)}`,
      detail: "Le tableau d’amortissement de la banque et votre relevé annuel donnent le même montant.",
      rule: "Recoupement de deux sources",
    },
    {
      title: "Mobilier séparé du logement",
      detail: "L’acte mentionne 6 000 € de mobilier : il est isolé, car des meubles s’usent plus vite qu’un logement.",
      rule: "AX-003",
    },
  ];

  const defaults: DefaultChoice[] = [
    {
      title: "Frais de notaire ajoutés au prix du logement",
      detail: "Ils se déduisent progressivement avec le logement. Votre résultat avant amortissements étant inférieur à 5 000 €, les déduire en une fois ne vous apporterait rien en 2026.",
      rule: "JUG-001",
      assistant: "Assistant Amortissements",
    },
    {
      title: "Logement découpé en 6 éléments",
      detail: "Grille standard pour un appartement : gros œuvre sur 50 ans, installations sur 25 ans, agencements sur 15 ans…",
      rule: "JUG-004 · JUG-005",
      assistant: "Assistant Amortissements",
    },
    {
      title: "Meubles regroupés en un seul lot sur 7 ans",
      detail: "Le total des meubles (8 480 €) est inférieur à 10 000 €.",
      rule: "JUG-006",
      assistant: "Assistant Amortissements",
    },
    {
      title: "Charges de copropriété déduites en totalité",
      detail: "C’est votre première année : la part refacturable au locataire sera régularisée l’an prochain, avec le décompte du syndic.",
      rule: "JUG-010",
      assistant: "Assistant Charges",
    },
  ];

  const history: HistoryRow[] = [
    { year: 2026, label: "Cette année", dotation: totalYear, used: seq.amortUsed, stock: seq.ardStockAfter, prov: { kind: "computed" } },
  ];

  return {
    year: 2026,
    owner: "Claire Martin",
    property: "Studio meublé — 12 rue des Champs, Lyon 3e",
    propertyShort: "Studio rue des Champs",
    logement,
    autoResolved,
    defaults,
    financement: {
      rows: [
        { id: "f-cap", label: "Montant emprunté", amount: 150000, prov: { kind: "read", docIds: ["offre"] } },
        { id: "f-taux", label: "Taux et durée", value: "3,45 % fixe sur 20 ans", prov: { kind: "read", docIds: ["offre"] } },
        { id: "f-first", label: "Première échéance", value: "5 avril 2026", prov: { kind: "read", docIds: ["offre"] } },
        { id: "f-int", label: "Intérêts retenus pour 2026", amount: loan.interest, prov: { kind: "read", docIds: ["offre", "releve-pret"] } },
        { id: "f-ass", label: "Assurance emprunteur 2026", amount: loan.insurance, prov: { kind: "read", docIds: ["offre", "releve-pret"] } },
        { id: "f-crd", label: "Reste à rembourser au 31 décembre", amount: loan.remaining, prov: { kind: "computed", note: "d’après le tableau d’amortissement" } },
      ],
      schedule,
      scheduleNote: "Seuls les intérêts et l’assurance se déduisent. La part de capital remboursée ne l’est pas : elle rembourse votre dette.",
    },
    loyers: { rows: loyers, total: recettesTotal },
    depenses: { rows: depenses, total: chargesTotal },
    amort: {
      baseRows: [
        { id: "b-pr", label: "Prix + frais d’acquisition", amount: A_PRICE + A_FEES, prov: { kind: "read", docIds: ["acte"] } },
        { id: "b-mob", label: "− Mobilier (amorti à part)", amount: -A_FURNITURE_DEED, prov: { kind: "read", docIds: ["acte"] } },
        { id: "b-ter", label: `− Terrain (${terrainPct} %), jamais amorti`, amount: -terrain, prov: terrainProv, pointId: "a-terrain" },
        { id: "b-bati", label: "= Valeur du logement qui s’use", amount: bati, prov: { kind: "computed" } },
      ],
      components,
      mobilier,
      totalYear,
      prorataNote: `Du ${frDate(start)} au 31 décembre : ${prorataDays} jours sur 360.`,
    },
    history,
    deficits: [],
    seq,
    summaries,
    provisional,
  };
}

// ─── Scénario B — reprise d'une comptabilité ─────────────────────────────────

const B_BATI = 168000;
const B_FURNITURE = 9000;

const docsB: Doc[] = [
  {
    id: "liasse-2025",
    file: "Liasse_fiscale_2025_Cabinet.pdf",
    kind: "Liasse fiscale 2025 (2031 et 2033)",
    year: 2025,
    status: "attention",
    statusNote: "Montant mis de côté différent du registre",
    findings: [
      { label: "Historique", value: "Activité depuis juin 2021, reprise" },
      { label: "Déficit à reporter", value: "1 850 € (né en 2025)" },
      { label: "Amortissements mis de côté", value: "11 240 €" },
      { label: "Emprunt en cours", value: "96 400 € restant dus fin 2025" },
    ],
    usedIn: ["historique", "financement", "amortissements"],
    pointId: "b-ard",
    paper: {
      heading: "Liasse 2031-SD / 2033-SD — exercice 2025 — M. Marc DUBOIS",
      lines: [
        { t: "Activité : location meublée non professionnelle — début 10/06/2021" },
        { t: "Résultat de l’exercice : déficit de 1 850 €", mark: "Déficit" },
        { t: "Amortissements réputés différés à reporter : 11 240 €", mark: "Mis de côté" },
        { t: "Emprunts et dettes auprès des établissements de crédit : 96 400 €", mark: "Emprunt" },
      ],
    },
  },
  {
    id: "registre",
    file: "Tableau_amortissements_Cabinet.xlsx",
    kind: "Registre des amortissements",
    year: 2025,
    status: "attention",
    statusNote: "Montant mis de côté différent de la liasse",
    findings: [
      { label: "Logement", value: "6 éléments, 168 000 € de valeur amortissable" },
      { label: "Meubles", value: "9 000 € en lot sur 7 ans" },
      { label: "Usure annuelle", value: "7 222 €" },
      { label: "Amortissements mis de côté", value: "10 980 €" },
    ],
    usedIn: ["amortissements", "historique"],
    pointId: "b-ard",
    paper: {
      heading: "Cabinet Exemple & Associés — plan d’amortissement — M. DUBOIS",
      lines: [
        { t: "Gros œuvre 84 000 € — 50 ans — dotation 1 680 €", mark: "Composant" },
        { t: "Installations (élec., plomberie, toiture) 50 400 € — 25 ans", mark: "Composant" },
        { t: "Étanchéité, agencements 33 600 € — 15 ans", mark: "Composant" },
        { t: "Mobilier 9 000 € — 7 ans — dotation 1 286 €", mark: "Mobilier" },
        { t: "Cumul des amortissements différés au 31/12/2025 : 10 980 €", mark: "Mis de côté" },
      ],
    },
  },
  {
    id: "gerance",
    file: "Releve_gerance_annuel_2026.pdf",
    kind: "Relevé de gérance annuel",
    year: 2026,
    status: "ok",
    findings: [
      { label: "Loyers encaissés", value: "12 × 780 €" },
      { label: "Frais de gestion", value: "674 €" },
    ],
    usedIn: ["loyers", "depenses"],
    paper: {
      heading: "Agence Exemple — compte rendu de gérance 2026",
      lines: [
        { t: "Bien : T2, 14 rue des Tanneurs, 33000 Bordeaux" },
        { t: "Loyers encaissés : 12 × 780,00 € = 9 360,00 €", mark: "Loyers" },
        { t: "Honoraires de gestion : 674,00 €", mark: "Frais de gestion" },
      ],
    },
  },
  {
    id: "tf-b",
    file: "Avis_taxe_fonciere_2026.pdf",
    kind: "Avis de taxe foncière",
    year: 2026,
    status: "ok",
    findings: [{ label: "Taxe foncière 2026", value: "1 020 €" }],
    usedIn: ["depenses"],
    paper: { heading: "Avis d’impôt 2026 — taxes foncières", lines: [{ t: "Montant de votre taxe foncière : 1 020 €", mark: "Montant" }] },
  },
  {
    id: "copro-b",
    file: "Decompte_charges_2026.pdf",
    kind: "Décompte de charges de copropriété",
    year: 2026,
    status: "ok",
    findings: [{ label: "Charges 2026", value: "1 180 €" }],
    usedIn: ["depenses"],
    paper: { heading: "Syndic Exemple — décompte 2026", lines: [{ t: "Total des charges du lot : 1 180,00 €", mark: "Montant" }] },
  },
  {
    id: "pno-b",
    file: "Echeancier_assurance_PNO.pdf",
    kind: "Assurance propriétaire non occupant",
    year: 2026,
    status: "ok",
    findings: [{ label: "Prime 2026", value: "168 €" }],
    usedIn: ["depenses"],
    paper: { heading: "Assurance Exemple — échéancier 2026", lines: [{ t: "Cotisation annuelle : 168,00 €", mark: "Prime" }] },
  },
  {
    id: "releve-pret-b",
    file: "Releve_annuel_pret_2026.pdf",
    kind: "Relevé annuel du prêt",
    year: 2026,
    hidden: true,
    status: "ok",
    findings: [
      { label: "Intérêts 2026", value: "1 846 €" },
      { label: "Assurance 2026", value: "204 €" },
      { label: "Reste dû fin 2026", value: "91 950 €" },
    ],
    usedIn: ["financement"],
    paper: {
      heading: "Banque Exemple — récapitulatif annuel 2026",
      lines: [
        { t: "Intérêts payés : 1 846,00 €", mark: "Intérêts" },
        { t: "Assurance : 204,00 €", mark: "Assurance" },
        { t: "Capital restant dû au 31/12/2026 : 91 950,00 €", mark: "Reste dû" },
      ],
    },
  },
];

const pointsB: Point[] = [
  {
    id: "b-ard",
    kind: "contradiction",
    blocking: true,
    domain: "historique",
    title: "Combien d’amortissements votre ancien cabinet a-t-il mis de côté ?",
    context:
      "Deux documents de votre cabinet ne donnent pas le même montant. L’écart est de 260 €. Je ne peux pas savoir lequel est juste : il peut s’agir d’une correction faite après le dépôt de la liasse.",
    why:
      "Ce montant ne change rien à votre résultat 2026. Il sert à réduire vos résultats des années futures, sans limite de durée — une erreur aujourd’hui se répercuterait donc pendant des années. Votre ancien cabinet est le mieux placé pour trancher.",
    sources: [
      { label: "Liasse fiscale 2025 (déposée)", value: "11 240 €", docId: "liasse-2025" },
      { label: "Registre des amortissements", value: "10 980 €", docId: "registre" },
    ],
    options: [
      { id: "liasse", label: "11 240 €", hint: "le montant déclaré dans la liasse 2025", set: { ard: 11240 } },
      { id: "registre", label: "10 980 €", hint: "le montant du registre du cabinet", set: { ard: 10980 } },
      { id: "other", label: "Un autre montant", hint: "communiqué par votre cabinet", input: { kind: "amount", key: "ard", min: 0, max: 200000 } },
    ],
    deferLabel: "Je vais demander à mon cabinet",
    delegate: {
      to: "Cabinet Exemple & Associés",
      message:
        "Bonjour,\n\nJe reprends moi-même la déclaration de ma location meublée (14 rue des Tanneurs, Bordeaux) à partir de 2026.\n\nLa liasse 2025 indique 11 240 € d’amortissements réputés différés à reporter, et votre tableau d’amortissements 10 980 €. Pouvez-vous me confirmer le montant exact au 31/12/2025 ?\n\nMerci d’avance,\nMarc Dubois",
    },
  },
  {
    id: "b-pret",
    kind: "missing",
    blocking: true,
    domain: "financement",
    title: "Il me manque le relevé annuel de votre prêt pour 2026",
    context:
      "Votre liasse 2025 mentionne un emprunt : 96 400 € restaient dus fin 2025. Aucun document de 2026 ne me permet de connaître les intérêts payés cette année, ni ce qui reste dû.",
    why:
      "Les intérêts réduisent votre résultat, et le montant restant dû figure dans votre liasse. Je ne peux pas les estimer sans le tableau de votre banque — je préfère vous le demander plutôt que de deviner.",
    options: [{ id: "doc", label: "J’ajoute le relevé de ma banque", hint: "souvent appelé « récapitulatif annuel » ou « IFU prêt »", addDoc: "releve-pret-b" }],
    deferLabel: "Je dois le demander à ma banque",
  },
];

function deriveB(state: ScenarioState): View {
  const f = state.facts;
  const ardAnswered = state.points["b-ard"]?.status === "answered";
  const ard = typeof f.ard === "number" ? f.ard : 11240;
  const loanDoc = state.addedDocs.includes("releve-pret-b");

  const components = componentsFor(B_BATI, 1);
  const mobilier = [{ label: "Mobilier (lot)", base: B_FURNITURE, years: 7, year: Math.round(B_FURNITURE / 7) }];
  const totalYear = components.reduce((s, c) => s + c.year, 0) + mobilier.reduce((s, m) => s + m.year, 0);

  const loyers: Row[] = [
    { id: "r-b", label: "Loyers encaissés par l’agence", sub: "12 × 780 €", amount: 9360, prov: { kind: "read", docIds: ["gerance"] } },
  ];
  const depenses: Row[] = [
    { id: "d-gest", label: "Frais de gestion de l’agence", amount: 674, prov: { kind: "read", docIds: ["gerance"] } },
    { id: "d-tf", label: "Taxe foncière", amount: 1020, prov: { kind: "read", docIds: ["tf-b"] } },
    { id: "d-copro", label: "Charges de copropriété", amount: 1180, prov: { kind: "read", docIds: ["copro-b"] } },
    { id: "d-pno", label: "Assurance propriétaire non occupant", amount: 168, prov: { kind: "read", docIds: ["pno-b"] } },
  ];
  if (loanDoc) {
    depenses.push(
      { id: "d-int", label: "Intérêts d’emprunt", amount: 1846, prov: { kind: "read", docIds: ["releve-pret-b"] } },
      { id: "d-ass", label: "Assurance emprunteur", amount: 204, prov: { kind: "read", docIds: ["releve-pret-b"] } },
    );
  } else {
    depenses.push({ id: "d-int", label: "Intérêts et assurance d’emprunt", value: "relevé 2026 manquant", prov: { kind: "missing" }, flag: "gap", pointId: "b-pret" });
  }

  const recettesTotal = sumRows(loyers);
  const chargesTotal = sumRows(depenses);
  const seq = fiscalSequence({ recettes: recettesTotal, charges: chargesTotal, amortYear: totalYear, deficitsStock: 1850, ardStock: ard });

  const carried = { kind: "carried", from: "liasse 2025 et registre du cabinet" } as const;
  const history: HistoryRow[] = [
    { year: 2021, label: "Première année (juin → décembre)", dotation: 4030, used: 2150, stock: 1880, prov: carried },
    { year: 2022, label: "Année complète", dotation: 7222, used: 5380, stock: 3722, prov: carried },
    { year: 2023, label: "Année complète", dotation: 7222, used: 6104, stock: 4840, prov: carried },
    { year: 2024, label: "Réserve en partie utilisée", dotation: 7222, used: 8044, stock: 4018, prov: carried },
    { year: 2025, label: "Déficit de 1 850 € (travaux de copropriété)", dotation: 7222, used: 0, stock: ard, prov: ardAnswered ? { kind: "answer" } : { kind: "estimated", note: "montant de la liasse en attendant votre réponse" } },
    { year: 2026, label: "Cette année", dotation: totalYear, used: seq.amortUsed + seq.ardUsed, stock: seq.ardStockAfter, prov: { kind: "computed" } },
  ];

  const provisional = pointsB.some((p) => p.blocking && state.points[p.id]?.status !== "answered");

  const summaries: Record<DomainId, Summary> = {
    logement: { text: "T2 de 38 m², 14 rue des Tanneurs, Bordeaux — loué depuis juin 2021", status: "ok" },
    financement: loanDoc
      ? { text: "Prêt en cours · 1 846 € d’intérêts en 2026", status: "ok" }
      : { text: "Prêt connu grâce à la liasse 2025 · relevé 2026 manquant", status: "attention" },
    loyers: { text: `12 loyers encaissés par l’agence · ${eur(recettesTotal)}`, status: "ok" },
    depenses: { text: `${depenses.filter((d) => d.flag !== "gap").length} dépenses retenues · ${eur(chargesTotal)}`, status: loanDoc ? "ok" : "attention" },
    amortissements: { text: `Plan de votre cabinet repris · ${eur(totalYear)} d’usure pour 2026`, status: "ok" },
    historique: ardAnswered
      ? { text: `5 années reprises · déficit 2025 et ${eur(ard)} mis de côté`, status: "ok" }
      : { text: "5 années reprises · un montant à confirmer avec votre cabinet", status: "attention" },
  };

  return {
    year: 2026,
    owner: "Marc Dubois",
    property: "T2 meublé — 14 rue des Tanneurs, Bordeaux",
    propertyShort: "T2 rue des Tanneurs",
    logement: [
      { id: "l-adr", label: "Logement", value: "T2 meublé de 38 m², 14 rue des Tanneurs, 33000 Bordeaux", prov: carried },
      { id: "l-date", label: "Début de l’activité", value: "10 juin 2021", prov: carried },
      { id: "l-val", label: "Valeur du logement qui s’use", amount: B_BATI, prov: carried },
      { id: "l-ter", label: "Terrain (jamais amorti)", amount: 48000, prov: carried },
      { id: "l-mob", label: "Mobilier", amount: B_FURNITURE, prov: carried },
    ],
    autoResolved: [
      { title: "Déficit 2025 : 1 850 €", detail: "La liasse et le registre concordent. Il sera déduit en premier de votre résultat 2026.", rule: "SAV-027" },
      { title: "Plan d’amortissement conservé", detail: "Les durées choisies par votre cabinet sont figées une fois le plan validé : je ne les recalcule pas.", rule: "JUG-005" },
      { title: "Loyers : aucun écart", detail: "Le relevé de gérance couvre les 12 mois de 2026.", rule: "Contrôle de complétude" },
    ],
    defaults: [
      {
        title: "Plan d’amortissement de votre cabinet conservé tel quel",
        detail: "Découpage, durées et part du terrain restent ceux de votre cabinet.",
        rule: "JUG-005",
        assistant: "Assistant Amortissements",
      },
    ],
    financement: {
      rows: loanDoc
        ? [
            { id: "f-crd0", label: "Reste dû fin 2025", amount: 96400, prov: { kind: "carried", from: "liasse 2025" } },
            { id: "f-int", label: "Intérêts 2026", amount: 1846, prov: { kind: "read", docIds: ["releve-pret-b"] } },
            { id: "f-ass", label: "Assurance emprunteur 2026", amount: 204, prov: { kind: "read", docIds: ["releve-pret-b"] } },
            { id: "f-crd", label: "Reste dû fin 2026", amount: 91950, prov: { kind: "read", docIds: ["releve-pret-b"] } },
          ]
        : [
            { id: "f-crd0", label: "Reste dû fin 2025", amount: 96400, prov: { kind: "carried", from: "liasse 2025" } },
            { id: "f-int", label: "Intérêts 2026", value: "relevé manquant", prov: { kind: "missing" }, flag: "gap", pointId: "b-pret" },
          ],
      schedule: [],
      scheduleNote: "Seuls les intérêts et l’assurance se déduisent. La part de capital remboursée ne l’est pas.",
    },
    loyers: { rows: loyers, total: recettesTotal },
    depenses: { rows: depenses, total: chargesTotal },
    amort: {
      baseRows: [
        { id: "b-bati", label: "Valeur du logement qui s’use", amount: B_BATI, prov: carried },
        { id: "b-mob", label: "Mobilier", amount: B_FURNITURE, prov: carried },
      ],
      components,
      mobilier,
      totalYear,
      prorataNote: "Année complète : 360 jours sur 360.",
    },
    history,
    deficits: [{ year: 2025, amount: 1850, used: seq.deficitsUsed }],
    seq,
    summaries,
    provisional,
  };
}

// ─── Scénario C — année N+1 ──────────────────────────────────────────────────

function carriedFromA(all: AllStates) {
  const viewA = deriveA(all.a);
  const start = typeof all.a.facts.startDate === "string" ? all.a.facts.startDate : "2026-04-01";
  const terrainPct = typeof all.a.facts.terrainPct === "number" ? all.a.facts.terrainPct : 25;
  return { viewA, start, terrainPct };
}

const docsC: Doc[] = [
  {
    id: "releves-2027",
    file: "Releves_compte_2027.pdf",
    kind: "Relevés bancaires 2027",
    year: 2027,
    status: "attention",
    statusNote: "Aucun loyer en août",
    findings: [
      { label: "Thomas Leroy", value: "6 loyers de 720 € puis 735 € en juillet" },
      { label: "Nouvelle locataire", value: "Sarah Benali, 760 € depuis septembre" },
      { label: "Août", value: "aucun loyer" },
    ],
    usedIn: ["loyers"],
    pointId: "c-aout",
    paper: {
      heading: "Relevés de compte — janvier à décembre 2027",
      lines: [
        { t: "05/01 → 05/06  VIR LEROY THOMAS LOYER   +720,00 (× 6)", mark: "Loyers" },
        { t: "05/07  VIR LEROY THOMAS LOYER JUILLET   +735,00", mark: "Loyer révisé" },
        { t: "Août : aucun virement de loyer", mark: "Écart" },
        { t: "03/09 → 03/12  VIR BENALI SARAH LOYER   +760,00 (× 4)", mark: "Nouvelle locataire" },
      ],
    },
  },
  {
    id: "bail-benali",
    file: "Bail_meuble_Benali.pdf",
    kind: "Nouveau bail de location meublée",
    year: 2027,
    status: "ok",
    findings: [
      { label: "Locataire", value: "Sarah Benali" },
      { label: "Loyer", value: "760 € par mois, à partir du 1er septembre 2027" },
    ],
    usedIn: ["loyers"],
    paper: { heading: "Contrat de location meublée", lines: [{ t: "Prise d’effet : 1er septembre 2027 — loyer 760 €", mark: "Loyer" }] },
  },
  {
    id: "tf-c",
    file: "Avis_taxe_fonciere_2027.pdf",
    kind: "Avis de taxe foncière",
    year: 2027,
    status: "ok",
    statusNote: "Nouveau : votre première taxe foncière",
    findings: [{ label: "Taxe foncière 2027", value: "1 080 €" }],
    usedIn: ["depenses"],
    paper: { heading: "Avis d’impôt 2027 — taxes foncières", lines: [{ t: "Montant de votre taxe foncière : 1 080 €", mark: "Montant" }] },
  },
  {
    id: "copro-c",
    file: "Appels_de_fonds_syndic_2027.pdf",
    kind: "Appels de charges de copropriété",
    year: 2027,
    status: "ok",
    findings: [{ label: "Appels payés", value: "4 × 195 €" }],
    usedIn: ["depenses"],
    paper: { heading: "Syndic Exemple — appels de fonds 2027", lines: [{ t: "4 appels trimestriels de 195,00 €", mark: "Montant" }] },
  },
  {
    id: "pno-c",
    file: "Attestation_assurance_PNO_2027.pdf",
    kind: "Assurance propriétaire non occupant",
    year: 2027,
    status: "ok",
    findings: [{ label: "Prime 2027", value: "146 €" }],
    usedIn: ["depenses"],
    paper: { heading: "Assurance Exemple — PNO 2027", lines: [{ t: "Cotisation annuelle TTC : 146,00 €", mark: "Prime" }] },
  },
  {
    id: "canape",
    file: "Facture_canape_lit.pdf",
    kind: "Facture de mobilier",
    year: 2027,
    status: "ok",
    findings: [{ label: "Canapé-lit", value: "890 € le 3 mars 2027" }],
    usedIn: ["amortissements"],
    paper: { heading: "Maison Meuble — facture", lines: [{ t: "Canapé-lit convertible — 03/03/2027 — 890,00 €", mark: "Montant" }] },
  },
  {
    id: "releve-pret-2027",
    file: "Releve_annuel_pret_2027.pdf",
    kind: "Relevé annuel du prêt",
    year: 2027,
    hidden: true,
    status: "ok",
    findings: [{ label: "Intérêts 2027", value: "identiques au calcul" }],
    usedIn: ["financement"],
    paper: { heading: "Banque Exemple — récapitulatif annuel 2027", lines: [{ t: "12 échéances — intérêts conformes au tableau", mark: "Intérêts" }] },
  },
];

const pointsC: Point[] = [
  {
    id: "c-aout",
    kind: "missing",
    blocking: true,
    domain: "loyers",
    title: "Que s’est-il passé en août ?",
    context:
      "Thomas Leroy a payé son dernier loyer en juillet. Ceux de Sarah Benali commencent en septembre. Août ne contient aucun loyer.",
    why:
      "Un mois sans loyer entre deux locataires est courant. Mais si le logement a été occupé autrement, le traitement de certaines dépenses peut changer : je ne le suppose pas à votre place.",
    options: [
      { id: "vacant", label: "Il était vide, entre deux locataires", set: { aug: "vacant" } },
      { id: "paid", label: "J’ai reçu un loyer autrement", hint: "espèces, autre compte…", input: { kind: "amount", key: "augAmount", min: 1, max: 5000 } },
      {
        id: "self",
        label: "Je l’ai occupé moi-même, ou prêté à un proche",
        escalate:
          "Cette situation change le traitement de certaines dépenses de l’année. Je ne veux pas conclure seul : ce point est transmis pour vérification par un expert avant que votre dossier puisse être finalisé.",
      },
    ],
    deferLabel: "Je vérifierai",
  },
  {
    id: "c-pret",
    kind: "optional",
    blocking: false,
    domain: "financement",
    title: "Voulez-vous confirmer vos intérêts 2027 ?",
    context:
      "Je les ai calculés à partir du tableau d’amortissement reçu l’an dernier. Le relevé annuel de votre banque permettrait de le confirmer.",
    why:
      "Un taux fixe suit exactement le tableau : l’écart est rare. Il existe surtout en cas de remboursement anticipé ou de changement d’assurance.",
    options: [
      { id: "doc", label: "J’ajoute le relevé de ma banque", addDoc: "releve-pret-2027" },
      { id: "keep", label: "Garder le calcul", hint: "rien n’a changé sur mon prêt", dismiss: true },
    ],
    deferLabel: "Plus tard",
  },
];

function deriveC(state: ScenarioState, all: AllStates): View {
  const { viewA, terrainPct } = carriedFromA(all);
  const f = state.facts;

  const immeuble = A_PRICE + A_FEES - A_FURNITURE_DEED;
  const terrain = Math.round((immeuble * terrainPct) / 100);
  const bati = immeuble - terrain;
  const components = componentsFor(bati, 1);
  const canapeProrata = days360ToYearEnd("2027-03-03") / 360;
  const mobilier = [
    { label: "Meubles 2026 (lot)", base: A_FURNITURE_DEED + A_FURNITURE_INVOICE, years: 7, year: Math.round((A_FURNITURE_DEED + A_FURNITURE_INVOICE) / 7) },
    { label: "Canapé-lit (mars 2027)", base: 890, years: 7, year: Math.round((890 / 7) * canapeProrata) },
  ];
  const totalYear = components.reduce((s, c) => s + c.year, 0) + mobilier.reduce((s, m) => s + m.year, 0);

  const loan = loanYear(LOAN_A, 2027);
  const loanDoc = state.addedDocs.includes("releve-pret-2027");
  const loanProv: Provenance = loanDoc
    ? { kind: "read", docIds: ["releve-pret-2027"] }
    : { kind: "computed", note: "d’après le tableau d’amortissement reçu en 2026" };

  const loyers: Row[] = [];
  for (let m = 1; m <= 6; m += 1) {
    loyers.push({ id: `r-${m}`, label: `Loyer de ${monthName(m)}`, sub: "Thomas Leroy", amount: 720, prov: { kind: "read", docIds: ["releves-2027"] } });
  }
  loyers.push({ id: "r-7", label: "Loyer de juillet", sub: "Thomas Leroy — loyer révisé", amount: 735, prov: { kind: "read", docIds: ["releves-2027"] } });
  const augStatus = state.points["c-aout"]?.status;
  if (augStatus === "answered" && f.aug === "vacant") {
    loyers.push({ id: "r-8", label: "Août", value: "logement vide entre deux locataires", amount: 0, prov: { kind: "answer" }, pointId: "c-aout" });
  } else if (augStatus === "answered" && typeof f.augAmount === "number") {
    loyers.push({ id: "r-8", label: "Loyer d’août", amount: f.augAmount, prov: { kind: "answer" }, pointId: "c-aout" });
  } else {
    loyers.push({ id: "r-8", label: "Août", value: augStatus === "escalated" ? "en vérification" : "aucun loyer — à expliquer", prov: { kind: "missing" }, flag: "gap", pointId: "c-aout" });
  }
  for (let m = 9; m <= 12; m += 1) {
    loyers.push({ id: `r-${m}`, label: `Loyer de ${monthName(m)}`, sub: "Sarah Benali", amount: 760, prov: { kind: "read", docIds: ["releves-2027", "bail-benali"] } });
  }

  const depenses: Row[] = [
    { id: "d-int", label: "Intérêts d’emprunt", sub: "12 échéances", amount: loan.interest, prov: loanProv },
    { id: "d-ass", label: "Assurance emprunteur", sub: "12 × 32,50 €", amount: loan.insurance, prov: loanProv },
    { id: "d-tf", label: "Taxe foncière", sub: "nouveau cette année", amount: 1080, prov: { kind: "read", docIds: ["tf-c"] } },
    { id: "d-copro", label: "Charges de copropriété", amount: 780, prov: { kind: "read", docIds: ["copro-c"] } },
    { id: "d-pno", label: "Assurance propriétaire non occupant", amount: 146, prov: { kind: "read", docIds: ["pno-c"] } },
  ];

  const recettesTotal = sumRows(loyers);
  const chargesTotal = sumRows(depenses);
  const ardStock = viewA.seq.ardStockAfter;
  const seq = fiscalSequence({ recettes: recettesTotal, charges: chargesTotal, amortYear: totalYear, deficitsStock: 0, ardStock });

  const provisional = pointsC.some((p) => p.blocking && state.points[p.id]?.status !== "answered");

  const summaries: Record<DomainId, Summary> = {
    logement: { text: "Déjà connu depuis 2026 — rien à vous redemander", status: "ok" },
    financement: loanDoc
      ? { text: `${eur(loan.interest)} d’intérêts, confirmés par votre banque`, status: "ok" }
      : { text: `${eur(loan.interest)} d’intérêts, calculés depuis votre tableau de 2026`, status: "ok" },
    loyers:
      augStatus === "answered"
        ? { text: `${loyers.filter((r) => (r.amount ?? 0) > 0).length} loyers · ${eur(recettesTotal)} · nouvelle locataire en septembre`, status: "ok" }
        : { text: "Loyers retrouvés sauf août · nouvelle locataire en septembre", status: "attention" },
    depenses: { text: `5 dépenses · ${eur(chargesTotal)} · première taxe foncière`, status: "ok" },
    amortissements: { text: `Plan 2026 poursuivi + un canapé-lit · ${eur(totalYear)} d’usure pour 2027`, status: "ok" },
    historique: { text: `${eur(ardStock)} mis de côté en 2026, repris automatiquement`, status: "ok" },
  };

  const history: HistoryRow[] = [
    { year: 2026, label: "Votre dossier 2026", dotation: viewA.amort.totalYear, used: viewA.seq.amortUsed, stock: ardStock, prov: { kind: "carried", from: "votre dossier 2026" } },
    { year: 2027, label: "Cette année", dotation: totalYear, used: seq.amortUsed + seq.ardUsed, stock: seq.ardStockAfter, prov: { kind: "computed" } },
  ];

  return {
    year: 2027,
    owner: "Claire Martin",
    property: "Studio meublé — 12 rue des Champs, Lyon 3e",
    propertyShort: "Studio rue des Champs",
    logement: viewA.logement.map((row) => ({ ...row, pointId: undefined, prov: { kind: "carried", from: "votre dossier 2026" } })),
    autoResolved: [
      { title: "Loyer révisé en juillet : 735 €", detail: "Le montant du virement a changé : c’est la révision annuelle prévue au bail. Rien à vous demander.", rule: "Détection de changement" },
      { title: "Nouvelle locataire : Sarah Benali", detail: "Son bail et ses virements concordent : 760 € depuis septembre.", rule: "Recoupement de deux sources" },
      { title: "Canapé-lit ajouté à vos meubles", detail: "890 € : amorti sur 7 ans à partir de mars, comme le reste de votre mobilier.", rule: "JUG-006" },
    ],
    defaults: viewA.defaults.slice(0, 3).map((d) => ({ ...d, detail: `${d.detail} Choix repris de 2026.` })),
    financement: {
      rows: [
        { id: "f-cap", label: "Prêt", value: "150 000 € à 3,45 % sur 20 ans", prov: { kind: "carried", from: "votre dossier 2026" } },
        { id: "f-int", label: "Intérêts 2027", amount: loan.interest, prov: loanProv },
        { id: "f-ass", label: "Assurance emprunteur 2027", amount: loan.insurance, prov: loanProv },
        { id: "f-crd", label: "Reste à rembourser au 31 décembre", amount: loan.remaining, prov: { kind: "computed", note: "d’après le tableau d’amortissement" } },
      ],
      schedule: loan.rows.map((row) => ({ label: `${monthName(row.month)} ${row.year}`, interest: row.interest, insurance: LOAN_A.monthlyInsurance })),
      scheduleNote: "Seuls les intérêts et l’assurance se déduisent. La part de capital remboursée ne l’est pas.",
    },
    loyers: { rows: loyers, total: recettesTotal },
    depenses: { rows: depenses, total: chargesTotal },
    amort: {
      baseRows: [
        { id: "b-bati", label: "Valeur du logement qui s’use", amount: bati, prov: { kind: "carried", from: "votre dossier 2026" } },
        { id: "b-ter", label: `Terrain (${terrainPct} %, votre choix 2026)`, amount: terrain, prov: { kind: "carried", from: "votre dossier 2026" } },
      ],
      components,
      mobilier,
      totalYear,
      prorataNote: "Année complète pour le logement ; le canapé-lit à partir du 3 mars 2027.",
    },
    history,
    deficits: [],
    seq,
    summaries,
    provisional,
  };
}

// ─── Registre des scénarios ──────────────────────────────────────────────────

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  a: {
    id: "a",
    label: "Première déclaration",
    persona: "Claire, 34 ans, a acheté un studio meublé à Lyon en mars 2026. Elle n’a jamais fait de comptabilité.",
    firstName: "Claire",
    initials: "CM",
    year: 2026,
    pitch: "Elle dépose 10 documents en vrac. Fiscal AI fait le tri et ne lui pose que 3 questions indispensables.",
    docs: docsA,
    points: pointsA,
    initialFacts: { startDate: null, decRent: null, terrainPct: null },
    derive: (state) => deriveA(state),
    previewMetric: {
      "a-date": (v) => `Usure déduite en 2026 : jusqu’à ${eur(v.amort.totalYear)}`,
      "a-terrain": (v) => `Usure calculée chaque année : ${eur(v.amort.components.reduce((s, c) => s + Math.round(c.base / c.years), 0))}`,
      "a-dec": (v) => `Loyers 2026 : ${eur(v.loyers.total)}`,
    },
    expectedDocs: [
      "Acte d’achat",
      "Offre de prêt",
      "Relevés de loyers",
      "Assurance",
      "Charges de copropriété",
      "Factures de meubles ou de travaux",
    ],
  },
  b: {
    id: "b",
    label: "Reprise d’une comptabilité",
    persona: "Marc, 52 ans, loue un T2 à Bordeaux depuis 2021. Il quitte son cabinet comptable.",
    firstName: "Marc",
    initials: "MD",
    year: 2026,
    pitch: "Il dépose sa dernière liasse. Fiscal AI reprend 5 ans d’historique et isole les 2 seuls points qui posent problème.",
    docs: docsB,
    points: pointsB,
    initialFacts: { ard: null },
    derive: (state) => deriveB(state),
    reprise: {
      certain: [
        "Le logement, sa valeur et la part du terrain",
        "Le plan d’amortissement : 6 éléments et leurs durées",
        "Le mobilier et sa durée",
        "5 années d’historique (2021 → 2025)",
        "Le déficit de 1 850 € né en 2025",
        "L’emprunt en cours",
      ],
      contradictory: ["Le montant d’amortissements mis de côté : 11 240 € ou 10 980 €"],
      missing: ["Les intérêts de votre prêt pour 2026"],
      fresh: ["Loyers et frais de gestion (relevé de l’agence)", "Taxe foncière 2026", "Charges de copropriété 2026", "Assurance 2026"],
    },
  },
  c: {
    id: "c",
    label: "Année suivante",
    persona: "Claire revient un an plus tard pour déclarer 2027. Fiscal AI se souvient de tout.",
    firstName: "Claire",
    initials: "CM",
    year: 2027,
    pitch: "Rien n’est redemandé. Fiscal AI cherche seulement ce qui a changé — et trouve un mois sans loyer.",
    docs: [...docsA.map((d) => ({ ...d, status: "ok" as const, statusNote: undefined, pointId: undefined })), ...docsC],
    points: pointsC,
    initialFacts: { aug: null, augAmount: null },
    derive: deriveC,
    memory: (all) => {
      const { viewA, start, terrainPct } = carriedFromA(all);
      return [
        { label: "Votre logement", value: "Studio de 28 m², 12 rue des Champs, Lyon 3e" },
        { label: "Achat et mise en location", value: `14 mars 2026 · loué depuis le ${frDate(start)}` },
        { label: "Votre prêt", value: "150 000 € à 3,45 % — tableau d’amortissement connu" },
        { label: "Part du terrain", value: `${terrainPct} % — votre choix de 2026` },
        { label: "Plan d’amortissement", value: "6 éléments + meubles, poursuivi automatiquement" },
        { label: "Mis de côté en 2026", value: `${eur(viewA.seq.ardStockAfter)} d’amortissements` },
      ];
    },
    changes: [
      { title: "Loyer révisé en juillet", detail: "720 € → 735 €" },
      { title: "Nouvelle locataire en septembre", detail: "Sarah Benali, 760 €" },
      { title: "Première taxe foncière", detail: "1 080 €" },
      { title: "Un nouveau meuble", detail: "Canapé-lit, 890 €" },
    ],
    expectedDocs: [
      "Relevés de loyers 2027",
      "Avis de taxe foncière 2027",
      "Charges de copropriété 2027",
      "Assurance 2027",
      "Factures de l’année (meubles, travaux)",
    ],
  },
};

export function initialState(id: ScenarioId): ScenarioState {
  const def = SCENARIOS[id];
  return {
    phase: "start",
    facts: { ...def.initialFacts },
    points: Object.fromEntries(def.points.map((p) => [p.id, { status: "open" as const }])),
    addedDocs: [],
    removedRows: [],
    generated: false,
  };
}

export function visibleDocs(def: ScenarioDef, state: ScenarioState): Doc[] {
  return def.docs.filter((d) => !d.hidden || state.addedDocs.includes(d.id));
}

export function findDoc(def: ScenarioDef, id: string): Doc | undefined {
  return def.docs.find((d) => d.id === id);
}
