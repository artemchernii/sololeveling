import type { TickerFacts } from './ideasBoard'

/* NUMBERS as a table (29 Oct, his "styling here could be better"): a
   label, the value, and a small note — the close before, the distance
   from a line, how many analysts. All the app's, from fetched closes. */

export type NumRow = {
  k: string
  v: string
  n?: string
  tone?: 'good' | 'bad'
  url?: string
}

const r2 = (n: number) => Math.round(n * 100) / 100
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(r2(n))}%`

export function money(cur: string, v: number) {
  const n = v.toLocaleString('en-GB', {
    maximumFractionDigits: v >= 1000 ? 0 : 2,
  })
  return cur === 'USD'
    ? `$${n}`
    : cur === 'EUR'
      ? `€${n}`
      : cur === 'GBp'
        ? `${n}p`
        : `${n} ${cur}`
}

export function tickerRows(f: TickerFacts): Array<NumRow> {
  const m = (v: number) => money(f.currency, v)
  const out: Array<NumRow> = [{ k: 'PRICE', v: m(f.price) }]
  if (f.day)
    out.push({
      k: 'TODAY',
      v: `${f.day.change >= 0 ? '▲' : '▼'} ${Math.abs(f.day.change).toFixed(1)}%`,
      n: `WAS ${m(f.day.base)}`,
      tone: f.day.change >= 0 ? 'good' : 'bad',
    })
  if (f.rsi !== null)
    out.push({
      k: 'RSI 14',
      v: String(f.rsi),
      n: f.rsi > 70 ? 'OVERBOUGHT' : f.rsi < 30 ? 'OVERSOLD' : 'NEUTRAL',
      tone: f.rsi > 70 ? 'bad' : f.rsi < 30 ? 'good' : undefined,
    })
  if (f.sma200)
    out.push({
      k: 'SMA 200',
      v: m(f.sma200.level),
      n: `PRICE ${signed(f.sma200.pct)}`,
      tone: f.sma200.pct >= 0 ? 'good' : 'bad',
    })
  if (f.high)
    out.push({ k: '52W HIGH', v: m(f.high.level), n: signed(f.high.pct) })
  if (f.target)
    out.push({
      k: 'TARGET',
      v: m(f.target.mean),
      n: `${signed(f.target.pct)} · ${f.target.count} ANALYSTS`,
    })
  if (f.pe !== null) out.push({ k: 'P/E', v: String(r2(f.pe)) })
  if (f.dividend !== null) out.push({ k: 'DIVIDEND', v: `${f.dividend}%` })
  return out
}
