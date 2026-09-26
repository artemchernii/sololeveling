import type { ReactNode } from 'react'

/* When the [ QUEST COMPLETE ] popup fires (26 Sep, Artem: "target for weekly
   lessons 2, we log 2 and see the popover"). Only on the write that carries
   a count across its target — never on opening a page where the target was
   already met, never when the target itself is lowered under the count,
   never on a Monday reset. So it needs the count from before, not a flag
   kept somewhere: two readings of aggregate.kindCount and the goal's target. */

export function reachedTarget(
  before: number | undefined,
  after: number | undefined,
  target: number | undefined,
): boolean {
  if (before === undefined || after === undefined || target === undefined) {
    return false
  }
  return before < target && after >= target
}

/* What the popup says, in his words for each kind. */
export type Quest = {
  /** The one line under the title: "Class · Português". */
  title: string
  /** "2 of 2 this week". */
  line: string
  /** The area it belongs to, for the icon's colour. */
  area: string
  /** The kind's own icon, drawn in the area's colour. */
  icon: ReactNode
}

type Listener = (quest: Quest) => void
const listeners = new Set<Listener>()

/** Show the popup. The host (QuestHost, in the app shell) draws it. */
export function announceQuest(quest: Quest): void {
  for (const listener of listeners) listener(quest)
}

export function onQuest(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
