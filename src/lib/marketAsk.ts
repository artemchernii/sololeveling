import { KINDS } from './marketRead'
import type { Fact, MarketRead, Source } from './marketRead'

/* ASK on Insights (I4, 21 Oct; spec docs/specs/2026-10-19-insights.md,
   mockup design/treasury-mockup/ask.html, his "go"). A question is
   answered by the same model as the market read, on the same facts and
   the read itself; 🌐 lets it search the web for that one question.
   Like a read line, the answer names fact keys and the app prints their
   numbers under it; a key not given is dropped, never shown. Nothing of
   it is stored — the thread lives on the page. */

export const ASK_KINDS = [...KINDS, 'gold', 'ideas'] as const
export type AskKind = (typeof ASK_KINDS)[number]
/** Searches one 🌐 question may make. */
export const MAX_ASK_SEARCHES = 3
export const MAX_QUESTION = 400

export type AskAnswer = {
  kind: AskKind
  answer: string
  factKeys: Array<string>
  sources: Array<Source>
}
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
})

/** What the model is asked; `today` as YYYY-MM-DD. */
export function askPrompt(
  facts: Array<Fact>,
  read: ReadContext | null,
  question: string,
  web: boolean,
  today: string,
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
The facts below are the numbers on his screen, each with a key.
${web ? `You may search the web (at most ${MAX_ASK_SEARCHES} searches) and must list the pages you used.` : 'Do not search the web; answer from the facts and the read only, and leave sources empty.'}

Rules:
- Write a number only if it is in the facts${web ? ' or in a source you list' : ''}.
- Never a sell, never a euro amount to put in, never a score. This is
  research, not advice.
- If the facts${web ? ' and the web' : ''} cannot answer it, say so plainly with kind "nodata"
  rather than guess.

Facts (key: label value):
${facts.map((f) => `- ${f.key}: ${f.label} ${f.value}`).join('\n')}

Question: ${question.slice(0, MAX_QUESTION)}

Answer with:
- kind: what the question is about — inflation, rates, market,
  allocation, gold, ideas, dont (something not to do) or nodata.
- answer: 2–4 plain sentences, at most 90 words. Wrap the 2–3 most
  important words in **double stars**.
- factKeys: 0–3 keys from the facts the answer is about; the app prints
  their numbers under it, so the answer need not repeat them.
- sources: ${web ? 'the pages you used, each with site (domain), title, url and day (YYYY-MM-DD)' : 'empty'}.`
}

const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/**
 * The model's answer, checked. A fact key not given is dropped (its chip
 * never shows), an unknown kind reads as nodata, a source that is not an
 * https link is dropped. No words is a failed answer.
 */
export function parseAsk(
  raw: unknown,
  keys: Array<string>,
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
  return {
    ok: true,
    answer: { kind, answer, factKeys, sources: sources.slice(0, 6) },
  }
}
