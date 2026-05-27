import { getBoundAuthUserId } from "@/lib/lmnp/auth/auth-boundary";

const STORAGE_KEY_PREFIX = "fiscal-ai-current-dossier-id:";

let currentDossierId: string | null = null;
let currentDossierUserId: string | null = null;
const listeners = new Set<(dossierId: string | null) => void>();

function storageKeyForUser(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function clearDossierSessionForAuthReset() {
  currentDossierId = null;
  currentDossierUserId = null;

  if (typeof window === "undefined") return;

  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      sessionStorage.removeItem(key);
    }
  }
}

export function getCurrentDossierId(explicitUserId?: string | null): string | null {
  const userId = explicitUserId ?? getBoundAuthUserId();
  if (!userId) return null;

  if (currentDossierUserId === userId && currentDossierId) {
    return currentDossierId;
  }

  if (typeof window === "undefined") return null;

  const stored = sessionStorage.getItem(storageKeyForUser(userId));
  if (!stored) return null;

  currentDossierId = stored;
  currentDossierUserId = userId;
  return stored;
}

export function setCurrentDossierId(dossierId: string | null, explicitUserId?: string | null) {
  const userId = explicitUserId ?? getBoundAuthUserId();
  if (!userId) return;

  currentDossierId = dossierId;
  currentDossierUserId = userId;

  if (typeof window === "undefined") return;

  const key = storageKeyForUser(userId);
  if (dossierId) {
    sessionStorage.setItem(key, dossierId);
  } else {
    sessionStorage.removeItem(key);
  }

  listeners.forEach((listener) => listener(dossierId));
}

export function subscribeCurrentDossierId(
  listener: (dossierId: string | null) => void,
): () => void {
  listeners.add(listener);
  listener(getCurrentDossierId());
  return () => listeners.delete(listener);
}
