import { ConvexError } from 'convex/values'

/* Codes a mutation throws on purpose, in the words a screen would use. Only
   codes live here; a ConvexError that is already a sentence is shown as is. */
const CODES: Record<string, string> = {
  TODAY_FULL: 'Today is full. Finish one or drop one.',
  /* R6. Each of these is a guard in convex/areas.ts, in the words the areas
     editor would use. The last four are backstops — the interface is built so
     they cannot normally be reached (the retire control asks where the capture
     words go, and the hue slider will not stop on the accent) — and they are
     here so a path nobody thought of still says something true. */
  AREA_ON_A_TILE:
    'That area is one of the six THIS MONTH tiles. Retiring it would empty a tile on Today, so it stays.',
  AREA_EXISTS: 'There is already an area with that name.',
  AREA_NEEDS_A_NAME: "That name doesn't make a usable one — try letters.",
  AREA_IN_USE:
    'Things are filed under that area. Retire it instead — deleting would leave them nameless.',
  AREA_IS_BUILT_IN: 'That one came with the app. Rename or retire it instead.',
  LAST_AREA: "That's the only area left.",
  NO_SUCH_AREA: 'That area is gone.',
  AREA_NEEDS_A_REPLACEMENT: 'Say where that area’s quick-capture words go.',
  HUE_IS_THE_ACCENT:
    'That colour is the one reserved for live and focus. Pick another.',
  BAD_HUE: 'A hue is a number from 0 to 359.',
  NOT_THE_WHOLE_LIST: 'That reorder did not match your areas.',
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
