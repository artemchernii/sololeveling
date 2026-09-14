import { ConvexError } from 'convex/values'

/* Codes a mutation throws on purpose, in the words a screen would use. Only
   codes live here; a ConvexError that is already a sentence is shown as is. */
const CODES: Record<string, string> = {
  TODAY_FULL: 'Today is full. Finish one or drop one.',
}

const SIGNED_OUT = 'Not signed in'

/** The server's words after "Uncaught", for an error from a Convex call. */
function serverWords(reason: unknown): string | null {
  if (!(reason instanceof Error) || !reason.message.startsWith('[CONVEX')) {
    return null
  }
  /* "…Server Error\nUncaught Error: No such task\n    at handler (…)" — the
     server's own words sit on the Uncaught line, after the error's name. */
  return /Uncaught (?:\w*Error: )?(.+)/.exec(reason.message)?.[1]?.trim() ?? ''
}

/**
 * True when Convex refused because the caller has no identity — requireUser()
 * in convex/auth.ts. That is a session that ended, not a broken page.
 */
export function isSignedOut(reason: unknown): boolean {
  return serverWords(reason) === SIGNED_OUT
}

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

  const said = serverWords(reason)
  if (said === null || said === SIGNED_OUT) return null
  return said ? (CODES[said] ?? said) : 'The server did not accept it.'
}
