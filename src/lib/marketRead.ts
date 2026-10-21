import { euros } from './money'
import { MARKETS, REGIONS, SECTORS } from './insightsMarket'

/* The market read on Insights (I3, 19 Oct; spec
   docs/specs/2026-10-19-insights.md, mockup
   design/treasury-mockup/insights.html, his "go"). His words: "analyze
   inflation, market and give some tip", "tell me overall idea what is the
   best to do", "for not smart person like me I want more like
   explanation".

   The model is handed the room's own numbers as facts, each with a key
   and the label and value the room shows. It writes the words; under a
   line the app prints the facts it named. A line naming a key that was
   not given is refused — a number the model wrote itself is never shown
   as the app's. */

export const MARKET_READ_MODEL = 'claude-sonnet-5-5'
/** The month's ceiling for reads paid with API credits (his Console
    limit is the ceiling behind it). */
export const CAP_USD = 2
/** Sonnet 5.5: $2 in, $10 out per million tokens; web search $10 per
    thousand searches. */
const PRICE = { input: 2, output: 10, search: 0.01 }
/** A Pro read not landed after this long is taken as lost (its page was
    closed); claude -p is stopped at five minutes. */
export const STALE_MS = 6 * 60_000
/** Searches one read may make. */
export const MAX_SEARCHES = 8

export const KINDS = [
  'inflation',
  'rates',
  'market',
  'allocation',
  'dont',
  'nodata',
] as const
export type Kind = (typeof KINDS)[number]
export const TONES = ['good', 'bad', 'warn', 'calm'] as const
export type Tone = (typeof TONES)[number]
export const MOODS = ['calm', 'mixed', 'rough'] as const
export type Mood = (typeof MOODS)[number]

export type Fact = {
  key: string
  label: string
  value: string
  /** Green for a rise, red for a fall; null when the number is a level. */
  tone: 'good' | 'bad' | null
}
export type ReadLine = {
  kind: Kind
  tone: Tone
  badge: string
  title: string
  line: string
  factKeys: Array<string>
  plain: string
}
export type Idea = {
  ticker: string
  name: string
  why: string
  bull: string
  bear: string
  wrong: string
}
export type Source = { site: string; title: string; url: string; day: string }
export type MarketRead = {
  mood: Mood
  lead: string
  rest: string
  summary: string
  kpis: Array<string>
  lines: Array<ReadLine>
  opinion: string
  ideas: Array<Idea>
  sources: Array<Source>
}

/* ---------------------------------------------------------------- facts */

/** What the room has on screen when READ MARKET is pressed (I1's 1M answer). */
export type MarketNumbers = {
  rates: Array<{
    id: 'us-cpi' | 'eu-hicp' | 'fed' | 'ecb'
    reached: boolean
    value: number | null
    upper: number | null
    month: string | null
    prev: number | null
    prevMonth: string | null
    since: string | null
    next: string | null
  }>
  markets: Array<{ id: string; move: { price: number; change: number } | null }>
  sectors: Array<{ id: string; change: number | null }>
  companies: Array<{ symbol: string; change: number | null }>
  regions: Array<{ id: string; change: number | null }>
}
export type Holding = { symbol: string; name: string; valueEur: number | null }

const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')
const monthOf = (ym: string | null) =>
  ym ? (MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym) : ''
const dayOf = (d: string) => `${Number(d.slice(8, 10))} ${monthOf(d)}`
const pct = (n: number) => `${n.toFixed(1)}%`
const move = (n: number) =>
  `${n > 0 ? '▲' : n < 0 ? '▼' : '='} ${Math.abs(n).toFixed(1)}%`
const tone = (n: number) => (n > 0 ? 'good' : n < 0 ? 'bad' : null)

/**
 * The room's numbers as facts: the four rates, the eight markets over the
 * month, the sectors, the thirty companies, the regions, and the
 * positions with their share of the valued total. Nothing not reached.
 */
export function marketFacts(
  m: MarketNumbers,
  holdings: Array<Holding>,
): Array<Fact> {
  const facts: Array<Fact> = []
  const add = (
    key: string,
    label: string,
    value: string,
    t: Fact['tone'] = null,
  ) => facts.push({ key, label, value, tone: t })

  for (const r of m.rates) {
    if (!r.reached || r.value === null) continue
    if (r.id === 'us-cpi' || r.id === 'eu-hicp') {
      const name = r.id === 'us-cpi' ? 'US CPI' : 'EURO CPI'
      add(r.id, `${name} ${monthOf(r.month)}`, pct(r.value))
      if (r.prev !== null)
        add(`${r.id}-was`, `${name} ${monthOf(r.prevMonth)}`, pct(r.prev))
    } else {
      const name = r.id === 'fed' ? 'FED' : 'ECB'
      const v =
        r.upper !== null
          ? `${r.value.toFixed(2)}–${r.upper.toFixed(2)}%`
          : `${r.value.toFixed(2)}%`
      add(r.id, name, r.since ? `${v} · SINCE ${dayOf(r.since)}` : v)
      if (r.next) add(`${r.id}-next`, `NEXT ${name}`, dayOf(r.next))
    }
  }
  for (const k of m.markets) {
    const def = MARKETS.find((x) => x.id === k.id)
    if (!def || !k.move) continue
    const v =
      def.unit === 'yield'
        ? `${k.move.price.toFixed(2)}% · ${k.move.change > 0 ? '▲' : '▼'} ${Math.abs(k.move.change).toFixed(2)} PTS`
        : `${move(k.move.change)} · 1M`
    add(`mkt-${k.id}`, def.name, v, tone(k.move.change))
  }
  for (const s of m.sectors) {
    const def = SECTORS.find((x) => x.id === s.id)
    if (!def || s.change === null) continue
    add(`sec-${s.id}`, def.name, `${move(s.change)} · 1M`, tone(s.change))
  }
  for (const c of m.companies) {
    if (c.change === null) continue
    add(`co-${c.symbol}`, c.symbol, `${move(c.change)} · 1M`, tone(c.change))
  }
  for (const r of m.regions) {
    const def = REGIONS.find((x) => x.id === r.id)
    if (!def || r.change === null) continue
    add(`reg-${r.id}`, def.name, `${move(r.change)} · 1M`, tone(r.change))
  }

  const valued = holdings.filter((h) => h.valueEur !== null && h.valueEur > 0)
  const total = valued.reduce((s, h) => s + (h.valueEur ?? 0), 0)
  if (total > 0) {
    add(
      'mine',
      'MINE',
      `${euros(Math.round(total))} · ${valued.length} ${valued.length === 1 ? 'POSITION' : 'POSITIONS'}`,
    )
    for (const h of [...valued].sort(
      (a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0),
    )) {
      const v = h.valueEur ?? 0
      add(
        `pos-${h.symbol}`,
        h.symbol,
        `${euros(Math.round(v))} · ${pct((v / total) * 100)}`,
      )
    }
  }
  return facts
}

/** The facts a line named, as the room shows them; unknown keys left out. */
export function factsFor(keys: Array<string>, facts: Array<Fact>) {
  return keys
    .map((k) => facts.find((f) => f.key === k))
    .filter((f): f is Fact => f !== undefined)
}

/* --------------------------------------------------------------- schema */

const str = { type: 'string' }
const strings = { type: 'array', items: str }
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const MARKET_READ_SCHEMA = object({
  mood: { type: 'string', enum: [...MOODS] },
  lead: str,
  rest: str,
  summary: str,
  kpis: strings,
  lines: {
    type: 'array',
    items: object({
      kind: { type: 'string', enum: [...KINDS] },
      tone: { type: 'string', enum: [...TONES] },
      badge: str,
      title: str,
      line: str,
      factKeys: strings,
      plain: str,
    }),
  },
  opinion: str,
  ideas: {
    type: 'array',
    items: object({
      ticker: str,
      name: str,
      why: str,
      bull: str,
      bear: str,
      wrong: str,
    }),
  },
  sources: {
    type: 'array',
    items: object({ site: str, title: str, url: str, day: str }),
  },
})

/* --------------------------------------------------------------- prompt */

/** What the model is asked; `today` as YYYY-MM-DD. */
export function marketReadPrompt(facts: Array<Fact>, today: string): string {
  return `You write the monthly market read for Artem's personal finance app.
He is not a finance expert: "for not smart person like me I want more like
explanation". Talk to him as "you". Today is ${today}.

The facts below are the numbers on his screen, each with a key. Search the
web for this month's news on inflation, the Fed, the ECB and the markets
(at most ${MAX_SEARCHES} searches), then read what it means for his money.

Rules:
- Write a number only if it is in the facts or in a source you link.
- Never a sell, never a euro amount to put in, never a score. This is
  research, not advice.
- If there is nothing new on a subject, write a line of kind "nodata"
  rather than guess.

Facts (key: label value):
${facts.map((f) => `- ${f.key}: ${f.label} ${f.value}`).join('\n')}

Answer with:
- mood: calm (a clear, easy month), mixed (no clear trend) or rough.
- lead: the headline's first part, 1–3 words (for example "Rates falling").
- rest: the headline's second part, 1–3 words (for example "shares up").
  lead and rest together at most 40 letters.
- summary: exactly two plain sentences. Wrap the 2–3 most important words
  in **double stars**.
- kpis: 3 or 4 fact keys to show as the month's numbers, the most telling
  first; include "mine" when it is in the facts.
- lines: 3 to 5 lines. kind is inflation, rates, market, allocation,
  dont (something not to do this month) or nodata. tone is good, bad,
  warn or calm. badge: 1–2 words in capitals (for example "FED CUT",
  "WATCH"). title: at most 6 words. line: one sentence, at most 16 words.
  factKeys: 1–3 keys from the facts that the line is about — their numbers
  are printed under the line by the app, so the line need not repeat them.
  plain: 2–3 easy sentences explaining what it means for his money, with
  **double stars** on the key words.
- opinion: two sentences on where his money sits — his positions and
  the alloc- lines (his share against the world's) against the market;
  "" when there are no positions in the facts.
- ideas: 0 to 4 Yahoo Finance tickers he does not own (no pos- key), each
  with name, why (at most 8 words), bull, bear and wrong (when the idea
  would be wrong), each one short sentence. None when nothing fits.
- sources: the pages you used, each with site (domain), title, url and day
  (YYYY-MM-DD).`
}

/* ---------------------------------------------------------------- check */

const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/**
 * The model's answer, checked. A line that names a key not among the
 * facts is refused (dropped), as is one of an unknown kind; kpis keep only
 * known keys; an idea on a ticker he owns is dropped. Fewer than three
 * lines left is a failed read.
 */
export function parseMarketRead(
  raw: unknown,
  keys: Array<string>,
):
  | { ok: true; read: MarketRead; refused: number }
  | { ok: false; error: string } {
  let d: Record<string, unknown> | null
  try {
    d = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<
      string,
      unknown
    > | null
  } catch {
    return { ok: false, error: 'BROKEN SHAPE' }
  }
  if (d === null || typeof d !== 'object' || !Array.isArray(d.lines))
    return { ok: false, error: 'BROKEN SHAPE' }
  const known = new Set(keys)
  let refused = 0
  const lines: Array<ReadLine> = []
  for (const l of d.lines as Array<Record<string, unknown>>) {
    const kind = l.kind as Kind
    const factKeys = Array.isArray(l.factKeys)
      ? (l.factKeys as Array<unknown>).filter(
          (k): k is string => typeof k === 'string',
        )
      : []
    if (
      !KINDS.includes(kind) ||
      factKeys.some((k) => !known.has(k)) ||
      (kind !== 'nodata' && factKeys.length === 0)
    ) {
      refused++
      continue
    }
    lines.push({
      kind,
      tone: TONES.includes(l.tone as Tone) ? (l.tone as Tone) : 'calm',
      badge: text(l.badge, 24).toUpperCase(),
      title: text(l.title, 60),
      line: text(l.line, 200),
      factKeys: factKeys.slice(0, 3),
      plain: text(l.plain, 600),
    })
  }
  if (lines.length < 3) return { ok: false, error: 'TOO FEW LINES' }

  const owned = new Set(
    keys.filter((k) => k.startsWith('pos-')).map((k) => k.slice(4)),
  )
  const ideas: Array<Idea> = []
  for (const i of Array.isArray(d.ideas)
    ? (d.ideas as Array<Record<string, unknown>>)
    : []) {
    const ticker = text(i.ticker, 16).toUpperCase()
    if (!/^[A-Z0-9.^=-]{1,16}$/.test(ticker) || owned.has(ticker)) continue
    ideas.push({
      ticker,
      name: text(i.name, 60),
      why: text(i.why, 80),
      bull: text(i.bull, 160),
      bear: text(i.bear, 160),
      wrong: text(i.wrong, 160),
    })
  }
  const sources: Array<Source> = []
  for (const s of Array.isArray(d.sources)
    ? (d.sources as Array<Record<string, unknown>>)
    : []) {
    const url = text(s.url, 400)
    if (!/^https:\/\//.test(url)) continue
    sources.push({
      site: text(s.site, 60),
      title: text(s.title, 120),
      url,
      day: /^\d{4}-\d{2}-\d{2}$/.test(text(s.day, 10)) ? text(s.day, 10) : '',
    })
  }
  return {
    ok: true,
    refused,
    read: {
      mood: MOODS.includes(d.mood as Mood) ? (d.mood as Mood) : 'mixed',
      lead: text(d.lead, 30),
      rest: text(d.rest, 30),
      summary: text(d.summary, 400),
      kpis: (Array.isArray(d.kpis) ? (d.kpis as Array<unknown>) : [])
        .filter((k): k is string => typeof k === 'string' && known.has(k))
        .slice(0, 4),
      lines: lines.slice(0, 5),
      opinion: text(d.opinion, 400),
      ideas: ideas.slice(0, 4),
      sources: sources.slice(0, 12),
    },
  }
}

/* ----------------------------------------------------------------- cost */

export type Usage = { input: number; output: number; searches: number }

/** What a response cost in dollars, from its usage, to the tenth of a cent. */
export function readCost(u: Usage): number {
  const usd =
    (u.input * PRICE.input + u.output * PRICE.output) / 1_000_000 +
    u.searches * PRICE.search
  return Math.ceil(usd * 1000) / 1000
}

/** The month a read belongs to, "2026-10". */
export const monthKey = (at: number) => new Date(at).toISOString().slice(0, 7)

/** The first day of the next month, "1 NOV". */
export function nextMonthWord(month: string): string {
  const m = Number(month.slice(5, 7))
  return `1 ${MONTHS[m % 12]}`
}
