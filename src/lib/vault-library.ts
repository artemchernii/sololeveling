import { READING_KINDS } from './reading'
import type { ReadingKind } from './reading'

/* The Vault as a library (26 Sep, Artem: "not a wall of hardly
   distinguishable reports with no sorting, filter or something. This
   needs to be a place where easy navigate and learn, remind").

   Everything here works on what is already stored — the reader's title,
   kind and tags, the sheet's dates. It invents nothing: a sheet read
   before titles existed shows its file name, and its kind is "other". */

const DAY = 86_400_000

export type LibrarySheet = {
  id: string
  /** The reader's title, or the file name when there is none. */
  title: string
  kind: ReadingKind
  tags: Array<string>
  /** When the class was — the session's time, else when it was added. */
  at: number
  addedAt: number
  revisedAt?: number
  /** Only a finished reading can be searched inside or revisited. */
  read: boolean
  /** Summary, text and words, for search. */
  haystack: string
}

export type Order = 'newest' | 'oldest'

/* Accents and case do not matter to a search: "conjuntivo" finds
   "Conjuntivo", "voce" finds "você". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function matches(sheet: LibrarySheet, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = fold(
    [sheet.title, sheet.kind, sheet.tags.join(' '), sheet.haystack].join(' '),
  )
  return words.every((w) => hay.includes(w))
}

export function arrange(
  sheets: ReadonlyArray<LibrarySheet>,
  opts: { kind: ReadingKind | 'all'; query: string; order: Order },
): Array<LibrarySheet> {
  return sheets
    .filter((s) => opts.kind === 'all' || s.kind === opts.kind)
    .filter((s) => matches(s, opts.query))
    .sort((a, b) => (opts.order === 'newest' ? b.at - a.at : a.at - b.at))
}

/** How many sheets of each kind — the filter chips, only kinds that have one. */
export function kindCounts(
  sheets: ReadonlyArray<LibrarySheet>,
): Array<{ kind: ReadingKind; count: number }> {
  return READING_KINDS.map((kind) => ({
    kind,
    count: sheets.filter((s) => s.kind === kind).length,
  })).filter((k) => k.count > 0)
}

const MONTH = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
})

/** Runs of sheets by the month of their class, in the order given. */
export function byMonth(
  sheets: ReadonlyArray<LibrarySheet>,
): Array<{ key: string; label: string; sheets: Array<LibrarySheet> }> {
  const out: Array<{
    key: string
    label: string
    sheets: Array<LibrarySheet>
  }> = []
  for (const sheet of sheets) {
    const d = new Date(sheet.at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const last = out.at(-1)
    if (last?.key === key) last.sheets.push(sheet)
    else out.push({ key, label: MONTH.format(d), sheets: [sheet] })
  }
  return out
}

/* A sheet comes back to be gone over when it has settled (two days since
   it was added, so today's class is not "due") and has not been revised
   in a week. The longest untouched first; a few, not a backlog. */
export const SETTLE_DAYS = 2
export const REST_DAYS = 7
export const REVISIT_SHOWN = 3

export function dueForRevisit(
  sheets: ReadonlyArray<LibrarySheet>,
  now: number,
): Array<LibrarySheet> {
  const lastTouch = (s: LibrarySheet) => s.revisedAt ?? s.addedAt
  return sheets
    .filter((s) => s.read)
    .filter((s) =>
      s.revisedAt === undefined
        ? now - s.addedAt >= SETTLE_DAYS * DAY
        : now - s.revisedAt >= REST_DAYS * DAY,
    )
    .sort((a, b) => lastTouch(a) - lastTouch(b))
    .slice(0, REVISIT_SHOWN)
}
