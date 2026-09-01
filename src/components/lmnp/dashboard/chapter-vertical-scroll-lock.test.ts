/**
 * Run: npx tsx src/components/lmnp/dashboard/chapter-vertical-scroll-lock.test.ts
 */
import {
  getChapterVerticalScrollLockOwner,
  isChapterVerticalScrollLocked,
  resetChapterVerticalScrollLockForTests,
  tryEngageChapterVerticalScrollLock,
  tryReleaseChapterVerticalScrollLock,
} from "./chapter-vertical-scroll-lock";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): void {
  resetChapterVerticalScrollLockForTests();

  assert(!isChapterVerticalScrollLocked(), "état initial : pas de verrou");
  assert(tryEngageChapterVerticalScrollLock("chapter-wheel"), "wheel engage le verrou");
  assert(getChapterVerticalScrollLockOwner() === "chapter-wheel", "owner = chapter-wheel");

  assert(
    !tryReleaseChapterVerticalScrollLock("carousel"),
    "carousel ne libère pas le verrou wheel",
  );
  assert(isChapterVerticalScrollLocked(), "verrou wheel intact après pointerup carousel simulé");
  assert(getChapterVerticalScrollLockOwner() === "chapter-wheel", "owner inchangé");

  assert(
    !tryEngageChapterVerticalScrollLock("carousel"),
    "carousel ne peut pas prendre un verrou déjà tenu",
  );

  assert(tryReleaseChapterVerticalScrollLock("chapter-wheel"), "wheel libère son propre verrou");
  assert(!isChapterVerticalScrollLocked(), "verrou libéré par le bon owner");

  assert(tryEngageChapterVerticalScrollLock("carousel"), "carousel engage après libération wheel");
  assert(tryReleaseChapterVerticalScrollLock("carousel"), "carousel libère son propre verrou");
  assert(!isChapterVerticalScrollLocked(), "carousel release réussi");

  console.log("chapter-vertical-scroll-lock.test.ts — tous les tests passés");
}

runTests();
