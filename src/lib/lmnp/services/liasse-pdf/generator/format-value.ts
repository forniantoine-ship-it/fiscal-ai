/**
 * Formatage de PRÉSENTATION pur — aucune règle fiscale. Une valeur déjà
 * décidée par le mapper fiscal (montant, texte, booléen) devient une chaîne
 * à dessiner, ou une liste de caractères pour les cases à chiffres répartis
 * (ex. SIREN). Ce module ne décide jamais SI une case s'affiche.
 */
import type { CerfaCaseValue } from "../types";
import type { CerfaValueFormat } from "../types";

/**
 * Corrige le même artefact déjà documenté et corrigé dans
 * `render-client-summary-pdf.ts` (jsPDF/Helvetica) : `toLocaleString("fr-FR")`
 * produit un séparateur de milliers non standard (U+202F/U+00A0) que les
 * polices standard ne rendent pas toujours correctement. Purement cosmétique,
 * jamais appliqué aux données elles-mêmes.
 */
function sanitizeSpaces(text: string): string {
  return text.replace(/[    ]/g, " ");
}

/**
 * Convention négatifs — vérifiée sur le dossier témoin réel (Liasse-2025,
 * JD2M, EDI accepté) : les montants négatifs du 2033-B et du 2033-A y sont
 * systématiquement représentés entre parenthèses, jamais avec un signe
 * moins (ex. « (9 080) », « (13 681) », jamais « -9 080 »). C'est une
 * convention comptable usuelle sur ce type de document, retrouvée à
 * l'identique sur les cases 270/310 du dossier de référence — traitée ici
 * comme une règle de PRÉSENTATION (aucune valeur fiscale n'est changée,
 * seul son habillage typographique l'est).
 */
function formatEurArrondi(value: CerfaCaseValue): string {
  if (typeof value !== "number") {
    throw new Error(`format "eur-arrondi" attend un nombre, reçu : ${typeof value}`);
  }
  const rounded = Math.round(value);
  const absFormatted = sanitizeSpaces(Math.abs(rounded).toLocaleString("fr-FR"));
  return rounded < 0 ? `(${absFormatted})` : absFormatted;
}

function formatTexte(value: CerfaCaseValue, maxChars?: number): string {
  const text = String(value);
  if (maxChars !== undefined && text.length > maxChars) {
    return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return text;
}

function formatDate(value: CerfaCaseValue): string {
  if (typeof value !== "string") {
    throw new Error(`format "date" attend une chaîne déjà formatée, reçu : ${typeof value}`);
  }
  return value;
}

/**
 * Case à cocher : `true` → glyphe de coche. `false` → chaîne vide (rien
 * dessiné) — jamais coché par défaut, jamais déduit d'une absence de donnée.
 * Ce module ne reçoit `false` que si le mapper l'a produit explicitement ;
 * il ne reçoit jamais rien pour une case absente (le générateur ne l'appelle
 * pas du tout dans ce cas — voir generator/render-cerfa-liasse.ts).
 */
function formatCaseACocher(value: CerfaCaseValue): string {
  if (typeof value !== "boolean") {
    throw new Error(`format "case-a-cocher" attend un booléen, reçu : ${typeof value}`);
  }
  return value ? "X" : "";
}

/**
 * Chiffres répartis (ex. SIREN) : retourne la chaîne de chiffres telle
 * quelle — c'est `render-cerfa-liasse.ts` qui la répartit ensuite sur
 * `digitPositions`, car cette répartition a besoin des coordonnées du
 * registre, hors de portée de ce module de formatage pur.
 */
function formatChiffresRepartis(value: CerfaCaseValue): string {
  const text = String(value).replace(/\s+/g, "");
  if (!/^\d+$/.test(text)) {
    throw new Error(`format "chiffres-repartis" attend une chaîne de chiffres, reçu : "${text}"`);
  }
  return text;
}

export function formatCerfaValue(
  value: CerfaCaseValue,
  format: CerfaValueFormat = "texte",
  maxChars?: number,
): string {
  switch (format) {
    case "eur-arrondi":
      return formatEurArrondi(value);
    case "texte":
      return sanitizeSpaces(formatTexte(value, maxChars));
    case "date":
      return sanitizeSpaces(formatDate(value));
    case "case-a-cocher":
      return formatCaseACocher(value);
    case "chiffres-repartis":
      return formatChiffresRepartis(value);
    default: {
      const exhaustive: never = format;
      throw new Error(`Format Cerfa inconnu : ${String(exhaustive)}`);
    }
  }
}
