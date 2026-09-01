/**
 * Run: npx tsx src/components/lmnp/dashboard/dashboard-chapter-scroll-lock.test.ts
 */
import { resetChapterVerticalScrollLockForTests } from "./chapter-vertical-scroll-lock";
import {
  engageChapterVerticalScrollLock,
  releaseChapterVerticalScrollLock,
} from "./dashboard-chapter-scroll";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createMockScrollContainer(): HTMLElement {
  const el = {
    scrollTop: 719,
    dataset: {} as DOMStringMap,
    style: { overflowY: "" } as CSSStyleDeclaration,
    scrollTo: (opts: { top: number }) => {
      el.scrollTop = opts.top;
    },
  };
  return el as unknown as HTMLElement;
}

function installDocumentMock(scrollContainer: HTMLElement): () => void {
  const previousDocument = (globalThis as { document?: Document }).document;
  (globalThis as { document: Document }).document = {
    querySelector: (selector: string) =>
      selector === "[data-chapter-scroll]" ? scrollContainer : null,
  } as unknown as Document;

  return () => {
    if (previousDocument === undefined) {
      delete (globalThis as { document?: Document }).document;
    } else {
      (globalThis as { document: Document }).document = previousDocument;
    }
  };
}

function runTests(): void {
  resetChapterVerticalScrollLockForTests();
  const scrollContainer = createMockScrollContainer();
  const restoreDocument = installDocumentMock(scrollContainer);

  try {
    assert(
      engageChapterVerticalScrollLock("chapter-wheel"),
      "wheel engage le verrou DOM",
    );
    assert(
      scrollContainer.dataset.carouselVerticalLock === "true",
      "dataset lock posé",
    );
    assert(scrollContainer.style.overflowY === "hidden", "overflowY hidden");

    assert(
      !releaseChapterVerticalScrollLock("carousel"),
      "carousel pointerup simulé ne libère pas le verrou wheel",
    );
    assert(
      scrollContainer.dataset.carouselVerticalLock === "true",
      "dataset lock intact après tentative carousel",
    );
    assert(scrollContainer.style.overflowY === "hidden", "overflowY toujours hidden");

    assert(
      releaseChapterVerticalScrollLock("chapter-wheel"),
      "wheel libère proprement son verrou",
    );
    assert(
      scrollContainer.dataset.carouselVerticalLock === undefined,
      "dataset lock retiré",
    );
    assert(scrollContainer.style.overflowY === "", "overflowY restauré");

    console.log("dashboard-chapter-scroll-lock.test.ts — tous les tests passés");
  } finally {
    restoreDocument();
    resetChapterVerticalScrollLockForTests();
  }
}

runTests();
