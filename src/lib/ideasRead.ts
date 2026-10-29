import type { Fact, Source } from './marketRead'

/* IDEAS, the board's read (29 Oct; spec docs/specs/2026-10-29-ideas-board.md,
   his words: "give ideas to ADD some stocks, to add gold or buy BONDS",
   "more of explanation why you suggest those tickers and why that much
   money"). The model's plan for his idle cash in four parts — KEEP,
   PROTECT, ADD TO MINE, NEW — each line a call, a € amount, a WHY and an
   € reason in words, and its NUMBERS. The calls and amounts are the
   model's plan, shown with who wrote it and never counted by the app.
   Every price, % and signal on a line is the app's own (fetched); a
   NUMBERS row is a fact key the app prints, or a claim with its source.
   Checked here before it is stored; one row per READ AGAIN. */

export const PARTS = ['keep', 'protect', 'add', 'new'] as const
export type Part = (typeof PARTS)[number]
export const LINE_PARTS = ['add', 'protect', 'new'] as const
export type LinePart = (typeof LINE_PARTS)[number]
export const CALLS = ['add', 'hold', 'wait'] as const
export type BoardCall = (typeof CALLS)[number]
/** The allocation line a NEW ticker fills (src/lib/insightsMine ALLOC). */
export const AREAS = [
  'tech',
  'us',
  'europe',
  'world',
  'health',
  'gold',
  'none',
] as const
export type Area = (typeof AREAS)[number]

/** A NUMBERS row: a fact the app prints (key), or a claim with its page. */
export type NumberRow = { key: string; text: string; url: string }
export type BoardLine = {
  part: LinePart
  ticker: string
  name: string
  call: BoardCall
  eur: number
  area: Area
  why: string
  eurWhy: string
  numbers: Array<NumberRow>
}
export type Board = {
  take: string
  parts: Record<Part, number>
  lines: Array<BoardLine>
  sources: Array<Source>
}

export const MIN_LINES = 3
export const MAX_LINES = 14
/** How far the parts may sit from the idle cash: rounding, not a gap. */
export const SUM_SLACK = 5

const str = { type: 'string' }
const int = { type: 'integer' }
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const IDEAS_SCHEMA = object({
  take: str,
  parts: object({ keep: int, protect: int, add: int, new: int }),
  lines: {
    type: 'array',
    items: object({
      part: { type: 'string', enum: [...LINE_PARTS] },
      ticker: str,
      name: str,
      call: { type: 'string', enum: [...CALLS] },
      eur: int,
      area: { type: 'string', enum: [...AREAS] },
      why: str,
      eurWhy: str,
      numbers: {
        type: 'array',
        items: object({ key: str, text: str, url: str }),
      },
    }),
  },
  sources: {
    type: 'array',
    items: object({ site: str, title: str, url: str, day: str }),
  },
})

/** The tickers he holds, from the facts' `pos-` keys. */
export const heldOf = (facts: Array<Fact>) =>
  new Set(
    facts
      .filter((f) => f.key.startsWith('pos-'))
      .map((f) => f.key.slice(4).toUpperCase()),
  )

/** What the model is asked; `today` as YYYY-MM-DD, `idle` in euros. */
export function ideasPrompt(
  facts: Array<Fact>,
  idle: number,
  today: string,
): string {
  const held = [...heldOf(facts)]
  return `You are Artem's assistant in his personal finance app. He opens
IDEAS to know what to do with money that sits idle. His words: "Like I
need you to be my assistant", "you always tell me BUY S&P500 etf", "HOW TO
INVEST SOME PART SAFELY BUT SOME PART TO MAKE MONEY", "Ideas need context
of my stocks. Give ideas to ADD some stocks, to add gold or buy BONDS",
"more of explanation why you suggest those tickers and why that much
money". He is not a finance expert; talk to him as "you". He lives in
Portugal and spends in euros. Today is ${today}.

The facts below are the numbers on his screen, each with a key: his
cash, his spending, his holdings (pos-), each held or watched ticker's
fetched price and signals (tk-), his allocation against the world,
results days (earn-), the market strip (mk-) and today's movers (mv-).

Search the web first (news of the last 14 days on his biggest holdings,
on today's big movers he holds, on euro rates and bond yields, on gold).
Your own knowledge stops before today: search rather than guess.

Make a plan for his idle cash, €${idle}, in four parts:
- keep: months of spending that stay as cash (say how many months).
- protect: gold, short government bonds, funds that pay the ECB rate
  (e.g. XEON.DE), US T-bills (e.g. IB01.L) — safety, with what each pays.
- add: more of what he already holds. ONLY tickers among: ${held.join(', ') || 'none'}.
- new: 2–4 tickers he does NOT hold, chosen for what MINE misses
  (regions, sectors) against the world.

Rules:
- keep + protect + add + new = ${idle} exactly (whole euros).
- In each of protect, add and new, the lines' eur add up to that part.
- call: add (put money in now), hold (keep what is there, eur 0), or wait
  (a staged amount for later, with the price or signal to wait for in
  eurWhy). Never a sell.
- Think across stocks, gold, bonds, cash that pays and regions. Never only
  "buy an index fund". Size by % of MINE: one company above ~7% of MINE
  is a bet on one name. Stage big amounts over weeks or months.
- 6–12 lines in all. Yahoo Finance tickers only (e.g. XEON.DE, VEUR.AS).
- take: two short sentences, at most 30 words in all, a real opinion
  about his money. Wrap the first sentence in **double stars**.
- area: for a NEW line, the allocation line it fills (the alloc- facts:
  tech, us, europe, world, health, gold), else none.
- why: ONE sentence, at most 16 words: the fact first, then what it
  means for him. Example: "Fell 12.6% on results; AI spending, not sales,
  is the worry."
- eurWhy: at most 12 words, a fragment is fine. Example: "2 buys, 3
  weeks apart · to 6.7% of MINE."
- How to write: plain words a non-expert reads in one go. No hedging
  (may, might, could, likely, deeply, significantly), no filler (it is
  worth noting, overall, in addition), no lists of reasons joined by
  "and … but … so". Numbers as digits.
- numbers: 2–4 rows. A row is either a fact of the list (key set, text
  and url empty — the app prints it) or a claim you found (key empty,
  text short with its number, url the https page it came from).
- Write a number in take, why or eurWhy only if it is in the facts, the
  plan's own euros, or a page you list in sources.
- sources: the pages you used, each with site (domain), title, url and
  day (YYYY-MM-DD).

Facts (key: label value):
${facts.map((f) => `- ${f.key}: ${f.label} ${f.value}`).join('\n')}`
}

const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''
const whole = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null
const TICKER = /^[A-Z0-9.^=-]{1,16}$/

/**
 * The model's board, checked. Refused: no take, parts that do not add up
 * to the idle cash, a part whose lines do not add up to it, too few lines.
 * Dropped: a line with a bad ticker, an ADD TO MINE line on a ticker he
 * does not hold, a NEW line on one he does, a NUMBERS row with a key not
 * given or a claim without an https page. A hold line puts in €0.
 */
export function parseIdeasRead(
  raw: unknown,
  facts: Array<Fact>,
  idle: number,
): { ok: true; board: Board } | { ok: false; error: string } {
  let d: Record<string, unknown> | null
  try {
    d = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<
      string,
      unknown
    > | null
  } catch {
    return { ok: false, error: 'BROKEN SHAPE' }
  }
  if (d === null || typeof d !== 'object')
    return { ok: false, error: 'BROKEN SHAPE' }
  const take = text(d.take, 600)
  if (take === '') return { ok: false, error: 'NOTHING BACK' }
  const p = (d.parts ?? {}) as Record<string, unknown>
  const parts = {} as Record<Part, number>
  for (const k of PARTS) {
    const n = whole(p[k])
    if (n === null) return { ok: false, error: 'BROKEN SHAPE' }
    parts[k] = n
  }
  const sum = PARTS.reduce((s, k) => s + parts[k], 0)
  if (Math.abs(sum - Math.round(idle)) > SUM_SLACK)
    return { ok: false, error: 'PARTS ≠ CASH' }

  const keys = new Set(facts.map((f) => f.key))
  const held = heldOf(facts)
  const lines: Array<BoardLine> = []
  for (const l of Array.isArray(d.lines)
    ? (d.lines as Array<Record<string, unknown>>)
    : []) {
    const part = LINE_PARTS.find((x) => x === l.part)
    const call = CALLS.find((x) => x === l.call)
    const ticker = text(l.ticker, 16).toUpperCase()
    const eur = whole(l.eur)
    if (!part || !call || eur === null || !TICKER.test(ticker)) continue
    if (part === 'add' && !held.has(ticker)) continue
    if (part === 'new' && held.has(ticker)) continue
    if (lines.some((x) => x.ticker === ticker)) continue
    const numbers: Array<NumberRow> = []
    for (const n of Array.isArray(l.numbers)
      ? (l.numbers as Array<Record<string, unknown>>)
      : []) {
      const key = text(n.key, 60)
      const url = text(n.url, 400)
      const said = text(n.text, 140)
      if (key !== '' && keys.has(key)) numbers.push({ key, text: '', url: '' })
      else if (key === '' && said !== '' && /^https:\/\//.test(url))
        numbers.push({ key: '', text: said, url })
    }
    lines.push({
      part,
      ticker,
      name: text(l.name, 60) || ticker,
      call,
      eur: call === 'hold' ? 0 : eur,
      area: AREAS.find((x) => x === l.area) ?? 'none',
      why: text(l.why, 400),
      eurWhy: text(l.eurWhy, 300),
      numbers: numbers.slice(0, 5),
    })
  }
  if (lines.length < MIN_LINES) return { ok: false, error: 'TOO FEW LINES' }
  for (const k of LINE_PARTS) {
    const ls = lines.filter((x) => x.part === k)
    const got = ls.reduce((s, x) => s + x.eur, 0)
    if (ls.length > 0 && Math.abs(got - parts[k]) > SUM_SLACK)
      return { ok: false, error: `${k.toUpperCase()} LINES ≠ PART` }
  }
  const sources: Array<Source> = []
  for (const s of Array.isArray(d.sources)
    ? (d.sources as Array<Record<string, unknown>>)
    : []) {
    const url = text(s.url, 400)
    if (!/^https:\/\//.test(url)) continue
    const day = text(s.day, 10)
    sources.push({
      site: text(s.site, 60),
      title: text(s.title, 120),
      url,
      day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '',
    })
  }
  return {
    ok: true,
    board: {
      take,
      parts,
      lines: lines.slice(0, MAX_LINES),
      sources: sources.slice(0, 8),
    },
  }
}

/** The plan as ASK is told it: the parts and each line in a few words. */
export function planText(b: Board | null | undefined): string | null {
  if (!b) return null
  const e = (n: number) => `€${Math.round(n)}`
  return [
    `Take: ${b.take.replace(/\*\*/g, '')}`,
    `Parts: KEEP ${e(b.parts.keep)}, PROTECT ${e(b.parts.protect)}, ADD TO MINE ${e(b.parts.add)}, NEW ${e(b.parts.new)}`,
    ...b.lines.map(
      (l) =>
        `- ${l.part.toUpperCase()} ${l.ticker} (${l.name}): ${l.call.toUpperCase()} ${e(l.eur)} — ${l.why} ${l.eurWhy}`,
    ),
  ]
    .join('\n')
    .slice(0, 4000)
}
