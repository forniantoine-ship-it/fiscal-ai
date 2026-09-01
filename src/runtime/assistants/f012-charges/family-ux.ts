/**
 * Cycle 6 — UX des 6 familles (langage quotidien).
 * Cycle 11 — amorces de mémoire + ancre d'année + recap anti-oubli.
 * Aucune règle fiscale ici : titres, rappels, couverture, inventaire.
 * CFE n'est pas une catégorie moteur : jamais en première ligne.
 */

import {
  CHARGE_FAMILY_IDS,
  type ChargeFamilyId,
  type FamilyCoverage,
  type FamilyCoverageStatus,
} from "../../capabilities/f012/charge";
import { incompleteCoverages } from "../../capabilities/f012/family-coverage";
import type { F012CategoryId, ProfilCharges } from "../../capabilities/f012/types";
import type { F012CollectedData } from "./types";
import {
  hasBankExpense,
  hasComptableExpense,
  hasGliExpense,
  hasGestionHonoraires,
  hasPnoExpense,
  slotNudgeStatus,
} from "./slot-nudge";

export const FAMILY_CARD_TITLES: Record<ChargeFamilyId, string> = {
  impots: "Impôts du logement",
  syndic: "Syndic / immeuble",
  assurances: "Assurance du logement",
  gestion: "Agence / comptable / logiciel",
  travaux: "Réparations et travaux",
  autres: "Autre chose payé pour ce logement",
};

export const FAMILY_TO_CATEGORIES: Record<ChargeFamilyId, F012CategoryId[]> = {
  impots: ["taxe_fonciere"],
  syndic: ["copropriete"],
  assurances: ["assurance_pno", "assurance_gli"],
  gestion: ["honoraires_gestion", "honoraires_comptable"],
  travaux: ["travaux"],
  autres: ["frais_bancaires", "divers"],
};

/**
 * Cycle 11 — amorce de mémoire rattachée à une catégorie moteur déjà existante.
 * `documentary` suit DOCUMENTARY_FAMILY_IDS : travaux / autres restent manuel.
 */
export type FamilyMemoryPrompt = {
  reminder: string;
  category: F012CategoryId;
  documentary: boolean;
};

export function familyMemoryPrompts(familyId: ChargeFamilyId): FamilyMemoryPrompt[] {
  switch (familyId) {
    case "impots":
      return [
        { reminder: "taxe foncière", category: "taxe_fonciere", documentary: true },
        { reminder: "autre taxe liée au logement", category: "divers", documentary: false },
      ];
    case "syndic":
      return [
        { reminder: "décompte annuel", category: "copropriete", documentary: true },
        { reminder: "appels de fonds", category: "copropriete", documentary: true },
        { reminder: "régularisation", category: "copropriete", documentary: true },
        { reminder: "fonds travaux", category: "copropriete", documentary: true },
      ];
    case "assurances":
      return [
        { reminder: "assurance habitation", category: "assurance_pno", documentary: true },
        { reminder: "assurance propriétaire", category: "assurance_pno", documentary: true },
        { reminder: "loyers impayés", category: "assurance_gli", documentary: true },
        { reminder: "autre assurance liée au logement", category: "assurance_pno", documentary: true },
      ];
    case "gestion":
      return [
        { reminder: "frais de gestion", category: "honoraires_gestion", documentary: true },
        { reminder: "mise en location", category: "honoraires_gestion", documentary: true },
        { reminder: "état des lieux", category: "honoraires_gestion", documentary: true },
        { reminder: "comptable", category: "honoraires_comptable", documentary: true },
      ];
    case "travaux":
      return [
        { reminder: "réparation", category: "travaux", documentary: false },
        { reminder: "artisan", category: "travaux", documentary: false },
        { reminder: "petit chantier", category: "travaux", documentary: false },
      ];
    case "autres":
      return [
        { reminder: "annonce", category: "divers", documentary: false },
        { reminder: "fournitures", category: "divers", documentary: false },
        { reminder: "frais bancaires liés au logement", category: "frais_bancaires", documentary: false },
        { reminder: "déplacement", category: "divers", documentary: false },
      ];
  }
}

export function buildFamilyInventory(profil: ProfilCharges): ChargeFamilyId[] {
  const families: ChargeFamilyId[] = ["impots"];
  if (profil.copropriete) families.push("syndic");
  families.push("assurances");
  if (profil.agence || profil.comptable) families.push("gestion");
  if (profil.travaux) families.push("travaux");
  families.push("autres");
  return families;
}

/** Cycle 11 — ancre caisse, sans jargon. N'invente aucune règle : SAV-Charges-01. */
export function familyYearReminder(year: number): string {
  return (
    `Nous cherchons ce que vous avez réellement payé en ${year}. ` +
    `Une facture reçue en ${year} mais payée plus tard, ou un prélèvement de janvier ${year + 1}, ne compte pas ici.`
  );
}

export function familyCardPhrase(familyId: ChargeFamilyId, year: number): string {
  switch (familyId) {
    case "impots":
      return `En ${year}, avez-vous payé une ou plusieurs taxes pour ce logement ?`;
    case "syndic":
      return (
        `Pensez à tout ce qui est sorti de votre compte pour l'immeuble en ${year} : ` +
        `décompte annuel, appels de fonds, régularisation, fonds travaux…`
      );
    case "assurances":
      return `Avez-vous payé une ou plusieurs assurances pour ce logement en ${year} ?`;
    case "gestion":
      return `En ${year}, avez-vous payé une ou plusieurs choses à une agence, un comptable ou un logiciel ?`;
    case "travaux":
      return `En ${year}, avez-vous payé une réparation, un artisan, ou un petit chantier ?`;
    case "autres":
      return `En ${year}, avez-vous payé autre chose pour ce logement — même une petite dépense ?`;
  }
}

export function familyCardExamples(familyId: ChargeFamilyId): string[] {
  return familyMemoryPrompts(familyId).map((row) => row.reminder);
}

export function familyActionLabels(year: number): {
  paper: string;
  amount: string;
  none: string;
  unknown: string;
} {
  return {
    paper: "J'ai un document",
    amount: "Je connais un montant",
    none: `Rien payé en ${year}`,
    unknown: "Je ne sais pas / je dois vérifier",
  };
}

export function paperReservedMessage(): string {
  return (
    "Vous pourrez ajouter ce papier plus tard — nous pourrons alors en lire le montant. " +
    "Ce n'est pas encore ouvert ici. Vous pouvez continuer sans inscrire 0 €."
  );
}

export function familyUnknownHelp(familyId: ChargeFamilyId, year: number): string {
  const where: Record<ChargeFamilyId, string> = {
    impots: "Regardez l'avis de taxe foncière, ou le prélèvement sur votre compte.",
    syndic: "Regardez le décompte annuel du syndic, ou les appels de fonds.",
    assurances: "Regardez le contrat d'assurance, l'attestation, ou le prélèvement sur votre compte.",
    gestion: "Regardez le relevé de l'agence, la facture du comptable, ou l'abonnement du logiciel.",
    travaux: "Regardez la facture, ou le paiement sur votre compte.",
    autres: "Regardez vos factures ou le relevé du compte lié au logement.",
  };
  const document: Record<ChargeFamilyId, string> = {
    impots: "l'avis de taxe foncière",
    syndic: "le décompte annuel du syndic",
    assurances: "le contrat ou l'attestation d'assurance",
    gestion: "le relevé d'agence ou la facture",
    travaux: "la facture",
    autres: "une facture ou le relevé bancaire",
  };
  return (
    `${familyCardPhrase(familyId, year)}\n\n` +
    `${familyYearReminder(year)}\n` +
    `${where[familyId]}\n` +
    `Si vous avez ${document[familyId]}, vous pourrez l'ajouter plus tard.\n\n` +
    `Vous pouvez continuer : nous n'inscrirons pas 0 €.`
  );
}

/** Libellé de couverture — jamais le nom du statut interne. */
export function coverageMark(status: FamilyCoverage["status"]): string {
  if (status === "captured") return "✓ Vu";
  if (status === "none") return "— Rien payé";
  if (status === "not_applicable") return "— Non concerné";
  if (status === "reviewed_empty") return "Vérifié — aucune dépense retenue";
  if (status === "unknown") return "? À compléter";
  return "À vérifier";
}

export function coverageRecapLines(familyCoverage: FamilyCoverage[]): string {
  return CHARGE_FAMILY_IDS.map((familyId) => {
    const row = familyCoverage.find((item) => item.familyId === familyId);
    const mark = coverageMark(row?.status ?? "pending");
    return `${FAMILY_CARD_TITLES[familyId]} ${mark}`;
  }).join("\n");
}

export function remainingIncompleteMessage(familyCoverage: FamilyCoverage[]): string | undefined {
  const incomplete = incompleteCoverages(familyCoverage);
  if (incomplete.length === 0) return undefined;
  const titles = incomplete.map((row) => FAMILY_CARD_TITLES[row.familyId]);
  const count =
    incomplete.length === 1 ? "1 information" : `${incomplete.length} informations`;
  return (
    `Il vous reste ${count} à compléter : ${titles.join(", ")}. ` +
    `Vous pouvez y revenir maintenant, ou continuer. ` +
    `Continuer n'enregistre pas cette partie comme complète.`
  );
}

export const FILET_MEMORY_HINTS = [
  "réparation",
  "artisan",
  "annonce",
  "copropriété",
  "assurance",
  "autre dépense",
] as const;

export function filetFinalPrompt(year: number): string {
  return (
    `Avant de terminer, repensons une dernière fois à votre logement.\n` +
    `Avez-vous payé quelque chose en ${year} que nous n'avons pas encore renseigné ?\n\n` +
    `${FILET_MEMORY_HINTS.join(" · ")}`
  );
}

export function coverageCompletenessPrompt(year: number, familyCoverage: FamilyCoverage[]): string {
  const remaining = remainingIncompleteMessage(familyCoverage);
  return (
    `${coverageRecapLines(familyCoverage)}\n\n` +
    (remaining ? `${remaining}\n\n` : "") +
    filetFinalPrompt(year)
  );
}

export type FiletChip = { id: string; label: string; familyId: ChargeFamilyId };

const FILET_CHIP_BY_FAMILY: Record<ChargeFamilyId, FiletChip> = {
  impots: { id: "completeness_impots", label: FAMILY_CARD_TITLES.impots, familyId: "impots" },
  syndic: {
    id: "completeness_syndic",
    label: "Charges d'immeuble / copropriété",
    familyId: "syndic",
  },
  assurances: {
    id: "completeness_assurances",
    label: "Assurance du logement",
    familyId: "assurances",
  },
  gestion: {
    id: "completeness_gestion",
    label: "Agence, gestionnaire ou comptable",
    familyId: "gestion",
  },
  travaux: {
    id: "completeness_travaux",
    label: "Une réparation / un artisan",
    familyId: "travaux",
  },
  autres: {
    id: "completeness_autres",
    label: FAMILY_CARD_TITLES.autres,
    familyId: "autres",
  },
};

const FILET_PRIORITY = {
  detected: 0,
  unknown: 1,
  companion: 2,
  notApplicable: 3,
  unexplored: 4,
  bank: 5,
} as const;

/**
 * Cycle 13A/13B — puces du filet, adaptées aux trous réels. Maximum 4.
 * Rang : détecté > unknown > compagnon incomplet > not_applicable >
 * jamais exploré > autres/banque en dernier.
 */
export function filetChips(input: {
  familyCoverage: FamilyCoverage[];
  collected?: F012CollectedData;
  profil?: ProfilCharges;
  detectedFamilyIds?: ChargeFamilyId[];
}): FiletChip[] {
  const collected = input.collected;
  const byFamily = Object.fromEntries(
    input.familyCoverage.map((row) => [row.familyId, row.status]),
  ) as Partial<Record<ChargeFamilyId, FamilyCoverage["status"]>>;
  const ranked: Array<FiletChip & { priority: number }> = [];

  const upsert = (chip: FiletChip, priority: number) => {
    const existing = ranked.find((row) => row.id === chip.id);
    if (existing) {
      existing.priority = Math.min(existing.priority, priority);
      return;
    }
    ranked.push({ ...chip, priority });
  };

  for (const familyId of input.detectedFamilyIds ?? []) {
    upsert(FILET_CHIP_BY_FAMILY[familyId], FILET_PRIORITY.detected);
  }

  for (const familyId of CHARGE_FAMILY_IDS) {
    if (byFamily[familyId] === "unknown") {
      upsert(FILET_CHIP_BY_FAMILY[familyId], FILET_PRIORITY.unknown);
    }
  }

  const gliOpen =
    collected &&
    !hasGliExpense(collected) &&
    slotNudgeStatus(collected, "gli") !== "declined";
  const comptableOpen =
    collected &&
    !hasComptableExpense(collected) &&
    slotNudgeStatus(collected, "comptable") !== "declined";
  const bankOpen = collected ? !hasBankExpense(collected) : true;

  if (gliOpen && (hasPnoExpense(collected!) || byFamily.assurances === "captured")) {
    upsert(
      {
        id: "completeness_gli",
        label: "Assurance loyers impayés",
        familyId: "assurances",
      },
      FILET_PRIORITY.companion,
    );
  }
  if (comptableOpen && (hasGestionHonoraires(collected!) || byFamily.gestion === "captured")) {
    upsert(
      {
        id: "completeness_comptable",
        label: "Comptable ou logiciel",
        familyId: "gestion",
      },
      FILET_PRIORITY.companion,
    );
  }

  /**
   * Cycle 14A — sous-rang interne au palier `unexplored`, pas un nouveau
   * palier : `validateCharges` traite déjà Impôts et Assurances comme
   * inconditionnellement attendues (warning sans condition de profil),
   * contrairement à Travaux/Syndic/Gestion (conditionnels à `profil.*`).
   * Les deux valeurs restent strictement entre `notApplicable` et `bank` —
   * la hiérarchie macro `detected > unknown > companion > notApplicable >
   * unexplored > bank` n'est pas modifiée, seul l'ordre à l'intérieur
   * d'`unexplored` l'est, uniquement quand plus de 4 familles y sont
   * candidates simultanément.
   */
  const UNIVERSAL_UNEXPLORED_FAMILIES = new Set<ChargeFamilyId>(["impots", "assurances"]);

  const untreatedPriority = (
    status: FamilyCoverage["status"] | undefined,
    familyId: ChargeFamilyId,
  ): number | undefined => {
    if (status === "not_applicable") return FILET_PRIORITY.notApplicable;
    if (status === "none" || status === "pending" || status === "reviewed_empty") {
      return UNIVERSAL_UNEXPLORED_FAMILIES.has(familyId)
        ? FILET_PRIORITY.unexplored
        : FILET_PRIORITY.unexplored + 0.5;
    }
    return undefined;
  };

  for (const familyId of ["impots", "travaux", "syndic", "gestion", "assurances"] as ChargeFamilyId[]) {
    if (familyId === "assurances" && collected && hasPnoExpense(collected)) continue;
    if (ranked.some((chip) => chip.familyId === familyId)) continue;
    const priority = untreatedPriority(byFamily[familyId], familyId);
    if (priority === undefined) continue;
    upsert(FILET_CHIP_BY_FAMILY[familyId], priority);
  }

  if (bankOpen) {
    upsert(
      {
        id: "completeness_bank",
        label: "Frais du compte du logement",
        familyId: "autres",
      },
      FILET_PRIORITY.bank,
    );
  }

  ranked.sort((left, right) => left.priority - right.priority);
  return ranked.slice(0, 4).map(({ priority: _priority, ...chip }) => chip);
}

export function completenessSuggestions(
  familyCoverage: FamilyCoverage[],
  context?: {
    collected?: F012CollectedData;
    profil?: ProfilCharges;
    detectedFamilyIds?: ChargeFamilyId[];
  },
): Array<{ id: string; label: string }> {
  const incomplete = incompleteCoverages(familyCoverage);
  const suggestions: Array<{ id: string; label: string }> = [];
  if (incomplete.length === 1) {
    suggestions.push({
      id: "revisit_incomplete",
      label: `Revenir sur ${FAMILY_CARD_TITLES[incomplete[0]!.familyId]}`,
    });
  } else if (incomplete.length > 1) {
    suggestions.push({
      id: "revisit_incomplete",
      label: "Revenir sur les informations à compléter",
    });
  }
  const chips = filetChips({
    familyCoverage,
    collected: context?.collected,
    profil: context?.profil,
    detectedFamilyIds: context?.detectedFamilyIds,
  });
  for (const chip of chips) {
    suggestions.push({ id: chip.id, label: chip.label });
  }
  if (chips.length === 0) {
    suggestions.push({ id: "completeness_travaux", label: "Une réparation" });
  }
  suggestions.push({ id: "completeness_no", label: "Non, c'est bon" });
  return suggestions;
}

export function foreignFamilyLockMessage(currentTitle: string, otherTitles: string[]): string {
  const others = otherTitles.length > 0 ? otherTitles.join(", ") : "une autre dépense";
  return (
    `Ce texte parle aussi d'autre chose que ${currentTitle} (${others}). ` +
    `Nous n'avons rien inscrit automatiquement, pour ne pas vous attribuer une mauvaise dépense. ` +
    `Choisissez ci-dessous, ou décrivez une dépense à la fois.`
  );
}

export function familyCardPrompt(familyId: ChargeFamilyId, year: number): string {
  const bullets = familyCardExamples(familyId).map((item) => `• ${item}`).join("\n");
  return (
    `${FAMILY_CARD_TITLES[familyId]}\n\n` +
    `${familyYearReminder(year)}\n\n` +
    `${familyCardPhrase(familyId, year)}\n\n` +
    bullets
  );
}

export function assuranceCreditAlreadyHandledNote(): string {
  return "L'assurance de votre crédit a déjà été vue avec le financement — ne la saisissez pas ici.";
}

export function syndicEpargneQuestion(year: number): string {
  return `Est-ce qu'une partie de ce que vous avez payé en ${year} correspond à une épargne pour de futurs travaux ?`;
}

/** Famille déjà tranchée : ne pas la redemander en avançant (revisit inclus). */
export function shouldSkipFamilyOnAdvance(status: FamilyCoverageStatus | undefined): boolean {
  return (
    status === "captured" ||
    status === "none" ||
    status === "reviewed_empty" ||
    status === "not_applicable"
  );
}

export function nextFamilyIndexToVisit(
  familyInventory: ChargeFamilyId[],
  fromIndexExclusive: number,
  familyCoverage: FamilyCoverage[],
): number {
  for (let index = fromIndexExclusive + 1; index < familyInventory.length; index += 1) {
    const familyId = familyInventory[index];
    if (!familyId) continue;
    const status = familyCoverage.find((row) => row.familyId === familyId)?.status;
    if (!shouldSkipFamilyOnAdvance(status)) return index;
  }
  return -1;
}

export function firstIncompleteFamilyIndex(
  familyInventory: ChargeFamilyId[],
  familyCoverage: FamilyCoverage[],
): number {
  return familyInventory.findIndex((familyId) => {
    const row = familyCoverage.find((item) => item.familyId === familyId);
    return row?.status === "unknown";
  });
}
