import { Fragment } from 'react'

import { DrawnMark, Flag } from './Flag'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { MARKETS } from '@/lib/insightsMarket'
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
  if (key.startsWith('sec-')) return '📊'
  if (key.startsWith('reg-')) return '🌐'
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

/** One of the hero's numbers: its source's logo or a line icon (30 Oct,
    his "Reduce emojies, use more logos icons"), its plain label. */
export function Kpi({ fact }: { fact: Fact }) {
  return (
    <span data-testid="read-kpi" className="ins-kpi">
      <span className="e">
        <FactMark k={fact.key} />
      </span>
      {labelOf(fact)}
      <span className={`v ${toneClass(fact)}`}>{fact.value}</span>
    </span>
  )
}

/** Who a number comes from, where a logo says it best. */
const SITE: Array<[string, string]> = [
  ['us-cpi', 'bls.gov'],
  ['eu-hicp', 'ec.europa.eu'],
  ['fed', 'federalreserve.gov'],
  ['ecb', 'ecb.europa.eu'],
]
/** Thin line icons, as the IDEAS board draws them. */
export const LINE: Record<string, string> = {
  wallet: 'M3 7h15a3 3 0 0 1 3 3v8H3zM3 7l12-3v3M16 13h2',
  chart: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  bars: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  pie: 'M21.2 15.9A10 10 0 1 1 8 2.8M22 12A10 10 0 0 0 12 2v10z',
  day: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  heat: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0zM11.5 10v7',
  bank: 'M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6',
  case: 'M3 7h18v13H3zM8 7V4h8v3M3 13h18',
  dollar: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  tax: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
}
/** One icon per kind of his own number, never two the same in a row. */
const MINE_ICON: Array<[string, string]> = [
  ['me-cash-lost', 'heat'],
  ['me-prices', 'heat'],
  ['me-cash-ecb', 'bank'],
  ['me-ecb', 'bank'],
  ['me-cash', 'wallet'],
  ['me-invested', 'case'],
  ['me-us-eur', 'globe'],
  ['me-dollar', 'dollar'],
  ['me-alloc-', 'pie'],
  ['me-tax-', 'tax'],
]
/** Each icon in its own colour (30 Oct, his "i want colorful icons"),
    on a tint of it. A kind of number, not a grade. */
const TINT: Record<string, string> = {
  heat: 'var(--state-warn)',
  bank: 'var(--color-lav-400)',
  wallet: 'var(--state-good)',
  case: 'var(--kind-note)',
  globe: 'var(--line-2)',
  dollar: 'var(--state-good)',
  pie: 'var(--color-lav-400)',
  tax: 'var(--state-danger)',
  chart: 'var(--kind-note)',
  bars: 'var(--state-warn)',
  day: 'var(--line-2)',
}
function Tinted({ n }: { n: string }) {
  return (
    <span className="fm" style={{ '--t': TINT[n] } as React.CSSProperties}>
      <LineIcon d={LINE[n]} />
    </span>
  )
}

export function LineIcon({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

export function FactMark({ k }: { k: string }) {
  const site = SITE.find(([p]) => k === p || k.startsWith(`${p}-`))?.[1]
  if (site) return <AccountLogo name={site} domain={site} size={18} />
  if (k.startsWith('mkt-')) {
    const m = MARKETS.find((x) => `mkt-${x.id}` === k)?.mark
    if (m && 'site' in m)
      return <AccountLogo name={m.site} domain={m.site} size={18} />
    if (m && 'coin' in m) return <TickerLogo symbol={m.coin} size={18} />
    if (m && 'flag' in m) return <Flag code={m.flag} size={18} />
    if (m && 'icon' in m) return <DrawnMark icon={m.icon} size={18} />
    return <Tinted n="chart" />
  }
  if (k.startsWith('co-') || k.startsWith('pos-'))
    return <TickerLogo symbol={k.slice(k.indexOf('-') + 1)} size={18} />
  if (k === 'mine') return <Tinted n="case" />
  if (k.startsWith('me-')) {
    const i = MINE_ICON.find(
      ([p]) => k === p || (p.endsWith('-') && k.startsWith(p)),
    )
    return <Tinted n={i?.[1] ?? 'wallet'} />
  }
  if (k.startsWith('sec-')) return <Tinted n="bars" />
  if (k.startsWith('reg-')) return <Tinted n="globe" />
  if (k.startsWith('alloc-')) return <Tinted n="pie" />
  if (k.startsWith('earn-')) return <Tinted n="day" />
  return <Tinted n="chart" />
}

/** The market's own facts in plain words; his (me-) already are. */
const PLAIN: Record<string, string> = {
  'us-cpi': 'US INFLATION',
  'us-cpi-was': 'US INFLATION · MONTH BEFORE',
  'eu-hicp': 'EURO INFLATION',
  'eu-hicp-was': 'EURO INFLATION · MONTH BEFORE',
  fed: 'FED RATE',
  'fed-next': 'NEXT FED MEETING',
  ecb: 'ECB RATE',
  'ecb-next': 'NEXT ECB MEETING',
  mine: 'INVESTMENTS',
  /* His own, by key, so a read stored before 30 Oct shows today's words. */
  'me-cash': 'CASH',
  'me-cash-lost': 'INFLATION ON CASH · A YEAR',
  'me-cash-ecb': 'ECB RATE ON CASH · A YEAR',
  'me-prices': 'EURO INFLATION',
  'me-ecb': 'ECB RATE',
  'me-invested': 'INVESTMENTS',
  'me-us-eur': 'US IN MINE',
  'me-dollar': 'DOLLAR · THIS MONTH',
}
export function labelOf(f: Fact) {
  if (PLAIN[f.key]) return PLAIN[f.key]
  if (f.key.startsWith('me-tax-')) return `TAX IF SOLD · ${f.key.slice(7)}`
  if (f.key.startsWith('me-alloc-'))
    return `${f.key.slice(9).toUpperCase()} IN MINE`
  if (f.key.startsWith('mkt-'))
    return MARKETS.find((m) => `mkt-${m.id}` === f.key)?.name ?? f.label
  return f.label.toUpperCase()
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

/** Under a cent shows three places: a Haiku answer is $0.004, never a
    $0.00 that reads as free. */
export const usd = (n: number) =>
  `$${n > 0 && n < 0.01 ? n.toFixed(3) : n.toFixed(2)}`
