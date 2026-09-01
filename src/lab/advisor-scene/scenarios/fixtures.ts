import type { Scenario } from "@/lab/advisor-scene/scenarios/types";
import { baseSubjects } from "@/lab/advisor-scene/subjects/fixtures";
import { prototypeSubjects } from "@/lab/advisor-scene/subjects/prototypeSubjects";

/**
 * Le prototype minimal (ADR-009 v2.0, validation demandée le 10/07/2026) :
 * trois sujets fictifs, aucun branchement métier, un beat par geste. Sert à
 * valider la composition, la lumière et les gestes avant toute intégration.
 */
const prototypeMinimal: Scenario = {
  id: "prototype-minimal",
  title: "Prototype minimal — trois sujets",
  description: "Un beat par geste, pour valider composition, lumière et gestes isolément.",
  baseSubjects: prototypeSubjects,
  beats: [
    {
      lifecycle: { "sujet-a": "resting" },
      activeId: "sujet-a",
      caption: "Présenter — le premier sujet devient actif.",
    },
    {
      lifecycle: { "sujet-a": "done", "sujet-b": "resting" },
      activeId: "sujet-b",
      caption: "Retirer — le sujet précédent cède sa place, sans disparaître.",
    },
    {
      lifecycle: { "sujet-c": "reported" },
      activeId: "sujet-b",
      caption: "Rapprocher — un sujet encore silencieux gagne en importance sans devenir actif.",
    },
    {
      lifecycle: {},
      activeId: "sujet-c",
      forcedGesture: { "sujet-c": "rappeler" },
      caption: "Rappeler — le sujet reporté redevient actif, sans avoir traversé les positions intermédiaires.",
    },
  ],
};

/**
 * Six scénarios plus riches, ancrés dans les situations déjà débattues du
 * Knowledge System (DEC-029, DEC-036, ADR-007) — conservés pour l'exploration
 * au-delà du prototype minimal.
 */
export const scenarios: Scenario[] = [
  prototypeMinimal,
  {
    id: "premier-jour",
    title: "Le premier jour",
    description: "Aucun sujet n'a encore été traité.",
    baseSubjects,
    beats: [
      {
        lifecycle: { activite: "resting" },
        activeId: "activite",
        caption: "Premier jour : aucun sujet n'a encore été traité.",
      },
    ],
  },
  {
    id: "correction-demandee",
    title: "La correction demandée",
    description: "Un document manque en cours de route ; le Conseiller poursuit ailleurs.",
    baseSubjects,
    beats: [
      {
        lifecycle: { activite: "done", logement: "done", credit: "resting" },
        activeId: "credit",
        caption: "Le dossier progresse normalement : le financement est en cours.",
      },
      {
        lifecycle: { credit: "reported", charges: "resting" },
        activeId: "charges",
        caption:
          "Le tableau d'amortissement manque. Le Conseiller passe aux charges en attendant ce document.",
      },
    ],
  },
  {
    id: "retour-une-semaine",
    title: "Le retour après une semaine",
    description: "Teste la permanence : rien ne doit bouger si rien n'a changé.",
    baseSubjects,
    beats: [
      {
        lifecycle: { activite: "done", logement: "done", credit: "resting" },
        activeId: "credit",
        caption: "Vous aviez laissé le dossier ici.",
      },
      {
        lifecycle: {},
        activeId: "credit",
        caption:
          "Une semaine plus tard : rien n'a changé, le Conseiller vous présente exactement la même priorité.",
      },
    ],
  },
  {
    id: "rappel-non-adjacent",
    title: "Le rappel non adjacent",
    description: "Le cas exact qui a fait échouer la roue (ADR-007) — test éliminatoire.",
    baseSubjects,
    beats: [
      {
        lifecycle: {
          activite: "done",
          logement: "reported",
          credit: "done",
          revenus: "done",
          charges: "resting",
        },
        activeId: "charges",
        caption:
          "Le dossier a avancé. Logement reste en attente depuis longtemps (acte d'acquisition manquant).",
      },
      {
        lifecycle: {},
        activeId: "logement",
        forcedGesture: { logement: "rappeler" },
        caption: "L'acte d'acquisition vient d'être reçu. Le Conseiller y revient directement.",
      },
    ],
  },
  {
    id: "corrections-concurrentes",
    title: "Les corrections concurrentes",
    description: "Deux sujets reportés en même temps : une seule priorité doit rester visible (DEC-036).",
    baseSubjects,
    beats: [
      {
        lifecycle: {
          activite: "done",
          logement: "reported",
          credit: "done",
          revenus: "done",
          charges: "reported",
        },
        activeId: "logement",
        caption: "Deux corrections sont en attente (Logement, Charges). Le Conseiller ne présente que la plus ancienne.",
      },
    ],
  },
  {
    id: "dossier-presque-clos",
    title: "Le dossier presque clos",
    description: "La majorité des sujets sont au repos \"terminé\", pas \"à découvrir\".",
    baseSubjects,
    beats: [
      {
        lifecycle: {
          activite: "done",
          logement: "done",
          credit: "done",
          revenus: "done",
          charges: "done",
          validation: "resting",
        },
        activeId: "validation",
        caption: "Il ne reste que la validation finale.",
      },
    ],
  },
];
