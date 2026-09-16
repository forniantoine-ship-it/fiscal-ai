import { computeRecettesExercice } from "../../capabilities/f013/compute-recettes-exercice";
import { reconcileRevenus } from "../../capabilities/f013/reconcile-revenus";
import type { Anomaly } from "../../contracts/Anomaly";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import {
  EXP_F013_IMPAYE,
  EXP_F013_PLATEFORME_NET,
  explainRevenus,
} from "../../presentation/explain-revenus";
import {
  createInitialF013State,
  type F013Action,
  type F013AssistantTurn,
  type F013Deps,
  type F013Message,
  type F013State,
} from "./types";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

/**
 * NEXT-1 (REV-P0-01) — un montant d'indemnité GLI doit être fini, positif ou
 * nul, jamais NaN/Infinity. Pas de plafond arbitraire (règle SAV-REV-04).
 */
function isValidNonNegativeAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * NEXT-1 (REV-P0-03) — anomalies qui empêchent de proposer la confirmation
 * finale. Exportée pour rester la SEULE définition de "anomalie bloquante"
 * F-013 — réutilisée telle quelle par l'UI (résumé, resume) au lieu d'une
 * seconde définition locale divergente (N1-B, audit contradictoire).
 */
export function blockingAnomalies(anomalies: Anomaly[]): Anomaly[] {
  return anomalies.filter((a) => a.severity === "fatal" || a.severity === "error");
}

function diagnosticPrompt(): F013Message {
  return {
    role: "assistant",
    content:
      "Avant de vérifier vos revenus, quelques questions rapides sur votre location :\n\n" +
      "• Type de location (longue durée, plateforme, mixte)\n" +
      "• Continuité du bail\n" +
      "• Loyer charges comprises ou hors charges\n\n" +
      "Répondez via le formulaire ci-dessous.",
  };
}

export class F013RevenusAssistant {
  constructor(
    private readonly ctx: RuntimeContext,
    private readonly deps: F013Deps = {},
  ) {}

  start(): F013AssistantTurn {
    return {
      state: createInitialF013State(),
      messages: [diagnosticPrompt()],
      completed: false,
    };
  }

  async handle(state: F013State, action: F013Action): Promise<F013AssistantTurn> {
    const messages: F013Message[] = [];

    switch (action.type) {
      case "restart":
        return this.start();

      case "submit_diagnostic": {
        const modeCollecte = action.typeLocation === "plateforme";
        const diagnostic = {
          typeLocation: action.typeLocation,
          continuiteBail: action.continuiteBail,
          modeCharges: action.modeCharges,
        };
        messages.push({
          role: "user",
          content:
            `Location : ${action.typeLocation} — ` +
            `Bail : ${action.continuiteBail} — ` +
            `Charges : ${action.modeCharges}`,
        });

        const loyerPrefill = this.deps.loyerMensuel ?? state.collected.loyerMensuel;
        const nextState: F013State = {
          ...state,
          diagnostic,
          modeCollecte,
          collected: {
            ...state.collected,
            loyerMensuel: loyerPrefill,
          },
        };

        if (modeCollecte) {
          messages.push({
            role: "assistant",
            content:
              "Pour votre activité de location touristique, indiquez le total des virements " +
              `reçus des plateformes en ${this.ctx.fiscalYear}.`,
          });
          return {
            state: { ...nextState, step: "sources_plateforme" },
            messages,
            completed: false,
          };
        }

        if (!loyerPrefill) {
          messages.push({
            role: "assistant",
            content:
              "Pour vérifier la cohérence de vos revenus, nous avons besoin du loyer mensuel " +
              "inscrit dans votre bail.",
          });
          return {
            state: { ...nextState, step: "loyer_collect" },
            messages,
            completed: false,
          };
        }

        return this.showAncrage(nextState, messages);
      }

      case "submit_loyer": {
        messages.push({
          role: "user",
          content: `Loyer mensuel : ${fmtEur(action.loyerMensuel)}`,
        });
        const fieldSources = { ...state.fieldSources, loyer_mensuel: action.source ?? "manual" };
        return this.showAncrage(
          {
            ...state,
            fieldSources,
            collected: {
              ...state.collected,
              loyerMensuel: action.loyerMensuel,
              provisionChargesMensuelle: action.provisionChargesMensuelle,
            },
          },
          messages,
        );
      }

      case "submit_declaration": {
        messages.push({
          role: "user",
          content: `Montant encaissé : ${fmtEur(action.montant)}`,
        });
        const fieldSources = { ...state.fieldSources, revenu_declare: action.source ?? "manual" };
        const nextState: F013State = {
          ...state,
          fieldSources,
          collected: { ...state.collected, montantDeclare: action.montant },
        };
        return this.runConfrontation(nextState, messages);
      }

      case "submit_decalage": {
        messages.push({
          role: "user",
          content:
            `Janvier = décembre précédent : ${action.janvierOui ? "oui" : "non"} — ` +
            `Décembre = janvier suivant : ${action.decembreOui ? "oui" : "non"}`,
        });
        const nextState: F013State = {
          ...state,
          collected: {
            ...state.collected,
            janvierEncaisseDecPrecedent: action.janvierOui,
            decembreEncaisseJanvierSuivant: action.decembreOui,
          },
        };
        return this.buildReview(nextState, messages);
      }

      case "submit_ecart_raison": {
        messages.push({ role: "user", content: `Raison : ${action.raison}` });
        const raisonMap: Record<string, F013State["step"]> = {
          impaye: "ecart_impaye",
          vacance: "ecart_vacance",
          loyer_inferieur: "ecart_loyer_inferieur",
          rattrapage: "decalage_jan_dec",
          complementaire: "sources_plateforme",
          erreur_saisie: "declaration",
          autre: "aggregate_review",
        };
        const step = raisonMap[action.raison] ?? "aggregate_review";

        if (action.raison === "erreur_saisie") {
          messages.push({
            role: "assistant",
            content: "Quel est le montant correct que vous avez encaissé ?",
          });
        } else if (action.raison === "rattrapage") {
          messages.push({
            role: "assistant",
            content:
              "Avez-vous encaissé des loyers en janvier correspondant au mois de décembre précédent ?\n" +
              "Des loyers de décembre ont-ils été payés en janvier de l'année suivante ?",
            suggestions: [
              { id: "decalage_non_non", label: "Non / Non" },
              { id: "decalage_oui_non", label: "Oui janvier / Non décembre" },
              { id: "decalage_non_oui", label: "Non janvier / Oui décembre" },
              { id: "decalage_oui_oui", label: "Oui / Oui" },
            ],
          });
        } else if (action.raison === "impaye") {
          messages.push({
            role: "assistant",
            content: "Ces loyers sont-ils couverts par une assurance loyers impayés (GLI) ?",
            suggestions: [
              { id: "gli_oui", label: "Oui" },
              { id: "gli_non", label: "Non" },
            ],
          });
        } else if (action.raison === "vacance") {
          messages.push({
            role: "assistant",
            content: "Indiquez la période de vacance (dates début et fin).",
          });
        } else if (action.raison === "loyer_inferieur") {
          messages.push({
            role: "assistant",
            content: "Sur combien de mois et quel montant avez-vous effectivement perçu ?",
          });
        }

        return {
          state: { ...nextStateFromEcart(state, action.raison), step },
          messages,
          completed: false,
        };
      }

      case "submit_impaye": {
        // NEXT-1 (REV-P0-01) — une réponse "GLI: oui" n'est jamais suffisante en
        // elle-même : le montant réellement perçu est obligatoire avant de
        // pouvoir clore cette étape, sinon l'indemnité est silencieusement
        // absente du revenu déclaré. Tant que ce montant n'est pas fourni (ou
        // invalide), on redemande — jamais un repli à 0 qui changerait le
        // revenu fiscal sans que l'utilisateur l'ait dit.
        if (action.gli && !isValidNonNegativeAmount(action.indemnite)) {
          const alreadyAsking = state.step === "ecart_impaye_montant";
          messages.push({
            role: "user",
            content: alreadyAsking ? "Montant invalide" : "GLI : oui",
          });
          messages.push({
            role: "assistant",
            content: alreadyAsking
              ? "Le montant indiqué n'est pas valide. Indiquez le montant réellement perçu au titre de l'indemnité GLI (0 si aucune indemnité n'a encore été versée)."
              : "Quel montant avez-vous réellement perçu au titre de l'indemnité GLI ?",
          });
          return {
            state: {
              ...state,
              step: "ecart_impaye_montant",
              collected: { ...state.collected, impayeGli: true, impayeIndemnite: undefined },
            },
            messages,
            completed: false,
          };
        }

        messages.push({
          role: "user",
          content: action.gli
            ? `GLI : oui — indemnité ${fmtEur(action.indemnite as number)}`
            : "GLI : non",
        });
        const collected = {
          ...state.collected,
          impayeGli: action.gli,
          impayeIndemnite: action.gli ? (action.indemnite as number) : undefined,
        };
        if (!action.gli) {
          messages.push({ role: "assistant", content: EXP_F013_IMPAYE });
        }
        return this.buildReview({ ...state, collected }, messages);
      }

      case "submit_vacance": {
        messages.push({
          role: "user",
          content: `Vacance du ${action.dateDebut} au ${action.dateFin}`,
        });
        const vacancePeriodes = [
          ...state.collected.vacancePeriodes,
          {
            dateDebut: action.dateDebut,
            dateFin: action.dateFin,
            enTravaux: action.enTravaux,
          },
        ];
        messages.push({
          role: "assistant",
          content: "Période de vacance enregistrée. L'ancrage sera ajusté en conséquence.",
        });
        return this.buildReview(
          { ...state, collected: { ...state.collected, vacancePeriodes } },
          messages,
          "VACANCE_DETECTEE",
        );
      }

      case "submit_loyer_inferieur": {
        messages.push({
          role: "user",
          content: `${action.mois} mois — ${fmtEur(action.montantPerçu)} perçus`,
        });
        return this.buildReview(
          {
            ...state,
            collected: {
              ...state.collected,
              loyerInferieurMois: action.mois,
              loyerInferieurMontant: action.montantPerçu,
            },
          },
          messages,
        );
      }

      case "submit_plateforme": {
        messages.push({
          role: "user",
          content: `Revenus plateforme : ${fmtEur(action.montant)}`,
        });
        const fieldSources = { ...state.fieldSources, plateforme: action.source ?? "manual" };
        messages.push({ role: "assistant", content: EXP_F013_PLATEFORME_NET });
        const nextState: F013State = {
          ...state,
          fieldSources,
          collected: { ...state.collected, recettesPlateforme: action.montant },
        };

        if (state.modeCollecte && !state.collected.montantDeclare) {
          return {
            state: {
              ...nextState,
              collected: { ...nextState.collected, montantDeclare: action.montant },
              step: "declaration",
            },
            messages: [
              ...messages,
              {
                role: "assistant",
                content:
                  `Au total, combien avez-vous encaissé sur votre compte au titre de cette location en ${this.ctx.fiscalYear} ?\n\n` +
                  "Incluez loyer + charges si vous les percevez ensemble.\n" +
                  "N'incluez pas le dépôt de garantie.",
              },
            ],
            completed: false,
          };
        }

        return this.buildReview(nextState, messages);
      }

      case "confirm_all": {
        messages.push({ role: "user", content: "Oui, je valide" });
        const result = this.buildResult(state);
        // NEXT-1 (REV-P0-03) — garde de dernier recours : même si cette étape
        // était atteinte par un appel direct (hors parcours UI normal) alors
        // qu'une anomalie bloquante subsiste, la confirmation ne doit jamais
        // aboutir silencieusement. `buildReview` réexplique la situation et
        // rouvre la qualification de l'écart au lieu de clore l'étape.
        if (blockingAnomalies(result.anomalies).length > 0) {
          return this.buildReview(state, messages);
        }
        messages.push({ role: "assistant", content: result.explanation });
        messages.push({
          role: "assistant",
          content: "Vos revenus sont enregistrés. Vous pouvez passer à l'étape suivante.",
        });
        return {
          state: { ...state, step: "complete", result },
          messages,
          completed: true,
          event: "REVENUS_TERMINE",
        };
      }

      default:
        return { state, messages, completed: false };
    }
  }

  private showAncrage(state: F013State, messages: F013Message[]): F013AssistantTurn {
    const preview = this.compute(state, state.collected.montantDeclare ?? 0);
    const theorique = preview.recettes.revenuTheorique;

    if (theorique && theorique.montantAttendu > 0) {
      messages.push({
        role: "assistant",
        content:
          `Sur la base de votre bail (loyer : ${fmtEur(theorique.loyerMensuel)}/mois),\n` +
          `votre activité de location meublée sur ${this.ctx.fiscalYear}\n` +
          `représente un revenu théorique de ${fmtEur(theorique.montantAttendu)}.\n\n` +
          "Nous allons maintenant vérifier ensemble ce que vous avez réellement encaissé.",
      });
    }

    messages.push({
      role: "assistant",
      content:
        `Au total, combien avez-vous encaissé sur votre compte bancaire\n` +
        `au titre de cette location en ${this.ctx.fiscalYear} ?\n\n` +
        "Incluez loyer + charges si vous les percevez ensemble.\n" +
        "N'incluez pas le dépôt de garantie.",
    });

    return {
      state: { ...state, step: "declaration" },
      messages,
      completed: false,
      event: "REVENUS_PARTIELLE",
    };
  }

  private runConfrontation(state: F013State, messages: F013Message[]): F013AssistantTurn {
    const montant = state.collected.montantDeclare ?? 0;
    const preview = this.compute(state, montant);
    const theorique = preview.recettes.revenuTheorique?.montantAttendu ?? 0;
    const reconciliation = reconcileRevenus({
      revenuTheorique: theorique,
      revenuDeclare: montant,
    });

    if (state.modeCollecte || reconciliation.niveau === "coherent") {
      if (!state.modeCollecte) {
        messages.push({
          role: "assistant",
          content:
            `✓ Vos revenus encaissés (${fmtEur(montant)}) sont cohérents avec votre bail ` +
            `(${fmtEur(theorique)} attendus).\n\n` +
            "Quelques questions pour finaliser :",
        });
        messages.push({
          role: "assistant",
          content:
            "→ Avez-vous encaissé des loyers en janvier correspondant au mois de décembre précédent ?\n" +
            "→ Des loyers de décembre ont-ils été payés en janvier de l'année suivante ?",
          suggestions: [
            { id: "decalage_non_non", label: "Non / Non" },
            { id: "decalage_oui_non", label: "Oui janvier / Non décembre" },
            { id: "decalage_non_oui", label: "Non janvier / Oui décembre" },
            { id: "decalage_oui_oui", label: "Oui / Oui" },
          ],
        });
        return {
          state: { ...state, step: "decalage_jan_dec" },
          messages,
          completed: false,
        };
      }

      if (state.diagnostic?.typeLocation === "mixte") {
        messages.push({
          role: "assistant",
          content: "Avez-vous également reçu des virements de plateformes touristiques ?",
        });
        return {
          state: { ...state, step: "sources_plateforme" },
          messages,
          completed: false,
        };
      }

      return this.buildReview(state, messages);
    }

    const ecart = Math.abs(reconciliation.ecart);
    if (reconciliation.nature === "nul_suspect") {
      // NEXT-1 (REV-P0-02) — un revenu déclaré nul n'est PAS une sur-déclaration :
      // avant ce correctif, ce cas tombait dans la branche "excédent" (message
      // et options incohérents avec la réalité). Ici il manque la totalité du
      // revenu théorique — jamais "de plus qu'attendu".
      messages.push({
        role: "assistant",
        content:
          `Vous déclarez 0 € encaissés, alors qu'un revenu théorique de ${fmtEur(theorique)} ` +
          "est attendu selon votre bail.\n\n" +
          "Pouvez-vous nous aider à comprendre ?",
        suggestions: [
          { id: "ecart_vacance", label: "Le logement est resté vacant sur la période" },
          { id: "ecart_impaye", label: "Des loyers n'ont pas été payés" },
          { id: "ecart_erreur", label: "Erreur dans le montant saisi" },
        ],
      });
    } else if (reconciliation.nature === "sous_declare") {
      messages.push({
        role: "assistant",
        content:
          `Vous déclarez ${fmtEur(montant)} encaissés.\n` +
          `Sur la base de votre bail, nous attendions ${fmtEur(theorique)}.\n\n` +
          `Il manque ${fmtEur(ecart)}. Pouvez-vous nous aider à comprendre ?`,
        suggestions: [
          { id: "ecart_impaye", label: "Des loyers n'ont pas été payés" },
          { id: "ecart_vacance", label: "Périodes de vacance non déclarées" },
          { id: "ecart_loyer_inferieur", label: "Loyer inférieur au bail" },
          { id: "ecart_autre", label: "Autre raison" },
        ],
      });
    } else {
      messages.push({
        role: "assistant",
        content:
          `Vous déclarez ${fmtEur(montant)}, soit ${fmtEur(ecart)} de plus qu'attendu selon votre bail.\n\n` +
          "Cet excédent peut s'expliquer par :",
        suggestions: [
          { id: "ecart_rattrapage", label: "Rattrapage de loyers en retard" },
          { id: "ecart_complementaire", label: "Recettes complémentaires" },
          { id: "ecart_erreur", label: "Erreur dans le montant saisi" },
        ],
      });
    }

    return {
      state: { ...state, step: "qualify_ecart" },
      messages,
      completed: false,
    };
  }

  private buildReview(
    state: F013State,
    messages: F013Message[],
    event?: F013AssistantTurn["event"],
  ): F013AssistantTurn {
    const result = this.buildResult(state);

    // NEXT-1 (REV-P0-03) — point de passage unique avant la confirmation
    // finale : si une anomalie bloquante subsiste (ex. revenu nul non résolu,
    // indemnité GLI signalée mais jamais chiffrée), on ne propose jamais le
    // bouton de confirmation. On réexplique le blocage et on rouvre la
    // qualification de l'écart, pour toujours laisser une issue de
    // résolution — jamais un blocage sans sortie.
    const blocking = blockingAnomalies(result.anomalies);
    if (blocking.length > 0) {
      for (const anomaly of blocking) {
        messages.push({ role: "assistant", content: anomaly.message });
      }
      messages.push({
        role: "assistant",
        content: "Pouvez-vous préciser ou corriger cette information avant de continuer ?",
        suggestions: [
          { id: "ecart_vacance", label: "Le logement est resté vacant sur une période supplémentaire" },
          { id: "ecart_impaye", label: "Des loyers n'ont pas été payés" },
          { id: "ecart_erreur", label: "Corriger le montant saisi" },
        ],
      });
      return {
        state: { ...state, result, step: "qualify_ecart" },
        messages,
        completed: false,
        event,
      };
    }

    messages.push({ role: "assistant", content: result.explanation });
    messages.push({
      role: "assistant",
      content: "Ce total vous convient-il ?",
      suggestions: [{ id: "confirm_all", label: "Oui, je valide" }],
    });
    return {
      state: { ...state, result, step: "aggregate_review" },
      messages,
      completed: false,
      event,
    };
  }

  private buildResult(state: F013State) {
    const montant = state.collected.montantDeclare ?? 0;
    const computed = this.compute(state, montant);
    const explain = explainRevenus({
      recettes: computed.recettes,
      exerciceFiscal: this.ctx.fiscalYear,
    });
    return {
      recettes: computed.recettes,
      explanation: explain.explanation,
      anomalies: computed.anomalies,
    };
  }

  private compute(state: F013State, montantDeclare: number) {
    const provision =
      state.diagnostic?.modeCharges === "hors_charges"
        ? state.collected.provisionChargesMensuelle
        : undefined;

    const computed = computeRecettesExercice({
      exerciceFiscal: this.ctx.fiscalYear,
      dateMiseEnService: this.deps.dateMiseEnService ?? `${this.ctx.fiscalYear}-01-01`,
      modeCollecte: state.modeCollecte,
      loyerMensuel: state.collected.loyerMensuel,
      provisionChargesMensuelle: provision,
      periodes: state.collected.periodes.length ? state.collected.periodes : undefined,
      vacances: state.collected.vacancePeriodes.length ? state.collected.vacancePeriodes : undefined,
      montantDeclare,
      janvierEncaisseDecPrecedent: state.collected.janvierEncaisseDecPrecedent,
      decembreEncaisseJanvierSuivant: state.collected.decembreEncaisseJanvierSuivant,
      indemnitesAssurance: state.collected.impayeIndemnite,
      recettesPlateforme: state.collected.recettesPlateforme,
      fieldSources: state.fieldSources,
    });

    // NEXT-1 (REV-P0-01/03) — filet de sécurité au niveau du calcul lui-même :
    // si l'état porte "GLI: oui" sans montant chiffré (ne devrait jamais
    // arriver via le parcours UI normal depuis ce correctif, mais un état
    // reconstruit directement — ancien état persisté, appel programmatique —
    // doit rester protégé), le revenu ne peut pas être considéré fiable.
    if (state.collected.impayeGli === true && state.collected.impayeIndemnite === undefined) {
      return {
        ...computed,
        anomalies: [
          ...computed.anomalies,
          {
            severity: "error" as const,
            message:
              "Indemnité GLI signalée comme perçue mais montant non renseigné — le revenu ne peut pas être confirmé en l'état.",
            field: "indemnites",
          },
        ],
      };
    }

    return computed;
  }
}

function nextStateFromEcart(
  state: F013State,
  raison: string,
): F013State {
  return {
    ...state,
    collected: { ...state.collected, ecartRaison: raison },
  };
}

export { createInitialF013State };
export type {
  F013Action,
  F013AssistantTurn,
  F013Deps,
  F013Message,
  F013Result,
  F013State,
  F013Step,
  F013Suggestion,
} from "./types";
