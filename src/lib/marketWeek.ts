import type { Fact } from './marketRead'

/* THE WEEK on MARKET (30 Oct; spec docs/specs/2026-10-30-market.md, mockup
   design/treasury-mockup/market-story.html, his "Go"). His words: "not
   much idea what is current going on on the market … earning reports,
   FED didnt hike didint cut, in Europe we have problems, Brazil
   election". The same READ MARKET press writes 3–5 stories of the week:
   a title and a line in plain words (the model's), three fact keys the
   app prints as boxes, and at most one move — a line on the IDEAS board.
   A story naming a key not given is refused, as a READ line is. */

export const WEEK_KINDS = [
  'rates',
  'earn',
  'eu',
  'gold',
  'em',
  'mkt',
  'none',
] as const
export type WeekKind = (typeof WEEK_KINDS)[number]
export const MAX_STORIES = 5

export type WeekStory = {
  kind: WeekKind
  title: string
  line: string
  factKeys: Array<string>
  /** The IDEAS line it opens: a ticker the board had when it was read. */
  move: { ticker: string } | null
}
export type Week = {
  weekHead: string
  weekTake: string
  week: Array<WeekStory>
}

const str = { type: 'string' }
export const WEEK_SCHEMA = {
  weekHead: str,
  weekTake: str,
  week: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...WEEK_KINDS] },
        title: str,
        line: str,
        factKeys: { type: 'array', items: str },
        move: str,
      },
      required: ['kind', 'title', 'line', 'factKeys', 'move'],
      additionalProperties: false,
    },
  },
}

/** The part of the prompt that asks for the week. */
export const WEEK_PROMPT = `- weekHead: the week in one plain line, at most 50 letters (for example
  "Rates held, big tech fell, Europe slowed").
- weekTake: two plain sentences on the week and what touches his money.
- week: 3 to ${MAX_STORIES} stories of this week and the last days, the
  biggest first (2 when the week was quiet). Search for this week's news:
  rate decisions, big company results, Europe, gold, emerging markets and
  elections. kind is rates (the Fed or the ECB), earn (company results),
  eu (Europe), gold, em (emerging markets, Brazil, China), mkt (shares in
  general) or none (a subject with no numbers this week).
  title: what happened, one plain sentence, at most 12 words (for example
  "The Fed kept its rate at 3.75–4.00%").
  line: one or two plain sentences, at most 30 words, with the detail.
  factKeys: exactly 3 keys the app prints as boxes, the market's numbers
  for the story (earn- and res- keys for results); a none story may name
  fewer.
  move: the idea it leads to, as for lines (the text after "idea-"), or
  "" when none fits. Use each idea at most once.`

const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/** The board line a move names, when the board offered it (an idea-
    fact): named as the fact ("idea-XEON.DE"), its ticker, or the ticker
    without its exchange ("XEON"). Null for any other. */
export function matchIdea(raw: unknown, known: ReadonlySet<string>) {
  const t = text(raw, 24)
    .toUpperCase()
    .replace(/^IDEA-/, '')
  if (!t) return null
  const offered = [...known]
    .filter((k) => k.startsWith('idea-'))
    .map((k) => k.slice(5))
  return (
    offered.find((o) => o === t) ??
    offered.find((o) => o.split('.')[0] === t.split('.')[0]) ??
    null
  )
}

/**
 * The model's week, checked: a story of an unknown kind, or naming a key
 * not among the facts, is refused; at most five are kept; a move not on
 * the board, or taken by a story before, is dropped to No action.
 */
export function parseWeek(
  d: Record<string, unknown>,
  keys: ReadonlyArray<string> | ReadonlySet<string>,
): Week & { refused: number } {
  const known = new Set(keys)
  const week: Array<WeekStory> = []
  let refused = 0
  for (const s of Array.isArray(d.week)
    ? (d.week as Array<Record<string, unknown> | null>)
    : []) {
    if (s === null || typeof s !== 'object') continue
    const kind = s.kind as WeekKind
    const factKeys = Array.isArray(s.factKeys)
      ? (s.factKeys as Array<unknown>).filter(
          (k): k is string => typeof k === 'string',
        )
      : []
    if (
      !WEEK_KINDS.includes(kind) ||
      factKeys.some((k) => !known.has(k)) ||
      (kind !== 'none' && factKeys.length === 0)
    ) {
      refused++
      continue
    }
    if (week.length === MAX_STORIES) {
      refused++
      continue
    }
    const raw = s.move
    const hit = matchIdea(
      typeof raw === 'object' && raw !== null
        ? (raw as { ticker?: unknown }).ticker
        : raw,
      known,
    )
    week.push({
      kind,
      title: text(s.title, 90),
      line: text(s.line, 240),
      factKeys: factKeys.slice(0, 3),
      move:
        hit && !week.some((w) => w.move?.ticker === hit)
          ? { ticker: hit }
          : null,
    })
  }
  return {
    week,
    weekHead: text(d.weekHead, 60),
    weekTake: text(d.weekTake, 400),
    refused,
  }
}

/* -------------------------------------------------- before a read */

const MOVE = /^([▲▼=]) ([\d.,]+)%$/
/** A fact's month move as a number, from its "▲ 3.9% · 1M" value. */
function moveOf(f: Fact): number | null {
  const m = f.value
    .split(' · ')
    .map((p) => MOVE.exec(p))
    .find((x) => x !== null)
  if (!m) return null
  const n = Number(m[2].replace(',', ''))
  return m[1] === '▼' ? -n : m[1] === '=' ? 0 : n
}

/** A fact as a story's box: the move first where it has one, the rest
    under it; else the first part. */
export function weekBox(f: Fact) {
  const parts = f.value.split(' · ')
  const at = parts.findIndex((p) => MOVE.test(p))
  const k = at < 0 ? 0 : at
  return {
    value: parts[k],
    note: parts.filter((_, j) => j !== k).join(' · '),
  }
}

const MOVERS: Array<[string, WeekKind]> = [
  ['mkt-gold', 'gold'],
  ['mkt-stoxx', 'eu'],
  ['mkt-btc', 'mkt'],
  ['mkt-eurusd', 'eu'],
]

/**
 * The stories the app can tell from its facts alone, before a read: no
 * model words, no move. The rate decisions (Fed, ECB), the held companies
 * that reported (earn- and res- facts), and the biggest month's mover
 * among gold, Stoxx 600, Bitcoin and EUR/USD.
 */
export function factStories(facts: ReadonlyArray<Fact>): Array<WeekStory> {
  const by = new Map(facts.map((f) => [f.key, f]))
  const out: Array<WeekStory> = []
  const story = (kind: WeekKind, title: string, keys: Array<string>) =>
    out.push({
      kind,
      title,
      line: '',
      factKeys: keys.filter((k) => by.has(k)).slice(0, 3),
      move: null,
    })
  const rate = (k: string) => by.get(k)?.value.split(' · ')[0]

  const fed = rate('fed')
  const ecb = rate('ecb')
  if (fed || ecb)
    story(
      'rates',
      [fed ? `Fed ${fed}` : '', ecb ? `ECB ${ecb}` : '']
        .filter(Boolean)
        .join(' · '),
      ['fed', 'ecb', 'mkt-us10y', 'ecb-next'],
    )

  const reported = facts.filter(
    (f) => f.key.startsWith('earn-') && f.label.includes('REPORTED'),
  )
  const results = facts.filter((f) => f.key.startsWith('res-'))
  const names = new Set(
    [...reported, ...results].map((f) => f.key.split('-').slice(1).join('-')),
  )
  if (names.size > 0)
    story(
      'earn',
      `${names.size} ${names.size === 1 ? 'company' : 'companies'} held reported`,
      [...reported, ...results].map((f) => f.key),
    )

  const movers = MOVERS.flatMap(([key, kind]) => {
    const f = by.get(key)
    const m = f ? moveOf(f) : null
    return f && m !== null ? [{ f, kind, m }] : []
  }).sort((a, b) => Math.abs(b.m) - Math.abs(a.m))
  const top = movers.at(0)
  if (top)
    story(
      top.kind,
      `${top.f.label} ${weekBox(top.f).value} in a month`,
      movers.map((x) => x.f.key),
    )
  return out
}
