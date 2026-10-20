import { Fragment } from 'react'

import { REGIONS, SECTORS } from '@/lib/insightsMarket'
import type { Fact, Kind, Tone } from '@/lib/marketRead'

/* Small pieces of the market read (I3): the model's **bold** words, the
   kind's icon (the model picks the kind, the app picks the icon), a fact
   as a chip, and the model's name. */

/** The model's words with its **double stars** as bold. */
export function Words({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\*\*(.+?)\*\*/g)
        .map((part, i) =>
          i % 2 === 1 ? (
            <b key={i}>{part}</b>
          ) : (
            <Fragment key={i}>{part}</Fragment>
          ),
        )}
    </>
  )
}

export const KIND_LOOK: Record<
  Kind,
  { icon: string; name: string; t: string }
> = {
  inflation: { icon: '🌡️', name: 'INFLATION', t: 'var(--state-good)' },
  rates: { icon: '🏛️', name: 'RATES', t: 'var(--color-lav-400)' },
  market: { icon: '🔥', name: 'MARKET', t: 'var(--state-warn)' },
  allocation: { icon: '⚖️', name: 'ALLOCATION', t: 'var(--state-danger)' },
  dont: { icon: '⛔', name: "DON'T", t: 'var(--state-danger)' },
  nodata: { icon: '❔', name: 'NO DATA', t: 'var(--color-ink-400)' },
}
export const KINDS_SHOWN = Object.keys(KIND_LOOK) as Array<Kind>

export const TONE_COLOUR: Record<Tone, string> = {
  good: 'var(--state-good)',
  bad: 'var(--state-danger)',
  warn: 'var(--state-warn)',
  calm: 'var(--color-lav-400)',
}
export const TONE_BADGE: Record<Tone, string> = {
  good: 'good',
  bad: 'bad',
  warn: 'warn',
  calm: 'lav',
}

/** A fact's icon, by what kind of number it is. */
export function factIcon(key: string): string {
  if (key === 'us-cpi' || key === 'us-cpi-was') return '🇺🇸'
  if (key.startsWith('eu-hicp')) return '🇪🇺'
  if (key.startsWith('fed') || key.startsWith('ecb')) return '🏛️'
  if (key.startsWith('sec-'))
    return SECTORS.find((s) => s.id === key.slice(4))?.emoji ?? '📊'
  if (key.startsWith('reg-'))
    return REGIONS.find((r) => r.id === key.slice(4))?.emoji ?? '🌐'
  if (key === 'mine' || key.startsWith('pos-')) return '💼'
  if (key.startsWith('co-')) return '🏢'
  return '📈'
}

const toneClass = (f: Fact) =>
  f.tone === 'good'
    ? 'text-state-good'
    : f.tone === 'bad'
      ? 'text-state-danger'
      : ''

/** A fact under a line: its label and value, as the room shows them. */
export function FactChip({ fact }: { fact: Fact }) {
  return (
    <span data-testid="read-fact" className="ins-fact">
      {fact.label} <span className={toneClass(fact)}>{fact.value}</span>
    </span>
  )
}

/** One of the hero's numbers. */
export function Kpi({ fact }: { fact: Fact }) {
  return (
    <span data-testid="read-kpi" className="ins-kpi">
      <span className="e">{factIcon(fact.key)}</span>
      {fact.label}
      <span className={`v ${toneClass(fact)}`}>{fact.value}</span>
    </span>
  )
}

/** "claude-sonnet-5-5" → "SONNET 5.5". */
export function modelWord(model: string): string {
  const m = /claude-([a-z]+)-(\d+)-(\d+)/.exec(model)
  return m ? `${m[1].toUpperCase()} ${m[2]}.${m[3]}` : model.toUpperCase()
}

/** 61800 → "62K", 3100 → "3.1K". */
export function tokens(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`
}

export const usd = (n: number) => `$${n.toFixed(2)}`
