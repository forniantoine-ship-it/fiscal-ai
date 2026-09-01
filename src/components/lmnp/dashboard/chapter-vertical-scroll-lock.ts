export type ChapterVerticalScrollLockOwner = "carousel" | "chapter-wheel";

let lockOwner: ChapterVerticalScrollLockOwner | null = null;

export function getChapterVerticalScrollLockOwner(): ChapterVerticalScrollLockOwner | null {
  return lockOwner;
}

export function isChapterVerticalScrollLocked(): boolean {
  return lockOwner !== null;
}

/** Engage le verrou si libre ou déjà détenu par le même owner. */
export function tryEngageChapterVerticalScrollLock(
  owner: ChapterVerticalScrollLockOwner,
): boolean {
  if (lockOwner !== null && lockOwner !== owner) {
    return false;
  }
  lockOwner = owner;
  return true;
}

/** Libère le verrou uniquement si l'owner correspond. */
export function tryReleaseChapterVerticalScrollLock(
  owner: ChapterVerticalScrollLockOwner,
): boolean {
  if (lockOwner !== owner) {
    return false;
  }
  lockOwner = null;
  return true;
}

/** Tests uniquement — réinitialise l'état de propriété en mémoire. */
export function resetChapterVerticalScrollLockForTests(): void {
  lockOwner = null;
}
