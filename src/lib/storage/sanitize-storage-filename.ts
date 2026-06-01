/**
 * Sanitizes filenames for Supabase Storage object keys.
 * Display names stay untouched — only internal storage paths use this.
 */

const FRENCH_LIGATURES: Record<string, string> = {
  œ: "oe",
  Œ: "oe",
  æ: "ae",
  Æ: "ae",
  ß: "ss",
};

export type SanitizeStorageFilenameOptions = {
  /** Default true — storage keys are lowercase for consistency. */
  lowercase?: boolean;
};

function replaceFrenchLigatures(value: string): string {
  return value.replace(/[œŒæÆß]/g, (char) => FRENCH_LIGATURES[char] ?? char);
}

function stripDiacritics(value: string): string {
  return replaceFrenchLigatures(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC");
}

function sanitizeBaseName(baseName: string, lowercase: boolean): string {
  let sanitized = stripDiacritics(baseName.trim());

  sanitized = sanitized.replace(/[\s_]+/g, "-");
  sanitized = sanitized.replace(/[^a-zA-Z0-9.-]+/g, "-");
  sanitized = sanitized.replace(/-+/g, "-").replace(/^-+|-+$/g, "");

  if (lowercase) {
    sanitized = sanitized.toLowerCase();
  }

  return sanitized || "document";
}

function sanitizeExtension(extension: string, lowercase: boolean): string {
  const stripped = stripDiacritics(extension.trim()).replace(/[^a-zA-Z0-9]+/g, "");
  if (!stripped) return "";
  return lowercase ? stripped.toLowerCase() : stripped;
}

function splitFilename(filename: string): { base: string; extension: string } {
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf(".");

  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return { base: trimmed, extension: "" };
  }

  return {
    base: trimmed.slice(0, lastDot),
    extension: trimmed.slice(lastDot + 1),
  };
}

/**
 * Converts a user-facing filename into a storage-safe object name.
 *
 * @example
 * sanitizeStorageFilename("Offre de prêt MORLAIX Romain.pdf")
 * // → "offre-de-pret-morlaix-romain.pdf"
 */
export function sanitizeStorageFilename(
  originalFilename: string,
  options: SanitizeStorageFilenameOptions = {},
): string {
  const lowercase = options.lowercase !== false;
  const { base, extension } = splitFilename(originalFilename);
  const safeBase = sanitizeBaseName(base, lowercase);
  const safeExtension = sanitizeExtension(extension, lowercase);

  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
}

export type StorageObjectPathParts = {
  /** Full object key passed to Supabase Storage. */
  storagePath: string;
  /** Sanitized filename segment (without user/timestamp prefix). */
  sanitizedFilename: string;
  /** Original filename for UI and database display. */
  displayFilename: string;
};

/**
 * Builds a Supabase Storage object path from a user id and original filename.
 */
export function buildStorageObjectPath(
  userId: string,
  originalFilename: string,
  options?: SanitizeStorageFilenameOptions,
): StorageObjectPathParts {
  const displayFilename = originalFilename.trim() || "document";
  const sanitizedFilename = sanitizeStorageFilename(displayFilename, options);
  const storagePath = `${userId}/${Date.now()}-${sanitizedFilename}`;

  return {
    storagePath,
    sanitizedFilename,
    displayFilename,
  };
}
