/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/format-value.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatCerfaValue } from "../generator/format-value";

describe("formatCerfaValue - eur-arrondi", () => {
  it("arrondit et separe les milliers en fr-FR, avec une espace normale (jamais une espace insecable)", () => {
    const result = formatCerfaValue(9862, "eur-arrondi");
    assert.equal(result.length, 5);
    assert.equal(result[1], " ");
    assert.equal(result.charCodeAt(1), 32);
  });
  it("arrondit les decimales", () => {
    assert.equal(formatCerfaValue(9861.6, "eur-arrondi"), formatCerfaValue(9862, "eur-arrondi"));
  });
  it("rend un nombre negatif entre parentheses, jamais avec un signe moins - convention verifiee sur le dossier temoin reel (cases 270/310 du 2033-B)", () => {
    const result = formatCerfaValue(-9080, "eur-arrondi");
    assert.equal(result[0], "(");
    assert.equal(result[result.length - 1], ")");
    assert.ok(!result.includes("-"), "aucun signe moins ne doit subsister");
    assert.equal(result, `(9${" "}080)`);
  });
  it("un nombre negatif dont la valeur absolue s'arrondit a zero reste positif (pas de '(0)')", () => {
    assert.equal(formatCerfaValue(-0.4, "eur-arrondi"), "0");
  });
  it("rejette une valeur non numerique plutot que de deviner", () => {
    assert.throws(() => formatCerfaValue("9862" as never, "eur-arrondi"));
  });
});

describe("formatCerfaValue - texte", () => {
  it("rend la chaine telle quelle sous la limite", () => {
    assert.equal(formatCerfaValue("Elsa Bouvard", "texte", 20), "Elsa Bouvard");
  });
  it("tronque avec ellipse au-dela de la limite - jamais un debordement silencieux ni une coupe brute", () => {
    const result = formatCerfaValue("Un tres long libelle qui depasse", "texte", 10);
    assert.equal(result.length, 10);
    assert.ok(result.endsWith("…"));
  });
});

describe("formatCerfaValue - date", () => {
  it("passthrough strict, aucun reformatage", () => {
    assert.equal(formatCerfaValue("01/02/2025", "date"), "01/02/2025");
  });
  it("rejette une valeur non-string plutot que de la formater elle-meme", () => {
    assert.throws(() => formatCerfaValue(20250201 as never, "date"));
  });
});

describe("formatCerfaValue - case-a-cocher", () => {
  it("true -> glyphe X", () => {
    assert.equal(formatCerfaValue(true, "case-a-cocher"), "X");
  });
  it("false -> chaine vide (jamais coche par defaut)", () => {
    assert.equal(formatCerfaValue(false, "case-a-cocher"), "");
  });
  it("rejette une valeur non booleenne", () => {
    assert.throws(() => formatCerfaValue("true" as never, "case-a-cocher"));
  });
});

describe("formatCerfaValue - chiffres-repartis", () => {
  it("retourne la chaine de chiffres sans espaces", () => {
    assert.equal(formatCerfaValue("104545108", "chiffres-repartis"), "104545108");
  });
  it("rejette une chaine non numerique", () => {
    assert.throws(() => formatCerfaValue("10A545108", "chiffres-repartis"));
  });
});

describe("formatCerfaValue - defaut", () => {
  it("format omis -> 'texte'", () => {
    assert.equal(formatCerfaValue("abc"), "abc");
  });
});
