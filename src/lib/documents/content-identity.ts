/**
 * Identité de CONTENU d'un document : SHA-256 des octets du fichier ORIGINAL (jamais le nom, le texte OCR, le montant ou la date).
 *
 * `SAME_DOCUMENT_CONTENT` (même SHA-256) ≠ `SAME_ACCOUNTING_FACT` : le hash détecte un RISQUE de double comptage, il ne décide
 * jamais seul d'une classe, d'un montant déductible ni de la suppression d'une charge (décision PO, GATE-1.1).
 * Le champ persisté ne contient que l'empreinte (64 hex minuscules), jamais le contenu.
 */
export const CONTENT_SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function isContentSha256(value: unknown): value is string {
  return typeof value === "string" && CONTENT_SHA256_PATTERN.test(value);
}

export async function sha256HexOfBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", view as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256HexOfFile(file: Blob): Promise<string> {
  return sha256HexOfBytes(await file.arrayBuffer());
}
