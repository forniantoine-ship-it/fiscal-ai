import {
  tryEngageChapterVerticalScrollLock,
  tryReleaseChapterVerticalScrollLock,
  type ChapterVerticalScrollLockOwner,
} from "@/components/lmnp/dashboard/chapter-vertical-scroll-lock";

const CHAPTER_SCROLL_SELECTOR = "[data-chapter-scroll]";

export function getChapterScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(CHAPTER_SCROLL_SELECTOR);
}

/** Scroll vertical vers un chapitre sans déplacer la fenêtre ni l'en-tête global. */
export function scrollChapterPanelIntoView(chapterId: string): void {
  const scrollContainer = getChapterScrollContainer();
  const chapter = document.getElementById(chapterId);
  if (!scrollContainer || !chapter) return;

  const targetTop =
    chapter.getBoundingClientRect().top -
    scrollContainer.getBoundingClientRect().top +
    scrollContainer.scrollTop;

  if (Math.abs(scrollContainer.scrollTop - targetTop) < 4) return;

  scrollContainer.scrollTo({ top: targetTop, behavior: "smooth" });
}

/** Exécute une action UI sans décaler le scroll vertical des chapitres (ex. « En savoir plus »). */
export function preserveChapterScrollPosition(action: () => void): void {
  const scrollContainer = getChapterScrollContainer();
  const scrollTop = scrollContainer?.scrollTop ?? 0;
  action();
  requestAnimationFrame(() => {
    scrollContainer?.scrollTo({ top: scrollTop });
  });
}

export function engageChapterVerticalScrollLock(
  owner: ChapterVerticalScrollLockOwner,
): boolean {
  const scrollContainer = getChapterScrollContainer();
  if (!scrollContainer) return false;
  if (!tryEngageChapterVerticalScrollLock(owner)) return false;

  scrollContainer.dataset.carouselVerticalLock = "true";
  scrollContainer.style.overflowY = "hidden";
  return true;
}

export function releaseChapterVerticalScrollLock(
  owner: ChapterVerticalScrollLockOwner,
): boolean {
  const scrollContainer = getChapterScrollContainer();
  if (!scrollContainer) return false;
  if (!tryReleaseChapterVerticalScrollLock(owner)) return false;

  delete scrollContainer.dataset.carouselVerticalLock;
  scrollContainer.style.overflowY = "";
  return true;
}

/** @deprecated Préférer engage/releaseChapterVerticalScrollLock avec un owner explicite. */
export function lockChapterVerticalScroll(lock: boolean): void {
  if (lock) {
    engageChapterVerticalScrollLock("carousel");
    return;
  }
  releaseChapterVerticalScrollLock("carousel");
}
