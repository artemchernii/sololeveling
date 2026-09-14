import { ConvexError } from 'convex/values'

/* Codes a mutation throws on purpose, in the words a screen would use. Only
   codes live here; a ConvexError that is already a sentence is shown as is. */
const CODES: Record<string, string> = {
  TODAY_FULL: 'Today is full. Finish one or drop one.',
}

const SIGNED_OUT = 'Not signed in'

/**
 * The sentence for a write that failed with nobody catching it, or null when
 * the rejection is not a Convex write at all (a cancelled navigation, a bug in
 * a component) — those are not "your save did not land", and saying so would
 * be a lie. Signing out is null too: the session sends you to /login instead.
 */
export function failureMessage(reason: unknown): string | null {
  if (reason instanceof ConvexError) {
    const data: unknown = reason.data
    if (typeof data === 'string') return CODES[data] ?? data
    return 'The server did not accept it.'
  }

  if (!(reason instanceof Error) || !reason.message.startsWith('[CONVEX')) {
    return null
  }

  /* "…Server Error\nUncaught Error: No such task\n    at handler (…)" — the
     server's own words sit on the Uncaught line, after the error's name. */
  const said = /Uncaught (?:\w*Error: )?(.+)/.exec(reason.message)?.[1]?.trim()
  if (said === SIGNED_OUT) return null
  return said ? (CODES[said] ?? said) : 'The server did not accept it.'
}
