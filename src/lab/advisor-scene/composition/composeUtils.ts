import type { Subject, SubjectId } from "@/lab/advisor-scene/types";
import { visibleSubjects } from "@/lab/advisor-scene/types";

/** Sujets visibles, avec leur écart d'index au sujet actif (0 = actif). */
export function withOffsets(
  subjects: Subject[],
  activeId: SubjectId | null,
): Array<{ subject: Subject; offset: number }> {
  const visible = visibleSubjects(subjects);
  const activeIndex = visible.findIndex((s) => s.id === activeId);
  const anchor = activeIndex >= 0 ? activeIndex : 0;

  return visible.map((subject, index) => ({ subject, offset: index - anchor }));
}

/** Ajustement de repli léger : les sujets "reported" se rapprochent, "done" s'éloignent. */
export function lifecycleBias(subject: Subject): number {
  if (subject.lifecycle === "reported") return 0.7;
  if (subject.lifecycle === "done") return 1.25;
  return 1;
}
