/**
 * Compagnon INPI — Phase 4.5.1 : classifieur d'intentions (100% déterministe).
 * Run: npx tsx --test src/components/lmnp/inpi-companion/inpi-companion-chat-intent.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { InpiCompanionConflict } from "@/runtime/assistants/inpi-companion/types";
import { classifyInpiCompanionIntent, type InpiCompanionIntentContext } from "./inpi-companion-chat-intent";

function ctx(overrides: Partial<InpiCompanionIntentContext> = {}): InpiCompanionIntentContext {
  return { mode: "creation", conflicts: [], ...overrides };
}

describe("LOST", () => {
  for (const message of ["je suis perdu", "Je ne sais plus quoi faire", "je suis complètement perdu"]) {
    it(`"${message}" → lost`, () => {
      assert.equal(classifyInpiCompanionIntent(message, ctx()), "lost");
    });
  }
});

describe("RESUME", () => {
  for (const message of ["je veux reprendre", "où en étais-je ?", "reprendre mon dossier"]) {
    it(`"${message}" → resume`, () => {
      assert.equal(classifyInpiCompanionIntent(message, ctx()), "resume");
    });
  }
});

describe("FIELD_HELP", () => {
  for (const message of ["c'est quoi le SIRET ?", "que dois-je mettre ici ?", "je ne comprends pas cette rubrique"]) {
    it(`"${message}" → field_help`, () => {
      assert.equal(classifyInpiCompanionIntent(message, ctx()), "field_help");
    });
  }
});

describe("SCREEN_DIVERGENCE", () => {
  for (const message of ["sur l'INPI je n'ai pas la même chose", "l'écran est différent", "l'INPI me demande autre chose"]) {
    it(`"${message}" → screen_divergence`, () => {
      assert.equal(classifyInpiCompanionIntent(message, ctx()), "screen_divergence");
    });
  }

  it("l'exemple donné en Phase 4.5.0 ne tombe pas dans field_help malgré la présence de 'l'INPI me demande'", () => {
    assert.equal(
      classifyInpiCompanionIntent("Je ne comprends pas pourquoi l'INPI me demande autre chose", ctx()),
      "screen_divergence",
    );
  });
});

describe("REGULARIZATION", () => {
  it("contexte mode='regularisation' → regularization, même pour un message générique", () => {
    assert.equal(classifyInpiCompanionIntent("bonjour", ctx({ mode: "regularisation" })), "regularization");
  });

  it("message explicitement présenté comme une régularisation, même hors contexte", () => {
    assert.equal(
      classifyInpiCompanionIntent("J'ai reçu une demande de régularisation de l'INPI", ctx()),
      "regularization",
    );
  });

  it("priorité 1 confirmée : régularisation l'emporte sur field_help même si le message contient des mots-clés d'aide", () => {
    assert.equal(
      classifyInpiCompanionIntent("Je ne comprends pas cette demande de régularisation", ctx()),
      "regularization",
    );
  });
});

describe("UNKNOWN_STATUS", () => {
  for (const message of ["je ne sais pas si je suis déjà inscrit", "comment savoir si j'ai un SIREN ?"]) {
    it(`"${message}" → unknown_status`, () => {
      assert.equal(classifyInpiCompanionIntent(message, ctx()), "unknown_status");
    });
  }
});

describe("ALREADY_REGISTERED", () => {
  for (const message of ["j'ai déjà mon SIREN", "mon activité est déjà déclarée"]) {
    it(`"${message}" → already_registered`, () => {
      assert.equal(classifyInpiCompanionIntent(message, ctx()), "already_registered");
    });
  }

  it("distinction avec unknown_status : 'je ne sais pas si je suis déjà inscrit' reste unknown_status, pas already_registered", () => {
    assert.equal(
      classifyInpiCompanionIntent("je ne sais pas si je suis déjà inscrit", ctx()),
      "unknown_status",
    );
  });
});

describe("MULTI_PROPERTY", () => {
  for (const message of ["j'ai plusieurs logements", "j'ai plusieurs biens"]) {
    it(`"${message}" → multi_property`, () => {
      assert.equal(classifyInpiCompanionIntent(message, ctx()), "multi_property");
    });
  }
});

describe("OUT_OF_SCOPE", () => {
  for (const message of [
    "et pour mes impôts ?",
    "comment calculer mon amortissement ?",
    "j'ai une question sur ma comptabilité",
  ]) {
    it(`"${message}" → out_of_scope`, () => {
      assert.equal(classifyInpiCompanionIntent(message, ctx()), "out_of_scope");
    });
  }
});

describe("CONFLICT", () => {
  it("contexte avec un conflit actif → conflict, même pour un message générique", () => {
    const conflict: InpiCompanionConflict = { field: "siren_siret", previousValue: "A", newValue: "B" };
    assert.equal(classifyInpiCompanionIntent("bonjour", ctx({ conflicts: [conflict] })), "conflict");
  });

  it("scénario 6 (audit 4.5.0) : 'Mon SIREN est différent de celui du document' → conflict, même sans conflit déjà détecté par le moteur", () => {
    assert.equal(
      classifyInpiCompanionIntent("Mon SIREN est différent de celui du document", ctx()),
      "conflict",
    );
  });
});

describe("free_question — repli par défaut", () => {
  for (const message of ["bonjour", "merci beaucoup", "d'accord, je continue", "xyz123 abc"]) {
    it(`"${message}" → free_question`, () => {
      assert.equal(classifyInpiCompanionIntent(message, ctx()), "free_question");
    });
  }
});

describe("Casse / accents", () => {
  it("insensible à la casse", () => {
    assert.equal(classifyInpiCompanionIntent("JE SUIS PERDU", ctx()), "lost");
  });

  it("insensible aux accents (é/è/ê)", () => {
    assert.equal(classifyInpiCompanionIntent("l'ecran est different", ctx()), "screen_divergence");
    assert.equal(classifyInpiCompanionIntent("l'écran est différent", ctx()), "screen_divergence");
  });
});

describe("Ordre de priorité — cas de conflit entre catégories", () => {
  it("screen_divergence l'emporte sur field_help lorsque les deux pourraient correspondre", () => {
    // Contient à la fois une formulation d'aide générique ET une divergence explicite.
    assert.equal(
      classifyInpiCompanionIntent("Je ne comprends pas, l'écran est différent de votre explication", ctx()),
      "screen_divergence",
    );
  });

  it("lost l'emporte sur field_help lorsque les deux pourraient correspondre", () => {
    assert.equal(
      classifyInpiCompanionIntent("Je suis perdu, je ne comprends pas cette rubrique", ctx()),
      "lost",
    );
  });

  it("un conflit actif l'emporte sur lost (« je suis perdu »)", () => {
    const conflict: InpiCompanionConflict = { field: "siren_siret", previousValue: "A", newValue: "B" };
    assert.equal(classifyInpiCompanionIntent("je suis perdu", ctx({ conflicts: [conflict] })), "conflict");
  });
});

describe("Phase 4.5.3 — motifs ajoutés", () => {
  it("« je ne sais pas quoi faire » → lost", () => {
    assert.equal(classifyInpiCompanionIntent("je ne sais pas quoi faire", ctx()), "lost");
  });

  it("« mon écran INPI ne correspond pas » → screen_divergence, pas conflict", () => {
    assert.equal(classifyInpiCompanionIntent("mon écran INPI ne correspond pas", ctx()), "screen_divergence");
  });

  it("« l'INPI me demande quelque chose » → regularization", () => {
    assert.equal(classifyInpiCompanionIntent("l'INPI me demande quelque chose", ctx()), "regularization");
  });

  it("« l'INPI me demande autre chose » reste screen_divergence (pas avalé par regularization)", () => {
    assert.equal(classifyInpiCompanionIntent("l'INPI me demande autre chose", ctx()), "screen_divergence");
  });

  it("« mon SIRET ne correspond pas » → conflict, pas screen_divergence", () => {
    assert.equal(classifyInpiCompanionIntent("mon SIRET ne correspond pas", ctx()), "conflict");
  });

  it("un « ne correspond pas » générique d'écran n'est pas capturé par conflict", () => {
    assert.notEqual(classifyInpiCompanionIntent("mon écran INPI ne correspond pas", ctx()), "conflict");
  });

  it("« j'ai commencé ma démarche » → resume", () => {
    assert.equal(classifyInpiCompanionIntent("j'ai commencé ma démarche", ctx()), "resume");
  });

  it("« j'ai envoyé ma demande » → resume", () => {
    assert.equal(classifyInpiCompanionIntent("j'ai envoyé ma demande", ctx()), "resume");
  });

  it("« je ne sais pas si mon activité est déjà déclarée » → unknown_status", () => {
    assert.equal(
      classifyInpiCompanionIntent("je ne sais pas si mon activité est déjà déclarée", ctx()),
      "unknown_status",
    );
  });

  it("« mon activité est déjà déclarée » reste already_registered", () => {
    assert.equal(classifyInpiCompanionIntent("mon activité est déjà déclarée", ctx()), "already_registered");
  });

  it("« faire la démarche à ma place » → out_of_scope", () => {
    assert.equal(classifyInpiCompanionIntent("faire la démarche à ma place", ctx()), "out_of_scope");
  });

  it("« faites-la pour moi » → out_of_scope", () => {
    assert.equal(classifyInpiCompanionIntent("faites-la pour moi", ctx()), "out_of_scope");
  });

  it("« pour moi » isolé n'est pas out_of_scope", () => {
    assert.equal(classifyInpiCompanionIntent("c'est une question pour moi", ctx()), "free_question");
  });

  it("« à quoi sert le SIREN ? » → field_help", () => {
    assert.equal(classifyInpiCompanionIntent("à quoi sert le SIREN ?", ctx()), "field_help");
  });
});

describe("Pureté", () => {
  it("classifyInpiCompanionIntent est synchrone et ne mute jamais son contexte, même gelé", () => {
    const conflict: InpiCompanionConflict = { field: "siren_siret", previousValue: "A", newValue: "B" };
    const frozenCtx = Object.freeze({ mode: "creation" as const, conflicts: Object.freeze([conflict]) });
    const result = classifyInpiCompanionIntent("bonjour", frozenCtx);
    assert.equal(result instanceof Promise, false);
    assert.equal(frozenCtx.conflicts.length, 1);
  });
});
