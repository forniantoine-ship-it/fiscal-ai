const STORAGE_KEY = "fiscal-ai-current-dossier-id";

let currentDossierId: string | null = null;
const listeners = new Set<(dossierId: string | null) => void>();

function readStoredDossierId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

function persistDossierId(dossierId: string | null) {
  if (typeof window === "undefined") return;
  if (dossierId) {
    sessionStorage.setItem(STORAGE_KEY, dossierId);
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function getCurrentDossierId(): string | null {
  if (currentDossierId) return currentDossierId;
  const stored = readStoredDossierId();
  if (stored) currentDossierId = stored;
  return currentDossierId;
}

export function setCurrentDossierId(dossierId: string | null) {
  currentDossierId = dossierId;
  persistDossierId(dossierId);
  listeners.forEach((listener) => listener(dossierId));
}

export function subscribeCurrentDossierId(
  listener: (dossierId: string | null) => void,
): () => void {
  listeners.add(listener);
  listener(getCurrentDossierId());
  return () => listeners.delete(listener);
}
