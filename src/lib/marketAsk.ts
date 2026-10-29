import { KINDS } from './marketRead'
import type { Fact, Idea, MarketRead, Source } from './marketRead'

/* ASK on Insights (I4, 21 Oct; spec docs/specs/2026-10-19-insights.md,
   mockup design/treasury-mockup/ask.html, his "go"). A question is
   answered by the same model as the market read, on the same facts and
   the read itself; 🌐 lets it search the web for that one question.
   Like a read line, the answer names fact keys and the app prints their
   numbers under it; a key not given is dropped, never shown. Nothing of
   it is stored — the thread lives on the page. Asked for ideas, it may
   name up to three tickers he does not own and NEXT does not show, each
   with a why, a bull, a bear and a wrong-if (21 Oct, "ideas in ASK");
   every number on their cards is fetched by the app. */

export const ASK_KINDS = [...KINDS, 'gold', 'ideas'] as const
export type AskKind = (typeof ASK_KINDS)[number]
/** Ideas one answer may name. */
export const MAX_ASK_IDEAS = 3
/** Searches one 🌐 question may make. */
export const MAX_ASK_SEARCHES = 3
export const MAX_QUESTION = 400

/** A chart the app draws from fetched closes (IDEAS ASK, 29 Oct). */
export const CHART_RANGES = ['1mo', '6mo', '1y'] as const
export type ChartRange = (typeof CHART_RANGES)[number]
export type AskChart = { tickers: Array<string>; range: ChartRange }
/** A small table of the model's, its numbers from facts or its sources. */
export type AskTable = { head: Array<string>; rows: Array<Array<string>> }

export type AskAnswer = {
  kind: AskKind
  answer: string
  factKeys: Array<string>
  sources: Array<Source>
  ideas: Array<Idea>
  charts: Array<AskChart>
  tables: Array<AskTable>
}

/** The IDEAS line a ✦ opened the question on (29 Oct). */
export type LineContext = {
  ticker: string
  part: string
  call: string
  eur: number
  why: string
}

/** A dropped screenshot as a data URL: its kind and bytes, or null when
    it is not an image the model reads or is over 5 MB. Never stored. */
export const SHOT_MAX = 5_000_000
export function shotOf(
  dataUrl: string,
): { mediaType: string; ext: string; data: string } | null {
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl,
  )
  if (!m || m[2].length * 0.75 > SHOT_MAX) return null
  return {
    mediaType: `image/${m[1]}`,
    ext: m[1] === 'jpeg' ? 'jpg' : m[1],
    data: m[2],
  }
}
/** An earlier question in the thread and what was answered. */
export type Said = { q: string; a: string }
/** Earlier turns sent with a question. */
export const MAX_HISTORY = 6

/** What the model is told of the month's read, when there is one. */
export type ReadContext = Pick<
  MarketRead,
  'lead' | 'rest' | 'summary' | 'lines' | 'opinion' | 'ideas'
>

/** The four questions offered before the first one (mockup, his "go"). */
export const SUGGESTED: Array<{ e: string; kind: string; q: string }> = [
  { e: '⚖️', kind: 'ALLOCATION', q: 'Explain my allocation' },
  { e: '🥇', kind: 'GOLD', q: 'Is gold still a hedge?' },
  { e: '🏛️', kind: 'RATES', q: "What if the Fed doesn't cut?" },
  { e: '💡', kind: 'IDEAS', q: 'Why these ideas?' },
]

const str = { type: 'string' }
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const ASK_SCHEMA = object({
  kind: { type: 'string', enum: [...ASK_KINDS] },
  answer: str,
  factKeys: { type: 'array', items: str },
  sources: {
    type: 'array',
    items: object({ site: str, title: str, url: str, day: str }),
  },
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
  charts: {
    type: 'array',
    items: object({
      tickers: { type: 'array', items: str },
      range: { type: 'string', enum: [...CHART_RANGES] },
    }),
  },
  tables: {
    type: 'array',
    items: object({
      head: { type: 'array', items: str },
      rows: { type: 'array', items: { type: 'array', items: str } },
    }),
  },
})

/** What the model is asked; `today` as YYYY-MM-DD. */
export function askPrompt(
  facts: Array<Fact>,
  read: ReadContext | null,
  question: string,
  web: boolean,
  today: string,
  /** The thread so far, oldest first: a follow-up reads on from it. */
  history: Array<Said> = [],
  /** IDEAS (29 Oct): the line its ✦ opened on, and a screenshot — a
      file Claude Code reads on his Mac, or 'attached' to the message. */
  more: { line: LineContext | null; shot: string | null } = {
    line: null,
    shot: null,
  },
): string {
  const told = read
    ? `This month's read, which he has on screen:
- headline: ${read.lead} · ${read.rest}
- summary: ${read.summary}
${read.lines.map((l) => `- ${l.kind} (${l.badge}): ${l.title}. ${l.line}`).join('\n')}
${read.opinion ? `- on his money: ${read.opinion}\n` : ''}${read.ideas.length ? `- ideas: ${read.ideas.map((i) => `${i.ticker} (${i.why})`).join('; ')}\n` : ''}`
    : 'There is no market read this month yet.\n'
  return `You answer Artem's question in his personal finance app, beside
the monthly market read. He is not a finance expert: "for not smart person
like me I want more like explanation". Talk to him as "you". Today is
${today}.

${told}
The facts below are the numbers on his screen, each with a key. They
are only what the app fetched; they say nothing about why a price moved.
An earn- fact is a held company's results day: one reported in the last
7 days, with the close before it and the price now, or one coming in 14.
When a question is about a company that has one, start from it.
${
  web
    ? `Search the web before you answer (at most ${MAX_ASK_SEARCHES} searches): look for
news from the last 14 days first — earnings and results, guidance,
analyst moves, central bank words — for the companies, funds or topics
in the question. Your own knowledge stops before today, so a recent event
you do not know of may well have happened: search for it rather than
doubt it. List the pages you used.`
    : `Do not search the web; answer from the facts and the read only, and
leave sources empty. When the question needs recent news (why something
moved, earnings, what someone said), say plainly that it needs the 🌐
switch, with kind "nodata", rather than guess at a cause.`
}
${
  history.length
    ? `
Earlier in this conversation (his question, then the answer):
${history
  .slice(-MAX_HISTORY)
  .map((h) => `- Q: ${h.q.slice(0, MAX_QUESTION)}\n  A: ${h.a.slice(0, 900)}`)
  .join('\n')}
The question below may follow on from these.
`
    : ''
}

${
  more.line
    ? `He asks about this line of his IDEAS board: ${more.line.ticker} in ${more.line.part.toUpperCase()}, the call ${more.line.call.toUpperCase()}${more.line.eur > 0 ? ` with €${more.line.eur}` : ''}, because: ${more.line.why}
`
    : ''
}${
    more.shot
      ? `He dropped a screenshot with the question${more.shot === 'attached' ? ' (attached)' : `: read the image file ${more.shot}`}. Read what is on it (rows, prices, a chart) and answer from it.
`
      : ''
  }
Rules:
- Write a number only if it is in the facts${web ? ' or in a source you list' : ''}${more.shot ? ' or on the screenshot' : ''}.
- Never a sell, never a score. A € amount only as his IDEAS plan has it.
- If the facts${web ? ' and the web' : ''} cannot answer it, say so plainly with kind "nodata"
  rather than guess.

Facts (key: label value):
${facts.map((f) => `- ${f.key}: ${f.label} ${f.value}`).join('\n')}

Question: ${question.slice(0, MAX_QUESTION)}

Answer with:
- kind: what the question is about — inflation, rates, market,
  allocation, gold, ideas, dont (something not to do) or nodata.
- answer: 2–5 plain sentences, at most 120 words. Wrap the 2–3 most
  important words in **double stars**.
- factKeys: 0–3 keys from the facts the answer is about; the app prints
  their numbers under it, so the answer need not repeat them.
- sources: ${web ? 'the pages you used, each with site (domain), title, url and day (YYYY-MM-DD)' : 'empty'}.
- ideas: only when he asks for ideas (kind "ideas"), else empty. 0 to
  ${MAX_ASK_IDEAS} Yahoo Finance tickers he does not own (no pos- key) and not among
  the read's ideas, each with name, why (at most 8 words), bull, bear and
  wrong (when the idea would be wrong), each one short sentence. The app
  fetches their prices; do not write any.
- charts: 0–1. When a price over time helps (a drop, two tickers side by
  side), 1–3 Yahoo tickers and a range (1mo, 6mo or 1y); the app fetches
  and draws it. No numbers of yours.
- tables: 0–1. A small comparison (2–5 columns, 2–6 rows, first row the
  header), each cell short; a number only from the facts or a source.`
}

const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/**
 * The model's answer, checked. A fact key not given is dropped (its chip
 * never shows), an unknown kind reads as nodata, a source that is not an
 * https link is dropped, an idea on a ticker he owns or NEXT shows is
 * dropped, and ideas stand only on an answer of kind ideas. No words is a
 * failed answer.
 */
export function parseAsk(
  raw: unknown,
  keys: Array<string>,
  /** Tickers NEXT already shows: not named again. */
  skip: Array<string> = [],
): { ok: true; answer: AskAnswer } | { ok: false; error: string } {
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
  const answer = text(d.answer, 900)
  if (answer === '') return { ok: false, error: 'NOTHING BACK' }
  const known = new Set(keys)
  const factKeys = (Array.isArray(d.factKeys) ? d.factKeys : [])
    .filter((k): k is string => typeof k === 'string' && known.has(k))
    .slice(0, 3)
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
  const kind = ASK_KINDS.includes(d.kind as AskKind)
    ? (d.kind as AskKind)
    : 'nodata'
  const away = new Set([
    ...keys.filter((k) => k.startsWith('pos-')).map((k) => k.slice(4)),
    ...skip.map((t) => t.toUpperCase()),
  ])
  const ideas: Array<Idea> = []
  for (const i of kind === 'ideas' && Array.isArray(d.ideas)
    ? (d.ideas as Array<Record<string, unknown>>)
    : []) {
    const ticker = text(i.ticker, 16).toUpperCase()
    if (!/^[A-Z0-9.^=-]{1,16}$/.test(ticker) || away.has(ticker)) continue
    if (ideas.some((x) => x.ticker === ticker)) continue
    ideas.push({
      ticker,
      name: text(i.name, 60),
      why: text(i.why, 80),
      bull: text(i.bull, 160),
      bear: text(i.bear, 160),
      wrong: text(i.wrong, 160),
    })
  }
  const charts: Array<AskChart> = []
  for (const c of Array.isArray(d.charts)
    ? (d.charts as Array<Record<string, unknown>>)
    : []) {
    const tickers = (Array.isArray(c.tickers) ? c.tickers : [])
      .map((t) => text(t, 16).toUpperCase())
      .filter((t) => /^[A-Z0-9.^=-]{1,16}$/.test(t))
      .slice(0, 3)
    const range = CHART_RANGES.find((r) => r === c.range) ?? '6mo'
    if (tickers.length > 0) charts.push({ tickers, range })
  }
  const tables: Array<AskTable> = []
  for (const t of Array.isArray(d.tables)
    ? (d.tables as Array<Record<string, unknown>>)
    : []) {
    const head = (Array.isArray(t.head) ? t.head : [])
      .map((x) => text(x, 24))
      .slice(0, 5)
    const rows = (Array.isArray(t.rows) ? t.rows : [])
      .filter(Array.isArray)
      .map((r) =>
        (r as Array<unknown>).map((x) => text(x, 24)).slice(0, head.length),
      )
      .filter((r) => r.length === head.length)
      .slice(0, 6)
    if (head.length >= 2 && rows.length > 0) tables.push({ head, rows })
  }
  return {
    ok: true,
    answer: {
      kind,
      answer,
      factKeys,
      sources: sources.slice(0, 6),
      ideas: ideas.slice(0, MAX_ASK_IDEAS),
      charts: charts.slice(0, 1),
      tables: tables.slice(0, 1),
    },
  }
}
