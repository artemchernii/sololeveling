/* 24 Sep. The second line of a row in the notes list: when it was written,
   when it last changed. Short enough to read at a glance and still exact. */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const MIN = 60_000
const DAY = 24 * 60 * MIN

function dayStart(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "just now", "14:05", "yesterday", "Mon", "3 Sep", "3 Sep 2025". */
export function whenLabel(ms: number, now: number): string {
  if (now - ms < MIN) return 'just now'
  const days = Math.round((dayStart(now) - dayStart(ms)) / DAY)
  const d = new Date(ms)
  if (days === 0) {
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  }
  if (days === 1) return 'yesterday'
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  /* Spelled out rather than asked of the locale: en-GB now says "Sept". */
  const month = MONTHS[d.getMonth()]
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return sameYear
    ? `${d.getDate()} ${month}`
    : `${d.getDate()} ${month} ${d.getFullYear()}`
}

/** Whether "edited" is worth saying: a change made while it was being
    written — within the first few minutes — is part of writing it. */
export function wasEdited(created: number, updated: number | undefined) {
  return updated !== undefined && updated - created > 5 * MIN
}

export type NoteSort = 'new' | 'edited' | 'az'

type Sortable = {
  title: string
  _creationTime: number
  updatedAt?: number
}

/**
 * The list in the order asked for (24 Sep). Newest is creation time;
 * Edited is the last change to the words, or creation if never edited; A–Z
 * ignores case and accents, so "Голiння" and "гоління" sit together.
 */
export function sortNotes<T extends Sortable>(
  notes: Array<T>,
  sort: NoteSort,
): Array<T> {
  const copy = [...notes]
  if (sort === 'az') {
    return copy.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    )
  }
  const at = (n: T) =>
    sort === 'edited' ? (n.updatedAt ?? n._creationTime) : n._creationTime
  return copy.sort((a, b) => at(b) - at(a))
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Whether a note matches what is typed in the list's search box: every word
 * appears somewhere in its title or body, in any order, ignoring case and
 * accents. An empty box matches everything.
 */
export function matchesQuery(
  note: { title: string; body: string },
  query: string,
): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fold(`${note.title}\n${note.body}`)
  return words.every((w) => haystack.includes(w))
}
