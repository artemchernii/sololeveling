import type { Idea, Source } from './marketRead'

/* COPY on an ASK answer (22 Oct, docs/specs/2026-10-21-copy-answer.md;
   mockup design/treasury-mockup/copy-answer.html, his "go"). Answers are
   never stored, so one press puts a good one on the clipboard as
   markdown: **bold** stays bold in Notes or Notion and reads plain
   anywhere else. What the card shows, in its order; an empty section is
   left out. Idea prices are not copied — fetched on open, a price in a
   note would read as current. */

export type CopyInput = {
  question: string
  web: boolean
  /** The kind as the card shows it: "⚖️ ALLOCATION". */
  kind: string
  answer: string
  /** The fact pills as the card shows them: "🏛️ FED 4.25–4.50%". */
  facts: Array<string>
  /** The tickers NEXT showed, on an ideas answer. */
  inNext: Array<string>
  ideas: Array<Idea>
  sources: Array<Source>
  /** "SONNET 5.5" */
  model: string
  searches: number
  at: number
}

const MONTH = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')

/** "www.reuters.com" → "REUTERS", as the source pill names it. */
export const siteWord = (site: string) =>
  site
    .replace(/^www\./, '')
    .split('.')[0]
    .toUpperCase()

/** "2026-10-16" → "16 OCT". */
export const dayWord = (d: string) =>
  `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}`

function when(at: number) {
  const d = new Date(at)
  const hm = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${d.getDate()} ${MONTH[d.getMonth()]} ${hm}`
}

export function askCopyText(c: CopyInput): string {
  const parts: Array<string> = [
    `## ${c.web ? '🌐 ' : ''}${c.question}`,
    c.kind,
    c.answer.trim(),
  ]
  const facts = [
    ...c.facts,
    ...(c.inNext.length ? [`💡 IN NEXT · ${c.inNext.join(' · ')}`] : []),
  ]
  if (facts.length)
    parts.push(['FACTS', ...facts.map((f) => `- ${f}`)].join('\n'))
  if (c.ideas.length)
    parts.push(
      [
        'IDEAS · MODEL · NOT ADVICE',
        ...c.ideas.map((i) =>
          [
            `- ${i.ticker} · ${i.name} — ${i.why}`,
            `  ▲ ${i.bull}`,
            `  ▼ ${i.bear}`,
            `  ✕ Wrong if ${i.wrong}`,
          ].join('\n'),
        ),
      ].join('\n'),
    )
  if (c.sources.length)
    parts.push(
      [
        'SOURCES',
        ...c.sources.map(
          (s) =>
            `- ${siteWord(s.site)}${s.day ? ` · ${dayWord(s.day)}` : ''} · ${s.url}`,
        ),
      ].join('\n'),
    )
  const searches =
    c.searches > 0
      ? `${c.searches} ${c.searches === 1 ? 'SEARCH' : 'SEARCHES'} · `
      : ''
  parts.push(`✦ ${c.model} · ${searches}${when(c.at)} · RESEARCH · NOT ADVICE`)
  return parts.join('\n\n')
}
