/**
 * Compagnon INPI — Phase 4.5.3 : réponses déterministes.
 * Run: npx tsx --test src/components/lmnp/inpi-companion/inpi-companion-chat-response.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { InpiCompanionConflict } from "@/runtime/assistants/inpi-companion/types";
import type { InpiCompanionChatContext } from "./inpi-companion-chat-context";
import { classifyInpiCompanionIntent } from "./inpi-companion-chat-intent";
import { buildInpiCompanionChatReply } from "./inpi-companion-chat-response";

function baseContext(overrides: Partial<InpiCompanionChatContext> = {}): InpiCompanionChatContext {
  return {
    mode: "creation",
    step: "identite",
    progressStatus: "active",
    currentQuestion: {
      field: "identite",
      label: "identité à confirmer",
      reason: "Cette information n'est pas disponible et doit être renseignée ou décidée par le client.",
    },
    nextAction: "provide_missing_field",
    knownValues: {},
    proposedValues: {},
    missingFields: ["identite"],
    conflicts: [],
    isMultiProperty: false,
    dossierInpiStatus: "not_started",
    ...overrides,
  };
}

function answer(message: string, context: InpiCompanionChatContext = baseContext()) {
  const intent = classifyInpiCompanionIntent(message, context);
  const reply = buildInpiCompanionChatReply({ message, intent, context });
  return { intent, reply };
}

function lower(text: string): string {
  return text.toLowerCase();
}

describe("regularization", () => {
  it("« l'INPI me demande quelque chose »", () => {
    const { intent, reply } = answer("l'INPI me demande quelque chose");
    assert.equal(intent, "regularization");
    assert.equal(reply.orientation, "paste_inpi_message");
    assert.match(lower(reply.text), /correction|complement/);
    assert.match(lower(reply.text), /ne voit pas/);
    assert.doesNotMatch(reply.text, /pièce manquante|KBIS|vous devez corriger|accepté|refusé/i);
  });

  it("« l'INPI demande une correction »", () => {
    const { intent, reply } = answer("l'INPI demande une correction");
    assert.equal(intent, "regularization");
    assert.equal(reply.orientation, "paste_inpi_message");
    assert.match(lower(reply.text), /copiez-le|copier/);
  });

  it("mode regularisation + message quelconque : même réponse, aucune cause inventée", () => {
    const context = baseContext({ mode: "regularisation" });
    const { intent, reply } = answer("bonjour", context);
    assert.equal(intent, "regularization");
    assert.equal(reply.orientation, "paste_inpi_message");
    assert.doesNotMatch(reply.text, /justificatif de domicile|capital social|erreur 404/i);
  });
});

describe("screen_divergence", () => {
  it("« mon écran INPI ne correspond pas »", () => {
    const { intent, reply } = answer("mon écran INPI ne correspond pas");
    assert.equal(intent, "screen_divergence");
    assert.equal(reply.orientation, "open_official_via_companion");
    assert.match(lower(reply.text), /diff[eé]rer|diffère/);
    assert.doesNotMatch(lower(reply.text), /votre écran est faux|écran est incorrect/);
    assert.doesNotMatch(reply.text, /window\.open|formalites\.entreprises/);
  });

  it("« l'écran INPI est différent »", () => {
    const { intent, reply } = answer("l'écran INPI est différent");
    assert.equal(intent, "screen_divergence");
    assert.match(lower(reply.text), /autorit|officiel|guichet/);
  });
});

describe("conflict", () => {
  it("« mon SIREN est différent »", () => {
    const { intent, reply } = answer("mon SIREN est différent");
    assert.equal(intent, "conflict");
    assert.equal(reply.orientation, "use_panel_buttons");
    assert.doesNotMatch(lower(reply.text), /la bonne valeur|retenez|choisissez officiellement/);
  });

  it("« mon SIRET ne correspond pas »", () => {
    const { intent, reply } = answer("mon SIRET ne correspond pas");
    assert.equal(intent, "conflict");
    assert.doesNotMatch(intent, /screen_divergence/);
  });

  it("conflit existant : les deux valeurs citées, aucun gagnant", () => {
    const conflict: InpiCompanionConflict = {
      field: "siren_siret",
      previousValue: "123456789",
      newValue: "987654321",
    };
    const context = baseContext({ conflicts: [conflict] });
    const { intent, reply } = answer("bonjour", context);
    assert.equal(intent, "conflict");
    assert.match(reply.text, /123456789/);
    assert.match(reply.text, /987654321/);
    assert.doesNotMatch(lower(reply.text), /retenez 123|retenez 987|la bonne est/);
  });
});

describe("lost", () => {
  it("« je suis perdu » mentionne l'étape actuelle", () => {
    const { intent, reply } = answer("je suis perdu");
    assert.equal(intent, "lost");
    assert.match(reply.text, /identité à confirmer/);
    assert.doesNotMatch(lower(reply.text), /bloqué fiscalement|en retard|il ne reste plus rien/);
  });

  it("« je ne sais pas quoi faire »", () => {
    const { intent, reply } = answer("je ne sais pas quoi faire");
    assert.equal(intent, "lost");
    assert.ok(reply.orientation === "stay_on_step" || reply.orientation === "use_panel_buttons");
  });
});

describe("resume", () => {
  it("« j'ai commencé ma démarche »", () => {
    const { intent, reply } = answer("j'ai commencé ma démarche");
    assert.equal(intent, "resume");
    assert.equal(reply.orientation, "use_panel_buttons");
    assert.match(lower(reply.text), /compagnon|fiscal ai/);
  });

  it("« j'ai envoyé ma demande » : submitted ≠ accepted", () => {
    const context = baseContext({
      mode: "attente",
      nextAction: "wait",
      currentQuestion: null,
      dossierInpiStatus: "submitted",
    });
    const { intent, reply } = answer("j'ai envoyé ma demande", context);
    assert.equal(intent, "resume");
    assert.match(lower(reply.text), /envoy|attente/);
    assert.doesNotMatch(lower(reply.text), /accepté|validé par l'inpi/);
  });
});

describe("unknown_status", () => {
  it("« je ne sais pas si j'ai un SIREN »", () => {
    const { intent, reply } = answer("je ne sais pas si j'ai un SIREN", baseContext({
      dossierInpiStatus: undefined,
    }));
    assert.equal(intent, "unknown_status");
    assert.equal(reply.orientation, "use_panel_buttons");
    assert.match(lower(reply.text), /rne/);
    assert.match(lower(reply.text), /pas une preuve/);
  });

  it("« je ne sais pas si mon activité est déjà déclarée » — inconnu ≠ not_started", () => {
    const { intent, reply } = answer(
      "je ne sais pas si mon activité est déjà déclarée",
      baseContext({ dossierInpiStatus: undefined }),
    );
    assert.equal(intent, "unknown_status");
    assert.doesNotMatch(lower(reply.text), /vous n'êtes pas immatriculé/);
    assert.match(lower(reply.text), /pas encore commenc/);
  });
});

describe("already_registered", () => {
  it("« j'ai déjà un SIREN » cite la valeur du dossier", () => {
    const { intent, reply } = answer(
      "j'ai déjà un SIREN",
      baseContext({ proposedValues: { siren_siret: "12345678900012" } }),
    );
    assert.equal(intent, "already_registered");
    assert.match(reply.text, /12345678900012/);
    assert.match(reply.text, /Dans votre dossier Fiscal AI/);
    assert.doesNotMatch(lower(reply.text), /officielle?ment valide/);
  });
});

describe("multi_property", () => {
  it("« j'ai plusieurs biens » — aucun mapping automatique", () => {
    const { intent, reply } = answer("j'ai plusieurs biens", baseContext({ isMultiProperty: true }));
    assert.equal(intent, "multi_property");
    assert.equal(reply.orientation, "stay_on_step");
    assert.match(lower(reply.text), /établissement/);
    assert.doesNotMatch(lower(reply.text), /nous avons choisi|correspond au bien n/);
  });
});

describe("out_of_scope", () => {
  it("question fiscale", () => {
    const { intent, reply } = answer("comment calculer mon amortissement ?");
    assert.equal(intent, "out_of_scope");
    assert.equal(reply.orientation, "stay_on_step");
    assert.match(lower(reply.text), /fiscal/);
    assert.doesNotMatch(reply.text, /dotation|linéaire|2033/);
  });

  it("« faites la démarche à ma place »", () => {
    const { intent, reply } = answer("faites la démarche à ma place");
    assert.equal(intent, "out_of_scope");
    assert.match(lower(reply.text), /à votre place|ne dépose pas/);
  });

  it("« faites-la pour moi »", () => {
    const { intent, reply } = answer("faites-la pour moi");
    assert.equal(intent, "out_of_scope");
    assert.equal(reply.orientation, "open_official_via_companion");
  });
});

describe("field_help", () => {
  it("« à quoi sert le SIREN ? »", () => {
    const { intent, reply } = answer("à quoi sert le SIREN ?");
    assert.equal(intent, "field_help");
    assert.equal(reply.orientation, "stay_on_step");
    assert.match(lower(reply.text), /inpi/);
  });

  it("« c'est quoi le SIRET ? »", () => {
    const { intent, reply } = answer("c'est quoi le SIRET ?");
    assert.equal(intent, "field_help");
    assert.match(lower(reply.text), /n'est pas vérifiée en direct|pas vérifiée en direct/);
  });

  it("« que dois-je mettre pour la domiciliation ? » — pas de recommandation d'adresse", () => {
    const { intent, reply } = answer("que dois-je mettre pour la domiciliation ?");
    assert.equal(intent, "field_help");
    assert.match(lower(reply.text), /vous appartient/);
    assert.doesNotMatch(lower(reply.text), /mettez l'adresse du bien|domiciliez-vous/);
  });

  it("fallback vers currentQuestion quand le message ne nomme pas de champ", () => {
    const { intent, reply } = answer("c'est quoi cette étape ?");
    assert.equal(intent, "field_help");
    assert.match(lower(reply.text), /identité|exploitant/);
  });

  it("valeur proposée présentée comme à confirmer, jamais officielle", () => {
    const { reply } = answer(
      "c'est quoi le SIRET ?",
      baseContext({ proposedValues: { siren_siret: "12345678900012" } }),
    );
    assert.match(reply.text, /12345678900012/);
    assert.match(lower(reply.text), /à confirmer|proposée/);
    assert.doesNotMatch(lower(reply.text), /valeur officielle inpi/);
  });
});

describe("free_question", () => {
  it("message arbitraire : fallback utile, étape rappelée, sujets d'aide", () => {
    const { intent, reply } = answer("xyz123 abc");
    assert.equal(intent, "free_question");
    assert.equal(reply.orientation, "stay_on_step");
    assert.match(lower(reply.text), /pas sûr de comprendre|ne suis pas sûr/);
    assert.match(reply.text, /identité à confirmer/);
    assert.match(reply.text, /Je suis perdu/);
  });
});

describe("pureté", () => {
  it("synchrone, pas de Promise, contexte gelé non muté", () => {
    const conflict: InpiCompanionConflict = { field: "siren_siret", previousValue: "A", newValue: "B" };
    const context = Object.freeze(
      baseContext({
        conflicts: Object.freeze([conflict]) as InpiCompanionConflict[],
        knownValues: Object.freeze({}),
        proposedValues: Object.freeze({}),
        missingFields: Object.freeze(["identite"]) as InpiCompanionChatContext["missingFields"],
      }),
    );
    const message = Object.freeze("bonjour") as string;
    const intent = classifyInpiCompanionIntent(message, context);
    const result = buildInpiCompanionChatReply({ message, intent, context });
    assert.equal(result instanceof Promise, false);
    assert.equal(typeof result.text, "string");
    assert.equal(context.conflicts.length, 1);
    assert.equal(context.mode, "creation");
  });

  it("aucune dépendance réseau / persistance / dispatch dans le module de réponse", () => {
    const source = readFileSync(fileURLToPath(new URL("./inpi-companion-chat-response.ts", import.meta.url)), "utf8");
    const functional = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(functional, /fetch\(/);
    assert.doesNotMatch(functional, /localStorage|sessionStorage|indexedDB/i);
    assert.doesNotMatch(functional, /dispatch\(/);
    assert.doesNotMatch(functional, /useLmnp|updateInpiStatus/);
    assert.doesNotMatch(functional, /openai|OpenAI|window\.open/i);
  });
});
