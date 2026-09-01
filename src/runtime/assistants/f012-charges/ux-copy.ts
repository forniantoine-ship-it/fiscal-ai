/**
 * Cycle UX-A — wording premier-intent F-012.
 * Année = `workspace.fiscalYear.year` (N). Aucune règle "déclaration N → N-1".
 */

import type { F012CategoryId } from "../../capabilities/f012/types";
import {
  FAMILY_CARD_TITLES,
  assuranceCreditAlreadyHandledNote,
  familyCardPhrase,
  familyCardPrompt,
  familyUnknownHelp,
  familyYearReminder,
  filetFinalPrompt,
  paperReservedMessage,
  syndicEpargneQuestion,
} from "./family-ux";
import { missingDocumentFieldMessage, paperInviteMessage } from "./charge-proposal";
import { situationalProfilageQuestions } from "./situational-profilage";

export function paidInYearAnchor(year: number): string {
  return `Nous allons regarder uniquement ce que vous avez réellement payé en ${year}.`;
}

export function categoryLabel(id: F012CategoryId): string {
  const labels: Record<F012CategoryId, string> = {
    taxe_fonciere: "Taxe foncière",
    assurance_pno: "Assurance du logement",
    assurance_gli: "Assurance loyers impayés",
    copropriete: "Syndic",
    honoraires_gestion: "Agence de gestion",
    travaux: "Travaux et réparations",
    honoraires_comptable: "Comptable ou logiciel",
    frais_bancaires: "Frais bancaires",
    divers: "Autres dépenses",
  };
  return labels[id];
}

export function categoryQuestion(id: F012CategoryId, year: number): string {
  switch (id) {
    case "taxe_fonciere":
      return (
        `En ${year}, avez-vous payé la taxe foncière de ce logement ?\n\n` +
        paidInYearAnchor(year)
      );
    case "assurance_pno":
      return `En ${year}, avez-vous payé une assurance pour ce logement ?`;
    case "assurance_gli":
      return `En ${year}, avez-vous payé une assurance contre les loyers impayés ?`;
    case "copropriete":
      return `En ${year}, avez-vous payé un syndic ?`;
    case "honoraires_gestion":
      return `En ${year}, avez-vous payé une agence pour gérer ce logement ?`;
    case "travaux":
      return `En ${year}, avez-vous payé des travaux ou fait réparer quelque chose dans le logement ?`;
    case "honoraires_comptable":
      return `En ${year}, avez-vous payé un comptable ou un logiciel pour suivre ce logement ?`;
    case "frais_bancaires":
      return `En ${year}, avez-vous payé des frais bancaires liés à ce logement ?`;
    case "divers":
      return `En ${year}, avez-vous d'autres dépenses pour ce logement ?`;
  }
}

export function amountPaidLabel(year: number): string {
  return `Combien avez-vous réellement payé en ${year} ?`;
}

export function amountWhereToLook(id: F012CategoryId): string | undefined {
  switch (id) {
    case "taxe_fonciere":
      return "Regardez l'avis de taxe foncière, ou le prélèvement sur votre compte.";
    case "assurance_pno":
    case "assurance_gli":
      return "Regardez votre contrat d'assurance, l'attestation, ou le prélèvement sur votre compte.";
    case "copropriete":
      return "Regardez les appels de fonds du syndic, ou le récapitulatif annuel.";
    case "honoraires_gestion":
      return "Regardez le relevé de l'agence, ou les prélèvements sur votre compte.";
    case "travaux":
      return "Regardez la facture, ou le paiement sur votre compte.";
    case "honoraires_comptable":
      return "Regardez la facture du comptable ou l'abonnement du logiciel.";
    case "frais_bancaires":
      return "Regardez les frais sur le compte lié au logement.";
    case "divers":
      return "Regardez vos factures ou votre relevé bancaire.";
  }
}

export type UnknownDocumentHint = {
  available: boolean;
  label?: string;
};

export function unknownDocumentHint(id: F012CategoryId): UnknownDocumentHint {
  switch (id) {
    case "taxe_fonciere":
      return { available: true, label: "l'avis de taxe foncière" };
    case "assurance_pno":
    case "assurance_gli":
      return { available: true, label: "le contrat ou l'attestation d'assurance" };
    case "copropriete":
      return { available: true, label: "le récapitulatif annuel du syndic" };
    case "honoraires_gestion":
      return { available: true, label: "le relevé de l'agence" };
    case "travaux":
      return { available: true, label: "la facture" };
    default:
      return { available: false };
  }
}

function unknownCategoryExplain(id: F012CategoryId, year: number): string {
  switch (id) {
    case "taxe_fonciere":
      return (
        `La taxe foncière est l'impôt local que vous payez chaque année pour ce logement. ` +
        `Nous cherchons uniquement ce que vous avez réellement payé en ${year}.`
      );
    case "assurance_pno":
      return (
        `C'est l'assurance du logement (incendie, dégât des eaux, responsabilité). ` +
        `Nous cherchons uniquement ce que vous avez réellement payé en ${year}.`
      );
    case "assurance_gli":
      return (
        `C'est l'assurance qui vous protège si un locataire ne paie pas. ` +
        `Nous cherchons uniquement ce que vous avez réellement payé en ${year}.`
      );
    case "copropriete":
      return (
        `Si le logement est dans un immeuble avec un syndic, vous versez des sommes au syndic. ` +
        `Nous cherchons uniquement ce que vous avez réellement payé en ${year}.`
      );
    case "honoraires_gestion":
      return (
        `Si une agence s'occupe du logement, elle vous facture ses honoraires. ` +
        `Nous cherchons uniquement ce que vous avez réellement payé en ${year}.`
      );
    case "travaux":
      return (
        `Il s'agit des réparations ou travaux que vous avez fait faire dans le logement. ` +
        `Nous cherchons uniquement ce que vous avez réellement payé en ${year}.`
      );
    case "honoraires_comptable":
      return (
        `C'est ce que vous avez payé à un comptable, ou pour un logiciel de suivi. ` +
        `Nous cherchons uniquement ce que vous avez réellement payé en ${year}.`
      );
    case "frais_bancaires":
      return (
        `Ce sont les frais du compte utilisé pour ce logement. ` +
        `Nous cherchons uniquement ce que vous avez réellement payé en ${year}.`
      );
    case "divers":
      return (
        `Toute autre dépense liée au logement, que nous n'avons pas encore vue. ` +
        `Nous cherchons uniquement ce que vous avez réellement payé en ${year}.`
      );
  }
}

export function unknownCategoryHelp(id: F012CategoryId, year: number): string {
  const where = amountWhereToLook(id);
  const document = unknownDocumentHint(id);
  const documentLine = document.available
    ? `Si vous avez ${document.label}, vous pourrez l'ajouter plus tard — nous pourrons alors lire le montant.`
    : "Si vous retrouvez le montant plus tard, vous pourrez le renseigner.";

  return (
    `${unknownCategoryExplain(id, year)}\n\n` +
    `${where ?? ""}\n\n` +
    `${documentLine}\n\n` +
    `Vous pouvez Passer : nous n'inscrirons pas 0 €.`
  ).replace(/\n{3,}/g, "\n\n");
}

export function profilagePrompt(year: number, known: { copropriete?: boolean } = {}): string {
  const bullets = situationalProfilageQuestions(known, year)
    .map((question) => `• ${question.label}`)
    .join("\n");
  return (
    `${paidInYearAnchor(year)}\n\n` +
    "Avant de commencer, quelques questions rapides :\n\n" +
    `${bullets}\n\n` +
    "Répondez via le formulaire ci-dessous."
  );
}

export function profilageFieldLabels(year: number): {
  copropriete: string;
  agence: string;
  travaux: string;
  vacance: string;
  comptable: string;
} {
  return {
    copropriete: "Ce logement est dans une copropriété (avec un syndic)",
    agence: "Une agence gère ce logement",
    travaux: `En ${year}, j'ai payé des travaux ou fait réparer quelque chose`,
    vacance: "Le logement a été vacant une partie de l'année",
    comptable: "J'ai un comptable ou un logiciel",
  };
}

export function coproFieldLabels(year: number): {
  courant: string;
  regularisation: string;
  epargneTravaux: string;
  grosTravaux: string;
} {
  return {
    courant: `Ce que vous avez versé au syndic pour les charges courantes en ${year}`,
    regularisation: `Le solde de régularisation payé en ${year} (si le syndic vous en a envoyé un)`,
    epargneTravaux: `L'épargne travaux demandée par le syndic, versée en ${year}`,
    grosTravaux: `Un appel de fonds pour de gros travaux, payé en ${year} (la nature reste à préciser)`,
  };
}

export function travauxQualificationPrompt(): string {
  return "Cette dépense a-t-elle remis le logement comme avant, ou l'a-t-elle amélioré ?";
}

export function travauxIncertainAck(): string {
  return (
    "Nous avons noté cette dépense. Tant que vous n'êtes pas certain de sa nature, " +
    "nous ne la comptons pas comme un simple entretien."
  );
}

export function fondsTravauxExplanation(): string {
  return (
    "Cette épargne pour travaux n'est pas déductible l'année où vous la versez — " +
    "elle le sera quand les travaux seront faits."
  );
}

export function resumeAck(year: number, categoryCount: number): string {
  if (categoryCount <= 0) return "Reprenons là où vous en étiez.";
  const already =
    categoryCount === 1 ? "1 catégorie déjà renseignée" : `${categoryCount} catégories déjà renseignées`;
  return `Reprenons là où vous en étiez — ${already} pour ${year}.`;
}

/** Cycle 5A / 11 — reprise non bloquante. Les 6 cartes liront la même liste `unknown`. */
export function incompleteCoverageResume(familyLabels: string[]): string | undefined {
  if (familyLabels.length === 0) return undefined;
  const count =
    familyLabels.length === 1 ? "1 information" : `${familyLabels.length} informations`;
  const names =
    familyLabels.length === 1 ? familyLabels[0] : familyLabels.join(", ");
  return (
    `Il vous reste ${count} à compléter : ${names}. ` +
    `Vous aviez indiqué qu'il vous manquait une information. ` +
    `Vous pouvez la compléter maintenant, ou continuer — ce n'est pas bloquant.`
  );
}

export function chargesAlreadyRecorded(year: number): string {
  return `Vos charges sont déjà enregistrées pour ${year}.`;
}

export function assistantHeaderLead(year: number): string {
  return paidInYearAnchor(year);
}

const FIRST_INTENT_FORBIDDEN = [
  /\bPNO\b/,
  /\bALUR\b/,
  /\bprovisions?\b/i,
  /montant annuel/i,
  /pour cet exercice/i,
  /pour votre déclaration/i,
];

/** Premier-intent : pas de jargon fiscal, pas de « déclaration N → N-1 ». */
export function firstIntentViolations(text: string, year: number): string[] {
  const violations: string[] = [];
  for (const pattern of FIRST_INTENT_FORBIDDEN) {
    if (pattern.test(text)) violations.push(pattern.source);
  }
  if (new RegExp(`déclaration\\s+${year}`, "i").test(text)) {
    violations.push(`déclaration ${year}`);
  }
  const previous = year - 1;
  if (new RegExp(`dépenses?\\s+${previous}`).test(text) || new RegExp(`${year}\\s*[→\\->]+\\s*${previous}`).test(text)) {
    violations.push(`déclaration ${year} → ${previous}`);
  }
  return violations;
}

export function allFirstIntentCopy(year: number): string[] {
  const ids: F012CategoryId[] = [
    "taxe_fonciere",
    "assurance_pno",
    "assurance_gli",
    "copropriete",
    "honoraires_gestion",
    "travaux",
    "honoraires_comptable",
    "frais_bancaires",
    "divers",
  ];
  const copro = coproFieldLabels(year);
  const profilage = profilageFieldLabels(year);
  return [
    paidInYearAnchor(year),
    profilagePrompt(year),
    ...Object.values(profilage),
    ...ids.map((id) => categoryQuestion(id, year)),
    ...ids.map((id) => categoryLabel(id)),
    amountPaidLabel(year),
    ...ids.flatMap((id) => {
      const where = amountWhereToLook(id);
      return [unknownCategoryHelp(id, year), ...(where ? [where] : [])];
    }),
    copro.courant,
    copro.regularisation,
    copro.epargneTravaux,
    copro.grosTravaux,
    travauxQualificationPrompt(),
    assistantHeaderLead(year),
    incompleteCoverageResume(["la taxe foncière"]) ?? "",
    familyYearReminder(year),
    filetFinalPrompt(year),
    ...Object.values(FAMILY_CARD_TITLES),
    ...(["impots", "syndic", "assurances", "gestion", "travaux", "autres"] as const).map((id) =>
      familyCardPhrase(id, year),
    ),
    ...(["impots", "syndic", "assurances", "gestion", "travaux", "autres"] as const).map((id) =>
      familyCardPrompt(id, year),
    ),
    familyUnknownHelp("impots", year),
    paperReservedMessage(),
    paperInviteMessage("impots"),
    paperInviteMessage("syndic"),
    paperInviteMessage("assurances"),
    paperInviteMessage("gestion"),
    missingDocumentFieldMessage(),
    syndicEpargneQuestion(year),
    assuranceCreditAlreadyHandledNote(),
    ...situationalProfilageQuestions({}, year).map((q) => q.label),
  ];
}
