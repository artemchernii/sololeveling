import { ConvexError } from 'convex/values'

/* The demo account's refusals (convex/write.ts), seen once at the Convex
   client: most screens catch their own failures and put the control back,
   so a friend would see a tick undo itself with no word. Every call that
   comes back DEMO_* is announced here; DemoBadge says it. */

export const DEMO_REFUSED = 'demo-refused'

const WORDS: Record<string, string> = {
  DEMO_READ_ONLY: 'DEMO · NOT SAVED',
  DEMO_NO_AI: 'DEMO · NO AI',
}

/** The badge words for a demo refusal, else null. */
export function demoWords(reason: unknown): string | null {
  if (!(reason instanceof ConvexError)) return null
  const data: unknown = reason.data
  return typeof data === 'string' ? (WORDS[data] ?? null) : null
}

export function announceDemo(reason: unknown): void {
  const words = demoWords(reason)
  if (words !== null && typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(DEMO_REFUSED, { detail: words }))
}
