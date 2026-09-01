import type { WorkflowStepView } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import type { DashboardHeroKind } from "@/components/lmnp/dashboard/workflow-progression";

export type ConseillerComplement = {
  id: string;
  question: string;
  answer: string;
};

/** Retire ou remplace les mentions « IA » dans les textes affichés par le conseiller. */
export function humanizeConseillerText(text: string): string {
  return text
    .replace(/extraits par l'IA/gi, "extraits automatiquement")
    .replace(/demandés par l'IA/gi, "demandés")
    .replace(/L'IA extrait automatiquement les données importantes/gi, "Les informations importantes sont extraites automatiquement")
    .replace(/L'IA extrait automatiquement/gi, "Les informations sont extraites automatiquement")
    .replace(/l'IA a identifié/gi, "nous avons repéré")
    .replace(/L'IA a identifié/g, "Nous avons repéré")
    .replace(/analysés par l'IA/gi, "analysés")
    .replace(/Statut IA/gi, "Statut")
    .replace(/\bl'IA\b/gi, "votre conseiller")
    .replace(/\bL'IA\b/g, "Votre conseiller")
    .replace(/\bIA\b/g, "conseiller");
}

export function buildConseillerComplements(
  currentStep: WorkflowStepView | null,
  kind: DashboardHeroKind,
): ConseillerComplement[] {
  if (kind === "correction") {
    return [
      {
        id: "what-check",
        question: "Que dois-je vérifier exactement ?",
        answer:
          "Repérez les champs signalés et confirmez ou corrigez chaque valeur. Cela garantit que votre déclaration reflète bien votre situation.",
      },
      {
        id: "can-later",
        question: "Puis-je corriger plus tard ?",
        answer:
          "Oui. Vous pouvez revenir sur cette étape à tout moment avant la validation finale de votre dossier.",
      },
      {
        id: "mandatory",
        question: "Cette étape est-elle obligatoire ?",
        answer:
          "Oui, chaque information confirmée alimente directement votre déclaration. Rien n'est transmis sans votre validation.",
      },
    ];
  }

  if (kind === "suggestions") {
    return [
      {
        id: "what-suggestions",
        question: "Que sont ces suggestions d'amortissement ?",
        answer:
          "Il s'agit de charges que votre conseiller a repérées et qui pourraient être amorties. Vous décidez lesquelles retenir.",
      },
      {
        id: "must-accept",
        question: "Dois-je toutes les accepter ?",
        answer:
          "Non. Examinez chaque suggestion et ne validez que celles qui correspondent à votre situation réelle.",
      },
      {
        id: "mandatory",
        question: "Cette étape est-elle obligatoire ?",
        answer:
          "L'examen des suggestions est recommandé pour optimiser votre déclaration, mais vous gardez le dernier mot sur chaque ligne.",
      },
    ];
  }

  if (kind === "ready") {
    return [
      {
        id: "what-next",
        question: "Que se passe-t-il ensuite ?",
        answer:
          "Vous passez à la préparation de votre déclaration. Vous pourrez la relire avant toute transmission.",
      },
      {
        id: "still-edit",
        question: "Puis-je encore modifier mon dossier ?",
        answer:
          "Oui, tant que vous n'avez pas validé la déclaration finale, chaque étape reste accessible.",
      },
      {
        id: "mandatory",
        question: "Cette étape est-elle obligatoire ?",
        answer:
          "La préparation finale est la dernière étape avant transmission. Vous pouvez la lancer quand vous vous sentez prêt.",
      },
    ];
  }

  const doc = currentStep?.requestedDocument;

  return [
    {
      id: "why-doc",
      question: "Pourquoi ce document ?",
      answer: doc
        ? currentStep?.documentPrompt
          ? `${humanizeConseillerText(currentStep.documentPrompt)} Ce document (${doc}) permet de préremplir votre dossier et d'éviter les saisies inutiles.`
          : `Ce document (${doc}) permet de préremplir votre dossier et d'éviter les saisies inutiles.`
        : "Chaque document justifie une partie de votre déclaration et permet de préremplir votre dossier sans saisie inutile.",
    },
    {
      id: "manual",
      question: "Je préfère remplir manuellement",
      answer:
        "C'est possible. Vous pouvez saisir les informations à la main — votre conseiller vous guidera champ par champ, sans imposer l'import.",
    },
    {
      id: "mandatory",
      question: "Cette étape est-elle obligatoire ?",
      answer:
        "Chaque étape contribue à votre déclaration LMNP. Certaines informations sont indispensables, d'autres peuvent être complétées plus tard selon votre situation.",
    },
  ];
}
